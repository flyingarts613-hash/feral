import { z } from 'zod'
import { getSettings, paymentMode } from '../services/settings.js'
import { quote, CATEGORIES } from '../services/pricing.js'
import {
  bookingByAccess,
  bookingView,
  createBooking,
  createGatewayOrder,
  httpError,
  recordGatewayCapture,
  sendOtp,
  submitPayment,
  verifyOtp,
} from '../services/bookings.js'
import { normalizeIndianMobile, cleanText } from '../lib/format.js'

const NAME = /^[\p{L}][\p{L}\p{M} .'-]*$/u

export const bookingSchema = z.object({
  name: z.string().transform((s) => cleanText(s, 80)).pipe(z.string().min(2, 'Enter your full name').max(80).regex(NAME, 'Use letters only')),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254)),
  phone: z.string().transform((s, c) => {
    const p = normalizeIndianMobile(s)
    if (!p) c.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number' })
    return p
  }),
  age: z.coerce.number({ error: 'Enter your age' }).int('Enter your age in whole years').min(1, 'Enter your age').max(120, 'Enter a real age'),
  gender: z.enum(['MALE', 'FEMALE'], { error: 'Choose male or female' }),
  category: z.enum(CATEGORIES, { error: 'Choose a pass' }),
  referralCode: z.string().max(40).optional().default(''),
  website: z.string().max(0, 'Invalid submission').optional(), // honeypot
})

const codeParam = z.object({ code: z.string().regex(/^FRL-[A-Z0-9]{6}$/i) })

export const publicRoutes = (ctx) => async (app) => {
  const limit = (max, minutes) => ({ config: { rateLimit: { max: max * ctx.cfg.rateLimitScale, timeWindow: minutes * 60000 } } })

  // Reads the booking a customer is allowed to see (token header, or ?t= for downloads).
  const access = async (req, purpose = 'booking') => {
    const { code } = codeParam.parse(req.params)
    const token = req.headers['x-booking-token'] || (purpose === 'pass_download' ? req.query?.t : null)
    const b = (await bookingByAccess(ctx, code, token, purpose)) || (purpose === 'pass_download' ? await bookingByAccess(ctx, code, token, 'booking') : null)
    if (!b) throw httpError(404, 'booking_not_found', 'Booking not found, or this link has expired.')
    return b
  }

  app.get('/config', async () => {
    const s = await getSettings(ctx.db)
    const mode = paymentMode(s, ctx.cfg)
    return {
      event: { name: s.event.name, dateLabel: s.event.dateLabel, timeLabel: s.event.timeLabel, venue: s.event.venue, coordinatorContact: s.event.coordinatorContact },
      pricing: { male: s.pricing.male, female: s.pricing.female, couple: s.pricing.couple, referralDiscount: s.pricing.referralDiscount },
      referralNote: 'Contact coordinators for referral code.',
      minAge: s.minAge,
      paymentMode: mode,
      razorpayKeyId: mode === 'razorpay' && ctx.razorpay.configured ? ctx.razorpay.keyId : null,
      paymentQr: Boolean(s.paymentQrFileId) ? `/api/public/payment-qr?v=${s.paymentQrFileId}` : null,
      upi: s.upi.vpa ? { vpa: s.upi.vpa, payeeName: s.upi.payeeName } : null,
      otp: { ttlSeconds: ctx.cfg.otp.ttlSeconds, resendCooldownSeconds: ctx.cfg.otp.resendCooldownSeconds },
    }
  })

  app.post('/quote', limit(30, 1), async (req) => {
    const { category, referralCode } = z.object({ category: z.enum(CATEGORIES), referralCode: z.string().max(40).optional() }).parse(req.body ?? {})
    const q = await quote(ctx.db, await getSettings(ctx.db), { category, code: referralCode })
    return { category, originalPaise: q.originalPaise, discountPaise: q.discountPaise, finalPaise: q.finalPaise, referral: { code: q.referral.code, status: q.referral.status } }
  })

  app.post('/bookings', limit(10, 10), async (req, reply) => {
    const input = bookingSchema.parse(req.body ?? {})
    const key = req.headers['idempotency-key']
    const idem = typeof key === 'string' && /^[A-Za-z0-9-]{16,80}$/.test(key) ? key : null
    const out = await createBooking(ctx, input, { idempotencyKey: idem, ip: req.ip })
    return reply.code(201).send(out)
  })

  app.get('/bookings/:code', limit(120, 1), async (req) => bookingView(ctx, await access(req)))

  app.post('/bookings/:code/otp/resend', limit(6, 10), async (req) => {
    const b = await access(req)
    return { otp: await sendOtp(ctx, b), booking: await bookingView(ctx, b) }
  })

  app.post('/bookings/:code/otp/verify', limit(20, 10), async (req) => {
    const b = await access(req)
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }).parse(req.body ?? {})
    const r = await verifyOtp(ctx, b, code, { ip: req.ip })
    return { priceChanged: Boolean(r.priceChanged), booking: await bookingView(ctx, await ctx.db.one('SELECT * FROM bookings WHERE id = $1', [b.id])) }
  })

  app.post('/bookings/:code/payment', limit(10, 10), async (req) => {
    const b = await access(req)
    let reference = ''
    let screenshot = null
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'screenshot') throw httpError(400, 'bad_field', 'Unexpected file.')
          screenshot = await part.toBuffer()
          if (part.file.truncated) throw httpError(413, 'file_too_large', 'Screenshot is too large.')
        } else if (part.fieldname === 'reference') reference = String(part.value)
      }
    } else reference = String(req.body?.reference ?? '')
    return submitPayment(ctx, b, { reference, screenshot: screenshot?.length ? screenshot : null }, { ip: req.ip })
  })

  app.post('/bookings/:code/razorpay/order', limit(10, 10), async (req) => createGatewayOrder(ctx, await access(req)))

  app.post('/bookings/:code/razorpay/verify', limit(10, 10), async (req) => {
    const b = await access(req)
    const body = z.object({ orderId: z.string().max(64), paymentId: z.string().max(64), signature: z.string().max(256) }).parse(req.body ?? {})
    if (!ctx.razorpay.verifyCheckoutSignature(body)) throw httpError(400, 'bad_signature', 'Payment could not be verified.')
    const own = await ctx.db.one('SELECT id FROM payments WHERE gateway_order_id = $1 AND booking_id = $2', [body.orderId, b.id])
    if (!own) throw httpError(404, 'order_unknown', 'Unknown order for this booking.')
    const r = await recordGatewayCapture(ctx, { orderId: body.orderId, paymentId: body.paymentId, source: 'checkout', ip: req.ip })
    return bookingView(ctx, r.booking)
  })

  // Pass download: the customer's own booking token or the emailed download link.
  app.get('/bookings/:code/pass.pdf', limit(30, 10), async (req, reply) => {
    const b = await access(req, 'pass_download')
    const row = await ctx.db.one(
      `SELECT f.bytes, ps.pass_code FROM passes ps JOIN files f ON f.id = ps.pdf_file_id
         JOIN payments p ON p.id = ps.payment_id
        WHERE ps.booking_id = $1 AND ps.status IN ('GENERATED', 'ISSUED') AND p.status = 'APPROVED'`,
      [b.id],
    )
    if (!row) throw httpError(404, 'no_pass', 'No pass has been issued for this booking yet.')
    return reply.type('application/pdf').header('Content-Disposition', `attachment; filename="FERAL-pass-${row.pass_code}.pdf"`).send(row.bytes)
  })

  app.get('/payment-qr', async (req, reply) => {
    const s = await getSettings(ctx.db)
    const f = s.paymentQrFileId ? await ctx.db.one(`SELECT mime, bytes FROM files WHERE id = $1 AND kind = 'payment_qr'`, [s.paymentQrFileId]) : null
    if (!f?.bytes) return reply.code(404).send({ error: 'not_configured', message: 'The payment QR has not been uploaded yet.' })
    return reply.type(f.mime).header('Cache-Control', 'public, max-age=300').send(f.bytes)
  })
}
