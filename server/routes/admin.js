import sharp from 'sharp'
import { z } from 'zod'
import { getSettings, setSetting, paymentMode, organizerPhones } from '../services/settings.js'
import { approvePayment, issuePass, rejectPayment, lookupPass, lookupPassByCode, passState } from '../services/payments.js'
import { retryNotification } from '../services/outbox.js'
import { referralUses } from '../services/pricing.js'
import { audit, adminActor } from '../services/audit.js'
import { httpError } from '../services/bookings.js'
import { hashPassword, randomToken, safeEqual, sha256, verifyPassword } from '../lib/security.js'
import { ADMIN_COOKIE as COOKIE, RANK, adminFromRequest, adminTokenHash } from '../services/adminAuth.js'
import { CATEGORY_LABEL, cleanText, normalizeIndianMobile } from '../lib/format.js'
import { offlineRoutes } from './offline.js'

const DUMMY_HASH = await hashPassword(randomToken()) // equalises login timing for unknown emails

const STATUS_GROUPS = {
  pending: ['PAYMENT_PENDING_VERIFICATION'],
  approved: ['PAID', 'PASS_ISSUED'],
  rejected: ['PAYMENT_REJECTED'],
  awaiting: ['AWAITING_PAYMENT'],
  unverified: ['EMAIL_VERIFICATION_PENDING'],
  cancelled: ['CANCELLED'],
}

const rupeesInt = z.number().int().min(0).max(10_000_000_00)
const SETTING_SCHEMAS = {
  event: z.object({
    name: z.string().min(2).max(120),
    shortName: z.string().min(2).max(60),
    dateLabel: z.string().min(2).max(60),
    timeLabel: z.string().min(2).max(60),
    venue: z.string().min(2).max(160),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    entryInstructions: z.string().max(500),
    coordinatorContact: z.string().max(120),
  }),
  pricing: z.object({ male: rupeesInt, female: rupeesInt, couple: rupeesInt, referralDiscount: rupeesInt }),
  minAge: z.number().int().min(0).max(100),
  paymentMode: z.enum(['static_upi', 'razorpay']).nullable(),
  organizerPhones: z.array(z.string()).max(5).transform((arr, c) =>
    arr.map((p) => {
      const n = normalizeIndianMobile(p) || (/^\+\d{8,15}$/.test(p.replace(/\s/g, '')) ? p.replace(/\s/g, '') : null)
      if (!n) c.addIssue({ code: 'custom', message: `Invalid phone number: ${p}` })
      return n
    }),
  ),
  upi: z.object({ vpa: z.string().max(100).regex(/^$|^[\w.-]{2,256}@[a-zA-Z]{2,64}$/, 'Invalid UPI ID'), payeeName: z.string().max(60) }),
  emailTemplates: z.object(
    Object.fromEntries(['otp', 'booking', 'confirmed', 'rejected', 'offline'].map((k) => [k, z.object({ subject: z.string().min(2).max(160), intro: z.string().max(1000) })])),
  ),
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const adminRoutes = (ctx) => async (app) => {
  const { cfg, db } = ctx
  const hashTok = (t) => adminTokenHash(ctx, t)

  // ─── auth ──────────────────────────────────────────────────────────────────
  app.addHook('preHandler', async (req) => {
    if (req.routeOptions.url?.endsWith('/login') || req.routeOptions.url?.endsWith('/setup')) return
    const a = await adminFromRequest(ctx, req)
    if (!a) throw httpError(401, 'unauthenticated', 'Please sign in.')
    if (req.method !== 'GET' && !safeEqual(String(req.headers['x-csrf-token'] || ''), a.csrf)) throw httpError(403, 'csrf', 'Your session expired. Reload the page.')
    req.admin = a
  })
  const need = (req, role) => {
    if (RANK[req.admin.role] < RANK[role]) throw httpError(403, 'forbidden', `This needs the ${role} role.`)
  }

  app.post('/login', { config: { rateLimit: { max: 10 * cfg.rateLimitScale, timeWindow: 15 * 60000 } } }, async (req, reply) => {
    // `loginId` (login ID or email); `email` is still accepted from older clients
    const body = z
      .object({ loginId: z.string().trim().toLowerCase().max(254).optional(), email: z.string().trim().toLowerCase().max(254).optional(), password: z.string().min(1).max(200) })
      .parse(req.body ?? {})
    const loginId = body.loginId || body.email || ''
    const actor = `login attempt <${loginId.slice(0, 120)}>`
    // per-account brute-force guard (on top of the per-IP limit): after N failures
    // in 15 minutes since the last successful sign-in, refuse even the right password
    const recent = await db.one(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE action = 'admin_login_failed' AND actor = $1 AND created_at > now() - interval '15 minutes'
          AND created_at > COALESCE((SELECT last_login_at FROM admins WHERE email = $2), '-infinity')`,
      [actor, loginId],
    )
    if (recent.n >= cfg.adminLoginMaxFailures) {
      await audit(db, { actor, action: 'admin_login_locked', ip: req.ip })
      throw httpError(429, 'login_locked', 'Too many failed sign-in attempts. Try again in 15 minutes.')
    }
    const a = loginId ? await db.one('SELECT * FROM admins WHERE email = $1 AND active', [loginId]) : null
    const ok = await verifyPassword(body.password, a?.password_hash ?? DUMMY_HASH)
    if (!a || !ok) {
      await audit(db, { actor, action: 'admin_login_failed', ip: req.ip })
      throw httpError(401, 'bad_credentials', 'Incorrect login ID or password.')
    }
    const token = randomToken()
    const csrf = randomToken(24)
    await db.query(
      `INSERT INTO admin_sessions (admin_id, token_hash, csrf_token, expires_at, ip, user_agent) VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5, $6)`,
      [a.id, hashTok(token), csrf, cfg.adminSessionHours, req.ip, String(req.headers['user-agent'] || '').slice(0, 200)],
    )
    await db.query('UPDATE admins SET last_login_at = now() WHERE id = $1', [a.id])
    await audit(db, { admin: a, action: 'admin_login', ip: req.ip })
    reply.setCookie(COOKIE, token, { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'strict', path: '/', maxAge: cfg.adminSessionHours * 3600 })
    return { admin: { email: a.email, name: a.name, role: a.role }, csrfToken: csrf }
  })

  // ─── first-owner setup (hosts without a shell for `npm run admin:create`) ────
  // Works only while there are no admins at all AND ADMIN_SETUP_TOKEN (32+
  // random characters, set on the server) is supplied. Once an admin exists it
  // is permanently closed.
  const noAdmins = async (q) => (await q.one('SELECT count(*)::int AS n FROM admins')).n === 0
  app.get('/setup', async () => ({ available: Boolean(cfg.adminSetupToken) && (await noAdmins(db)) }))
  app.post('/setup', { config: { rateLimit: { max: 5 * cfg.rateLimitScale, timeWindow: 15 * 60000 } } }, async (req) => {
    const body = z
      .object({
        token: z.string().max(200),
        email: z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email'),
        name: z.string().trim().min(2).max(80),
        password: z.string().min(12, 'Use at least 12 characters').max(200),
      })
      .parse(req.body ?? {})
    if (!cfg.adminSetupToken || !safeEqual(body.token, cfg.adminSetupToken)) {
      await audit(db, { actor: 'setup attempt', action: 'admin_setup_refused', ip: req.ip })
      throw httpError(403, 'setup_refused', 'Setup is not available.')
    }
    const hash = await hashPassword(body.password)
    const a = await db.tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(82610262)')
      if (!(await noAdmins(c))) throw httpError(409, 'setup_closed', 'An admin already exists. Sign in instead.')
      return c.one(`INSERT INTO admins (email, name, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING *`, [body.email, body.name, hash])
    })
    await audit(db, { admin: a, action: 'admin_setup_owner_created', ip: req.ip })
    return { ok: true, admin: { email: a.email, role: a.role } }
  })

  app.post('/logout', async (req, reply) => {
    await db.query('DELETE FROM admin_sessions WHERE id = $1', [req.admin.sessionId])
    reply.clearCookie(COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/me', async (req) => ({ admin: { email: req.admin.email, name: req.admin.name, role: req.admin.role }, csrfToken: req.admin.csrf }))

  // ─── bookings ──────────────────────────────────────────────────────────────
  const listQuery = z.object({
    status: z.string().optional(),
    q: z.string().max(100).optional(),
    category: z.enum(['male', 'female', 'couple']).optional(),
    referral: z.string().max(40).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
  })

  function where(f) {
    const w = []
    const p = []
    const add = (sql, v) => {
      p.push(v)
      w.push(sql.replace('?', `$${p.length}`))
    }
    if (f.status) {
      const statuses = STATUS_GROUPS[f.status] || [f.status]
      add('b.status = ANY(?)', statuses)
    }
    if (f.category) add('b.category = ?', f.category)
    if (f.referral) f.referral.toLowerCase() === 'none' ? w.push('b.referral_code IS NULL') : add('b.referral_code = ?', f.referral.toUpperCase())
    if (f.from) add(`b.created_at >= (?::date AT TIME ZONE 'Asia/Kolkata')`, f.from)
    if (f.to) add(`b.created_at < ((?::date + 1) AT TIME ZONE 'Asia/Kolkata')`, f.to)
    if (f.q) {
      const like = `%${f.q.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%`
      p.push(like)
      const i = p.length
      const digits = f.q.replace(/\D/g, '')
      let phone = ''
      if (digits.length >= 4) {
        p.push(`%${digits}%`)
        phone = ` OR b.phone LIKE $${i + 1}`
      }
      w.push(`(b.booking_code ILIKE $${i} OR b.holder_name ILIKE $${i} OR b.email ILIKE $${i}${phone})`)
    }
    return { sql: w.length ? `WHERE ${w.join(' AND ')}` : '', params: p }
  }

  const SELECT = `
    SELECT b.id, b.booking_code, b.holder_name, b.email, b.phone, b.age, b.gender, b.category, b.referral_code, b.source, b.quantity,
           b.original_paise, b.discount_paise, b.final_paise, b.status, b.created_at, b.email_verified_at,
           p.id AS payment_id, p.method, p.transaction_reference, p.status AS payment_status, p.screenshot_file_id IS NOT NULL AS has_screenshot,
           p.submitted_at, p.approved_at, p.rejected_at, p.rejection_reason, p.reviewed_by_label, p.gateway_verified, p.amount_paise,
           ps.pass_code, ps.status AS pass_status, ps.redeemed_at,
           (SELECT coalesce(json_agg(json_build_object('id', n.id, 'type', n.type, 'channel', n.channel, 'recipient', n.recipient, 'status', n.status,
                    'attempts', n.attempts, 'error', n.last_error, 'provider', n.provider, 'updatedAt', n.updated_at) ORDER BY n.created_at), '[]')
              FROM notifications n WHERE n.booking_id = b.id AND n.type <> 'otp') AS notifications
      FROM bookings b
      LEFT JOIN LATERAL (SELECT * FROM payments WHERE booking_id = b.id AND status <> 'CREATED' ORDER BY created_at DESC LIMIT 1) p ON true
      LEFT JOIN passes ps ON ps.booking_id = b.id AND ps.seq = 1`

  app.get('/bookings', async (req) => {
    const f = listQuery.parse(req.query ?? {})
    const { sql, params } = where(f)
    const order = f.status === 'pending' ? 'p.submitted_at ASC NULLS LAST' : 'b.created_at DESC'
    const rows = await db.many(`${SELECT} ${sql} ORDER BY ${order} LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`, params)
    const total = (await db.one(`SELECT count(*)::int AS n FROM bookings b ${sql}`, params)).n
    const pending = (await db.one(`SELECT count(*)::int AS n FROM bookings WHERE status = 'PAYMENT_PENDING_VERIFICATION'`)).n
    return { total, pending, page: f.page, rows }
  })

  const findBooking = async (code) => {
    const b = await db.one('SELECT * FROM bookings WHERE booking_code = $1', [String(code).toUpperCase()])
    if (!b) throw httpError(404, 'not_found', 'Booking not found.')
    return b
  }

  app.get('/bookings/:code', async (req) => {
    const b = await findBooking(req.params.code)
    const [row] = await db.many(`${SELECT} WHERE b.id = $1`, [b.id])
    return {
      booking: row,
      payments: await db.many(
        `SELECT id, method, transaction_reference, amount_paise, status, screenshot_file_id IS NOT NULL AS has_screenshot, gateway_order_id, gateway_payment_id,
                gateway_verified, reviewed_by_label, submitted_at, approved_at, rejected_at, rejection_reason, created_at
           FROM payments WHERE booking_id = $1 ORDER BY created_at DESC`,
        [b.id],
      ),
      notifications: await db.many(
        `SELECT id, channel, type, recipient, status, attempts, max_attempts, provider, provider_message_id, provider_status, last_error, created_at, sent_at, delivered_at, next_attempt_at
           FROM notifications WHERE booking_id = $1 ORDER BY created_at`,
        [b.id],
      ),
      audit: await db.many('SELECT actor, action, from_status, to_status, details, created_at FROM audit_logs WHERE booking_id = $1 ORDER BY created_at', [b.id]),
    }
  })

  app.get('/bookings/:code/screenshot/:paymentId', async (req, reply) => {
    const b = await findBooking(req.params.code)
    const f = await db.one(
      `SELECT f.mime, f.bytes FROM payments p JOIN files f ON f.id = p.screenshot_file_id WHERE p.id = $1 AND p.booking_id = $2`,
      [Number(req.params.paymentId) || 0, b.id],
    )
    if (!f?.bytes) throw httpError(404, 'not_found', 'No screenshot (or it was purged by the retention policy).')
    return reply.type(f.mime).header('Cache-Control', 'private, no-store').send(f.bytes)
  })

  for (const doc of ['pass', 'receipt']) {
    app.get(`/bookings/:code/${doc}.pdf`, async (req, reply) => {
      const b = await findBooking(req.params.code)
      const col = doc === 'pass' ? 'pdf_file_id' : 'receipt_file_id'
      const f = await db.one(`SELECT f.bytes FROM passes ps JOIN files f ON f.id = ps.${col} WHERE ps.booking_id = $1 ORDER BY ps.seq LIMIT 1`, [b.id])
      if (!f?.bytes) throw httpError(404, 'not_found', 'Not generated yet.')
      return reply.type('application/pdf').header('Content-Disposition', `inline; filename="${b.booking_code}-${doc}.pdf"`).send(f.bytes)
    })
  }

  app.get('/bookings/:code/pass.png', async (req, reply) => {
    const b = await findBooking(req.params.code)
    const f = await db.one(`SELECT f.bytes FROM passes ps JOIN files f ON f.id = ps.png_file_id WHERE ps.booking_id = $1 ORDER BY ps.seq LIMIT 1`, [b.id])
    if (!f?.bytes) throw httpError(404, 'not_found', 'Not generated yet.')
    return reply.type('image/png').header('Cache-Control', 'private, no-store').header('Content-Disposition', `inline; filename="${b.booking_code}-pass.png"`).send(f.bytes)
  })

  const confirmBody = z.object({ confirm: z.literal(true, { error: 'Confirmation required' }) })

  app.post('/bookings/:code/approve', async (req) => {
    need(req, 'approver')
    confirmBody.parse(req.body ?? {})
    const r = await approvePayment(ctx, String(req.params.code).toUpperCase(), { admin: req.admin }, { ip: req.ip })
    return { ok: true, passError: r.passError }
  })

  app.post('/bookings/:code/reject', async (req) => {
    need(req, 'approver')
    const { reason } = confirmBody.extend({ reason: z.string().max(500).optional() }).parse(req.body ?? {})
    await rejectPayment(ctx, String(req.params.code).toUpperCase(), { admin: req.admin }, { reason, ip: req.ip })
    return { ok: true }
  })

  // Retry pass generation after a failure (no-op if the pass exists).
  app.post('/bookings/:code/issue-pass', async (req) => {
    need(req, 'approver')
    const b = await findBooking(req.params.code)
    const pass = await issuePass(ctx, b.id)
    await audit(db, { admin: req.admin, action: 'pass_generation_retry', booking: b, ip: req.ip })
    return { ok: true, passCode: pass.pass_code }
  })

  app.post('/notifications/:id/retry', async (req) => {
    need(req, 'approver')
    const n = await retryNotification(db, Number(req.params.id) || 0)
    if (!n) throw httpError(409, 'not_failed', 'Only failed messages can be retried.')
    await audit(db, { admin: req.admin, action: 'notification_retry', booking: n.booking_id ? { id: n.booking_id } : null, details: { notificationId: n.id, type: n.type }, ip: req.ip })
    return { ok: true }
  })

  app.get('/notifications', async (req) => {
    const { status, page } = z.object({ status: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query ?? {})
    return db.many(
      `SELECT n.id, n.channel, n.type, n.recipient, n.status, n.attempts, n.max_attempts, n.provider, n.provider_status, n.last_error,
              n.created_at, n.sent_at, n.delivered_at, n.next_attempt_at, b.booking_code
         FROM notifications n LEFT JOIN bookings b ON b.id = n.booking_id
        WHERE ($1::text IS NULL OR n.status = $1) ORDER BY n.created_at DESC LIMIT 100 OFFSET $2`,
      [status || null, (page - 1) * 100],
    )
  })

  app.get('/audit', async (req) => {
    const { page } = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query ?? {})
    return db.many(`SELECT actor, action, booking_code, from_status, to_status, details, ip, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100 OFFSET $1`, [(page - 1) * 100])
  })

  // ─── overview ──────────────────────────────────────────────────────────────
  app.get('/summary', async () => {
    const s = await getSettings(db)
    const counts = Object.fromEntries((await db.many('SELECT status, count(*)::int AS n FROM bookings GROUP BY status')).map((r) => [r.status, r.n]))
    const revenue = (await db.one(`SELECT coalesce(sum(amount_paise), 0)::bigint AS paise, count(*)::int AS n FROM payments WHERE status = 'APPROVED'`))
    const passes = (await db.one(`SELECT count(*) FILTER (WHERE status = 'ISSUED')::int AS issued, count(*)::int AS generated, count(redeemed_at)::int AS checked_in FROM passes`))
    const byCategory = await db.many(
      `SELECT b.category, count(*)::int AS paid, coalesce(sum(p.amount_paise), 0)::bigint AS revenue
         FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.status = 'APPROVED' GROUP BY b.category`,
    )
    const referrals = await db.many(
      `SELECT r.code, r.active, r.max_uses,
              count(b.id) FILTER (WHERE b.status NOT IN ('EMAIL_VERIFICATION_PENDING', 'CANCELLED'))::int AS bookings,
              count(p.id)::int AS paid, coalesce(sum(p.amount_paise), 0)::bigint AS revenue
         FROM referral_codes r
         LEFT JOIN bookings b ON b.referral_code_id = r.id
         LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'APPROVED'
        GROUP BY r.id ORDER BY bookings DESC, r.code`,
    )
    const failedNotifications = (await db.one(`SELECT count(*)::int AS n FROM notifications WHERE status = 'FAILED' AND type <> 'otp'`)).n
    const warnings = [...cfg.warnings]
    if (!s.paymentQrFileId && paymentMode(s, cfg) === 'static_upi') warnings.push('No payment QR uploaded — customers cannot pay until you upload it in Settings.')
    if (!organizerPhones(s, cfg).length) warnings.push('No organizer phone number set — payment alerts cannot be sent.')
    if (paymentMode(s, cfg) === 'razorpay' && !ctx.razorpay.configured) warnings.push('Payment mode is Razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set.')
    return {
      totals: {
        bookings: Object.values(counts).reduce((a, b) => a + b, 0),
        unverified: counts.EMAIL_VERIFICATION_PENDING || 0,
        awaitingPayment: counts.AWAITING_PAYMENT || 0,
        pending: counts.PAYMENT_PENDING_VERIFICATION || 0,
        paid: (counts.PAID || 0) + (counts.PASS_ISSUED || 0),
        rejected: counts.PAYMENT_REJECTED || 0,
        cancelled: counts.CANCELLED || 0,
        passesIssued: passes.issued,
        passesGenerated: passes.generated,
        checkedIn: passes.checked_in,
        revenuePaise: revenue.paise,
        failedNotifications,
      },
      byCategory: byCategory.map((r) => ({ ...r, label: CATEGORY_LABEL[r.category] })),
      referrals,
      warnings,
      providers: { email: ctx.email.name, notify: ctx.notify.name, paymentMode: paymentMode(s, cfg) },
    }
  })

  app.get('/export.csv', async (req, reply) => {
    const rows = await db.many(`${SELECT} ORDER BY b.created_at`)
    const cols = [
      ['Booking ID', 'booking_code'], ['Name', 'holder_name'], ['Email', 'email'], ['Phone', 'phone'], ['Age', 'age'], ['Gender', 'gender'],
      ['Pass', (r) => CATEGORY_LABEL[r.category]], ['Referral', 'referral_code'], ['Original (Rs)', (r) => r.original_paise / 100],
      ['Discount (Rs)', (r) => r.discount_paise / 100], ['Final (Rs)', (r) => r.final_paise / 100], ['Booking status', 'status'],
      ['Payment status', 'payment_status'], ['Payment method', 'method'], ['Reference', 'transaction_reference'], ['Reviewed by', 'reviewed_by_label'],
      ['Source', 'source'], ['Passes', 'quantity'], ['Pass ID', 'pass_code'], ['Pass status', 'pass_status'], ['Checked in', 'redeemed_at'], ['Created', 'created_at'],
      ['Submitted', 'submitted_at'], ['Approved', 'approved_at'], ['Rejected', 'rejected_at'], ['Rejection reason', 'rejection_reason'],
    ]
    const val = (r, c) => (typeof c === 'function' ? c(r) : r[c] instanceof Date ? r[c].toISOString() : r[c])
    const csv = [cols.map((c) => csvCell(c[0])).join(','), ...rows.map((r) => cols.map((c) => csvCell(val(r, c[1]))).join(','))].join('\r\n')
    await audit(db, { admin: req.admin, action: 'bookings_exported', details: { rows: rows.length }, ip: req.ip })
    return reply.type('text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="feral-bookings-${new Date().toISOString().slice(0, 10)}.csv"`).send('﻿' + csv)
  })

  // ─── settings ──────────────────────────────────────────────────────────────
  app.get('/settings', async () => {
    const s = await getSettings(db)
    return { ...s, effective: { paymentMode: paymentMode(s, cfg), organizerPhones: organizerPhones(s, cfg) } }
  })

  app.put('/settings/:key', async (req) => {
    need(req, 'owner')
    const schema = SETTING_SCHEMAS[req.params.key]
    if (!schema) throw httpError(400, 'unknown_setting', 'Unknown setting.')
    const value = schema.parse(req.body?.value)
    const before = (await getSettings(db))[req.params.key]
    await setSetting(db, req.params.key, value, adminActor(req.admin))
    await audit(db, { admin: req.admin, action: 'settings_changed', details: { key: req.params.key, before, after: value }, ip: req.ip })
    return { ok: true }
  })

  app.post('/settings/payment-qr', async (req) => {
    need(req, 'owner')
    const file = await req.file()
    if (!file) throw httpError(400, 'no_file', 'Choose an image.')
    const buf = await file.toBuffer()
    if (file.file.truncated) throw httpError(413, 'file_too_large', 'Image too large.')
    let png
    try {
      png = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer() // lossless; keeps the QR exact
    } catch {
      throw httpError(415, 'file_type', 'Upload a PNG, JPEG or WebP image of the QR code.')
    }
    const f = await db.one(`INSERT INTO files (kind, mime, bytes, size, sha256) VALUES ('payment_qr', 'image/png', $1, $2, $3) RETURNING id`, [png, png.length, sha256(png)])
    await setSetting(db, 'paymentQrFileId', f.id, adminActor(req.admin))
    await audit(db, { admin: req.admin, action: 'payment_qr_uploaded', details: { fileId: f.id, sha256: sha256(png) }, ip: req.ip })
    return { ok: true, fileId: f.id }
  })

  // ─── referral codes ────────────────────────────────────────────────────────
  app.get('/referral-codes', async () => {
    const rows = await db.many('SELECT * FROM referral_codes ORDER BY code')
    for (const r of rows) r.uses = await referralUses(db, r.id)
    return rows
  })

  const priceOrNull = z.number().int().min(0).max(10_000_000_00).nullable().optional()
  const codeBody = z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/, '2–32 letters, numbers, - or _'),
    kind: z.enum(['fixed_price', 'flat_discount']),
    discountPaise: priceOrNull,
    malePricePaise: priceOrNull,
    femalePricePaise: priceOrNull,
    couplePricePaise: priceOrNull,
    maxUses: z.number().int().min(1).max(100000).nullable().optional(),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
    active: z.boolean().optional(),
    note: z.string().max(200).optional(),
  })

  app.post('/referral-codes', async (req, reply) => {
    need(req, 'owner')
    const b = codeBody.parse(req.body ?? {})
    try {
      const r = await db.one(
        `INSERT INTO referral_codes (code, kind, discount_paise, male_price_paise, female_price_paise, couple_price_paise, max_uses, expires_at, active, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [b.code, b.kind, b.discountPaise ?? null, b.malePricePaise ?? null, b.femalePricePaise ?? null, b.couplePricePaise ?? null, b.maxUses ?? null, b.expiresAt ?? null, b.active ?? true, cleanText(b.note || ''), adminActor(req.admin)],
      )
      await audit(db, { admin: req.admin, action: 'referral_code_created', details: r, ip: req.ip })
      return reply.code(201).send(r)
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'code_exists', 'That code already exists.')
      throw e
    }
  })

  app.patch('/referral-codes/:code', async (req) => {
    need(req, 'owner')
    const b = codeBody.partial().omit({ code: true }).parse(req.body ?? {})
    const map = { kind: 'kind', discountPaise: 'discount_paise', malePricePaise: 'male_price_paise', femalePricePaise: 'female_price_paise', couplePricePaise: 'couple_price_paise', maxUses: 'max_uses', expiresAt: 'expires_at', active: 'active', note: 'note' }
    const sets = []
    const vals = []
    for (const [k, col] of Object.entries(map))
      if (k in b) {
        vals.push(b[k])
        sets.push(`${col} = $${vals.length}`)
      }
    if (!sets.length) throw httpError(400, 'nothing', 'Nothing to change.')
    vals.push(String(req.params.code).toUpperCase())
    const r = await db.one(`UPDATE referral_codes SET ${sets.join(', ')} WHERE code = $${vals.length} RETURNING *`, vals)
    if (!r) throw httpError(404, 'not_found', 'Code not found.')
    await audit(db, { admin: req.admin, action: 'referral_code_updated', details: { code: r.code, changes: b }, ip: req.ip })
    return r
  })

  // ─── offline passes ────────────────────────────────────────────────────────
  offlineRoutes(app, ctx, { need })

  // ─── entry check-in ────────────────────────────────────────────────────────
  // Accepts the pass ID printed on the pass (FERAL-2026-XXXXXX) or, for passes
  // that carry one, a verify link/token.
  const findPass = async (raw) => {
    const s = String(raw || '').trim()
    return (await lookupPassByCode(ctx, s)) || lookupPass(ctx, s.split('/').pop().split('?')[0])
  }
  const passInfo = (p) =>
    p && {
      state: passState(p),
      holderName: p.holder_name,
      pass: CATEGORY_LABEL[p.category],
      passCode: p.pass_code,
      bookingCode: p.booking_code,
      checkedInAt: p.redeemed_at,
      checkedInBy: p.redeemed_by,
    }

  app.post('/checkin/lookup', async (req) => {
    const p = await findPass(req.body?.token)
    return passInfo(p) || { state: 'INVALID' }
  })

  app.post('/checkin/redeem', async (req) => {
    need(req, 'approver')
    const p = await findPass(req.body?.token)
    if (!p) throw httpError(404, 'invalid', 'INVALID — not a FERAL pass.')
    if (passState(p) !== 'VALID') throw httpError(409, 'cancelled', 'This pass is cancelled.')
    const r = await db.one(`UPDATE passes SET redeemed_at = now(), redeemed_by = $2 WHERE id = $1 AND redeemed_at IS NULL RETURNING redeemed_at`, [p.id, adminActor(req.admin)])
    if (!r) throw httpError(409, 'already_checked_in', `Already checked in at ${new Date(p.redeemed_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} by ${p.redeemed_by}.`)
    await audit(db, { admin: req.admin, action: 'pass_checked_in', booking: { id: p.booking_id, booking_code: p.booking_code }, details: { passCode: p.pass_code }, ip: req.ip })
    return { ...passInfo({ ...p, redeemed_at: r.redeemed_at, redeemed_by: adminActor(req.admin) }), checkedInNow: true }
  })

  app.post('/checkin/reset', async (req) => {
    need(req, 'owner')
    const { passCode } = z.object({ passCode: z.string().max(40) }).parse(req.body ?? {})
    const p = await db.one(`UPDATE passes SET redeemed_at = NULL, redeemed_by = NULL WHERE pass_code = $1 AND redeemed_at IS NOT NULL RETURNING booking_id, pass_code`, [passCode.trim().toUpperCase()])
    if (!p) throw httpError(404, 'not_found', 'No checked-in pass with that ID.')
    await audit(db, { admin: req.admin, action: 'pass_checkin_reset', booking: { id: p.booking_id }, details: { passCode: p.pass_code }, ip: req.ip })
    return { ok: true }
  })
}
