// Admin → Issue Offline Pass: bookings for payments received in person.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { setup, json, auth, pendingBooking, adminSession, drain } from './helpers.js'
import { decrypt } from '../lib/security.js'

let t, owner, approver, viewer
before(async () => {
  t = await setup()
  owner = await adminSession(t.ctx, t.app, 'owner')
  approver = await adminSession(t.ctx, t.app, 'approver')
  viewer = await adminSession(t.ctx, t.app, 'viewer')
})
after(() => t.close())

const PRICE = { male: 199900, female: 169900, couple: 349900 }
let n = 0
const form = (over = {}) => ({
  name: 'Kabir Malhotra',
  email: `kabir.${++n}.${Date.now()}@example.com`,
  phone: '98100 12345',
  category: 'male',
  quantity: 1,
  paymentMethod: 'cash',
  amountPaise: PRICE[over.category || 'male'] * (over.quantity || 1),
  paymentReceived: true,
  ...over,
})
const key = () => crypto.randomUUID()
const issue = (body, k = key(), who = approver) => who.req('POST', '/offline/bookings', body, { 'idempotency-key': k })
const passesOf = (code) =>
  t.ctx.db.many(`SELECT ps.* FROM passes ps JOIN bookings b ON b.id = ps.booking_id WHERE b.booking_code = $1 ORDER BY ps.seq`, [code])
const mailFor = (to) => t.capture.emails.filter((m) => m.to === to)

test('1. a single Male/Stag pass is issued, stored as PAID/offline and emailed with the PDF', async () => {
  const body = form()
  const r = await issue(body)
  assert.equal(r.statusCode, 201, r.body)
  const v = json(r).booking
  assert.match(v.bookingId, /^FRL-[A-Z0-9]{6}$/)
  assert.deepEqual([v.source, v.paymentStatus, v.status, v.category, v.quantity, v.amountPaise, v.method], ['offline', 'PAID', 'PASS_ISSUED', 'male', 1, 199900, 'offline_cash'])
  assert.equal(v.emailStatus.status, 'SENT')
  assert.equal(v.passes.length, 1)
  assert.match(v.passes[0].passCode, /^FERAL-2026-[A-HJKMNP-Z2-9]{6}$/)

  const b = await t.ctx.db.one(`SELECT * FROM bookings WHERE booking_code = $1`, [v.bookingId])
  assert.deepEqual([b.source, b.status, b.email, b.phone, b.age, b.gender, b.price_override], ['offline', 'PASS_ISSUED', body.email, '+919810012345', null, null, false])
  const pay = await t.ctx.db.one(`SELECT * FROM payments WHERE booking_id = $1`, [b.id])
  assert.deepEqual([pay.status, pay.method, pay.amount_paise], ['APPROVED', 'offline_cash', 199900])
  assert.ok(pay.reviewed_by_label.includes(approver.email))

  const [mail] = mailFor(body.email)
  assert.equal(mail.subject, 'Your FERAL Halloween Party Pass Is Here')
  assert.deepEqual(mail.attachments.map((a) => [a.filename, a.contentType, Boolean(a.cid)]), [
    [`FERAL-2026-Pass-${v.bookingId}.pdf`, 'application/pdf', false],
    [`FERAL-receipt-${v.bookingId}.pdf`, 'application/pdf', false],
    ['feral-qr-1.png', 'image/png', true],
  ])
  for (const s of [v.bookingId, v.passes[0].passCode, 'MALE / STAG', '26 October 2026', '5:30 PM', 'Chhatarpur Farms, South Delhi', 'cid:feral-qr-1', '+91 8377098457', 'www.getferal.in']) {
    assert.ok(mail.html.includes(s), `email lacks ${s}`)
  }
  const pdf = await PDFDocument.load(mail.attachments[0].content)
  assert.equal(pdf.getPageCount(), 2) // the official pass + its entry QR card
  const audit = await t.ctx.db.many(`SELECT action FROM audit_logs WHERE booking_id = $1 ORDER BY id`, [b.id])
  assert.deepEqual(audit.map((a) => a.action), ['offline_booking_issued', 'pass_issued'])
})

test('2. a Female pass and 3. a Couple pass use the right category, price and label', async () => {
  for (const [category, label, admits] of [['female', 'GIRLS', 'ADMITS ONE'], ['couple', 'COUPLE', 'ADMITS TWO']]) {
    const body = form({ category, paymentMethod: 'upi', reference: `UPI${Date.now()}${category}` })
    const r = await issue(body)
    assert.equal(r.statusCode, 201, r.body)
    const v = json(r).booking
    assert.deepEqual([v.category, v.categoryLabel, v.amountPaise, v.method, v.reference], [category, label, PRICE[category], 'offline_upi', body.reference])
    const [mail] = mailFor(body.email)
    assert.ok(mail.html.includes(label))
    void admits
  }
})

test('4. several passes in one booking: unique IDs and QR tokens, named attendees, one email with every pass', async () => {
  const body = form({ category: 'female', quantity: 3, attendeeNames: ['Ananya Rao', 'Isha Kapoor'], notes: 'Hostel group' })
  const r = await issue(body)
  assert.equal(r.statusCode, 201, r.body)
  const v = json(r).booking
  assert.equal(v.quantity, 3)
  assert.deepEqual(v.passes.map((p) => p.holderName), ['Ananya Rao', 'Isha Kapoor', 'Kabir Malhotra'])
  const rows = await passesOf(v.bookingId)
  assert.equal(new Set(rows.map((p) => p.pass_code)).size, 3)
  assert.equal(new Set(rows.map((p) => p.qr_token_hash)).size, 3)
  assert.deepEqual(rows.map((p) => p.seq), [1, 2, 3])
  const mails = mailFor(body.email)
  assert.equal(mails.length, 1)
  assert.equal(mails[0].attachments[0].filename, `FERAL-2026-Passes-${v.bookingId}.pdf`)
  assert.equal(mails[0].attachments.filter((a) => a.cid).length, 3)
  assert.equal((await PDFDocument.load(mails[0].attachments[0].content)).getPageCount(), 6)
  // the admin and the customer's emailed link download the same PDF
  const dl = await approver.req('GET', `/bookings/${v.bookingId}/pass.pdf`)
  assert.equal(dl.statusCode, 200)
  assert.ok(Buffer.from(dl.rawPayload).equals(mails[0].attachments[0].content))
  const link = mails[0].text.match(/Download: (\S+)/)[1]
  const pub = await t.app.inject({ method: 'GET', url: link.replace('http://localhost:8787', '') })
  assert.equal(pub.statusCode, 200)
  assert.match(pub.headers['content-disposition'], new RegExp(`FERAL-2026-Passes-${v.bookingId}\\.pdf`))
  // one row per booking in the existing admin list (not one per pass)
  const list = json(await viewer.req('GET', `/bookings?q=${v.bookingId}`))
  assert.equal(list.rows.length, 1)
  assert.equal(list.rows[0].source, 'offline')
})

test('price override needs a reason and is recorded; the server sets the price, not the browser', async () => {
  const noReason = await issue(form({ amountPaise: 150000 }))
  assert.equal(noReason.statusCode, 400)
  assert.equal(json(noReason).error, 'override_reason_required')
  const r = await issue(form({ amountPaise: 150000, overrideReason: 'Early supporter rate' }))
  assert.equal(r.statusCode, 201, r.body)
  const v = json(r).booking
  assert.deepEqual([v.amountPaise, v.priceOverride, v.overrideReason], [150000, true, 'Early supporter rate'])
  const b = await t.ctx.db.one(`SELECT original_paise, discount_paise, final_paise FROM bookings WHERE booking_code = $1`, [v.bookingId])
  assert.deepEqual([b.original_paise, b.discount_paise, b.final_paise], [199900, 49900, 150000])
  const a = await t.ctx.db.one(`SELECT details FROM audit_logs WHERE action = 'offline_booking_issued' AND booking_code = $1`, [v.bookingId])
  assert.deepEqual([a.details.priceOverride, a.details.overrideReason, a.details.listPaise], [true, 'Early supporter rate', 199900])
})

test('validation: confirmation of payment is required, and bad input is refused with field errors', async () => {
  const notConfirmed = await issue(form({ paymentReceived: false }))
  assert.equal(notConfirmed.statusCode, 400)
  assert.ok(json(notConfirmed).fields.paymentReceived)
  const bad = await issue(form({ email: 'nope', phone: '123', quantity: 11, category: 'vip', name: '<script>', amountPaise: 199900 }))
  assert.equal(bad.statusCode, 400)
  assert.deepEqual(Object.keys(json(bad).fields).sort(), ['category', 'email', 'name', 'phone', 'quantity'])
  const noKey = await approver.req('POST', '/offline/bookings', form())
  assert.equal(noKey.statusCode, 400)
  assert.equal(json(noKey).error, 'idempotency_key')
  // a status sent by the browser is ignored: there is no such field, PAID is set by the server
  const r = await issue({ ...form(), status: 'CANCELLED', paymentStatus: 'REJECTED' })
  assert.equal(json(r).booking.paymentStatus, 'PAID')
})

test('6. an email failure keeps the booking and passes; resend sends it once, without new passes', async () => {
  const body = form({ quantity: 2 })
  t.capture.failEmail = (m) => m.to === body.email
  const r = await issue(body)
  assert.equal(r.statusCode, 201, r.body)
  const v = json(r).booking
  assert.equal(v.emailStatus.status, 'QUEUED') // will retry automatically
  assert.match(v.emailStatus.error, /test email failure/)
  assert.equal(v.status, 'PAID') // paid, passes generated, not yet "issued"
  assert.equal((await passesOf(v.bookingId)).length, 2)
  const before = (await passesOf(v.bookingId)).map((p) => p.pass_code)

  // viewers cannot resend; a resend while it still fails stays failed
  assert.equal((await viewer.req('POST', `/offline/bookings/${v.bookingId}/resend`, { confirm: true })).statusCode, 403)
  let s = json(await approver.req('POST', `/offline/bookings/${v.bookingId}/resend`, { confirm: true }))
  assert.equal(s.emailStatus.status, 'QUEUED')

  t.capture.failEmail = null
  s = json(await approver.req('POST', `/offline/bookings/${v.bookingId}/resend`, { confirm: true }))
  assert.equal(s.emailStatus.status, 'SENT')
  assert.equal(s.status, 'PASS_ISSUED')
  assert.equal(mailFor(body.email).length, 1)
  assert.deepEqual((await passesOf(v.bookingId)).map((p) => p.pass_code), before)
  // the background worker has nothing left to send for it
  await t.ctx.db.query(`UPDATE notifications SET next_attempt_at = now()`)
  await drain(t.ctx)
  assert.equal(mailFor(body.email).length, 1)
  // an immediate second resend is refused; later it sends a fresh copy of the same passes
  const again = await approver.req('POST', `/offline/bookings/${v.bookingId}/resend`, { confirm: true })
  assert.equal(json(again).error, 'recently_sent')
  await t.ctx.db.query(`UPDATE notifications SET sent_at = now() - interval '5 minutes' FROM bookings b WHERE b.id = notifications.booking_id AND b.booking_code = $1`, [v.bookingId])
  s = json(await approver.req('POST', `/offline/bookings/${v.bookingId}/resend`, { confirm: true }))
  assert.equal(s.emailStatus.status, 'SENT')
  assert.equal(mailFor(body.email).length, 2)
  assert.deepEqual((await passesOf(v.bookingId)).map((p) => p.pass_code), before)
  const actions = (await t.ctx.db.many(`SELECT action FROM audit_logs WHERE booking_code = $1 ORDER BY id`, [v.bookingId])).map((a) => a.action)
  assert.equal(actions.filter((a) => a === 'offline_email_resend').length, 3)
})

test('7. duplicate submissions: the same request ID returns the same booking; a look-alike needs "issue anyway"', async () => {
  const body = form({ category: 'couple' })
  const k = key()
  const [a, b] = await Promise.all([issue(body, k), issue(body, k)])
  const codes = [json(a).booking.bookingId, json(b).booking.bookingId]
  assert.equal(codes[0], codes[1])
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 201])
  const c = await issue(body, k)
  assert.deepEqual([c.statusCode, json(c).duplicate, json(c).booking.bookingId], [200, true, codes[0]])
  assert.equal((await t.ctx.db.one(`SELECT count(*)::int AS n FROM bookings WHERE email = $1`, [body.email])).n, 1)
  assert.equal(mailFor(body.email).length, 1)

  const look = await issue(body) // new request ID, same customer and passes, minutes later
  assert.equal(look.statusCode, 409)
  assert.deepEqual([json(look).error, json(look).bookingId], ['possible_duplicate', codes[0]])
  const ok = await issue({ ...body, allowDuplicate: true })
  assert.equal(ok.statusCode, 201)
  assert.notEqual(json(ok).booking.bookingId, codes[0])
})

test('8. offline passes use the normal entry check: QR and pass ID verify, a second scan is rejected', async () => {
  const body = form({ quantity: 2, attendeeNames: ['Meher Gill'] })
  const v = json(await issue(body)).booking
  const [p1, p2] = await passesOf(v.bookingId)
  const token = decrypt(t.ctx.cfg.appSecret, p1.qr_token_enc)
  const pub = json(await t.app.inject({ method: 'GET', url: `/api/public/passes/verify/${token}` }))
  assert.deepEqual(pub, { status: 'VALID', firstName: 'Meher', pass: 'MALE / STAG', checkedIn: false })
  // check in pass 1 by its QR link, pass 2 by its typed ID
  const in1 = json(await approver.req('POST', '/checkin/redeem', { token: `https://www.getferal.in/verify/${token}` }))
  assert.deepEqual([in1.state, in1.holderName, in1.passCode, in1.checkedInNow], ['VALID', 'Meher Gill', p1.pass_code, true])
  assert.equal(json(await approver.req('POST', '/checkin/redeem', { token })).error, 'already_checked_in')
  const in2 = json(await approver.req('POST', '/checkin/redeem', { token: p2.pass_code }))
  assert.equal(in2.holderName, 'Kabir Malhotra')
  assert.equal(json(await approver.req('POST', '/checkin/redeem', { token: p2.pass_code })).error, 'already_checked_in')
  assert.equal(json(await t.app.inject({ method: 'GET', url: `/api/public/passes/verify/${token}` })).checkedIn, true)
  const view = json(await viewer.req('GET', `/offline/bookings/${v.bookingId}`))
  assert.ok(view.passes.every((p) => p.checkedInAt))
})

test('9. no access without the right admin: anonymous 401, viewer read-only, CSRF enforced', async () => {
  const anon = [
    ['POST', '/api/admin/offline/bookings'],
    ['GET', '/api/admin/offline/bookings'],
    ['GET', '/api/admin/offline/config'],
    ['POST', '/api/admin/offline/test-email'],
  ]
  for (const [method, url] of anon) {
    const r = await t.app.inject({ method, url, payload: method === 'POST' ? form() : undefined, headers: { 'idempotency-key': key() } })
    assert.equal(r.statusCode, 401, `${method} ${url}`)
  }
  assert.equal((await issue(form(), key(), viewer)).statusCode, 403)
  assert.equal((await viewer.req('POST', '/offline/test-email')).statusCode, 403)
  assert.equal((await viewer.req('GET', '/offline/bookings')).statusCode, 200)
  const noCsrf = await t.app.inject({ method: 'POST', url: '/api/admin/offline/bookings', payload: form(), headers: { cookie: `feral_admin=${approver.cookie}`, 'idempotency-key': key() } })
  assert.equal(noCsrf.statusCode, 403)
  // the public API has no way in either
  const pub = await t.app.inject({ method: 'POST', url: '/api/public/offline/bookings', payload: form() })
  assert.equal(pub.statusCode, 404)
})

test('Offline Bookings list: search, category and email-status filters, details', async () => {
  const body = form({ name: 'Zara Qureshi', category: 'female', phone: '9876501234' })
  const v = json(await issue(body)).booking
  const q = async (qs) => json(await viewer.req('GET', `/offline/bookings?${qs}`))
  for (const s of ['Zara', body.email, '9876501234', v.bookingId]) assert.ok((await q(`q=${encodeURIComponent(s)}`)).rows.some((r) => r.bookingId === v.bookingId), s)
  const fem = await q('category=female')
  assert.ok(fem.rows.length && fem.rows.every((r) => r.category === 'female'))
  const sent = await q('emailStatus=sent')
  assert.ok(sent.rows.some((r) => r.bookingId === v.bookingId))
  assert.ok(!(await q('emailStatus=failed')).rows.some((r) => r.bookingId === v.bookingId))
  const row = (await q(`q=${v.bookingId}`)).rows[0]
  assert.deepEqual([row.source, row.paymentStatus, row.quantity, row.emailStatus.status], ['offline', 'PAID', 1, 'SENT'])
  // online bookings never appear here
  assert.ok((await q('limit=200')).rows.every((r) => r.source === 'offline'))
})

test('test email goes only to the signed-in admin and is marked as a sample', async () => {
  const r = json(await approver.req('POST', '/offline/test-email'))
  assert.deepEqual([r.ok, r.to], [true, approver.email])
  const m = mailFor(approver.email).at(-1)
  assert.match(m.subject, /^\[TEST\] Your FERAL Halloween Party Pass Is Here/)
  assert.ok(m.html.includes('NOT VALID FOR ENTRY'))
  assert.equal((await t.ctx.db.one(`SELECT count(*)::int AS n FROM bookings WHERE booking_code = 'FRL-SAMPLE'`)).n, 0)
})

test('10. online bookings still work alongside offline ones', async () => {
  const b = await pendingBooking(t.app, t.capture, { name: 'Online Person' })
  const r = await approver.req('POST', `/bookings/${b.booking.bookingId}/approve`, { confirm: true })
  assert.equal(r.statusCode, 200, r.body)
  await drain(t.ctx)
  const view = json(await t.app.inject({ method: 'GET', url: `/api/public/bookings/${b.booking.bookingId}`, headers: auth(b) }))
  assert.equal(view.status, 'PASS_ISSUED')
  const row = await t.ctx.db.one(`SELECT source, quantity FROM bookings WHERE booking_code = $1`, [b.booking.bookingId])
  assert.deepEqual([row.source, row.quantity], ['online', 1])
  assert.ok(t.capture.emails.some((m) => m.subject === 'Your Official FERAL 2026 Pass' && m.to === b.booking.email))
})
