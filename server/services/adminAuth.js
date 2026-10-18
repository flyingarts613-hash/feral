import { hashPassword, keyedHash, verifyPassword } from '../lib/security.js'
import { audit } from './audit.js'

export const ADMIN_COOKIE = 'feral_admin'
export const RANK = { viewer: 1, approver: 2, owner: 3 }
export const adminTokenHash = (ctx, t) => keyedHash(ctx.cfg.appSecret, `admin:${t}`)

// The signed-in admin for a request (from the HttpOnly session cookie), or null.
export async function adminFromRequest(ctx, req) {
  const token = req.cookies?.[ADMIN_COOKIE]
  if (!token) return null
  const s = await ctx.db.one(
    `SELECT s.id AS session_id, s.csrf_token, a.* FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND a.active`,
    [adminTokenHash(ctx, token)],
  )
  return s ? { id: s.id, email: s.email, name: s.name, role: s.role, sessionId: s.session_id, csrf: s.csrf_token } : null
}

// Creates / updates the primary admin from ADMIN_LOGIN_ID + ADMIN_PASSWORD_HASH
// (or ADMIN_PASSWORD) on every start. Only the scrypt hash reaches the
// database. A changed password or login ID signs the old sessions out; removing
// the variables disables the account. Admins created any other way are untouched.
export async function syncEnvAdmin(ctx) {
  const { loginId, passwordHash, password } = ctx.cfg.envAdmin
  // the plaintext (if any) is only needed for this function; drop it from the config
  ctx.cfg.envAdmin.password = ''
  return ctx.db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(82610263)') // two instances starting together
    const signOut = (ids) => ids.length && c.query('DELETE FROM admin_sessions WHERE admin_id = ANY($1)', [ids])
    // env-managed accounts that no longer match the configured login ID
    const stale = await c.many(`UPDATE admins SET active = false WHERE managed_by = 'env' AND active AND email <> $1 RETURNING id, email`, [loginId])
    await signOut(stale.map((a) => a.id))
    for (const a of stale) await audit(c, { actor: 'system', action: 'env_admin_disabled', details: { loginId: a.email } })
    if (!loginId) return { status: stale.length ? 'disabled' : 'none' }

    const cur = await c.one('SELECT * FROM admins WHERE email = $1', [loginId])
    let hash = passwordHash
    if (!hash) hash = cur && (await verifyPassword(password, cur.password_hash)) ? cur.password_hash : await hashPassword(password)
    if (!cur) {
      await c.query(`INSERT INTO admins (email, name, password_hash, role, managed_by) VALUES ($1, 'FERAL Admin', $2, 'owner', 'env')`, [loginId, hash])
      await audit(c, { actor: 'system', action: 'env_admin_created', details: { loginId } })
      return { status: 'created' }
    }
    const changed = cur.password_hash !== hash
    if (changed || cur.role !== 'owner' || !cur.active || cur.managed_by !== 'env') {
      await c.query(`UPDATE admins SET password_hash = $2, role = 'owner', active = true, managed_by = 'env' WHERE id = $1`, [cur.id, hash])
      if (changed) await signOut([cur.id])
      await audit(c, { actor: 'system', action: 'env_admin_updated', details: { loginId, passwordChanged: changed } })
      return { status: 'updated', passwordChanged: changed }
    }
    return { status: 'unchanged' }
  })
}
