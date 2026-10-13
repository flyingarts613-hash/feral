import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)

// URL-safe random bearer token (customer links, pass QR, sessions).
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')

// Keyed hash for anything we look up by value but never store in clear text
// (OTPs, access tokens, pass QR tokens, session tokens).
export const keyedHash = (secret, value) => crypto.createHmac('sha256', secret).update(String(value)).digest('hex')

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// 6-digit OTP from a CSPRNG (uniform, no modulo bias).
export const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

// Unambiguous alphabet (no 0/O, 1/I/L).
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const randomCode = (len) => Array.from({ length: len }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('')

export const newBookingCode = () => `FRL-${randomCode(6)}`
// Pass IDs: FERAL-2026-XXXXXX (31^6 ≈ 887 million combinations; uniqueness is
// enforced by the database and a collision is retried with a new code).
export const PASS_CODE_RE = /^FERAL-2026-[A-HJKMNP-Z2-9]{6}$/
export const newPassCode = () => `FERAL-2026-${randomCode(6)}`

// Admin passwords: scrypt, N=2^15.
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, key] = String(stored).split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(key, 'base64')
  const got = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 })
  return crypto.timingSafeEqual(expected, got)
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

// AES-256-GCM for the few values we must be able to read back (pass QR tokens).
const encKey = (secret) => crypto.createHash('sha256').update(`feral-enc:${secret}`).digest()
export function encrypt(secret, plain) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', encKey(secret), iv)
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
}
export function decrypt(secret, box) {
  const [iv, tag, data] = String(box).split('.').map((s) => Buffer.from(s, 'base64url'))
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(secret), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(data), d.final()]).toString('utf8')
}
