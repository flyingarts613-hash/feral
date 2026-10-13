import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { setup, json, auth, verifiedBooking, pendingBooking, adminSession, drain, nextRef } from './helpers.js'
import { issuePass } from '../services/payments.js'
import { decrypt } from '../lib/security.js'

let t, owner, approver, viewer
before(async () => {
  t = await setup()
  owner = await adminSession(t.ctx, t.app, 'owner')
  approver = await adminSession(t.ctx, t.app, 'approver')
  viewer = await adminSession(t.ctx, t.app, 'viewer')
})
after(() => t.close())

const idOf = (b) => b.booking.bookingId
const dbBooking = (code) => t.ctx.db.one('SELECT * FROM bookings WHERE booking_code = $1', [code])

test('payment submission saves the reference and moves to PAYMENT_PENDING_VERIFICATION', async () => {
  const b = await pendingBooking(t.app, t.capture)
  assert.equal(b.booking.status, 'PAYMENT_PENDING_VERIFICATION')
  assert.equal(b.booking.payment.status, 'SUBMITTED')
  // duplicate submission is refused
  const again = await t.app.inject({ method: 'POST', url: `/api/public/bookings/${idOf(b)}/payment`, headers: auth(b), payload: { reference: nextRef() } })
  assert.equal(json(again).error, 'already_submitted')
})

test('the same UPI reference cannot be used for two bookings', async () => {
  const ref = nextRef()
  const a = await verifiedBooking(t.app, t.capture)
  const b = await verifiedBooking(t.app, t.capture)
  assert.equal((await t.app.inject({ method: 'POST', url: `/api/public/bookings/${idOf(a)}/payment`, headers: auth(a), payload: { reference: ref } })).statusCode, 200)
  const r = await t.app.inject({ method: 'POST', url: `/api/public/bookings/${idOf(b)}/payment`, headers: auth(b), payload: { reference: ref.toLowerCase() } })
  assert.equal(json(r).error, 'reference_in_use')
})

test('screenshot uploads are type-checked and re-encoded', async () => {
  const b = await verifiedBooking(t.app, t.capture)
  const form = (file, type) => {
    const boundary = '----feral' + Math.random().toString(16).slice(2)
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reference"\r\n\r\n${nextRef()}\r\n--${boundary}\r\nContent-Disposition: form-data; name="screenshot"; filename="x"\r\nContent-Type: ${type}\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, ...auth(b) } }
  }
  const evil = form(Buffer.from('<script>alert(1)</script>'), 'image/png')
  const r1 = await t.app.inject({ method: 'POST', url: `/api/public/bookings/${idOf(b)}/payment`, payload: evil.body, headers: evil.headers })
  assert.equal(json(r1).error, 'file_type')
  const sharp = (await import('sharp')).default
  const png = await sharp({ create: { width: 40, height: 80, channels: 3, background: '#123456' } }).png().toBuffer()
  const ok = form(png, 'image/png')
  const r2 = await t.app.inject({ method: 'POST', url: `/api/public/bookings/${idOf(b)}/payment`, payload: ok.body, headers: ok.headers })
  assert.equal(r2.statusCode, 200, r2.body)
  const f = await t.ctx.db.one(`SELECT f.mime FROM payments p JOIN files f ON f.id = p.screenshot_file_id JOIN bookings b ON b.id = p.booking_id WHERE b.booking_code = $1`, [idOf(b)])
  assert.equal(f.mime, 'image/jpeg')
  // only admins can see it
  const anon = await t.app.inject({ method: 'GET', url: `/api/admin/bookings/${idOf(b)}/screenshot/1` })
  assert.equal(anon.statusCode, 401)
})

test('12. payment approval requires an authenticated admin with the approver role and a CSRF token', async () => {
  const b = await pendingBooking(t.app, t.capture)
  const url = `/api/admin/bookings/${idOf(b)}/approve`
  assert.equal((await t.app.inject({ method: 'POST', url, payload: { confirm: true } })).statusCode, 401)
  assert.equal((await t.app.inject({ method: 'POST', url, payload: { confirm: true }, headers: { cookie: 'feral_admin=forged' } })).statusCode, 401)
  // valid session but no CSRF header
  assert.equal((await t.app.inject({ method: 'POST', url, payload: { confirm: true }, headers: { cookie: `feral_admin=${approver.cookie}` } })).statusCode, 403)
  assert.equal((await viewer.req('POST', `/bookings/${idOf(b)}/approve`, { confirm: true })).statusCode, 403)
  // the confirmation flag is required
  assert.equal((await approver.req('POST', `/bookings/${idOf(b)}/approve`, {})).statusCode, 400)
  // a customer's own booking token is no use either
  assert.equal((await t.app.inject({ method: 'POST', url, payload: { confirm: true }, headers: auth(b) })).statusCode, 401)
  assert.equal((await dbBooking(idOf(b))).status, 'PAYMENT_PENDING_VERIFICATION')
})

test('13. payment submission notifies the organizer with the booking details', async () => {
  t.capture.notifications.length = 0
  const b = await pendingBooking(t.app, t.capture, { referralCode: 'ETHAN' })
  await drain(t.ctx)
  const n = t.capture.notifications.find((m) => m.body.includes(idOf(b)))
  assert.ok(n, 'organizer notified')
  assert.equal(n.to, '+919999999999')
  assert.equal(n.kind, 'payment_pending')
  for (const s of ['FERAL — PAYMENT APPROVAL REQUIRED', 'Customer: Aarav Mehta', 'Phone: +919876543210', 'Pass: MALE / STAG', 'Referral: ETHAN', 'Original Price: Rs 1,999', 'Discount: Rs 499', 'Final Amount: Rs 1,500', 'Status: PAYMENT PENDING VERIFICATION', 'Review this booking in the FERAL admin dashboard.'])
    assert.ok(n.body.includes(s), `message contains "${s}"`)
  assert.ok(!/token|http/i.test(n.body), 'no links or tokens in the SMS')
  const row = await t.ctx.db.one(`SELECT status FROM notifications WHERE type = 'organizer_payment_pending' AND booking_id = (SELECT id FROM bookings WHERE booking_code = $1)`, [idOf(b)])
  assert.equal(row.status, 'SENT')
})

test('14. a failed organizer notification is retried safely (once delivered, no duplicates)', async () => {
  t.capture.notifications.length = 0
  let failures = 2
  t.capture.failNotify = () => failures-- > 0
  const b = await pendingBooking(t.app, t.capture)
  const key = `organizer_payment_pending:%`
  const id = (await dbBooking(idOf(b))).id
  for (let i = 0; i < 3; i++) {
    await drain(t.ctx)
    await t.ctx.db.query(`UPDATE notifications SET next_attempt_at = now() WHERE booking_id = $1 AND status = 'QUEUED'`, [id])
  }
  t.capture.failNotify = null
  const rows = await t.ctx.db.many(`SELECT status, attempts FROM notifications WHERE booking_id = $1 AND dedupe_key LIKE $2`, [id, key])
  assert.equal(rows.length, 1)
  assert.deepEqual([rows[0].status, rows[0].attempts], ['SENT', 3])
  assert.equal(t.capture.notifications.filter((m) => m.body.includes(idOf(b))).length, 1)
  // the booking was never at risk
  assert.equal((await dbBooking(idOf(b))).status, 'PAYMENT_PENDING_VERIFICATION')
})

test('15. a pending payment cannot produce a confirmed pass', async () => {
  const b = await pendingBooking(t.app, t.capture)
  const id = (await dbBooking(idOf(b))).id
  await assert.rejects(() => issuePass(t.ctx, id), /approved payment/)
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM passes WHERE booking_id = $1', [id])).n, 0)
  const dl = await t.app.inject({ method: 'GET', url: `/api/public/bookings/${idOf(b)}/pass.pdf`, headers: auth(b) })
  assert.equal(dl.statusCode, 404)
})

let approved // shared with later tests
test('16. approving generates exactly one unique pass and emails it with the receipt', async () => {
  t.capture.emails.length = 0
  const b = await pendingBooking(t.app, t.capture, { name: 'Ishaan Kapoor', category: 'couple' })
  const r = await approver.req('POST', `/bookings/${idOf(b)}/approve`, { confirm: true })
  assert.equal(r.statusCode, 200, r.body)
  assert.equal(json(r).passError, null)
  let row = await dbBooking(idOf(b))
  assert.equal(row.status, 'PAID')
  await drain(t.ctx)
  row = await dbBooking(idOf(b))
  assert.equal(row.status, 'PASS_ISSUED')
  const passes = await t.ctx.db.many('SELECT * FROM passes WHERE booking_id = $1', [row.id])
  assert.equal(passes.length, 1)
  assert.equal(passes[0].status, 'ISSUED')
  const pay = await t.ctx.db.one(`SELECT * FROM payments WHERE booking_id = $1`, [row.id])
  assert.deepEqual([pay.status, pay.reviewed_by_label], ['APPROVED', `approver admin <${approver.email}>`])
  const mail = t.capture.emails.find((m) => m.to === row.email && m.subject === 'Your Official FERAL 2026 Pass')
  assert.ok(mail)
  const code = passes[0].pass_code
  assert.deepEqual(
    mail.attachments.map((a) => [a.filename, a.contentType]),
    [
      [`FERAL-2026-Pass-${code}.png`, 'image/png'],
      [`FERAL-2026-Pass-${code}.pdf`, 'application/pdf'],
      [`FERAL-receipt-${row.booking_code}.pdf`, 'application/pdf'],
    ],
  )
  const body = 'Your entry pass for FERAL - Halloween House Party 2026 is ready. Keep this pass accessible and present it at entry. We look forward to seeing you.'
  assert.ok(mail.text.includes(body) && mail.html.includes(body))
  assert.ok(!mail.html.includes('cid:'), 'no inline QR any more')
  const audit = await t.ctx.db.many('SELECT action FROM audit_logs WHERE booking_id = $1 ORDER BY id', [row.id])
  assert.deepEqual(audit.map((a) => a.action), ['booking_created', 'email_verified', 'payment_submitted', 'payment_approved', 'pass_generated', 'pass_issued'])
  approved = { b, row, pass: passes[0], mail }
})

test('17. a duplicate approval is refused and cannot create another pass or email', async () => {
  const before = t.capture.emails.length
  const r = await approver.req('POST', `/bookings/${idOf(approved.b)}/approve`, { confirm: true })
  assert.equal(r.statusCode, 409)
  assert.equal(json(r).error, 'already_approved')
  // concurrent double-click
  const b = await pendingBooking(t.app, t.capture)
  const [x, y] = await Promise.all([1, 2].map(() => approver.req('POST', `/bookings/${idOf(b)}/approve`, { confirm: true })))
  assert.deepEqual([x.statusCode, y.statusCode].sort(), [200, 409])
  await drain(t.ctx)
  const id = (await dbBooking(idOf(b))).id
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM passes WHERE booking_id = $1', [id])).n, 1)
  assert.equal((await t.ctx.db.one(`SELECT count(*)::int AS n FROM notifications WHERE booking_id = $1 AND type = 'payment_confirmed'`, [id])).n, 1)
  assert.equal(t.capture.emails.filter((m) => /Official FERAL 2026 Pass/.test(m.subject)).length - t.capture.emails.slice(0, before).filter((m) => /Official FERAL 2026 Pass/.test(m.subject)).length, 1)
  // calling the issuer again directly is a no-op
  const p1 = await issuePass(t.ctx, id)
  const p2 = await issuePass(t.ctx, id)
  assert.equal(p1.pass_code, p2.pass_code)
})

test('19. the pass carries the correct customer name, as a 16:9 PNG and PDF without payment data', async () => {
  const [png, pdf] = approved.mail.attachments.map((a) => a.content)
  const doc = await PDFDocument.load(pdf)
  assert.equal(doc.getSubject(), 'FERAL 2026 pass for Ishaan Kapoor (COUPLE)')
  assert.equal(doc.getTitle(), `FERAL 2026 Official Pass ${approved.pass.pass_code}`)
  const { width, height } = doc.getPage(0).getSize()
  assert.deepEqual([width, height], [960, 540])
  const meta = await sharp(png).metadata()
  assert.deepEqual([meta.format, meta.width, meta.height], ['png', 1920, 1080])
  assert.match(approved.pass.pass_code, /^FERAL-2026-[A-HJKMNP-Z2-9]{6}$/)
  // the stored files are the ones that were emailed
  const stored = await t.ctx.db.one('SELECT bytes FROM files WHERE id = $1', [approved.pass.png_file_id])
  assert.ok(stored.bytes.equals(png))
  // no payment details in the pass files
  const pay = await t.ctx.db.one('SELECT transaction_reference FROM payments WHERE booking_id = $1', [approved.row.id])
  for (const buf of [png, pdf]) {
    const raw = buf.toString('latin1')
    for (const secret of [pay.transaction_reference, approved.row.email, approved.row.phone, approved.row.booking_code]) assert.ok(!raw.includes(secret), `pass leaks ${secret}`)
  }
})

test('pass IDs are unique: a colliding ID is replaced, and the database never holds two', async () => {
  const taken = approved.pass.pass_code
  const b = await pendingBooking(t.app, t.capture, { name: 'Zoya Sheikh', category: 'female', gender: 'FEMALE' })
  const id = (await dbBooking(idOf(b))).id
  // approve without issuing, then issue with a generator that collides first
  await t.ctx.db.query(`UPDATE payments SET status = 'APPROVED', approved_at = now() WHERE booking_id = $1`, [id])
  await t.ctx.db.query(`UPDATE bookings SET status = 'PAID' WHERE id = $1`, [id])
  const drawn = [taken, taken, 'FERAL-2026-ZZZZZZ']
  const pass = await issuePass(t.ctx, id, { newCode: () => drawn.shift() })
  assert.equal(pass.pass_code, 'FERAL-2026-ZZZZZZ')
  assert.equal(drawn.length, 0)
  const files = await t.ctx.db.one('SELECT count(*)::int AS n FROM files WHERE id IN ($1, $2, $3)', [pass.pdf_file_id, pass.png_file_id, pass.receipt_file_id])
  assert.equal(files.n, 3)
  // a generator that only ever collides gives up without creating anything
  const b2 = await pendingBooking(t.app, t.capture)
  const id2 = (await dbBooking(idOf(b2))).id
  await t.ctx.db.query(`UPDATE payments SET status = 'APPROVED', approved_at = now() WHERE booking_id = $1`, [id2])
  await t.ctx.db.query(`UPDATE bookings SET status = 'PAID' WHERE id = $1`, [id2])
  await assert.rejects(() => issuePass(t.ctx, id2, { newCode: () => taken }), (e) => e.code === '23505')
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM passes WHERE booking_id = $1', [id2])).n, 0)
  assert.equal((await t.ctx.db.one(`SELECT count(*)::int AS n FROM notifications WHERE booking_id = $1 AND type = 'payment_confirmed'`, [id2])).n, 0)
  const dup = await t.ctx.db.one('SELECT count(*)::int AS n FROM passes GROUP BY pass_code ORDER BY 1 DESC LIMIT 1')
  assert.equal(dup.n, 1)
  // the issuer then succeeds normally
  assert.match((await issuePass(t.ctx, id2)).pass_code, /^FERAL-2026-/)
})

test('a rejected or unsubmitted payment can never get a pass', async () => {
  const b = await pendingBooking(t.app, t.capture)
  const id = (await dbBooking(idOf(b))).id
  await approver.req('POST', `/bookings/${idOf(b)}/reject`, { confirm: true, reason: 'not found' })
  await assert.rejects(() => issuePass(t.ctx, id), /approved payment/)
  const r = await approver.req('POST', `/bookings/${idOf(b)}/issue-pass`)
  assert.equal(r.statusCode, 409)
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM passes WHERE booking_id = $1', [id])).n, 0)
})

test('20. the pass QR verifies against its own pass only', async () => {
  const token = decrypt(t.ctx.cfg.appSecret, approved.pass.qr_token_enc)
  const ok = await t.app.inject({ method: 'GET', url: `/api/public/passes/verify/${token}` })
  assert.deepEqual(json(ok), { status: 'VALID', firstName: 'Ishaan', pass: 'COUPLE', checkedIn: false })
  const page = await t.app.inject({ method: 'GET', url: `/verify/${token}` })
  assert.ok(page.body.includes('VALID') && page.body.includes('Ishaan'))
  assert.ok(!page.body.includes(approved.row.email) && !page.body.includes(approved.row.phone), 'no personal details on the public page')
  const bad = await t.app.inject({ method: 'GET', url: `/api/public/passes/verify/${'A'.repeat(32)}` })
  assert.equal(json(bad).status, 'INVALID')
  // every pass has its own token
  const tokens = (await t.ctx.db.many('SELECT qr_token_enc FROM passes')).map((r) => decrypt(t.ctx.cfg.appSecret, r.qr_token_enc))
  assert.equal(new Set(tokens).size, tokens.length)
  // check-in: once only, unless an owner resets it
  assert.equal((await approver.req('POST', '/checkin/redeem', { token: `http://x/verify/${token}` })).statusCode, 200)
  const twice = await approver.req('POST', '/checkin/redeem', { token })
  assert.equal(json(twice).error, 'already_checked_in')
  assert.equal((await approver.req('POST', '/checkin/reset', { passCode: approved.pass.pass_code })).statusCode, 403)
  assert.equal((await owner.req('POST', '/checkin/reset', { passCode: approved.pass.pass_code })).statusCode, 200)
  assert.equal((await approver.req('POST', '/checkin/redeem', { token })).statusCode, 200)
  // entry staff can type the pass ID printed on the pass
  assert.equal((await owner.req('POST', '/checkin/reset', { passCode: approved.pass.pass_code })).statusCode, 200)
  const byId = json(await viewer.req('POST', '/checkin/lookup', { token: ` ${approved.pass.pass_code.toLowerCase()} ` }))
  assert.deepEqual([byId.state, byId.holderName, byId.passCode, byId.checkedInAt], ['VALID', 'Ishaan Kapoor', approved.pass.pass_code, null])
  assert.equal((await approver.req('POST', '/checkin/redeem', { token: approved.pass.pass_code })).statusCode, 200)
  assert.equal(json(await approver.req('POST', '/checkin/redeem', { token: approved.pass.pass_code })).error, 'already_checked_in')
  assert.equal(json(await viewer.req('POST', '/checkin/lookup', { token: 'FERAL-2026-AAAAAA' })).state, 'INVALID')
})

test('pass download needs the booking token or the emailed link', async () => {
  const anon = await t.app.inject({ method: 'GET', url: `/api/public/bookings/${idOf(approved.b)}/pass.pdf` })
  assert.equal(anon.statusCode, 404)
  const own = await t.app.inject({ method: 'GET', url: `/api/public/bookings/${idOf(approved.b)}/pass.pdf`, headers: auth(approved.b) })
  assert.equal(own.statusCode, 200)
  assert.equal(own.headers['content-type'], 'application/pdf')
  const link = approved.mail.text.match(/Download your pass: (\S+)/)[1]
  const viaLink = await t.app.inject({ method: 'GET', url: link.replace('http://localhost:8787', '') })
  assert.equal(viaLink.statusCode, 200)
})

test('21. a failed pass email keeps the approval, and a retry sends it once', async () => {
  t.capture.failEmail = (m) => /Official FERAL 2026 Pass/.test(m.subject)
  const b = await pendingBooking(t.app, t.capture)
  await approver.req('POST', `/bookings/${idOf(b)}/approve`, { confirm: true })
  const id = (await dbBooking(idOf(b))).id
  await t.ctx.db.query(`UPDATE notifications SET max_attempts = 2 WHERE booking_id = $1 AND type = 'payment_confirmed'`, [id])
  for (let i = 0; i < 3; i++) {
    await drain(t.ctx)
    await t.ctx.db.query(`UPDATE notifications SET next_attempt_at = now() WHERE booking_id = $1 AND status = 'QUEUED'`, [id])
  }
  let n = await t.ctx.db.one(`SELECT * FROM notifications WHERE booking_id = $1 AND type = 'payment_confirmed'`, [id])
  assert.equal(n.status, 'FAILED')
  let row = await dbBooking(idOf(b))
  assert.equal(row.status, 'PAID') // payment stays approved, pass generated, not "issued"
  assert.equal((await t.ctx.db.one('SELECT status FROM passes WHERE booking_id = $1', [id])).status, 'GENERATED')
  const detail = json(await viewer.req('GET', `/bookings/${idOf(b)}`))
  assert.equal(detail.booking.payment_status, 'APPROVED')

  t.capture.failEmail = null
  assert.equal((await viewer.req('POST', `/notifications/${n.id}/retry`)).statusCode, 403)
  assert.equal((await approver.req('POST', `/notifications/${n.id}/retry`)).statusCode, 200)
  await drain(t.ctx)
  n = await t.ctx.db.one(`SELECT * FROM notifications WHERE id = $1`, [n.id])
  assert.equal(n.status, 'SENT')
  row = await dbBooking(idOf(b))
  assert.equal(row.status, 'PASS_ISSUED')
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM passes WHERE booking_id = $1', [id])).n, 1)
  // retrying something that succeeded is refused
  assert.equal((await approver.req('POST', `/notifications/${n.id}/retry`)).statusCode, 409)
})

test('22. rejection is recorded, emailed to the customer, reported to the organizer, and the customer can resubmit', async () => {
  t.capture.notifications.length = 0
  const b = await pendingBooking(t.app, t.capture)
  const r = await approver.req('POST', `/bookings/${idOf(b)}/reject`, { confirm: true, reason: 'No payment found for this reference' })
  assert.equal(r.statusCode, 200, r.body)
  await drain(t.ctx)
  const row = await dbBooking(idOf(b))
  assert.equal(row.status, 'PAYMENT_REJECTED')
  const pay = await t.ctx.db.one('SELECT * FROM payments WHERE booking_id = $1', [row.id])
  assert.deepEqual([pay.status, pay.rejection_reason], ['REJECTED', 'No payment found for this reference'])
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM passes WHERE booking_id = $1', [row.id])).n, 0)
  const audit = await t.ctx.db.one(`SELECT * FROM audit_logs WHERE booking_id = $1 AND action = 'payment_rejected'`, [row.id])
  assert.equal(audit.details.reason, 'No payment found for this reference')
  const mail = t.capture.emails.find((m) => m.to === row.email && /Needs Attention/.test(m.subject))
  assert.ok(mail && mail.text.includes('No payment found for this reference') && mail.text.includes(row.booking_code))
  assert.ok(t.capture.notifications.some((n) => n.kind === 'payment_rejected' && n.body.includes(row.booking_code)))
  // customer view shows the reason; resubmission goes back to pending
  const view = json(await t.app.inject({ method: 'GET', url: `/api/public/bookings/${idOf(b)}`, headers: auth(b) }))
  assert.equal(view.payment.rejectionReason, 'No payment found for this reference')
  const again = await t.app.inject({ method: 'POST', url: `/api/public/bookings/${idOf(b)}/payment`, headers: auth(b), payload: { reference: nextRef() } })
  assert.equal(json(again).status, 'PAYMENT_PENDING_VERIFICATION')
  // the booking and its history are kept
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM payments WHERE booking_id = $1', [row.id])).n, 2)
})

test('analytics count only verified revenue; CSV export works and is formula-safe', async () => {
  const s = json(await viewer.req('GET', '/summary'))
  const paid = await t.ctx.db.one(`SELECT coalesce(sum(amount_paise),0)::bigint AS s FROM payments WHERE status = 'APPROVED'`)
  assert.equal(s.totals.revenuePaise, paid.s)
  assert.ok(s.totals.pending >= 1)
  const b = await pendingBooking(t.app, t.capture, { name: 'Zed Test' })
  await t.ctx.db.query(`UPDATE bookings SET holder_name = '=HYPERLINK("x")' WHERE booking_code = $1`, [idOf(b)])
  const csv = await viewer.req('GET', '/export.csv')
  assert.equal(csv.statusCode, 200)
  assert.ok(csv.body.includes(`"'=HYPERLINK(""x"")"`))
  const lr = await viewer.req('GET', `/bookings?status=pending&q=${idOf(b)}`)
  assert.equal(lr.statusCode, 200, lr.body)
  assert.equal(json(lr).rows.length, 1)
})
