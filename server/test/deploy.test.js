// Deployment readiness: fresh-database migrations, start-up races, health
// check, hosting config, first-owner setup without a shell, free email alerts
// and split site/API URLs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, json, pendingBooking, adminSession, drain, TEST_DB } from './helpers.js'
import { loadConfig } from '../config.js'
import { createDb } from '../db.js'
import { migrate } from '../migrate.js'

const MIGRATIONS = ['001_init.sql', '002_pass_png.sql', '003_row_level_security.sql', '004_referral_codes_int650_kittu20.sql', '005_offline_passes.sql']
const silent = { info() {}, warn() {}, error() {} }

test('a fresh database is migrated completely, with row-level security on every table', async () => {
  const t = await setup()
  try {
    const applied = (await t.ctx.db.many('SELECT name FROM schema_migrations ORDER BY name')).map((r) => r.name)
    assert.deepEqual(applied, MIGRATIONS)
    const open = await t.ctx.db.many(`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                       WHERE n.nspname = current_schema() AND c.relkind = 'r' AND NOT c.relrowsecurity`)
    assert.deepEqual(open, [], 'tables without RLS')
    // the app (table owner) is unaffected
    assert.equal(json(await t.app.inject({ method: 'GET', url: '/api/public/config' })).pricing.male, 199900)
  } finally {
    await t.close()
  }
})

test('two instances starting at once apply each migration exactly once', async () => {
  const t = await setup()
  await t.close()
  const c = createDb({ databaseUrl: TEST_DB })
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  const a = createDb({ databaseUrl: TEST_DB }, silent)
  const b = createDb({ databaseUrl: TEST_DB }, silent)
  try {
    await Promise.all([migrate(a, silent), migrate(b, silent), migrate(a, silent)])
    const rows = await c.many('SELECT name FROM schema_migrations ORDER BY name')
    assert.deepEqual(rows.map((r) => r.name), MIGRATIONS)
  } finally {
    await Promise.all([a.close(), b.close(), c.close()])
  }
})

test('health check answers GET and HEAD and checks the database', async () => {
  const t = await setup()
  try {
    const r = await t.app.inject({ method: 'GET', url: '/api/health' })
    assert.equal(r.statusCode, 200)
    assert.deepEqual(json(r), { ok: true })
    assert.equal((await t.app.inject({ method: 'HEAD', url: '/api/health' })).statusCode, 200)
    await t.ctx.db.close()
    t.ctx.db.close = async () => {}
    assert.equal((await t.app.inject({ method: 'GET', url: '/api/health' })).statusCode, 500)
  } finally {
    await t.close()
  }
})

test('hosting configuration: platform port, all interfaces, pool size, URLs and validation', () => {
  const base = {
    NODE_ENV: 'production',
    PORT: '10000',
    DATABASE_URL: 'postgresql://postgres.ref:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    DATABASE_SSL: 'true',
    DATABASE_POOL_MAX: '5',
    APP_SECRET: 'x'.repeat(44),
    APP_URL: 'https://feral.onrender.com',
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.gmail.com',
    EMAIL_FROM: 'FERAL <x@example.com>',
    ORGANIZER_EMAIL: 'Organiser@Example.com',
  }
  const cfg = loadConfig(base)
  assert.deepEqual([cfg.port, cfg.host, cfg.databaseSsl, cfg.databasePoolMax, cfg.trustProxy, cfg.cookieSecure], [10000, '0.0.0.0', true, 5, true, true])
  assert.equal(cfg.apiUrl, 'https://feral.onrender.com')
  assert.deepEqual(cfg.notify.organizerEmails, ['organiser@example.com'])
  assert.ok(!cfg.warnings.some((w) => /organizer alerts will fail/.test(w)))
  assert.match(cfg.payment.qrPath, /server\/assets\/payment-qr\.png$/)
  // site on its own host, server on Render
  const split = loadConfig({ ...base, APP_URL: 'https://www.getferal.in', PUBLIC_API_URL: 'https://feral.onrender.com/' })
  assert.deepEqual([split.appUrl, split.apiUrl], ['https://www.getferal.in', 'https://feral.onrender.com'])
  const bad = (over, re) => assert.throws(() => loadConfig({ ...base, ...over }), re)
  bad({ ADMIN_SETUP_TOKEN: 'short' }, /ADMIN_SETUP_TOKEN/)
  bad({ ORGANIZER_EMAIL: 'not-an-email' }, /ORGANIZER_EMAIL/)
  bad({ DATABASE_URL: '' }, /DATABASE_URL/)
  bad({ APP_SECRET: 'short' }, /APP_SECRET/)
  bad({ EMAIL_PROVIDER: 'dev_outbox' }, /not allowed in production/)
  bad({ PUBLIC_API_URL: 'http://feral.onrender.com' }, /PUBLIC_API_URL/)
})

test('first owner can be created without a shell, once, and only with the setup token', async () => {
  const t = await setup({ ADMIN_SETUP_TOKEN: 's'.repeat(40) })
  try {
    const avail = async () => json(await t.app.inject({ method: 'GET', url: '/api/admin/setup' })).available
    assert.equal(await avail(), true)
    const post = (payload) => t.app.inject({ method: 'POST', url: '/api/admin/setup', payload })
    const good = { token: 's'.repeat(40), name: 'Kritik Aggarwal', email: 'Owner@Example.com', password: 'a long password 123' }
    assert.equal((await post({ ...good, token: 's'.repeat(39) + 't' })).statusCode, 403)
    assert.equal((await post({ ...good, password: 'short' })).statusCode, 400)
    const [x, y] = await Promise.all([post(good), post({ ...good, email: 'other@example.com' })])
    assert.deepEqual([x.statusCode, y.statusCode].sort(), [200, 409])
    assert.equal(await avail(), false)
    assert.equal((await post({ ...good, email: 'third@example.com' })).statusCode, 409)
    const admins = await t.ctx.db.many('SELECT email, role FROM admins')
    assert.equal(admins.length, 1)
    assert.equal(admins[0].role, 'owner')
    const winner = admins[0].email
    const login = await t.app.inject({ method: 'POST', url: '/api/admin/login', payload: { email: winner, password: good.password } })
    assert.equal(login.statusCode, 200)
    const audit = await t.ctx.db.many(`SELECT action FROM audit_logs WHERE action LIKE 'admin_setup%' ORDER BY id`)
    assert.deepEqual(audit.map((a) => a.action), ['admin_setup_refused', 'admin_setup_owner_created'])
  } finally {
    await t.close()
  }
  // without ADMIN_SETUP_TOKEN the setup never opens, even on an empty database
  const t2 = await setup()
  try {
    assert.equal(json(await t2.app.inject({ method: 'GET', url: '/api/admin/setup' })).available, false)
    const r = await t2.app.inject({ method: 'POST', url: '/api/admin/setup', payload: { token: '', name: 'Someone', email: 'a@b.co', password: 'a long password 123' } })
    assert.equal(r.statusCode, 403)
    assert.equal((await t2.ctx.db.one('SELECT count(*)::int AS n FROM admins')).n, 0)
  } finally {
    await t2.close()
  }
})

test('organizer email alerts work without any phone provider; split hosting gives correct links', async () => {
  const t = await setup({
    NOTIFY_PROVIDER: '',
    ORGANIZER_PHONE: '',
    ORGANIZER_EMAIL: 'organiser@example.com',
    APP_URL: 'https://www.getferal.in',
    PUBLIC_API_URL: 'https://feral.onrender.com',
  })
  try {
    const b = await pendingBooking(t.app, t.capture, { name: 'Riya Sen', category: 'female', gender: 'FEMALE' })
    const code = b.booking.bookingId
    await drain(t.ctx)
    const rows = await t.ctx.db.many(`SELECT channel, type, recipient, status FROM notifications WHERE type LIKE 'organizer%' ORDER BY id`)
    assert.deepEqual(rows, [{ channel: 'email', type: 'organizer_payment_pending', recipient: 'organiser@example.com', status: 'SENT' }])
    const alert = t.capture.emails.find((m) => m.to === 'organiser@example.com')
    assert.match(alert.subject, new RegExp(`Payment approval required · ${code}`))
    assert.ok(alert.text.includes('FERAL — PAYMENT APPROVAL REQUIRED') && alert.text.includes('Riya Sen') && alert.text.includes('Status: PAYMENT PENDING VERIFICATION'))
    assert.ok(!/https?:\/\//.test(alert.text) && !/token/i.test(alert.text), 'no links or tokens in the alert')

    // payment email: booking link → site, QR image → API host
    const payMail = t.capture.emails.find((m) => /Payment Required/.test(m.subject))
    assert.ok(payMail.text.includes('https://www.getferal.in/#booking='))
    const approver = await adminSession(t.ctx, t.app, 'approver')
    assert.equal((await approver.req('POST', `/bookings/${code}/approve`, { confirm: true })).statusCode, 200)
    await drain(t.ctx)
    const passMail = t.capture.emails.find((m) => m.subject === 'Your Official FERAL 2026 Pass')
    const link = passMail.text.match(/Download your pass: (\S+)/)[1]
    assert.ok(link.startsWith(`https://feral.onrender.com/api/public/bookings/${code}/pass.pdf?t=`), link)
    const dl = await t.app.inject({ method: 'GET', url: link.replace('https://feral.onrender.com', '') })
    assert.equal(dl.statusCode, 200)
  } finally {
    await t.close()
  }
})

test('queued messages survive a restart, and a send cut off mid-way is retried once', async () => {
  const t = await setup()
  try {
    const b = await pendingBooking(t.app, t.capture, { name: 'Dev Arora' })
    const id = (await t.ctx.db.one('SELECT id FROM bookings WHERE booking_code = $1', [b.booking.bookingId])).id
    // nothing has been delivered yet: the alert is in the database, not in memory
    const q = await t.ctx.db.many(`SELECT status FROM notifications WHERE booking_id = $1 AND type = 'organizer_payment_pending'`, [id])
    assert.deepEqual(q.map((r) => r.status), ['QUEUED'])
    // a worker claims it and the process dies before reporting back
    await t.ctx.db.query(`UPDATE notifications SET status = 'SENDING', attempts = 1, locked_until = now() + interval '2 minutes' WHERE booking_id = $1 AND type = 'organizer_payment_pending'`, [id])
    await drain(t.ctx)
    assert.equal(t.capture.notifications.length, 0, 'not re-sent while the claim is still live')
    // after the claim expires (as after a restart) it is picked up again and sent once
    await t.ctx.db.query(`UPDATE notifications SET locked_until = now() - interval '1 second' WHERE booking_id = $1 AND status = 'SENDING'`, [id])
    await drain(t.ctx)
    await drain(t.ctx)
    const n = await t.ctx.db.one(`SELECT status, attempts FROM notifications WHERE booking_id = $1 AND type = 'organizer_payment_pending'`, [id])
    assert.deepEqual([n.status, n.attempts], ['SENT', 2])
    assert.equal(t.capture.notifications.filter((m) => m.body.includes(b.booking.bookingId)).length, 1)
  } finally {
    await t.close()
  }
})
