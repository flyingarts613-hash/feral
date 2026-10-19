import fs from 'node:fs/promises'
import { createDb } from './db.js'
import { migrate } from './migrate.js'
import { createEmailProvider } from './providers/email.js'
import { createNotifyProvider } from './providers/notify.js'
import { createRazorpay } from './providers/razorpay.js'
import { getSettings, setSetting } from './services/settings.js'
import { sha256 } from './lib/security.js'
import { syncEnvAdmin } from './services/adminAuth.js'

// Wires config, database and providers into one context object shared by
// routes, services and the worker. Tests pass a `capture` to use the in-memory
// test providers (allowed only under NODE_ENV=test).
export async function createContext(cfg, { capture, log = console, razorpayFetch } = {}) {
  const db = createDb(cfg, log)
  await migrate(db, log)
  const ctx = {
    cfg,
    db,
    log,
    email: createEmailProvider(cfg, { capture }),
    notify: createNotifyProvider(cfg, { capture }),
    razorpay: createRazorpay(cfg, razorpayFetch ? { fetchImpl: razorpayFetch } : {}),
  }
  await bootstrapQr(ctx)
  const envAdmin = await syncEnvAdmin(ctx)
  // always reported (no values), so the deploy log shows whether the login exists
  log.info?.(`primary admin from environment: ${envAdmin.status === 'none' ? 'not configured (ADMIN_LOGIN_ID is not set)' : envAdmin.status}`)
  return ctx
}

// PAYMENT_QR_PATH seeds the payment QR once; after that, uploads in the admin replace it.
async function bootstrapQr(ctx) {
  const p = ctx.cfg.payment.qrPath
  if (!p) return
  const s = await getSettings(ctx.db)
  const buf = await fs.readFile(p).catch(() => null)
  if (!buf) {
    ctx.log.warn?.(`PAYMENT_QR_PATH ${p} not found`)
    return
  }
  const hash = sha256(buf)
  if (s.paymentQrFileId) {
    const cur = await ctx.db.one('SELECT sha256 FROM files WHERE id = $1', [s.paymentQrFileId])
    if (cur) return
  }
  const mime = buf[0] === 0x89 ? 'image/png' : buf[0] === 0xff ? 'image/jpeg' : 'image/webp'
  const f = await ctx.db.one(`INSERT INTO files (kind, mime, bytes, size, sha256) VALUES ('payment_qr', $1, $2, $3, $4) RETURNING id`, [mime, buf, buf.length, hash])
  await setSetting(ctx.db, 'paymentQrFileId', f.id, 'PAYMENT_QR_PATH')
}
