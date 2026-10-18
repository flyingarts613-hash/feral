// Offline pass issuance (Admin → Issue Offline Pass).
//
// An admin records a payment received in person (cash / UPI / other) and the
// server creates a PAID booking with one pass per attendee, using the same pass
// IDs, QR verification tokens, check-in and email outbox as online bookings.
//
// Order of work, so nothing half-done is ever sent:
//   1. validate + price on the server (the browser's numbers are not trusted)
//   2. draw pass IDs + QR tokens and render the PDF and receipt (no DB writes yet)
//   3. one transaction: customer, booking, payment (APPROVED), files, passes,
//      audit entry and the queued email — all or nothing
//   4. only then send the email (immediately, so the admin sees the result);
//      a failed send stays queued for automatic retries and can be resent
//      without creating new passes.

import { getSettings } from './settings.js'
import { audit, adminActor } from './audit.js'
import { enqueue } from './outbox.js'
import { httpError, mintLink, tokenHash } from './bookings.js'
import { qrTokenHash, verifyUrlFor } from './payments.js'
import { renderOfflinePasses, renderReceipt, METHOD_LABEL } from './documents.js'
import { offlinePassesEmail } from './emails.js'
import { qrPng } from './passArt.js'
import { deliverNow } from './worker.js'
import { decrypt, encrypt, newBookingCode, newPassCode, randomToken, sha256 } from '../lib/security.js'
import { CATEGORY_LABEL } from '../lib/format.js'

export const MAX_OFFLINE_PASSES = 10
export const OFFLINE_METHOD = { cash: 'offline_cash', upi: 'offline_upi', other: 'offline_other' }
const DUPLICATE_WINDOW_MINUTES = 30
const WEBSITE = 'www.getferal.in'

const EMAIL_STATUS_SQL = `
  LEFT JOIN LATERAL (
    SELECT id, status, attempts, max_attempts, last_error, sent_at, delivered_at, provider_status, updated_at
      FROM notifications WHERE booking_id = b.id AND type = 'offline_passes' ORDER BY created_at DESC LIMIT 1
  ) n ON true`

// ─── issue ─────────────────────────────────────────────────────────────────
/**
 * input (already schema-validated by the route): { name, email, phone, category,
 *   quantity, attendeeNames[], notes, paymentMethod, reference, amountPaise,
 *   overrideReason, paymentReceived: true, allowDuplicate }
 */
export async function issueOffline(ctx, admin, input, { idempotencyKey, ip = null, newCode = newPassCode } = {}) {
  if (input.paymentReceived !== true) throw httpError(400, 'payment_not_confirmed', 'Confirm that the payment has been received.', { field: 'paymentReceived' })
  const settings = await getSettings(ctx.db)

  // a repeated submission of the same form (double click, retry after a timeout)
  const again = await ctx.db.one(`SELECT * FROM bookings WHERE idempotency_key = $1`, [idempotencyKey])
  if (again) {
    if (again.source !== 'offline') throw httpError(409, 'idempotency_conflict', 'This request was already used for another booking.')
    return { duplicate: true, booking: await offlineView(ctx, again.booking_code) }
  }

  const quantity = input.quantity
  const unit = settings.pricing[input.category]
  const listPaise = unit * quantity
  const override = input.amountPaise !== listPaise
  const reason = (input.overrideReason || '').trim()
  if (override && reason.length < 3) {
    throw httpError(400, 'override_reason_required', `The amount differs from the price list (${listPaise / 100} rupees). Add a reason for the change.`, { field: 'overrideReason' })
  }

  if (!input.allowDuplicate) {
    const dup = await ctx.db.one(
      `SELECT booking_code, created_at FROM bookings
        WHERE source = 'offline' AND lower(email) = $1 AND category = $2 AND quantity = $3
          AND created_at > now() - make_interval(mins => $4)
        ORDER BY created_at DESC LIMIT 1`,
      [input.email, input.category, quantity, DUPLICATE_WINDOW_MINUTES],
    )
    if (dup) {
      throw httpError(409, 'possible_duplicate', `${dup.booking_code} was issued to this email for the same passes a few minutes ago. Tick "issue anyway" only if this is a separate purchase.`, {
        bookingId: dup.booking_code,
      })
    }
  }

  // who is on each pass: named attendees first, the purchaser for the rest
  const names = Array.from({ length: quantity }, (_, i) => input.attendeeNames?.[i] || input.name)
  const method = OFFLINE_METHOD[input.paymentMethod]
  const original = Math.max(listPaise, input.amountPaise)
  const discount = original - input.amountPaise

  for (let attempt = 1; ; attempt++) {
    const bookingCode = newBookingCode()
    const passes = []
    const seen = new Set()
    while (passes.length < quantity) {
      const code = newCode()
      if (seen.has(code)) continue
      seen.add(code)
      const token = randomToken(24)
      passes.push({ seq: passes.length + 1, passCode: code, token, holderName: names[passes.length], verifyUrl: verifyUrlFor(ctx, token) })
    }

    // render first: if this fails, nothing has been written or sent
    let rendered
    let receipt
    try {
      rendered = await renderOfflinePasses({ bookingCode, category: input.category, quantity, event: settings.event, website: WEBSITE, passes })
      receipt = await renderReceipt({
        preliminary: false,
        bookingCode,
        holderName: input.name,
        email: input.email,
        phone: input.phone,
        category: input.category,
        quantity,
        referralCode: null,
        originalPaise: original,
        discountPaise: discount,
        finalPaise: input.amountPaise,
        method,
        reference: input.reference || null,
        verifiedAt: new Date(),
        issuedAt: new Date(),
        event: settings.event,
      })
    } catch (e) {
      ctx.log.error({ err: e.message }, 'offline pass rendering failed')
      throw httpError(500, 'pass_generation_failed', 'The passes could not be generated. Nothing was saved and no email was sent. Please try again.')
    }

    try {
      const out = await ctx.db.tx(async (c) => {
        const customer = await c.one(
          `INSERT INTO customers (email, name, phone) VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET updated_at = now() RETURNING id`,
          [input.email, input.name, input.phone],
        )
        const b = await c.one(
          `INSERT INTO bookings (booking_code, customer_id, holder_name, email, phone, category, original_paise, discount_paise, final_paise,
                                 status, access_token_hash, idempotency_key, created_ip, source, quantity, notes, price_override, price_override_reason, issued_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PAID',$10,$11,$12,'offline',$13,$14,$15,$16,$17) RETURNING *`,
          [bookingCode, customer.id, input.name, input.email, input.phone, input.category, original, discount, input.amountPaise,
           tokenHash(ctx, randomToken()), idempotencyKey, ip, quantity, input.notes || null, override, override ? reason : null, adminActor(admin)],
        )
        const pay = await c.one(
          `INSERT INTO payments (booking_id, method, transaction_reference, amount_paise, status, submitted_at, approved_at, reviewed_by, reviewed_by_label)
           VALUES ($1, $2, $3, $4, 'APPROVED', now(), now(), $5, $6) RETURNING *`,
          [b.id, method, input.reference || null, input.amountPaise, admin.id, adminActor(admin)],
        )
        const file = (kind, mime, bytes) =>
          c.one(`INSERT INTO files (kind, mime, bytes, size, sha256) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [kind, mime, bytes, bytes.length, sha256(bytes)])
        const pdf = await file('pass_pdf', 'application/pdf', rendered.pdf)
        const rec = await file('receipt_pdf', 'application/pdf', receipt)
        for (const p of passes) {
          await c.query(
            `INSERT INTO passes (booking_id, payment_id, seq, holder_name, pass_code, qr_token_hash, qr_token_enc, pdf_file_id, receipt_file_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'GENERATED')`,
            [b.id, pay.id, p.seq, p.holderName, p.passCode, qrTokenHash(ctx, p.token), encrypt(ctx.cfg.appSecret, p.token), pdf.id, rec.id],
          )
        }
        await audit(c, {
          admin,
          action: 'offline_booking_issued',
          booking: b,
          to: 'PAID',
          details: {
            category: b.category,
            quantity,
            amountPaise: input.amountPaise,
            listPaise,
            priceOverride: override,
            overrideReason: override ? reason : undefined,
            method,
            reference: input.reference || undefined,
            passCodes: passes.map((p) => p.passCode),
          },
          ip,
        })
        // held back from the background worker for a moment: it is sent right below
        const notificationId = await enqueue(c, { booking: b, channel: 'email', type: 'offline_passes', recipient: b.email, key: `offline_passes:${b.id}:1`, delaySeconds: 60 })
        return { b, notificationId }
      })
      await deliverNow(ctx, out.notificationId)
      return { duplicate: false, booking: await offlineView(ctx, out.b.booking_code) }
    } catch (e) {
      if (e.code !== '23505') throw e
      if (e.constraint === 'bookings_idempotency_key_key') {
        // the same form was submitted twice at the same moment; the other one won
        const won = await ctx.db.one(`SELECT booking_code FROM bookings WHERE idempotency_key = $1`, [idempotencyKey])
        return { duplicate: true, booking: await offlineView(ctx, won.booking_code) }
      }
      if (attempt >= 3) throw e
      ctx.log.warn({ attempt, constraint: e.constraint }, 'offline issue: ID collision, drawing new IDs')
    }
  }
}

// ─── email ─────────────────────────────────────────────────────────────────
// Builds the confirmation email from what was stored at issue time (passes,
// PDF, receipt). Used by the worker for the first send, retries and resends.
export async function offlinePassesMail(ctx, booking, settings) {
  const passes = await ctx.db.many(`SELECT * FROM passes WHERE booking_id = $1 AND status <> 'CANCELLED' ORDER BY seq`, [booking.id])
  if (!passes.length) throw new Error('no passes for this booking')
  const payment = await ctx.db.one(`SELECT * FROM payments WHERE id = $1`, [passes[0].payment_id])
  if (payment?.status !== 'APPROVED') throw new Error('payment is not approved')
  const files = await ctx.db.many('SELECT id, bytes FROM files WHERE id = ANY($1)', [[passes[0].pdf_file_id, passes[0].receipt_file_id]])
  const pdf = files.find((f) => f.id === passes[0].pdf_file_id)?.bytes
  const receipt = files.find((f) => f.id === passes[0].receipt_file_id)?.bytes
  if (!pdf || !receipt) throw new Error('pass documents missing')
  const dl = await mintLink(ctx, ctx.db, booking.id, 'pass_download', settings)
  const downloadUrl = `${ctx.cfg.apiUrl}/api/public/bookings/${encodeURIComponent(booking.booking_code)}/pass.pdf?t=${encodeURIComponent(dl)}`
  const qrs = []
  for (const p of passes) qrs.push({ seq: p.seq, png: await qrPng(verifyUrlFor(ctx, decrypt(ctx.cfg.appSecret, p.qr_token_enc))) })
  const mail = offlinePassesEmail({ settings, booking, passes, methodLabel: METHOD_LABEL[payment.method], downloadUrl })
  return {
    ...mail,
    attachments: [
      { filename: `FERAL-2026-${passes.length > 1 ? 'Passes' : 'Pass'}-${booking.booking_code}.pdf`, content: pdf, contentType: 'application/pdf' },
      { filename: `FERAL-receipt-${booking.booking_code}.pdf`, content: receipt, contentType: 'application/pdf' },
      ...qrs.map((q) => ({ filename: `feral-qr-${q.seq}.png`, content: q.png, contentType: 'image/png', cid: `feral-qr-${q.seq}`, inline: true })),
    ],
  }
}

// Resend: never creates passes. A message still queued or failed is sent again
// as is; after a successful send a new copy is queued (refused within a minute
// of the last one, so a double click cannot send two).
export async function resendOffline(ctx, admin, bookingCode, { ip = null } = {}) {
  const id = await ctx.db.tx(async (c) => {
    const b = await c.one(`SELECT * FROM bookings WHERE booking_code = $1 FOR UPDATE`, [bookingCode])
    if (!b || b.source !== 'offline') throw httpError(404, 'not_found', 'Offline booking not found.')
    const n = await c.one(`SELECT * FROM notifications WHERE booking_id = $1 AND type = 'offline_passes' ORDER BY created_at DESC LIMIT 1`, [b.id])
    let nid
    if (n && ['QUEUED', 'SENDING'].includes(n.status)) nid = n.id
    else if (n?.status === 'FAILED') {
      await c.query(`UPDATE notifications SET status = 'QUEUED', attempts = 0, last_error = NULL, next_attempt_at = now() + interval '60 seconds', updated_at = now() WHERE id = $1`, [n.id])
      nid = n.id
    } else {
      if (n?.sent_at && Date.now() - new Date(n.sent_at).getTime() < 60_000) throw httpError(409, 'recently_sent', 'The email was sent less than a minute ago. Wait a moment before sending it again.')
      const count = (await c.one(`SELECT count(*)::int AS n FROM notifications WHERE booking_id = $1 AND type = 'offline_passes'`, [b.id])).n
      nid = await enqueue(c, { booking: b, channel: 'email', type: 'offline_passes', recipient: b.email, key: `offline_passes:${b.id}:${count + 1}`, delaySeconds: 60 })
    }
    await audit(c, { admin, action: 'offline_email_resend', booking: b, details: { notificationId: nid, previousStatus: n?.status ?? null }, ip })
    return nid
  })
  await deliverNow(ctx, id)
  return offlineView(ctx, bookingCode)
}

// Test email to the signed-in admin: a SAMPLE pass (not stored, QR not valid).
export async function sendOfflineTestEmail(ctx, admin, { ip = null } = {}) {
  const settings = await getSettings(ctx.db)
  const booking = { booking_code: 'FRL-SAMPLE', holder_name: admin.name || 'FERAL Admin', category: 'male', final_paise: settings.pricing.male }
  const passes = [{ seq: 1, pass_code: 'FERAL-2026-SAMPLE', holder_name: booking.holder_name }]
  const verifyUrl = `${ctx.cfg.passVerifyUrl}/SAMPLE-NOT-A-VALID-PASS`
  const r = await renderOfflinePasses({
    bookingCode: booking.booking_code,
    category: 'male',
    quantity: 1,
    event: settings.event,
    website: WEBSITE,
    sample: true,
    passes: [{ seq: 1, passCode: passes[0].pass_code, holderName: booking.holder_name, verifyUrl }],
  })
  const mail = offlinePassesEmail({ settings, booking, passes, methodLabel: METHOD_LABEL.offline_cash, downloadUrl: null, sample: true })
  try {
    const sent = await ctx.email.send({
      to: admin.email,
      ...mail,
      attachments: [
        { filename: 'FERAL-2026-Pass-SAMPLE.pdf', content: r.pdf, contentType: 'application/pdf' },
        { filename: 'feral-qr-1.png', content: r.qrPngs[0], contentType: 'image/png', cid: 'feral-qr-1', inline: true },
      ],
      idempotencyKey: `offline-test-${randomToken(9)}`,
    })
    await audit(ctx.db, { admin, action: 'offline_test_email_sent', details: { to: admin.email, provider: sent.provider }, ip })
    return { ok: true, to: admin.email, provider: sent.provider }
  } catch (e) {
    await audit(ctx.db, { admin, action: 'offline_test_email_failed', details: { to: admin.email, error: e.message }, ip })
    return { ok: false, to: admin.email, error: e.message }
  }
}

// ─── views ─────────────────────────────────────────────────────────────────
const emailState = (n) => {
  if (!n?.id) return { status: 'NONE' }
  return {
    status: n.provider_status === 'delivered' || n.status === 'DELIVERED' ? 'DELIVERED' : n.status,
    attempts: n.attempts,
    maxAttempts: n.max_attempts,
    error: n.last_error,
    sentAt: n.sent_at,
    updatedAt: n.updated_at,
  }
}

export async function offlineView(ctx, bookingCode) {
  const b = await ctx.db.one(
    `SELECT b.*, p.method, p.transaction_reference, p.status AS payment_status, p.amount_paise, p.approved_at,
            n.id AS n_id, n.status AS n_status, n.attempts AS n_attempts, n.max_attempts AS n_max, n.last_error AS n_error,
            n.sent_at AS n_sent_at, n.provider_status AS n_provider_status, n.updated_at AS n_updated_at
       FROM bookings b
       JOIN payments p ON p.booking_id = b.id AND p.status = 'APPROVED'
       ${EMAIL_STATUS_SQL}
      WHERE b.booking_code = $1 AND b.source = 'offline'`,
    [String(bookingCode).toUpperCase()],
  )
  if (!b) throw httpError(404, 'not_found', 'Offline booking not found.')
  const passes = await ctx.db.many(
    `SELECT seq, pass_code, COALESCE(holder_name, $2) AS holder_name, status, redeemed_at, redeemed_by FROM passes WHERE booking_id = $1 ORDER BY seq`,
    [b.id, b.holder_name],
  )
  const history = await ctx.db.many(
    `SELECT id, status, attempts, last_error, sent_at, created_at FROM notifications WHERE booking_id = $1 AND type = 'offline_passes' ORDER BY created_at`,
    [b.id],
  )
  const auditRows = await ctx.db.many(`SELECT actor, action, details, created_at FROM audit_logs WHERE booking_id = $1 ORDER BY id`, [b.id])
  return {
    bookingId: b.booking_code,
    source: 'offline',
    holderName: b.holder_name,
    email: b.email,
    phone: b.phone,
    category: b.category,
    categoryLabel: CATEGORY_LABEL[b.category],
    quantity: b.quantity,
    amountPaise: b.final_paise,
    priceOverride: b.price_override,
    overrideReason: b.price_override_reason,
    method: b.method,
    methodLabel: METHOD_LABEL[b.method],
    reference: b.transaction_reference,
    notes: b.notes,
    paymentStatus: b.payment_status === 'APPROVED' ? 'PAID' : b.payment_status,
    status: b.status,
    issuedBy: b.issued_by,
    createdAt: b.created_at,
    passes: passes.map((p) => ({ seq: p.seq, passCode: p.pass_code, holderName: p.holder_name, status: p.status, checkedInAt: p.redeemed_at, checkedInBy: p.redeemed_by })),
    emailStatus: emailState({ id: b.n_id, status: b.n_status, attempts: b.n_attempts, max_attempts: b.n_max, last_error: b.n_error, sent_at: b.n_sent_at, provider_status: b.n_provider_status, updated_at: b.n_updated_at }),
    emailHistory: history,
    audit: auditRows,
  }
}

export async function listOffline(ctx, f) {
  const w = [`b.source = 'offline'`]
  const p = []
  const add = (sql, v) => {
    p.push(v)
    w.push(sql.replaceAll('?', `$${p.length}`))
  }
  if (f.q) {
    const like = `%${f.q.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%`
    add('(b.booking_code ILIKE ? OR b.holder_name ILIKE ? OR b.email ILIKE ? OR b.phone ILIKE ?)', like)
  }
  if (f.category) add('b.category = ?', f.category)
  if (f.emailStatus) {
    const map = { sent: `n.status = 'SENT' AND coalesce(n.provider_status, '') <> 'delivered'`, delivered: `(n.status = 'DELIVERED' OR n.provider_status = 'delivered')`, failed: `n.status = 'FAILED'`, sending: `n.status IN ('QUEUED', 'SENDING')` }
    if (map[f.emailStatus]) w.push(map[f.emailStatus])
  }
  const where = `WHERE ${w.join(' AND ')}`
  const rows = await ctx.db.many(
    `SELECT b.booking_code, b.holder_name, b.email, b.phone, b.category, b.quantity, b.final_paise, b.status, b.created_at, b.price_override, b.issued_by,
            p.method, p.status AS payment_status,
            n.id AS n_id, n.status AS n_status, n.attempts AS n_attempts, n.max_attempts AS n_max, n.last_error AS n_error, n.sent_at AS n_sent_at,
            n.provider_status AS n_provider_status, n.updated_at AS n_updated_at
       FROM bookings b
       JOIN payments p ON p.booking_id = b.id AND p.status = 'APPROVED'
       ${EMAIL_STATUS_SQL}
      ${where}
      ORDER BY b.created_at DESC LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`,
    p,
  )
  const total = (await ctx.db.one(`SELECT count(*)::int AS n FROM bookings b ${EMAIL_STATUS_SQL} ${where}`, p)).n
  return {
    total,
    page: f.page,
    rows: rows.map((r) => ({
      bookingId: r.booking_code,
      holderName: r.holder_name,
      email: r.email,
      phone: r.phone,
      category: r.category,
      categoryLabel: CATEGORY_LABEL[r.category],
      quantity: r.quantity,
      amountPaise: r.final_paise,
      priceOverride: r.price_override,
      method: r.method,
      methodLabel: METHOD_LABEL[r.method],
      source: 'offline',
      paymentStatus: r.payment_status === 'APPROVED' ? 'PAID' : r.payment_status,
      status: r.status,
      issuedBy: r.issued_by,
      createdAt: r.created_at,
      emailStatus: emailState({ id: r.n_id, status: r.n_status, attempts: r.n_attempts, max_attempts: r.n_max, last_error: r.n_error, sent_at: r.n_sent_at, provider_status: r.n_provider_status, updated_at: r.n_updated_at }),
    })),
  }
}
