import { keyedHash } from '../lib/security.js'

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
