import { audit, adminActor } from './audit.js'
import { enqueue } from './outbox.js'
import { getSettings } from './settings.js'
import { httpError, notifyOrganizer } from './bookings.js'
import { renderPass, renderReceipt } from './documents.js'
import { encrypt, keyedHash, newPassCode, PASS_CODE_RE, randomToken, sha256 } from '../lib/security.js'
import { cleanText } from '../lib/format.js'

export const qrTokenHash = (ctx, token) => keyedHash(ctx.cfg.appSecret, `passqr:${token}`)
export const verifyUrlFor = (ctx, token) => `${ctx.cfg.passVerifyUrl}/${token}`

// ─── confirm ─────────────────────────────────────────────────────────────────
// actor: { admin } for a person, or { system: 'razorpay auto-approve' }.
export async function approvePayment(ctx, bookingCode, actor, { ip = null } = {}) {
  const pre = await ctx.db.one(
    `SELECT p.* FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.booking_code = $1 AND p.status = 'SUBMITTED'`,
    [bookingCode],
  )
  // Gateway payments are reconciled against Razorpay's own record first.
  if (pre?.method === 'razorpay') {
    if (!pre.gateway_verified) throw httpError(409, 'gateway_unverified', 'This gateway payment has no verified signature.')
    const rp = await ctx.razorpay.fetchPayment(pre.gateway_payment_id)
    if (rp.status !== 'captured' || rp.order_id !== pre.gateway_order_id || rp.amount !== pre.amount_paise || rp.currency !== 'INR') {
      throw httpError(409, 'gateway_mismatch', `Razorpay reports this payment as "${rp.status}" for ${rp.amount / 100} ${rp.currency} — it cannot be confirmed.`)
    }
  }

  const label = actor.admin ? adminActor(actor.admin) : actor.system
  const booking = await ctx.db.tx(async (c) => {
    const b = await c.one('SELECT * FROM bookings WHERE booking_code = $1 FOR UPDATE', [bookingCode])
    if (!b) throw httpError(404, 'not_found', 'Booking not found.')
    const p = await c.one(`SELECT * FROM payments WHERE booking_id = $1 AND status IN ('SUBMITTED', 'APPROVED') FOR UPDATE`, [b.id])
    if (p?.status === 'APPROVED') throw httpError(409, 'already_approved', 'This payment has already been approved.')
    if (!p || b.status !== 'PAYMENT_PENDING_VERIFICATION') throw httpError(409, 'not_pending', 'This booking has no payment awaiting verification.')
    if (pre && p.id !== pre.id) throw httpError(409, 'changed', 'The payment changed while you were reviewing it. Reload and try again.')
    await c.query(
      `UPDATE payments SET status = 'APPROVED', approved_at = now(), reviewed_by = $2, reviewed_by_label = $3 WHERE id = $1`,
      [p.id, actor.admin?.id ?? null, label],
    )
    const ub = await c.one(`UPDATE bookings SET status = 'PAID', updated_at = now() WHERE id = $1 RETURNING *`, [b.id])
    await audit(c, {
      admin: actor.admin,
      actor: label,
      action: 'payment_approved',
      booking: ub,
      from: b.status,
      to: ub.status,
      details: { paymentId: p.id, method: p.method, reference: p.transaction_reference, amountPaise: p.amount_paise },
      ip,
    })
    return ub
  })

  // The approval is committed. Pass generation failing must not undo it — it can be retried.
  let passError = null
  try {
    await issuePass(ctx, booking.id)
  } catch (e) {
    passError = e.message
    ctx.log.error({ err: e.message, booking: bookingCode }, 'pass generation failed')
    await audit(ctx.db, { actor: 'system', action: 'pass_generation_failed', booking, details: { error: e.message } })
  }
  return { booking, passError }
}

// ─── pass ────────────────────────────────────────────────────────────────────
// Generates the pass + receipt once per booking (UNIQUE booking_id) and queues
// the confirmation email once (dedupe key). Calling it again is a no-op apart
// from re-queuing nothing.
export async function issuePass(ctx, bookingId, { newCode = newPassCode } = {}) {
  const existing = await ctx.db.one('SELECT * FROM passes WHERE booking_id = $1', [bookingId])
  if (existing) return existing

  const booking = await ctx.db.one('SELECT * FROM bookings WHERE id = $1', [bookingId])
  const payment = await ctx.db.one(`SELECT * FROM payments WHERE booking_id = $1 AND status = 'APPROVED'`, [bookingId])
  if (!booking || !payment || !['PAID', 'PASS_ISSUED'].includes(booking.status)) {
    throw httpError(409, 'not_paid', 'A pass can only be issued for an approved payment.')
  }

  const settings = await getSettings(ctx.db)
  const receiptPdf = await renderReceipt({
    preliminary: false,
    bookingCode: booking.booking_code,
    holderName: booking.holder_name,
    email: booking.email,
    phone: booking.phone,
    category: booking.category,
    referralCode: booking.referral_code,
    originalPaise: booking.original_paise,
    discountPaise: booking.discount_paise,
    finalPaise: payment.amount_paise,
    method: payment.method,
    reference: payment.transaction_reference,
    verifiedAt: payment.approved_at,
    issuedAt: new Date(),
    event: settings.event,
  })

  // The pass ID is random; the UNIQUE constraint is the final word, so a
  // collision just means drawing a new ID and rendering again.
  for (let attempt = 1; ; attempt++) {
    const passCode = newCode()
    const token = randomToken(24)
    // Only the attendee's name, pass type, pass ID and event details go on the pass.
    const art = await renderPass({ holderName: booking.holder_name, category: booking.category, passCode, event: settings.event })
    try {
      return await ctx.db.tx(async (c) => {
        const b = await c.one('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId])
        const again = await c.one('SELECT * FROM passes WHERE booking_id = $1', [bookingId])
        if (again) return again
        const file = (kind, mime, bytes) =>
          c.one(`INSERT INTO files (kind, mime, bytes, size, sha256) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [kind, mime, bytes, bytes.length, sha256(bytes)])
        const pdf = await file('pass_pdf', 'application/pdf', art.pdf)
        const png = await file('pass_png', 'image/png', art.png)
        const rec = await file('receipt_pdf', 'application/pdf', receiptPdf)
        const pass = await c.one(
          `INSERT INTO passes (booking_id, payment_id, pass_code, qr_token_hash, qr_token_enc, pdf_file_id, png_file_id, receipt_file_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'GENERATED') RETURNING *`,
          [b.id, payment.id, passCode, qrTokenHash(ctx, token), encrypt(ctx.cfg.appSecret, token), pdf.id, png.id, rec.id],
        )
        await audit(c, { actor: 'system', action: 'pass_generated', booking: b, details: { passCode } })
        await enqueue(c, { booking: b, channel: 'email', type: 'payment_confirmed', recipient: b.email, key: `payment_confirmed:${b.id}` })
        return pass
      })
    } catch (e) {
      if (e.code !== '23505') throw e
      if (e.constraint === 'passes_booking_id_key') return ctx.db.one('SELECT * FROM passes WHERE booking_id = $1', [bookingId]) // concurrent issue won
      if (attempt >= 5) throw e
      ctx.log.warn({ booking: booking.booking_code, attempt }, 'pass ID collision, drawing a new one')
    }
  }
}

// ─── reject ──────────────────────────────────────────────────────────────────
export async function rejectPayment(ctx, bookingCode, actor, { reason = '', ip = null } = {}) {
  const settings = await getSettings(ctx.db)
  const why = cleanText(reason, 500) || null
  const label = actor.admin ? adminActor(actor.admin) : actor.system
  return ctx.db.tx(async (c) => {
    const b = await c.one('SELECT * FROM bookings WHERE booking_code = $1 FOR UPDATE', [bookingCode])
    if (!b) throw httpError(404, 'not_found', 'Booking not found.')
    const p = await c.one(`SELECT * FROM payments WHERE booking_id = $1 AND status IN ('SUBMITTED', 'APPROVED') FOR UPDATE`, [b.id])
    if (p?.status === 'APPROVED') throw httpError(409, 'already_approved', 'This payment is already approved and cannot be rejected here.')
    if (!p || b.status !== 'PAYMENT_PENDING_VERIFICATION') throw httpError(409, 'not_pending', 'This booking has no payment awaiting verification.')
    const up = await c.one(
      `UPDATE payments SET status = 'REJECTED', rejected_at = now(), rejection_reason = $2, reviewed_by = $3, reviewed_by_label = $4 WHERE id = $1 RETURNING *`,
      [p.id, why, actor.admin?.id ?? null, label],
    )
    const ub = await c.one(`UPDATE bookings SET status = 'PAYMENT_REJECTED', updated_at = now() WHERE id = $1 RETURNING *`, [b.id])
    await audit(c, { admin: actor.admin, actor: label, action: 'payment_rejected', booking: ub, from: b.status, to: ub.status, details: { paymentId: p.id, reference: p.transaction_reference, reason: why }, ip })
    await enqueue(c, { booking: ub, channel: 'email', type: 'payment_rejected', recipient: ub.email, key: `payment_rejected:${p.id}`, payload: { paymentId: p.id } })
    await notifyOrganizer(ctx, c, settings, ub, up, 'payment_rejected')
    return ub
  })
}

// ─── pass verification (entry) ───────────────────────────────────────────────
export async function lookupPass(ctx, token) {
  if (!token || token.length < 20 || token.length > 100) return null
  return ctx.db.one(
    `SELECT ps.*, b.holder_name, b.category, b.booking_code, b.status AS booking_status
       FROM passes ps JOIN bookings b ON b.id = ps.booking_id WHERE ps.qr_token_hash = $1`,
    [qrTokenHash(ctx, token)],
  )
}

// Entry staff type the pass ID printed on the pass (FERAL-2026-XXXXXX).
export async function lookupPassByCode(ctx, code) {
  const c = String(code || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!PASS_CODE_RE.test(c)) return null
  return ctx.db.one(
    `SELECT ps.*, b.holder_name, b.category, b.booking_code, b.status AS booking_status
       FROM passes ps JOIN bookings b ON b.id = ps.booking_id WHERE ps.pass_code = $1`,
    [c],
  )
}

export const passState = (pass) => {
  if (!pass) return 'INVALID'
  if (pass.status === 'CANCELLED' || pass.booking_status === 'CANCELLED') return 'CANCELLED'
  return 'VALID'
}
