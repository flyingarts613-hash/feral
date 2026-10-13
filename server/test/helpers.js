import pg from 'pg'
import { loadConfig } from '../config.js'
import { createContext } from '../context.js'
import { buildApp } from '../app.js'
import { processOnce } from '../services/worker.js'
import { hashPassword } from '../lib/security.js'

// Each test file gets a fresh schema in TEST_DATABASE_URL and in-memory
// email/notification providers (the "test" providers only run under NODE_ENV=test).
export const TEST_DB = process.env.TEST_DATABASE_URL || 'postgresql://feral@localhost:5433/feral_test'
const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent } }

export async function setup(env = {}) {
  const c = new pg.Client({ connectionString: TEST_DB })
  await c.connect()
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await c.end()

  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    APP_SECRET: 'test-secret-test-secret-test-secret-0123456789',
    APP_URL: 'http://localhost:8787',
    EMAIL_PROVIDER: 'test',
    EMAIL_FROM: 'FERAL <tickets@example.com>',
    NOTIFY_PROVIDER: 'test',
    ORGANIZER_PHONE: '+919999999999',
    SERVE_STATIC: 'false',
    WORKER: 'false',
    COOKIE_SECURE: 'false',
    RATE_LIMIT_SCALE: '1000',
    ...env,
  })
  const capture = { emails: [], notifications: [], failEmail: null, failNotify: null }
  const ctx = await createContext(cfg, { capture, log: silent, razorpayFetch: env.__razorpayFetch })
  ctx.log = silent
  // TEST_LOG=1 prints server errors while debugging a test
  const app = await buildApp({ ...ctx, logger: process.env.TEST_LOG ? { level: 'error' } : false, log: process.env.TEST_LOG ? undefined : silent })
  // buildApp copies ctx; keep one ctx for services used directly in tests
  const close = async () => {
    await app.close()
    await ctx.db.close()
  }
  return { cfg, ctx, app, capture, close }
}

export const json = (res) => JSON.parse(res.body)

export const person = (over = {}) => ({
  name: 'Aarav Mehta',
  email: `aarav.${Math.random().toString(36).slice(2, 8)}@example.com`,
  phone: '98765 43210',
  age: 22,
  gender: 'MALE',
  category: 'male',
  referralCode: '',
  ...over,
})

export async function createBooking(app, over = {}, headers = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/public/bookings', payload: person(over), headers })
  return { res, body: json(res) }
}

export function lastOtp(capture, email) {
  const m = [...capture.emails].reverse().find((e) => e.to === email && /Verify Your Email/.test(e.subject))
  return m?.text.match(/Your code: (\d{6})/)?.[1]
}

export const auth = (b) => ({ 'x-booking-token': b.accessToken })

export async function verifiedBooking(app, capture, over = {}) {
  const { body } = await createBooking(app, over)
  const otp = lastOtp(capture, body.booking.email)
  const v = await app.inject({ method: 'POST', url: `/api/public/bookings/${body.bookingId ?? body.booking.bookingId}/otp/verify`, headers: auth(body), payload: { code: otp } })
  if (v.statusCode !== 200) throw new Error(`verify failed: ${v.body}`)
  return { ...body, booking: json(v).booking }
}

let refN = 400000000000
export const nextRef = () => String(++refN)

export async function pendingBooking(app, capture, over = {}) {
  const b = await verifiedBooking(app, capture, over)
  const res = await app.inject({ method: 'POST', url: `/api/public/bookings/${b.booking.bookingId}/payment`, headers: auth(b), payload: { reference: nextRef() } })
  if (res.statusCode !== 200) throw new Error(`payment submit failed: ${res.body}`)
  return { ...b, booking: json(res) }
}

export async function adminSession(ctx, app, role = 'owner') {
  const email = `${role}.${Math.random().toString(36).slice(2, 7)}@feral.test`
  await ctx.db.query(`INSERT INTO admins (email, name, password_hash, role) VALUES ($1, $2, $3, $4)`, [email, `${role} admin`, await hashPassword('correct horse battery'), role])
  const res = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { email, password: 'correct horse battery' } })
  const cookie = res.cookies.find((c) => c.name === 'feral_admin')
  const { csrfToken } = json(res)
  const req = (method, url, payload) =>
    app.inject({ method, url: `/api/admin${url}`, payload, headers: { cookie: `feral_admin=${cookie.value}`, 'x-csrf-token': csrfToken } })
  return { req, cookie: cookie.value, csrfToken, email }
}

export async function drain(ctx) {
  let n = 0
  for (let i = 0; i < 20; i++) {
    const k = await processOnce(ctx)
    n += k
    if (!k) break
  }
  return n
}
