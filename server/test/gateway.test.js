import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { setup, json, auth, verifiedBooking, adminSession, drain } from './helpers.js'

// Payment mode B. Razorpay's HTTP API is mocked (it can't be reached from tests);
// signatures are real HMACs with test secrets, exactly as Razorpay computes them.
const KEY_SECRET = 'rzp_test_secret_value'
const WEBHOOK_SECRET = 'rzp_webhook_secret_value'
const rp = { orders: new Map(), payments: new Map() }
const razorpayFetch = async (url, init) => {
  const u = new URL(url)
  if (init.method === 'POST' && u.pathname === '/v1/orders') {
    const body = JSON.parse(init.body)
    const order = { id: `order_${crypto.randomBytes(6).toString('hex')}`, amount: body.amount, currency: body.currency, receipt: body.receipt, status: 'created' }
    rp.orders.set(order.id, order)
    return new Response(JSON.stringify(order), { status: 200 })
  }
  const m = u.pathname.match(/^\/v1\/payments\/(.+)$/)
  if (init.method === 'GET' && m) {
    const p = rp.payments.get(m[1])
    return new Response(JSON.stringify(p ?? { error: { description: 'not found' } }), { status: p ? 200 : 404 })
  }
  return new Response('{}', { status: 404 })
}

let t, approver
before(async () => {
  t = await setup({
    PAYMENT_MODE: 'razorpay',
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_KEY_SECRET: KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    GATEWAY_AUTO_APPROVE: 'true',
    __razorpayFetch: razorpayFetch,
  })
  approver = await adminSession(t.ctx, t.app, 'approver')
})
after(() => t.close())

const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex')
const pay = (orderId, amount, status = 'captured') => {
  const p = { id: `pay_${crypto.randomBytes(6).toString('hex')}`, order_id: orderId, amount, currency: 'INR', status }
  rp.payments.set(p.id, p)
  return p
}
const webhook = (event, entity, eventId, secret = WEBHOOK_SECRET) => {
  const body = JSON.stringify({ event, payload: { payment: { entity } } })
  return t.app.inject({ method: 'POST', url: '/api/webhooks/razorpay', payload: body, headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(secret, body), 'x-razorpay-event-id': eventId } })
}

test('orders are created server-side for the booking amount', async () => {
  const b = await verifiedBooking(t.app, t.capture, { referralCode: 'ETHAN', gender: 'FEMALE', category: 'female' })
  const o = json(await t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/razorpay/order`, headers: auth(b) }))
  assert.equal(o.amountPaise, 100000)
  assert.equal(rp.orders.get(o.orderId).amount, 100000)
  // UPI reference submission is closed in gateway mode
  const r = await t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/payment`, headers: auth(b), payload: { reference: '412345678999' } })
  assert.equal(json(r).error, 'wrong_mode')
})

test('checkout callback needs a valid signature', async () => {
  const b = await verifiedBooking(t.app, t.capture)
  const o = json(await t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/razorpay/order`, headers: auth(b) }))
  const p = pay(o.orderId, o.amountPaise)
  const url = `/api/public/bookings/${b.booking.bookingId}/razorpay/verify`
  const bad = await t.app.inject({ method: 'POST', url, headers: auth(b), payload: { orderId: o.orderId, paymentId: p.id, signature: 'f'.repeat(64) } })
  assert.equal(json(bad).error, 'bad_signature')
  const ok = await t.app.inject({ method: 'POST', url, headers: auth(b), payload: { orderId: o.orderId, paymentId: p.id, signature: sign(KEY_SECRET, `${o.orderId}|${p.id}`) } })
  assert.equal(ok.statusCode, 200, ok.body)
  assert.equal(json(ok).status, 'PAYMENT_PENDING_VERIFICATION')
})

test('webhooks with a bad signature are rejected', async () => {
  const r = await webhook('payment.captured', { id: 'pay_x', order_id: 'order_x', amount: 100, status: 'captured' }, 'evt_bad', 'wrong-secret')
  assert.equal(r.statusCode, 401)
})

test('18. duplicate payment webhooks cannot create duplicate passes', async () => {
  const b = await verifiedBooking(t.app, t.capture)
  const o = json(await t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/razorpay/order`, headers: auth(b) }))
  const p = pay(o.orderId, o.amountPaise)
  // the same event delivered three times, plus a second event type for the same payment
  const results = await Promise.all([webhook('payment.captured', p, 'evt_1'), webhook('payment.captured', p, 'evt_1'), webhook('order.paid', p, 'evt_2')])
  results.forEach((r) => assert.equal(r.statusCode, 200))
  assert.equal((await webhook('payment.captured', p, 'evt_1')).statusCode, 200)
  await drain(t.ctx)
  const id = (await t.ctx.db.one('SELECT id FROM bookings WHERE booking_code = $1', [b.booking.bookingId])).id
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM passes WHERE booking_id = $1', [id])).n, 1)
  assert.equal((await t.ctx.db.one(`SELECT count(*)::int AS n FROM payments WHERE booking_id = $1 AND status = 'APPROVED'`, [id])).n, 1)
  assert.equal((await t.ctx.db.one(`SELECT count(*)::int AS n FROM notifications WHERE booking_id = $1 AND type = 'payment_confirmed'`, [id])).n, 1)
  assert.equal((await t.ctx.db.one('SELECT status FROM bookings WHERE id = $1', [id])).status, 'PASS_ISSUED')
})

test('a webhook with the wrong amount is not accepted', async () => {
  const b = await verifiedBooking(t.app, t.capture)
  const o = json(await t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/razorpay/order`, headers: auth(b) }))
  const p = pay(o.orderId, 100)
  await webhook('payment.captured', p, 'evt_amount')
  const row = await t.ctx.db.one('SELECT status FROM bookings WHERE booking_code = $1', [b.booking.bookingId])
  assert.equal(row.status, 'AWAITING_PAYMENT')
})

test('manual confirmation is reconciled against Razorpay and cannot bypass it', async () => {
  const b = await verifiedBooking(t.app, t.capture)
  const o = json(await t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/razorpay/order`, headers: auth(b) }))
  const p = pay(o.orderId, o.amountPaise)
  await t.app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/razorpay/verify`, headers: auth(b), payload: { orderId: o.orderId, paymentId: p.id, signature: sign(KEY_SECRET, `${o.orderId}|${p.id}`) } })
  rp.payments.get(p.id).status = 'refunded' // Razorpay no longer reports it as captured
  const r = await approver.req('POST', `/bookings/${b.booking.bookingId}/approve`, { confirm: true })
  assert.equal(r.statusCode, 409)
  assert.equal(json(r).error, 'gateway_mismatch')
  rp.payments.get(p.id).status = 'captured'
  assert.equal((await approver.req('POST', `/bookings/${b.booking.bookingId}/approve`, { confirm: true })).statusCode, 200)
})
