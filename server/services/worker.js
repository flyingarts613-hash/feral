import { claimDue, markFailed, markSent } from './outbox.js'
import { getSettings } from './settings.js'
import { bookingEmail, confirmedEmail, organizerPendingMessage, organizerRejectedMessage, rejectedEmail } from './emails.js'
import { bookingUrl, mintLink } from './bookings.js'
import { renderReceipt } from './documents.js'
import { audit } from './audit.js'

// Renders and sends one queued message. Throws on failure (the caller retries).
async function deliver(ctx, n) {
  const settings = await getSettings(ctx.db)
  const booking = n.booking_id ? await ctx.db.one('SELECT * FROM bookings WHERE id = $1', [n.booking_id]) : null
  if (n.booking_id && !booking) throw new Error('booking no longer exists')

  switch (n.type) {
    case 'booking_payment_required': {
      const token = await mintLink(ctx, ctx.db, booking.id, 'booking', settings)
      const qrUrl = settings.paymentQrFileId ? `${ctx.cfg.appUrl}/api/public/payment-qr?v=${settings.paymentQrFileId}` : null
      const mail = bookingEmail({ settings, booking, bookingUrl: bookingUrl(ctx, booking.booking_code, token), qrUrl, upi: settings.upi })
      const receipt = await renderReceipt({
        preliminary: true,
        bookingCode: booking.booking_code,
        holderName: booking.holder_name,
        email: booking.email,
        phone: booking.phone,
        category: booking.category,
        referralCode: booking.referral_code,
        originalPaise: booking.original_paise,
        discountPaise: booking.discount_paise,
        finalPaise: booking.final_paise,
        issuedAt: new Date(),
        event: settings.event,
      })
      return ctx.email.send({
        to: booking.email,
        ...mail,
        attachments: [{ filename: `FERAL-booking-${booking.booking_code}.pdf`, content: receipt, contentType: 'application/pdf' }],
        idempotencyKey: `n-${n.id}-${n.attempts}`,
      })
    }

    case 'payment_confirmed': {
      const pass = await ctx.db.one('SELECT * FROM passes WHERE booking_id = $1', [booking.id])
      const payment = await ctx.db.one(`SELECT * FROM payments WHERE id = $1`, [pass?.payment_id])
      if (!pass || payment?.status !== 'APPROVED') throw new Error('no approved pass for this booking')
      const files = await ctx.db.many('SELECT id, bytes FROM files WHERE id = ANY($1)', [[pass.pdf_file_id, pass.png_file_id, pass.receipt_file_id]])
      const pick = (id) => files.find((f) => f.id === id)?.bytes
      const pdf = pick(pass.pdf_file_id)
      const png = pick(pass.png_file_id)
      const receipt = pick(pass.receipt_file_id)
      if (!pdf || !png || !receipt) throw new Error('pass documents missing')
      const dl = await mintLink(ctx, ctx.db, booking.id, 'pass_download', settings)
      const downloadUrl = `${ctx.cfg.appUrl}/api/public/bookings/${encodeURIComponent(booking.booking_code)}/pass.pdf?t=${encodeURIComponent(dl)}`
      const mail = confirmedEmail({ settings, booking, payment, pass, downloadUrl })
      return ctx.email.send({
        to: booking.email,
        ...mail,
        attachments: [
          { filename: `FERAL-2026-Pass-${pass.pass_code}.png`, content: png, contentType: 'image/png' },
          { filename: `FERAL-2026-Pass-${pass.pass_code}.pdf`, content: pdf, contentType: 'application/pdf' },
          { filename: `FERAL-receipt-${booking.booking_code}.pdf`, content: receipt, contentType: 'application/pdf' },
        ],
        idempotencyKey: `n-${n.id}-${n.attempts}`,
      })
    }

    case 'payment_rejected': {
      const p = await ctx.db.one('SELECT * FROM payments WHERE id = $1', [n.payload.paymentId])
      const token = await mintLink(ctx, ctx.db, booking.id, 'booking', settings)
      const mail = rejectedEmail({ settings, booking, reason: p?.rejection_reason, bookingUrl: bookingUrl(ctx, booking.booking_code, token) })
      return ctx.email.send({ to: booking.email, ...mail, idempotencyKey: `n-${n.id}-${n.attempts}` })
    }

    case 'organizer_payment_pending':
    case 'organizer_payment_rejected': {
      if (n.recipient === 'unconfigured') throw new Error('No organizer phone number configured (ORGANIZER_PHONE or admin settings)')
      const p = await ctx.db.one('SELECT * FROM payments WHERE id = $1', [n.payload.paymentId])
      const pending = n.type === 'organizer_payment_pending'
      const msg = pending ? organizerPendingMessage({ booking, payment: p }) : organizerRejectedMessage({ booking, reason: p?.rejection_reason })
      return ctx.notify.send({ to: n.recipient, kind: pending ? 'payment_pending' : 'payment_rejected', ...msg })
    }

    default:
      throw new Error(`unknown notification type ${n.type}`)
  }
}

// After a message is accepted by the provider.
async function afterSent(ctx, n) {
  if (n.type !== 'payment_confirmed') return
  await ctx.db.tx(async (c) => {
    const b = await c.one('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [n.booking_id])
    await c.query(`UPDATE passes SET status = 'ISSUED', issued_at = COALESCE(issued_at, now()) WHERE booking_id = $1 AND status = 'GENERATED'`, [b.id])
    if (b.status === 'PAID') {
      await c.query(`UPDATE bookings SET status = 'PASS_ISSUED', updated_at = now() WHERE id = $1`, [b.id])
      await audit(c, { actor: 'system', action: 'pass_issued', booking: b, from: 'PAID', to: 'PASS_ISSUED', details: { notificationId: n.id } })
    }
  })
}

export async function processOnce(ctx, limit = 10) {
  const due = await claimDue(ctx.db, limit)
  for (const n of due) {
    try {
      const r = await deliver(ctx, n)
      await markSent(ctx.db, n, { provider: r.provider, messageId: r.messageId, providerStatus: r.status ?? null })
      await afterSent(ctx, n)
    } catch (e) {
      const final = await markFailed(ctx.db, n, e.message, n.channel === 'email' ? ctx.email.name : ctx.notify.name)
      ctx.log[final ? 'error' : 'warn']({ id: n.id, type: n.type, attempt: n.attempts, err: e.message }, final ? 'notification failed permanently' : 'notification failed, will retry')
    }
  }
  return due.length
}

// Retention: drop bookings that never verified their email, expired sessions
// and links; purge payment screenshots some time after the event.
export async function cleanup(ctx) {
  const settings = await getSettings(ctx.db)
  await ctx.db.query(`DELETE FROM bookings WHERE status = 'EMAIL_VERIFICATION_PENDING' AND created_at < now() - make_interval(hours => $1)`, [ctx.cfg.retention.unverifiedHours])
  await ctx.db.query(`DELETE FROM customers c WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = c.id)`)
  await ctx.db.query(`DELETE FROM admin_sessions WHERE expires_at < now()`)
  await ctx.db.query(`DELETE FROM booking_links WHERE expires_at < now()`)
  const purgeAfter = new Date(new Date(settings.event.endsAt).getTime() + ctx.cfg.retention.screenshotDaysAfterEvent * 86400000)
  if (Date.now() > purgeAfter.getTime()) {
    await ctx.db.query(`UPDATE files SET bytes = NULL, purged_at = now() WHERE kind = 'payment_screenshot' AND bytes IS NOT NULL`)
  }
}

export function startWorker(ctx) {
  let busy = false
  let lastCleanup = 0
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      while ((await processOnce(ctx)) > 0) {}
      if (Date.now() - lastCleanup > 3600_000) {
        lastCleanup = Date.now()
        await cleanup(ctx)
      }
    } catch (e) {
      ctx.log.error({ err: e.message }, 'worker tick failed')
    } finally {
      busy = false
    }
  }
  const t = setInterval(tick, ctx.cfg.workerIntervalMs)
  t.unref()
  setImmediate(tick)
  return () => clearInterval(t)
}
