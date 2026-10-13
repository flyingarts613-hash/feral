import sharp from 'sharp'
import { audit } from './audit.js'
import { quote } from './pricing.js'
import { getSettings, paymentMode, organizerPhones } from './settings.js'
import { enqueue } from './outbox.js'
import { otpEmail } from './emails.js'
import { generateOtp, keyedHash, newBookingCode, randomToken, safeEqual, sha256 } from '../lib/security.js'
import { CATEGORY_LABEL } from '../lib/format.js'

export const httpError = (statusCode, code, message, extra = {}) => Object.assign(new Error(message), { statusCode, code, expose: true, ...extra })

export const tokenHash = (ctx, token) => keyedHash(ctx.cfg.appSecret, `tok:${token}`)
const otpHash = (ctx, bookingId, otp) => keyedHash(ctx.cfg.appSecret, `otp:${bookingId}:${otp}`)

// ─── access ──────────────────────────────────────────────────────────────────
// A customer reaches their booking with the token issued when it was created
// (kept by the browser) or a link token from one of our emails.
export async function bookingByAccess(ctx, code, token, purpose = 'booking') {
  if (!code || !token || token.length < 20) return null
  const h = tokenHash(ctx, token)
  return ctx.db.one(
    `SELECT b.* FROM bookings b
      WHERE b.booking_code = $1
        AND (b.access_token_hash = $2
             OR EXISTS (SELECT 1 FROM booking_links l WHERE l.booking_id = b.id AND l.token_hash = $2 AND l.purpose = $3 AND l.expires_at > now()))`,
    [String(code).toUpperCase(), h, purpose],
  )
}

export async function mintLink(ctx, q, bookingId, purpose, settings) {
  const token = randomToken()
  const expires = new Date(new Date(settings.event.endsAt).getTime() + 60 * 86400000)
  await q.query('INSERT INTO booking_links (booking_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [bookingId, purpose, tokenHash(ctx, token), expires])
  return token
}

export const bookingUrl = (ctx, code, token) => `${ctx.cfg.appUrl}/#booking=${encodeURIComponent(code)}.${encodeURIComponent(token)}`

// ─── public view ─────────────────────────────────────────────────────────────
export async function bookingView(ctx, booking) {
  const settings = await getSettings(ctx.db)
  const payment = await ctx.db.one('SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1', [booking.id])
  const pass = await ctx.db.one('SELECT status, pass_code, issued_at FROM passes WHERE booking_id = $1', [booking.id])
  const otp = await ctx.db.one(`SELECT created_at, expires_at FROM otp_codes WHERE booking_id = $1 AND status IN ('ACTIVE','SEND_FAILED') ORDER BY created_at DESC LIMIT 1`, [booking.id])
  const cooldown = otp ? Math.max(0, Math.ceil((new Date(otp.created_at).getTime() + ctx.cfg.otp.resendCooldownSeconds * 1000 - Date.now()) / 1000)) : 0
  return {
    bookingId: booking.booking_code,
    status: booking.status,
    holderName: booking.holder_name,
    email: booking.email,
    category: booking.category,
    categoryLabel: CATEGORY_LABEL[booking.category],
    referralCode: booking.referral_code,
    originalPaise: booking.original_paise,
    discountPaise: booking.discount_paise,
    finalPaise: booking.final_paise,
    emailVerified: Boolean(booking.email_verified_at),
    otp: booking.status === 'EMAIL_VERIFICATION_PENDING' ? { resendInSeconds: cooldown, expiresAt: otp?.expires_at ?? null } : null,
    paymentMode: paymentMode(settings, ctx.cfg),
    payment: payment
      ? {
          method: payment.method,
          status: payment.status,
          reference: payment.transaction_reference,
          submittedAt: payment.submitted_at,
          rejectionReason: payment.status === 'REJECTED' ? payment.rejection_reason : null,
        }
      : null,
    pass: pass ? { status: pass.status, passId: pass.status === 'ISSUED' ? pass.pass_code : null } : null,
  }
}

// ─── create ──────────────────────────────────────────────────────────────────
// input is already validated + normalised by the route schema.
export async function createBooking(ctx, input, { idempotencyKey = null, ip = null } = {}) {
  const settings = await getSettings(ctx.db)
  if (input.age < settings.minAge) throw httpError(400, 'underage', `You must be at least ${settings.minAge} to book.`, { field: 'age' })
  if (input.category === 'male' && input.gender !== 'MALE') throw httpError(400, 'category_gender', 'The Male / Stag pass is for male guests.', { field: 'category' })
  if (input.category === 'female' && input.gender !== 'FEMALE') throw httpError(400, 'category_gender', 'The Girls pass is for female guests.', { field: 'category' })

  const accessToken = randomToken()
  const result = await ctx.db.tx(async (c) => {
    // Retry of the same submission (network retry, double click): same booking back.
    if (idempotencyKey) {
      const prior = await c.one('SELECT * FROM bookings WHERE idempotency_key = $1 FOR UPDATE', [idempotencyKey])
      if (prior) {
        if (prior.email !== input.email) throw httpError(409, 'idempotency_conflict', 'This request was already used for a different booking.')
        await c.query('UPDATE bookings SET access_token_hash = $1, updated_at = now() WHERE id = $2', [tokenHash(ctx, accessToken), prior.id])
        return { booking: { ...prior }, reused: true }
      }
    }

    const q = await quote(c, settings, { category: input.category, code: input.referralCode })
    const referralApplied = q.referral.status === 'applied'

    const customer = await c.one(
      `INSERT INTO customers (email, name, phone, age, gender) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, age = EXCLUDED.age, gender = EXCLUDED.gender, updated_at = now()
       RETURNING id`,
      [input.email, input.name, input.phone, input.age, input.gender],
    )

    // Same person re-submitting the same unverified booking: reuse it.
    const open = await c.one(
      `SELECT * FROM bookings WHERE email = $1 AND category = $2 AND lower(holder_name) = lower($3)
          AND status = 'EMAIL_VERIFICATION_PENDING' AND created_at > now() - interval '30 minutes'
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.email, input.category, input.name],
    )
    if (open) {
      const b = await c.one(
        `UPDATE bookings SET phone = $2, age = $3, gender = $4, referral_code_id = $5, referral_code = $6,
                original_paise = $7, discount_paise = $8, final_paise = $9, access_token_hash = $10,
                idempotency_key = COALESCE(idempotency_key, $11), updated_at = now()
          WHERE id = $1 RETURNING *`,
        [open.id, input.phone, input.age, input.gender, q.referral.id, referralApplied ? q.referral.code : null, q.originalPaise, q.discountPaise, q.finalPaise, tokenHash(ctx, accessToken), idempotencyKey],
      )
      return { booking: b, reused: true, quote: q }
    }

    for (let i = 0; i < 6; i++) {
      const code = newBookingCode()
      const b = await c.one(
        `INSERT INTO bookings (booking_code, customer_id, holder_name, email, phone, age, gender, category,
                               referral_code_id, referral_code, original_paise, discount_paise, final_paise,
                               status, access_token_hash, idempotency_key, created_ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'EMAIL_VERIFICATION_PENDING',$14,$15,$16)
         ON CONFLICT (booking_code) DO NOTHING RETURNING *`,
        [code, customer.id, input.name, input.email, input.phone, input.age, input.gender, input.category, q.referral.id,
         referralApplied ? q.referral.code : null, q.originalPaise, q.discountPaise, q.finalPaise, tokenHash(ctx, accessToken), idempotencyKey, ip],
      )
      if (b) {
        await audit(c, { actor: 'customer', action: 'booking_created', booking: b, to: b.status, details: { category: b.category, referral: b.referral_code, finalPaise: b.final_paise }, ip })
        return { booking: b, reused: false, quote: q }
      }
    }
    throw new Error('Could not allocate a booking ID')
  })

  let otp = { sent: false }
  if (result.booking.status === 'EMAIL_VERIFICATION_PENDING') {
    try {
      otp = await sendOtp(ctx, result.booking)
    } catch (e) {
      // cooldown (a retry within the window) is fine — the earlier code is still valid
      if (e.code !== 'otp_cooldown') throw e
      otp = { sent: false, resendInSeconds: e.retryAfter }
    }
  }
  return {
    accessToken,
    referral: result.quote ? { code: result.quote.referral.code, status: result.quote.referral.status } : null,
    otp,
    booking: await bookingView(ctx, (await ctx.db.one('SELECT * FROM bookings WHERE id = $1', [result.booking.id]))),
  }
}

// ─── email OTP ───────────────────────────────────────────────────────────────
export async function sendOtp(ctx, booking) {
  const { otp: o } = ctx.cfg
  const settings = await getSettings(ctx.db)
  const code = generateOtp()
  const row = await ctx.db.tx(async (c) => {
    const b = await c.one('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking.id])
    if (b.status !== 'EMAIL_VERIFICATION_PENDING') throw httpError(409, 'already_verified', 'This email is already verified.')
    const last = await c.one('SELECT created_at FROM otp_codes WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1', [b.id])
    if (last) {
      const wait = Math.ceil((new Date(last.created_at).getTime() + o.resendCooldownSeconds * 1000 - Date.now()) / 1000)
      if (wait > 0) throw httpError(429, 'otp_cooldown', `Please wait ${wait}s before requesting another code.`, { retryAfter: wait })
    }
    const recent = await c.one(`SELECT count(*)::int AS n FROM otp_codes WHERE booking_id = $1 AND created_at > now() - interval '1 hour'`, [b.id])
    if (recent.n >= o.maxSendsPerHour) throw httpError(429, 'otp_limit', 'Too many codes requested. Try again in an hour.', { retryAfter: 3600 })
    await c.query(`UPDATE otp_codes SET status = 'SUPERSEDED' WHERE booking_id = $1 AND status = 'ACTIVE'`, [b.id])
    return c.one(
      `INSERT INTO otp_codes (booking_id, otp_hash, expires_at, max_attempts, status)
       VALUES ($1, $2, now() + make_interval(secs => $3), $4, 'ACTIVE') RETURNING id, expires_at`,
      [b.id, otpHash(ctx, b.id, code), o.ttlSeconds, o.maxAttempts],
    )
  })

  // Sent directly (not via the queue) so the code itself is never written to the database.
  const mail = otpEmail({ settings, booking, otp: code, ttlMinutes: Math.round(o.ttlSeconds / 60) })
  try {
    const r = await ctx.email.send({ to: booking.email, ...mail, idempotencyKey: `otp-${row.id}` })
    await recordDirect(ctx, { booking, type: 'otp', key: `otp:${row.id}`, status: 'SENT', provider: r.provider, messageId: r.messageId })
  } catch (e) {
    ctx.log.error({ err: e.message, booking: booking.booking_code }, 'OTP email failed')
    await ctx.db.query(`UPDATE otp_codes SET status = 'SEND_FAILED' WHERE id = $1`, [row.id])
    await recordDirect(ctx, { booking, type: 'otp', key: `otp:${row.id}`, status: 'FAILED', provider: ctx.email.name, error: e.message })
    throw httpError(502, 'otp_send_failed', "We couldn't send the verification email. Check the address and try again in a minute.")
  }
  return { sent: true, expiresInSeconds: o.ttlSeconds, resendInSeconds: o.resendCooldownSeconds }
}

async function recordDirect(ctx, { booking, type, key, status, provider, messageId = null, error = null }) {
  await ctx.db.query(
    `INSERT INTO notifications (booking_id, channel, type, recipient, dedupe_key, status, attempts, max_attempts, provider, provider_message_id, last_error, sent_at)
     VALUES ($1, 'email', $2, $3, $4, $5, 1, 1, $6, $7, $8, CASE WHEN $5 = 'SENT' THEN now() END)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [booking.id, type, booking.email, key, status, provider, messageId, error],
  )
}

export async function verifyOtp(ctx, booking, code, { ip = null } = {}) {
  const settings = await getSettings(ctx.db)
  const out = await ctx.db.tx(async (c) => {
    const b = await c.one('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking.id])
    if (b.email_verified_at) return { ok: true, already: true }
    const otp = await c.one(`SELECT * FROM otp_codes WHERE booking_id = $1 AND status = 'ACTIVE' FOR UPDATE`, [b.id])
    if (!otp) return { ok: false, code: 'no_active_code', message: 'This code is no longer valid. Request a new one.' }
    if (new Date(otp.expires_at) <= new Date()) {
      await c.query(`UPDATE otp_codes SET status = 'SUPERSEDED' WHERE id = $1`, [otp.id])
      return { ok: false, code: 'otp_expired', message: 'This code has expired. Request a new one.' }
    }
    if (!safeEqual(otpHash(ctx, b.id, code), otp.otp_hash)) {
      const attempts = otp.attempts + 1
      const locked = attempts >= otp.max_attempts
      await c.query(`UPDATE otp_codes SET attempts = $2, status = $3 WHERE id = $1`, [otp.id, attempts, locked ? 'LOCKED' : 'ACTIVE'])
      return locked
        ? { ok: false, code: 'otp_locked', message: 'Too many incorrect attempts. Request a new code.' }
        : { ok: false, code: 'otp_incorrect', message: 'That code is incorrect.', attemptsLeft: otp.max_attempts - attempts }
    }

    await c.query(`UPDATE otp_codes SET status = 'VERIFIED', verified_at = now(), attempts = attempts + 1 WHERE id = $1`, [otp.id])
    // Re-check the referral at the moment the booking starts counting against it.
    let priceChanged = false
    let upd = b
    if (b.referral_code) {
      const q = await quote(c, settings, { category: b.category, code: b.referral_code, lock: true, excludeBookingId: b.id })
      if (q.referral.status !== 'applied' || q.finalPaise !== b.final_paise) {
        priceChanged = true
        upd = await c.one(
          `UPDATE bookings SET referral_code_id = $2, referral_code = $3, original_paise = $4, discount_paise = $5, final_paise = $6 WHERE id = $1 RETURNING *`,
          [b.id, q.referral.id, q.referral.status === 'applied' ? q.referral.code : null, q.originalPaise, q.discountPaise, q.finalPaise],
        )
      }
    }
    upd = await c.one(`UPDATE bookings SET status = 'AWAITING_PAYMENT', email_verified_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [b.id])
    await audit(c, { actor: 'customer', action: 'email_verified', booking: upd, from: b.status, to: upd.status, details: { priceChanged }, ip })
    await enqueue(c, { booking: upd, channel: 'email', type: 'booking_payment_required', recipient: upd.email, key: `booking_payment_required:${upd.id}` })
    return { ok: true, priceChanged }
  })
  if (!out.ok) throw httpError(400, out.code, out.message, { attemptsLeft: out.attemptsLeft })
  return out
}

// ─── payment submission (static UPI QR) ──────────────────────────────────────
const IMAGE_MAGIC = [
  { mime: 'image/png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
]

// Checks the real file type, then re-encodes (drops metadata and anything that
// isn't pixels). Returns a JPEG buffer.
export async function sanitizeImage(ctx, buf) {
  if (!buf?.length) return null
  if (buf.length > ctx.cfg.uploads.maxBytes) throw httpError(413, 'file_too_large', `Screenshot must be under ${Math.round(ctx.cfg.uploads.maxBytes / 1048576)} MB.`)
  if (!IMAGE_MAGIC.some((m) => m.test(buf))) throw httpError(415, 'file_type', 'Screenshot must be a PNG, JPEG or WebP image.')
  try {
    return await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 3200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
  } catch {
    throw httpError(415, 'file_unreadable', 'That image could not be read. Try a different screenshot.')
  }
}

export const normalizeReference = (raw) => String(raw ?? '').replace(/[\s-]/g, '').toUpperCase()

export async function submitPayment(ctx, booking, { reference, screenshot }, { ip = null } = {}) {
  const settings = await getSettings(ctx.db)
  if (paymentMode(settings, ctx.cfg) !== 'static_upi') throw httpError(409, 'wrong_mode', 'Payments for this event go through the online checkout.')
  const ref = normalizeReference(reference)
  if (!/^[A-Z0-9]{6,35}$/.test(ref)) throw httpError(400, 'reference_invalid', 'Enter the UPI transaction / reference ID from your payment app (letters and numbers only).', { field: 'reference' })
  const image = screenshot ? await sanitizeImage(ctx, screenshot) : null

  const res = await ctx.db.tx(async (c) => {
    const b = await c.one('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking.id])
    if (b.status === 'PAYMENT_PENDING_VERIFICATION') throw httpError(409, 'already_submitted', 'Payment details for this booking are already awaiting verification.')
    if (!['AWAITING_PAYMENT', 'PAYMENT_REJECTED'].includes(b.status)) throw httpError(409, 'not_awaiting_payment', 'This booking is not awaiting payment.')
    let fileId = null
    if (image) fileId = (await c.one(`INSERT INTO files (kind, mime, bytes, size, sha256) VALUES ('payment_screenshot', 'image/jpeg', $1, $2, $3) RETURNING id`, [image, image.length, sha256(image)])).id
    let p
    try {
      p = await c.one(
        `INSERT INTO payments (booking_id, method, transaction_reference, amount_paise, status, screenshot_file_id, submitted_at)
         VALUES ($1, 'upi_static', $2, $3, 'SUBMITTED', $4, now()) RETURNING *`,
        [b.id, ref, b.final_paise, fileId],
      )
    } catch (e) {
      if (e.code === '23505' && /reference/.test(e.constraint || '')) throw httpError(409, 'reference_in_use', 'This transaction ID has already been submitted for another booking.', { field: 'reference' })
      if (e.code === '23505') throw httpError(409, 'already_submitted', 'Payment details for this booking are already awaiting verification.')
      throw e
    }
    const upd = await c.one(`UPDATE bookings SET status = 'PAYMENT_PENDING_VERIFICATION', updated_at = now() WHERE id = $1 RETURNING *`, [b.id])
    await audit(c, { actor: 'customer', action: 'payment_submitted', booking: upd, from: b.status, to: upd.status, details: { method: 'upi_static', reference: ref, screenshot: Boolean(fileId), amountPaise: p.amount_paise }, ip })
    await notifyOrganizer(ctx, c, settings, upd, p, 'payment_pending')
    return upd
  })
  return bookingView(ctx, res)
}

// Queues one alert per organizer number (and per ORGANIZER_EMAIL address),
// inside the same transaction that saved the payment — the alert exists only if
// the payment was saved, and only once.
export async function notifyOrganizer(ctx, c, settings, booking, payment, kind) {
  const phones = organizerPhones(settings, ctx.cfg)
  const emails = ctx.cfg.notify.organizerEmails
  const channel = ctx.notify.channel
  const type = kind === 'payment_pending' ? 'organizer_payment_pending' : 'organizer_payment_rejected'
  const payload = { paymentId: payment.id }
  for (const to of emails) await enqueue(c, { booking, channel: 'email', type, recipient: to, key: `${type}:${payment.id}:email:${to}`, payload })
  // With only email alerts set up, a missing phone setup is not a failure.
  if (emails.length && (ctx.notify.name === 'none' || !phones.length)) return
  if (!phones.length) {
    await enqueue(c, { booking, channel, type, recipient: 'unconfigured', key: `${type}:${payment.id}:unconfigured`, payload })
    return
  }
  for (const phone of phones) await enqueue(c, { booking, channel, type, recipient: phone, key: `${type}:${payment.id}:${phone}`, payload })
}

// ─── payment gateway (Razorpay) ──────────────────────────────────────────────
export async function createGatewayOrder(ctx, booking) {
  const settings = await getSettings(ctx.db)
  if (paymentMode(settings, ctx.cfg) !== 'razorpay') throw httpError(409, 'wrong_mode', 'Online checkout is not enabled.')
  if (!ctx.razorpay.configured) throw httpError(503, 'gateway_unconfigured', 'Online payments are not configured yet.')
  if (!['AWAITING_PAYMENT', 'PAYMENT_REJECTED'].includes(booking.status)) throw httpError(409, 'not_awaiting_payment', 'This booking is not awaiting payment.')
  let p = await ctx.db.one(`SELECT * FROM payments WHERE booking_id = $1 AND method = 'razorpay' AND status = 'CREATED' AND amount_paise = $2 ORDER BY created_at DESC LIMIT 1`, [booking.id, booking.final_paise])
  if (!p) {
    const order = await ctx.razorpay.createOrder({ amountPaise: booking.final_paise, receipt: booking.booking_code, notes: { booking: booking.booking_code } })
    if (order.amount !== booking.final_paise) throw httpError(502, 'gateway_amount', 'Payment gateway returned an unexpected amount.')
    p = await ctx.db.one(`INSERT INTO payments (booking_id, method, amount_paise, status, gateway_order_id) VALUES ($1, 'razorpay', $2, 'CREATED', $3) RETURNING *`, [booking.id, booking.final_paise, order.id])
  }
  return { keyId: ctx.razorpay.keyId, orderId: p.gateway_order_id, amountPaise: p.amount_paise, currency: 'INR', name: 'FERAL', prefill: { name: booking.holder_name, email: booking.email, contact: booking.phone } }
}

// Marks a gateway payment as captured. Called from the checkout callback (after
// signature verification) and from the verified webhook; safe to call twice.
export async function recordGatewayCapture(ctx, { orderId, paymentId, amountPaise = null, source, ip = null }) {
  const settings = await getSettings(ctx.db)
  return ctx.db.tx(async (c) => {
    // Lock order everywhere: booking first, then its payment (avoids deadlocks
    // between a webhook and an approval running at the same time).
    const ref = await c.one('SELECT booking_id FROM payments WHERE gateway_order_id = $1', [orderId])
    if (!ref) throw httpError(404, 'order_unknown', 'Unknown order.')
    const b = await c.one('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [ref.booking_id])
    const p = await c.one('SELECT * FROM payments WHERE gateway_order_id = $1 FOR UPDATE', [orderId])
    if (amountPaise !== null && amountPaise !== p.amount_paise) throw httpError(400, 'amount_mismatch', 'Captured amount does not match the booking.')
    if (p.status !== 'CREATED') return { booking: b, payment: p, duplicate: true }
    const live = await c.one(`SELECT id FROM payments WHERE booking_id = $1 AND status IN ('SUBMITTED','APPROVED')`, [b.id])
    if (live) return { booking: b, payment: p, duplicate: true }
    const upd = await c.one(
      `UPDATE payments SET status = 'SUBMITTED', gateway_payment_id = $2, transaction_reference = $2, gateway_verified = true, submitted_at = now() WHERE id = $1 RETURNING *`,
      [p.id, paymentId],
    )
    const ub = await c.one(`UPDATE bookings SET status = 'PAYMENT_PENDING_VERIFICATION', updated_at = now() WHERE id = $1 RETURNING *`, [b.id])
    await audit(c, { actor: source === 'webhook' ? 'razorpay webhook' : 'customer', action: 'payment_submitted', booking: ub, from: b.status, to: ub.status, details: { method: 'razorpay', paymentId, orderId, gatewayVerified: true }, ip })
    await notifyOrganizer(ctx, c, settings, ub, upd, 'payment_pending')
    return { booking: ub, payment: upd, duplicate: false }
  })
}
