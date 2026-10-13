import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setup, json, createBooking, lastOtp, auth, person } from './helpers.js'

let t
before(async () => (t = await setup()))
after(() => t.close())

const verify = (b, code) => t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/otp/verify`, headers: auth(b), payload: { code } })
const resend = (b) => t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/otp/resend`, headers: auth(b) })
const wrong = (otp) => String((Number(otp) + 1) % 1000000).padStart(6, '0')

test('booking starts in EMAIL_VERIFICATION_PENDING and emails an OTP (never returned by the API)', async () => {
  const { res, body } = await createBooking(t.app)
  assert.equal(res.statusCode, 201)
  assert.equal(body.booking.status, 'EMAIL_VERIFICATION_PENDING')
  assert.match(body.booking.bookingId, /^FRL-[A-Z0-9]{6}$/)
  const otp = lastOtp(t.capture, body.booking.email)
  assert.match(otp, /^\d{6}$/)
  assert.ok(!res.body.includes(otp), 'OTP must not appear in the API response')
  const rows = await t.ctx.db.many('SELECT otp_hash FROM otp_codes oc JOIN bookings b ON b.id = oc.booking_id WHERE b.booking_code = $1', [body.booking.bookingId])
  assert.equal(rows.length, 1)
  assert.ok(!rows[0].otp_hash.includes(otp) && rows[0].otp_hash.length === 64, 'only a keyed hash is stored')
  const n = await t.ctx.db.one(`SELECT payload FROM notifications WHERE type = 'otp' ORDER BY id DESC LIMIT 1`)
  assert.ok(!JSON.stringify(n.payload).includes(otp))
  const mail = t.capture.emails.at(-1)
  assert.equal(mail.subject, 'Verify Your Email — FERAL 2026')
})

test('9a. incorrect OTP is rejected with attempts remaining', async () => {
  const { body } = await createBooking(t.app)
  const otp = lastOtp(t.capture, body.booking.email)
  const r = await verify(body, wrong(otp))
  assert.equal(r.statusCode, 400)
  assert.deepEqual([json(r).error, json(r).attemptsLeft], ['otp_incorrect', 4])
})

test('9b. expired OTP is rejected; correct OTP verifies and moves to AWAITING_PAYMENT', async () => {
  const { body } = await createBooking(t.app)
  const otp = lastOtp(t.capture, body.booking.email)
  await t.ctx.db.query(`UPDATE otp_codes SET expires_at = now() - interval '1 second' WHERE booking_id = (SELECT id FROM bookings WHERE booking_code = $1)`, [body.booking.bookingId])
  const r = await verify(body, otp)
  assert.equal(json(r).error, 'otp_expired')

  // new code (after the cooldown) works, and the old one doesn't
  await t.ctx.db.query(`UPDATE otp_codes SET created_at = now() - interval '2 minutes' WHERE booking_id = (SELECT id FROM bookings WHERE booking_code = $1)`, [body.booking.bookingId])
  assert.equal((await resend(body)).statusCode, 200)
  const otp2 = lastOtp(t.capture, body.booking.email)
  if (otp2 !== otp) assert.equal(json(await verify(body, otp)).error, 'otp_incorrect')
  const ok = await verify(body, otp2)
  assert.equal(ok.statusCode, 200, ok.body)
  assert.equal(json(ok).booking.status, 'AWAITING_PAYMENT')
  assert.equal(json(ok).booking.emailVerified, true)
  // OTP invalidated after use
  const again = await verify(body, otp2)
  assert.equal(again.statusCode, 200) // already verified → idempotent success, no new state
  const row = await t.ctx.db.one(`SELECT status FROM otp_codes WHERE booking_id = (SELECT id FROM bookings WHERE booking_code = $1) ORDER BY id DESC LIMIT 1`, [body.booking.bookingId])
  assert.equal(row.status, 'VERIFIED')
})

test('10a. OTP locks after the maximum number of wrong attempts', async () => {
  const { body } = await createBooking(t.app)
  const otp = lastOtp(t.capture, body.booking.email)
  for (let i = 0; i < 4; i++) assert.equal(json(await verify(body, wrong(otp))).error, 'otp_incorrect')
  assert.equal(json(await verify(body, wrong(otp))).error, 'otp_locked')
  // even the right code no longer works
  assert.equal(json(await verify(body, otp)).error, 'no_active_code')
})

test('10b. resend has a cooldown and an hourly cap', async () => {
  const { body } = await createBooking(t.app)
  const r = await resend(body)
  assert.equal(r.statusCode, 429)
  assert.equal(json(r).error, 'otp_cooldown')
  assert.ok(json(r).retryAfter > 0)
  const id = (await t.ctx.db.one('SELECT id FROM bookings WHERE booking_code = $1', [body.booking.bookingId])).id
  for (let i = 0; i < 4; i++) {
    await t.ctx.db.query(`UPDATE otp_codes SET created_at = created_at - interval '61 seconds' WHERE booking_id = $1`, [id])
    assert.equal((await resend(body)).statusCode, 200)
  }
  await t.ctx.db.query(`UPDATE otp_codes SET created_at = created_at - interval '61 seconds' WHERE booking_id = $1`, [id])
  const capped = await resend(body)
  assert.equal(json(capped).error, 'otp_limit')
})

test('11a. duplicate submission with the same Idempotency-Key returns the same booking', async () => {
  const p = person()
  const key = 'idem-' + Math.random().toString(36).slice(2) + '-0123456789'
  const a = await t.app.inject({ method: 'POST', url: '/api/public/bookings', payload: p, headers: { 'idempotency-key': key } })
  const b = await t.app.inject({ method: 'POST', url: '/api/public/bookings', payload: p, headers: { 'idempotency-key': key } })
  assert.equal(json(a).booking.bookingId, json(b).booking.bookingId)
  const n = await t.ctx.db.one('SELECT count(*)::int AS n FROM bookings WHERE email = $1', [p.email])
  assert.equal(n.n, 1)
  // the first token was rotated: only the latest response's token works
  const old = await t.app.inject({ method: 'GET', url: `/api/public/bookings/${json(a).booking.bookingId}`, headers: { 'x-booking-token': json(a).accessToken } })
  const cur = await t.app.inject({ method: 'GET', url: `/api/public/bookings/${json(b).booking.bookingId}`, headers: { 'x-booking-token': json(b).accessToken } })
  assert.equal(old.statusCode, 404)
  assert.equal(cur.statusCode, 200)
})

test('11b. a retried submission without a key reuses the unverified booking', async () => {
  const p = person()
  const a = json(await t.app.inject({ method: 'POST', url: '/api/public/bookings', payload: p }))
  const b = json(await t.app.inject({ method: 'POST', url: '/api/public/bookings', payload: p }))
  assert.equal(a.booking.bookingId, b.booking.bookingId)
  assert.equal(b.otp.sent, false) // within the cooldown: the first code is still valid
})

test('validation: phone, email, age, gender/pass and minimum age', async () => {
  const bad = async (over) => json(await t.app.inject({ method: 'POST', url: '/api/public/bookings', payload: person(over) }))
  assert.ok((await bad({ phone: '12345' })).fields.phone)
  assert.ok((await bad({ email: 'nope' })).fields.email)
  assert.ok((await bad({ name: '<script>' })).fields.name)
  assert.equal((await bad({ age: 15 })).error, 'underage')
  assert.equal((await bad({ gender: 'MALE', category: 'female' })).error, 'category_gender')
  // phone formats normalise to +91
  for (const ph of ['+91 98765 43210', '09876543210', '919876543210', '9876543210']) {
    const r = json(await t.app.inject({ method: 'POST', url: '/api/public/bookings', payload: person({ phone: ph }) }))
    const row = await t.ctx.db.one('SELECT phone FROM bookings WHERE booking_code = $1', [r.booking.bookingId])
    assert.equal(row.phone, '+919876543210', ph)
  }
})

test('a booking cannot be read without its token', async () => {
  const { body } = await createBooking(t.app)
  const r = await t.app.inject({ method: 'GET', url: `/api/public/bookings/${body.booking.bookingId}`, headers: { 'x-booking-token': 'x'.repeat(43) } })
  assert.equal(r.statusCode, 404)
  assert.equal((await t.app.inject({ method: 'GET', url: `/api/public/bookings/${body.booking.bookingId}` })).statusCode, 404)
})

test('payment cannot be submitted before email verification', async () => {
  const { body } = await createBooking(t.app)
  const r = await t.app.inject({ method: 'POST', url: `/api/public/bookings/${body.booking.bookingId}/payment`, headers: auth(body), payload: { reference: '412345678912' } })
  assert.equal(json(r).error, 'not_awaiting_payment')
})
