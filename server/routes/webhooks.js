import crypto from 'node:crypto'
import { recordGatewayCapture } from '../services/bookings.js'
import { approvePayment } from '../services/payments.js'
import { safeEqual } from '../lib/security.js'

// Provider callbacks. Every one is authenticated by the provider's signature;
// anything unsigned or mis-signed is rejected without side effects.

async function setDelivery(ctx, provider, messageId, status, providerStatus, error = null) {
  if (!messageId) return
  if (status === 'DELIVERED') {
    await ctx.db.query(
      `UPDATE notifications SET status = 'DELIVERED', provider_status = $3, delivered_at = now(), updated_at = now()
        WHERE provider = $1 AND provider_message_id = $2 AND status IN ('SENT', 'DELIVERED')`,
      [provider, messageId, providerStatus],
    )
  } else if (status === 'FAILED') {
    await ctx.db.query(
      `UPDATE notifications SET status = 'FAILED', provider_status = $3, last_error = $4, updated_at = now()
        WHERE provider = $1 AND provider_message_id = $2 AND status = 'SENT'`,
      [provider, messageId, providerStatus, error || providerStatus],
    )
  } else {
    await ctx.db.query(`UPDATE notifications SET provider_status = $3, updated_at = now() WHERE provider = $1 AND provider_message_id = $2`, [provider, messageId, providerStatus])
  }
}

// Returns true the first time an event id is seen.
const firstTime = async (ctx, provider, id, type) =>
  Boolean(await ctx.db.one(`INSERT INTO webhook_events (provider, event_id, event_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`, [provider, id, type]))

export const webhookRoutes = (ctx) => async (app) => {
  const cfg = ctx.cfg

  // ─── Razorpay ──────────────────────────────────────────────────────────────
  app.post('/razorpay', async (req, reply) => {
    if (!ctx.razorpay.verifyWebhook(req.rawBody || '', req.headers['x-razorpay-signature'])) return reply.code(401).send({ error: 'bad_signature' })
    const eventId = req.headers['x-razorpay-event-id'] || crypto.createHash('sha256').update(req.rawBody).digest('hex')
    if (!(await firstTime(ctx, 'razorpay', eventId, req.body?.event))) return { ok: true, duplicate: true }
    const entity = req.body?.payload?.payment?.entity
    if (['payment.captured', 'order.paid'].includes(req.body?.event) && entity?.order_id && entity.status === 'captured') {
      let r
      try {
        r = await recordGatewayCapture(ctx, { orderId: entity.order_id, paymentId: entity.id, amountPaise: entity.amount, source: 'webhook' })
      } catch (e) {
        if (['order_unknown', 'amount_mismatch'].includes(e.code)) {
          req.log.warn({ err: e.message, orderId: entity.order_id }, 'razorpay webhook ignored')
          return { ok: true, ignored: e.code }
        }
        // Not processed: forget the event so Razorpay's retry is handled.
        await ctx.db.query(`DELETE FROM webhook_events WHERE provider = 'razorpay' AND event_id = $1`, [eventId])
        req.log.error({ err: e.message }, 'razorpay webhook handling failed')
        return reply.code(500).send({ error: 'retry' })
      }
      if (!r.duplicate && cfg.payment.gatewayAutoApprove) {
        // The capture is recorded; if auto-approval fails it stays pending for a person to confirm.
        await approvePayment(ctx, r.booking.booking_code, { system: 'razorpay auto-approve' }).catch((e) => req.log.error({ err: e.message }, 'auto-approve failed'))
      }
    }
    return { ok: true }
  })

  // ─── Resend (Svix-signed) delivery events ──────────────────────────────────
  app.post('/resend', async (req, reply) => {
    const secret = cfg.email.resendWebhookSecret
    const id = req.headers['svix-id']
    const ts = req.headers['svix-timestamp']
    const sigs = String(req.headers['svix-signature'] || '')
    if (!secret || !id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return reply.code(401).send({ error: 'bad_signature' })
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${req.rawBody}`).digest('base64')
    if (!sigs.split(' ').some((s) => safeEqual(s.split(',')[1] || '', expected))) return reply.code(401).send({ error: 'bad_signature' })
    if (!(await firstTime(ctx, 'resend', id, req.body?.type))) return { ok: true }
    const { type, data } = req.body || {}
    const map = { 'email.delivered': 'DELIVERED', 'email.bounced': 'FAILED', 'email.complained': 'FAILED', 'email.failed': 'FAILED' }
    await setDelivery(ctx, 'resend', data?.email_id, map[type] || null, type, data?.bounce?.message)
    return { ok: true }
  })

  // ─── Twilio message status callbacks ───────────────────────────────────────
  app.post('/twilio/status', async (req, reply) => {
    const token = cfg.notify.twilio.authToken
    const url = `${cfg.appUrl}/api/webhooks/twilio/status`
    const params = req.body || {}
    const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
    const expected = crypto.createHmac('sha1', token || 'unset').update(data).digest('base64')
    if (!token || !safeEqual(String(req.headers['x-twilio-signature'] || ''), expected)) return reply.code(401).send({ error: 'bad_signature' })
    const st = params.MessageStatus
    const status = ['delivered', 'read'].includes(st) ? 'DELIVERED' : ['failed', 'undelivered'].includes(st) ? 'FAILED' : null
    const provider = String(params.To || '').startsWith('whatsapp:') ? 'twilio_whatsapp' : 'twilio_sms'
    await setDelivery(ctx, provider, params.MessageSid, status, st, params.ErrorCode ? `Twilio error ${params.ErrorCode}` : null)
    return reply.type('text/xml').send('<Response/>')
  })

  // ─── WhatsApp Cloud API ────────────────────────────────────────────────────
  app.get('/whatsapp', async (req, reply) => {
    const q = req.query || {}
    const vt = cfg.notify.whatsappCloud.verifyToken
    if (q['hub.mode'] === 'subscribe' && vt && safeEqual(String(q['hub.verify_token'] || ''), vt)) return reply.type('text/plain').send(String(q['hub.challenge'] || ''))
    return reply.code(403).send()
  })
  app.post('/whatsapp', async (req, reply) => {
    const secret = cfg.notify.whatsappCloud.appSecret
    const expected = 'sha256=' + crypto.createHmac('sha256', secret || 'unset').update(req.rawBody || '').digest('hex')
    if (!secret || !safeEqual(String(req.headers['x-hub-signature-256'] || ''), expected)) return reply.code(401).send({ error: 'bad_signature' })
    for (const entry of req.body?.entry || [])
      for (const ch of entry.changes || [])
        for (const s of ch.value?.statuses || []) {
          const status = ['delivered', 'read'].includes(s.status) ? 'DELIVERED' : s.status === 'failed' ? 'FAILED' : null
          await setDelivery(ctx, 'whatsapp_cloud', s.id, status, s.status, s.errors?.[0]?.title)
        }
    return { ok: true }
  })
}
