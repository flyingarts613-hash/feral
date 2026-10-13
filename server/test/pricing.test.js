import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { setup, json, createBooking, adminSession } from './helpers.js'

let t
before(async () => {
  t = await setup()
  // an ordinary referral code, created the only way codes can be created: by an admin
  const owner = await adminSession(t.ctx, t.app, 'owner')
  const r = await owner.req('POST', '/referral-codes', { code: 'FRIEND', kind: 'flat_discount' })
  assert.equal(r.statusCode, 201, r.body)
  await owner.req('POST', '/referral-codes', { code: 'OLD', kind: 'flat_discount', expiresAt: '2020-01-01T00:00:00Z' })
  await owner.req('POST', '/referral-codes', { code: 'ONCE', kind: 'flat_discount', maxUses: 1 })
})
after(() => t.close())

const quote = async (category, referralCode) => json(await t.app.inject({ method: 'POST', url: '/api/public/quote', payload: { category, referralCode } }))

test('1. Male without referral: ₹1,999', async () => {
  const q = await quote('male', '')
  assert.deepEqual([q.originalPaise, q.discountPaise, q.finalPaise, q.referral.status], [199900, 0, 199900, 'none'])
})

test('2. Girls without referral: ₹1,699', async () => {
  const q = await quote('female')
  assert.equal(q.finalPaise, 169900)
})

test('3. Male with ETHAN: ₹1,500 (fixed price, not stacked)', async () => {
  const q = await quote('male', 'ETHAN')
  assert.deepEqual([q.originalPaise, q.discountPaise, q.finalPaise, q.referral.status], [199900, 49900, 150000, 'applied'])
})

test('4. Girls with ETHAN: ₹1,000', async () => {
  const q = await quote('female', 'ETHAN')
  assert.deepEqual([q.discountPaise, q.finalPaise], [69900, 100000])
})

test('ETHAN on a couple pass falls back to the normal ₹400 discount', async () => {
  assert.equal((await quote('couple', 'ETHAN')).finalPaise, 309900)
})

test('5. Male with another valid referral: ₹1,599', async () => {
  const q = await quote('male', 'FRIEND')
  assert.deepEqual([q.discountPaise, q.finalPaise], [40000, 159900])
})

test('6. Girls with another valid referral: ₹1,299', async () => {
  assert.equal((await quote('female', 'friend')).finalPaise, 129900)
})

test('couple with another valid referral: ₹3,099', async () => {
  assert.equal((await quote('couple', 'FRIEND')).finalPaise, 309900)
})

test('INT650 and KITTU20 take ₹400 off every pass (any letter case)', async () => {
  for (const code of ['INT650', 'kittu20', ' Kittu20 ']) {
    const expected = { male: [199900, 159900], female: [169900, 129900], couple: [349900, 309900] }
    for (const [category, [original, final]] of Object.entries(expected)) {
      const q = await quote(category, code)
      assert.deepEqual([q.originalPaise, q.discountPaise, q.finalPaise, q.referral.status, q.referral.code], [original, 40000, final, 'applied', code.trim().toUpperCase()], `${code} ${category}`)
    }
  }
})

test('a booking with KITTU20 is charged the discounted price', async () => {
  const { res, body } = await createBooking(t.app, { referralCode: 'KITTU20' })
  assert.equal(res.statusCode, 201, res.body)
  assert.deepEqual([body.booking.originalPaise, body.booking.discountPaise, body.booking.finalPaise], [199900, 40000, 159900])
})

test('7. Invalid referral code: no discount', async () => {
  const q = await quote('male', 'NOPE123')
  assert.deepEqual([q.finalPaise, q.discountPaise, q.referral.status], [199900, 0, 'invalid'])
})

test('expired referral code: no discount', async () => {
  const q = await quote('male', 'OLD')
  assert.deepEqual([q.finalPaise, q.referral.status], [199900, 'expired'])
})

test('8. ETHAN matching is case-insensitive (and ignores spaces)', async () => {
  for (const c of ['ethan', 'Ethan', 'eThAn', ' ETHAN ']) assert.equal((await quote('male', c)).finalPaise, 150000, c)
})

test('booking stores the server price and ignores any price sent by the browser', async () => {
  const { res, body } = await createBooking(t.app, { referralCode: 'Ethan', finalPaise: 1, originalPaise: 1, discountPaise: 999999 })
  assert.equal(res.statusCode, 201, res.body)
  assert.deepEqual([body.booking.originalPaise, body.booking.discountPaise, body.booking.finalPaise, body.booking.referralCode], [199900, 49900, 150000, 'ETHAN'])
  const row = await t.ctx.db.one('SELECT original_paise, discount_paise, final_paise, referral_code FROM bookings WHERE booking_code = $1', [body.booking.bookingId])
  assert.deepEqual(row, { original_paise: 199900, discount_paise: 49900, final_paise: 150000, referral_code: 'ETHAN' })
})

test('booking with an invalid code is charged the original price and records no code', async () => {
  const { body } = await createBooking(t.app, { referralCode: 'MADEUP' })
  assert.equal(body.referral.status, 'invalid')
  assert.equal(body.booking.finalPaise, 199900)
  assert.equal(body.booking.referralCode, null)
})

test('usage limits are enforced on the server', async () => {
  const { lastOtp, auth } = await import('./helpers.js')
  const { body } = await createBooking(t.app, { referralCode: 'ONCE' })
  assert.equal(body.booking.finalPaise, 159900)
  const otp = lastOtp(t.capture, body.booking.email)
  await t.app.inject({ method: 'POST', url: `/api/public/bookings/${body.booking.bookingId}/otp/verify`, headers: auth(body), payload: { code: otp } })
  const q = await quote('male', 'ONCE')
  assert.equal(q.referral.status, 'exhausted')
  assert.equal(q.finalPaise, 199900)
})

test('admin-configured prices are used', async () => {
  const owner = await adminSession(t.ctx, t.app, 'owner')
  const r = await owner.req('PUT', '/settings/pricing', { value: { male: 210000, female: 169900, couple: 349900, referralDiscount: 50000 } })
  assert.equal(r.statusCode, 200, r.body)
  assert.equal((await quote('male', 'FRIEND')).finalPaise, 160000)
  assert.equal((await quote('male', 'ETHAN')).finalPaise, 150000)
  await owner.req('PUT', '/settings/pricing', { value: { male: 199900, female: 169900, couple: 349900, referralDiscount: 40000 } })
})

test('customers cannot create referral codes', async () => {
  const r = await t.app.inject({ method: 'POST', url: '/api/admin/referral-codes', payload: { code: 'FREE', kind: 'flat_discount', discountPaise: 199900 } })
  assert.equal(r.statusCode, 401)
})
