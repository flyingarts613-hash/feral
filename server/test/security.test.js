import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { loadConfig } from '../config.js'
import { setup, json, pendingBooking, adminSession, drain } from './helpers.js'

const base = { DATABASE_URL: 'postgres://x', APP_SECRET: 'z'.repeat(40), APP_URL: 'https://www.getferal.in', EMAIL_FROM: 'FERAL <a@b.c>', NOTIFY_PROVIDER: 'twilio_sms' }

test('production refuses fake providers, weak secrets and missing email config', () => {
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', EMAIL_PROVIDER: 'dev_outbox' }), /not allowed in production/)
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', EMAIL_PROVIDER: 'test' }), /not allowed in production/)
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', NOTIFY_PROVIDER: 'test' }), /not allowed in production/)
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', EMAIL_PROVIDER: '' }), /EMAIL_PROVIDER is required/)
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', APP_SECRET: 'short' }), /APP_SECRET/)
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'development', EMAIL_PROVIDER: 'test' }), /only run under NODE_ENV=test/)
  const ok = loadConfig({ ...base, NODE_ENV: 'production', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' })
  assert.equal(ok.cookieSecure, true)
})

let t, admin
before(async () => {
  t = await setup({ RESEND_WEBHOOK_SECRET: 'whsec_' + Buffer.from('resend-secret').toString('base64'), TWILIO_AUTH_TOKEN: 'twilio-token', TWILIO_ACCOUNT_SID: 'AC123' })
  admin = await adminSession(t.ctx, t.app, 'owner')
})
after(() => t.close())

test('admin pages and API carry strict security headers; customer API is not cached', async () => {
  const r = await admin.req('GET', '/summary')
  assert.equal(r.headers['x-frame-options'], 'DENY')
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/)
  assert.equal(r.headers['x-content-type-options'], 'nosniff')
  const c = await t.app.inject({ method: 'GET', url: '/api/public/config' })
  assert.equal(c.headers['cache-control'], 'no-store')
  assert.equal(json(c).referralNote, 'Contact coordinators for referral code.')
  assert.ok(!JSON.stringify(json(c)).match(/secret|token|api_key/i))
})

test('admin session cookie is HttpOnly + SameSite=Strict, and logout ends it', async () => {
  const a = await adminSession(t.ctx, t.app, 'viewer')
  const login = await t.app.inject({ method: 'POST', url: '/api/admin/login', payload: { email: a.email, password: 'correct horse battery' } })
  const set = login.headers['set-cookie']
  assert.match(String(set), /HttpOnly/)
  assert.match(String(set), /SameSite=Strict/)
  assert.equal((await a.req('POST', '/logout')).statusCode, 200)
  assert.equal((await a.req('GET', '/me')).statusCode, 401)
  const wrong = await t.app.inject({ method: 'POST', url: '/api/admin/login', payload: { email: a.email, password: 'nope nope nope' } })
  assert.equal(wrong.statusCode, 401)
})

test('email delivery is only recorded from a correctly signed Resend webhook', async () => {
  const b = await pendingBooking(t.app, t.capture)
  await drain(t.ctx)
  const n = await t.ctx.db.one(`SELECT * FROM notifications WHERE type = 'booking_payment_required' AND booking_id = (SELECT id FROM bookings WHERE booking_code = $1)`, [b.booking.bookingId])
  assert.equal(n.status, 'SENT') // accepted by the provider — not "delivered"
  // pretend the provider id is a Resend id
  await t.ctx.db.query(`UPDATE notifications SET provider = 'resend', provider_message_id = 're_123' WHERE id = $1`, [n.id])
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_123' } })
  const id = 'msg_1'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = crypto.createHmac('sha256', Buffer.from('resend-secret')).update(`${id}.${ts}.${body}`).digest('base64')
  const forged = await t.app.inject({ method: 'POST', url: '/api/webhooks/resend', payload: body, headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,AAAA' } })
  assert.equal(forged.statusCode, 401)
  const ok = await t.app.inject({ method: 'POST', url: '/api/webhooks/resend', payload: body, headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` } })
  assert.equal(ok.statusCode, 200)
  assert.equal((await t.ctx.db.one('SELECT status FROM notifications WHERE id = $1', [n.id])).status, 'DELIVERED')
})

test('Twilio status callbacks need a valid X-Twilio-Signature', async () => {
  const b = await pendingBooking(t.app, t.capture)
  await drain(t.ctx)
  const n = await t.ctx.db.one(`SELECT * FROM notifications WHERE type = 'organizer_payment_pending' AND booking_id = (SELECT id FROM bookings WHERE booking_code = $1)`, [b.booking.bookingId])
  await t.ctx.db.query(`UPDATE notifications SET provider = 'twilio_sms', provider_message_id = 'SM1' WHERE id = $1`, [n.id])
  const params = { MessageSid: 'SM1', MessageStatus: 'delivered', To: '+919999999999' }
  const url = 'http://localhost:8787/api/webhooks/twilio/status'
  const sig = crypto.createHmac('sha1', 'twilio-token').update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64')
  const payload = new URLSearchParams(params).toString()
  const bad = await t.app.inject({ method: 'POST', url: '/api/webhooks/twilio/status', payload, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'nope' } })
  assert.equal(bad.statusCode, 401)
  const ok = await t.app.inject({ method: 'POST', url: '/api/webhooks/twilio/status', payload, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig } })
  assert.equal(ok.statusCode, 200)
  assert.equal((await t.ctx.db.one('SELECT status FROM notifications WHERE id = $1', [n.id])).status, 'DELIVERED')
})

test('no organizer number configured → the alert is visibly failed, the booking is kept', async () => {
  await admin.req('PUT', '/settings/organizerPhones', { value: [] })
  t.ctx.cfg.notify.organizerPhones.length = 0
  const b = await pendingBooking(t.app, t.capture)
  for (let i = 0; i < 7; i++) {
    await drain(t.ctx)
    await t.ctx.db.query(`UPDATE notifications SET next_attempt_at = now() WHERE status = 'QUEUED'`)
  }
  const n = await t.ctx.db.one(`SELECT status, last_error FROM notifications WHERE type = 'organizer_payment_pending' AND booking_id = (SELECT id FROM bookings WHERE booking_code = $1)`, [b.booking.bookingId])
  assert.equal(n.status, 'FAILED')
  assert.match(n.last_error, /No organizer phone number/)
  const s = json(await admin.req('GET', '/summary'))
  assert.ok(s.warnings.some((w) => /organizer phone/i.test(w)))
  assert.ok(json(await admin.req('GET', '/bookings?status=pending')).rows.some((r) => r.booking_code === b.booking.bookingId))
})
