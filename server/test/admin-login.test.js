// Primary admin from the environment (ADMIN_LOGIN_ID + ADMIN_PASSWORD_HASH /
// ADMIN_PASSWORD) and the admin sign-in itself. Dummy credentials only.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { setup, json, adminSession } from './helpers.js'
import { hashPassword } from '../lib/security.js'

const LOGIN_ID = '9000000001'
const PASSWORD = 'Test-Only-Passw0rd!'
const open = []
after(async () => {
  for (const t of open) await t.close().catch(() => {})
})
const boot = async (env) => {
  const t = await setup(env)
  open.push(t)
  return t
}
const login = (t, loginId, password, extra = {}) => t.app.inject({ method: 'POST', url: '/api/admin/login', payload: { loginId, password, ...extra } })
const withSession = (t, r) => {
  const cookie = r.cookies.find((c) => c.name === 'feral_admin')
  const csrf = json(r).csrfToken
  return (method, url, payload, headers = {}) =>
    t.app.inject({ method, url: `/api/admin${url}`, payload, headers: { cookie: `feral_admin=${cookie.value}`, 'x-csrf-token': csrf, ...headers } })
}

test('valid login with the login ID and password from the environment (hash variant); secure cookie', async () => {
  const t = await boot({ ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD_HASH: await hashPassword(PASSWORD), COOKIE_SECURE: 'true' })
  const r = await login(t, LOGIN_ID, PASSWORD)
  assert.equal(r.statusCode, 200, r.body)
  assert.deepEqual(json(r).admin, { email: LOGIN_ID, name: 'FERAL Admin', role: 'owner' })
  const c = r.cookies.find((x) => x.name === 'feral_admin')
  assert.deepEqual([c.httpOnly, c.secure, c.sameSite, c.path], [true, true, 'Strict', '/'])
  assert.ok(c.maxAge > 0 && c.maxAge <= 12 * 3600)
  // nothing secret in the response
  assert.ok(!r.body.includes(PASSWORD) && !r.body.includes('scrypt'))
  const me = await withSession(t, r)('GET', '/me')
  assert.equal(json(me).admin.role, 'owner')
  // stored as a hash only
  const row = await t.ctx.db.one(`SELECT password_hash, managed_by, active FROM admins WHERE email = $1`, [LOGIN_ID])
  assert.match(row.password_hash, /^scrypt\$/)
  assert.deepEqual([row.managed_by, row.active], ['env', true])
  const dump = JSON.stringify(await t.ctx.db.many(`SELECT * FROM admins`)) + JSON.stringify(await t.ctx.db.many(`SELECT * FROM audit_logs`))
  assert.ok(!dump.includes(PASSWORD), 'plaintext password stored somewhere')
  // the first-owner setup form is closed because an admin exists
  assert.equal(json(await t.app.inject({ method: 'GET', url: '/api/admin/setup' })).available, false)
})

test('plaintext ADMIN_PASSWORD variant works, and the plaintext is dropped from the config', async () => {
  const t = await boot({ ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD })
  assert.equal(t.ctx.cfg.envAdmin.password, '')
  assert.equal((await login(t, LOGIN_ID, PASSWORD)).statusCode, 200)
  // also accepted under the old field name
  assert.equal((await t.app.inject({ method: 'POST', url: '/api/admin/login', payload: { email: LOGIN_ID, password: PASSWORD } })).statusCode, 200)
})

test('invalid logins get one generic message; repeated failures lock that login ID', async () => {
  const t = await boot({ ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD })
  const wrongPw = await login(t, LOGIN_ID, 'not-the-password')
  const wrongId = await login(t, '9999999999', PASSWORD)
  const empty = await t.app.inject({ method: 'POST', url: '/api/admin/login', payload: { loginId: LOGIN_ID } })
  assert.deepEqual([wrongPw.statusCode, wrongId.statusCode, empty.statusCode], [401, 401, 400])
  assert.equal(json(wrongPw).message, 'Incorrect login ID or password.')
  assert.equal(json(wrongId).message, json(wrongPw).message)
  assert.ok(!wrongPw.cookies.length)
  // 5 failures in 15 minutes → even the right password is refused for a while
  for (let i = 0; i < 4; i++) assert.equal((await login(t, LOGIN_ID, `wrong-${i}`)).statusCode, 401)
  const locked = await login(t, LOGIN_ID, PASSWORD)
  assert.equal(locked.statusCode, 429)
  assert.match(json(locked).message, /Too many failed sign-in attempts/)
  // other admins are not affected
  const other = await adminSession(t.ctx, t.app, 'viewer')
  assert.ok(other.cookie)
  // after the window it works again
  await t.ctx.db.query(`UPDATE audit_logs SET created_at = now() - interval '16 minutes' WHERE action = 'admin_login_failed'`)
  assert.equal((await login(t, LOGIN_ID, PASSWORD)).statusCode, 200)
})

test('session expiry and logout end access', async () => {
  const t = await boot({ ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD })
  const req = withSession(t, await login(t, LOGIN_ID, PASSWORD))
  assert.equal((await req('GET', '/offline/bookings')).statusCode, 200)
  await t.ctx.db.query(`UPDATE admin_sessions SET expires_at = now() - interval '1 second'`)
  assert.equal((await req('GET', '/offline/bookings')).statusCode, 401)

  const req2 = withSession(t, await login(t, LOGIN_ID, PASSWORD))
  assert.equal((await req2('GET', '/me')).statusCode, 200)
  const out = await req2('POST', '/logout')
  assert.equal(out.statusCode, 200)
  assert.match(out.headers['set-cookie'], /feral_admin=;/)
  assert.equal((await req2('GET', '/me')).statusCode, 401)
  assert.equal((await req2('GET', '/offline/bookings')).statusCode, 401)
  assert.equal((await t.ctx.db.one(`SELECT count(*)::int AS n FROM admin_sessions WHERE expires_at > now()`)).n, 0)
})

test('without a session nothing admin is reachable; with one, admin operations work', async () => {
  const t = await boot({ ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD })
  const issueBody = { name: 'Neel Batra', email: 'neel@example.com', phone: '9810011223', category: 'male', quantity: 1, paymentMethod: 'cash', amountPaise: 199900, paymentReceived: true }
  const anon = [
    ['POST', '/offline/bookings', issueBody],
    ['GET', '/offline/bookings'],
    ['GET', '/offline/bookings/FRL-ABCDEF'],
    ['POST', '/offline/bookings/FRL-ABCDEF/resend', { confirm: true }],
    ['GET', '/bookings'],
    ['GET', '/bookings/FRL-ABCDEF/pass.pdf'],
    ['GET', '/export.csv'],
    ['POST', '/checkin/redeem', { token: 'FERAL-2026-ABCDEF' }],
  ]
  for (const [m, url, payload] of anon) {
    const r = await t.app.inject({ method: m, url: `/api/admin${url}`, payload, headers: { 'idempotency-key': crypto.randomUUID() } })
    assert.equal(r.statusCode, 401, `${m} ${url}`)
    assert.ok(!r.body.includes('neel@example.com'))
  }
  // signed in as the primary admin: issue, list, view, download, resend, check in
  const req = withSession(t, await login(t, LOGIN_ID, PASSWORD))
  const issued = await req('POST', '/offline/bookings', issueBody, { 'idempotency-key': crypto.randomUUID() })
  assert.equal(issued.statusCode, 201, issued.body)
  const b = json(issued).booking
  assert.equal(b.issuedBy, `FERAL Admin <${LOGIN_ID}>`)
  assert.equal(json(await req('GET', '/offline/bookings')).total, 1)
  assert.equal((await req('GET', `/offline/bookings/${b.bookingId}`)).statusCode, 200)
  const pdf = await req('GET', `/bookings/${b.bookingId}/pass.pdf`)
  assert.deepEqual([pdf.statusCode, pdf.headers['content-type']], [200, 'application/pdf'])
  await t.ctx.db.query(`UPDATE notifications SET sent_at = now() - interval '5 minutes'`)
  assert.equal((await req('POST', `/offline/bookings/${b.bookingId}/resend`, { confirm: true })).statusCode, 200)
  assert.equal(json(await req('POST', '/checkin/redeem', { token: b.passes[0].passCode })).checkedInNow, true)
  // changing data without the CSRF header is refused even with the cookie
  const cookie = (await login(t, LOGIN_ID, PASSWORD)).cookies.find((c) => c.name === 'feral_admin').value
  const noCsrf = await t.app.inject({ method: 'POST', url: '/api/admin/offline/bookings', payload: issueBody, headers: { cookie: `feral_admin=${cookie}`, 'idempotency-key': crypto.randomUUID() } })
  assert.equal(noCsrf.statusCode, 403)
})

test('changing the password in the environment signs old sessions out; removing it disables the account', async () => {
  const t1 = await boot({ ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD })
  const old = withSession(t1, await login(t1, LOGIN_ID, PASSWORD))
  assert.equal((await old('GET', '/me')).statusCode, 200)
  // same password on restart: nothing changes, sessions survive
  const t2 = await boot({ __keepSchema: true, ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD })
  assert.equal((await old('GET', '/me')).statusCode, 200)
  // new password: old sessions end, old password fails, new one works
  const NEW = 'Another-Test-Passw0rd'
  const t3 = await boot({ __keepSchema: true, ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD_HASH: await hashPassword(NEW) })
  assert.equal((await old('GET', '/me')).statusCode, 401)
  assert.equal((await login(t3, LOGIN_ID, PASSWORD)).statusCode, 401)
  assert.equal((await login(t3, LOGIN_ID, NEW)).statusCode, 200)
  // variables removed: the account is disabled, other admins keep working
  const keep = await adminSession(t3.ctx, t3.app, 'owner')
  const t4 = await boot({ __keepSchema: true })
  assert.equal((await login(t4, LOGIN_ID, NEW)).statusCode, 401)
  assert.equal((await t4.ctx.db.one(`SELECT active FROM admins WHERE email = $1`, [LOGIN_ID])).active, false)
  assert.equal((await keep.req('GET', '/me')).statusCode, 200)
  const actions = (await t4.ctx.db.many(`SELECT action FROM audit_logs WHERE action LIKE 'env_admin%' ORDER BY id`)).map((a) => a.action)
  assert.deepEqual(actions, ['env_admin_created', 'env_admin_updated', 'env_admin_disabled'])
  void t2
})

test('bad environment values stop the server instead of starting without a login', async () => {
  const { loadConfig } = await import('../config.js')
  const base = { DATABASE_URL: 'postgres://x', APP_SECRET: 'z'.repeat(40) }
  assert.throws(() => loadConfig({ ...base, ADMIN_LOGIN_ID: LOGIN_ID }), /neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD/)
  assert.throws(() => loadConfig({ ...base, ADMIN_PASSWORD: PASSWORD }), /ADMIN_LOGIN_ID is not/)
  assert.throws(() => loadConfig({ ...base, ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: 'short' }), /at least 12/)
  assert.throws(() => loadConfig({ ...base, ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD_HASH: 'plaintext' }), /not a hash/)
  assert.throws(() => loadConfig({ ...base, ADMIN_LOGIN_ID: 'bad id!', ADMIN_PASSWORD: PASSWORD }), /ADMIN_LOGIN_ID may only/)
})

test('/admin/login serves the admin sign-in page; the public site and QR pages stay public', async () => {
  const t = await boot({ SERVE_STATIC: 'true', ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD })
  const r = await t.app.inject({ method: 'GET', url: '/admin/login' })
  const page = await t.app.inject({ method: 'GET', url: '/admin/' })
  assert.deepEqual([r.statusCode, page.statusCode], [200, 200])
  assert.match(r.headers['content-type'], /text\/html/)
  assert.equal(r.body, page.body) // the same admin app, which shows the login form until signed in
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/)
  assert.ok(!r.body.includes(LOGIN_ID) && !r.body.includes(PASSWORD))
  // its relative asset links resolve from /admin/login exactly as from /admin/
  const js = r.body.match(/src="\.\.\/(assets\/[^"]+\.js)"/)[1]
  assert.equal((await t.app.inject({ method: 'GET', url: `/${js}` })).statusCode, 200)
  assert.equal((await t.app.inject({ method: 'GET', url: '/api/public/config' })).statusCode, 200)
  assert.equal((await t.app.inject({ method: 'GET', url: '/' })).statusCode, 200)
})

test('with ADMIN_LOGIN_ID configured the first-time setup is never offered and its endpoint refuses', async () => {
  const TOKEN = 's'.repeat(44)
  const t = await boot({ ADMIN_SETUP_TOKEN: TOKEN, ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD })
  assert.equal(json(await t.app.inject({ method: 'GET', url: '/api/admin/setup' })).available, false)
  // even if the admins table were emptied, setup stays closed while ADMIN_LOGIN_ID is set
  await t.ctx.db.query('DELETE FROM admins')
  assert.equal(json(await t.app.inject({ method: 'GET', url: '/api/admin/setup' })).available, false)
  const r = await t.app.inject({ method: 'POST', url: '/api/admin/setup', payload: { token: TOKEN, name: 'Someone', email: 'someone@example.com', password: 'a long password 123' } })
  assert.equal(r.statusCode, 403)
  assert.equal((await t.ctx.db.one('SELECT count(*)::int AS n FROM admins')).n, 0)
  // and the reason this happened in production: without ADMIN_LOGIN_ID there is no admin at all
  const t2 = await boot({ ADMIN_SETUP_TOKEN: TOKEN })
  assert.equal((await t2.ctx.db.one('SELECT count(*)::int AS n FROM admins')).n, 0)
  assert.equal(json(await t2.app.inject({ method: 'GET', url: '/api/admin/setup' })).available, true)
})

test('production warns when ADMIN_LOGIN_ID is missing', async () => {
  const { loadConfig } = await import('../config.js')
  const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', APP_SECRET: 'z'.repeat(40), APP_URL: 'https://x.example', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', EMAIL_FROM: 'a@b.co' }
  assert.ok(loadConfig(base).warnings.some((w) => /ADMIN_LOGIN_ID is not set/.test(w)))
  assert.ok(!loadConfig({ ...base, ADMIN_LOGIN_ID: LOGIN_ID, ADMIN_PASSWORD: PASSWORD }).warnings.some((w) => /ADMIN_LOGIN_ID/.test(w)))
})
