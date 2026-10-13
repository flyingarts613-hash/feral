// Admin API client. Session lives in an HttpOnly cookie; state-changing calls
// carry the CSRF token the server issued at sign-in.
let csrf = null
export const setCsrf = (t) => (csrf = t)

export class AdminError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed (${status})`)
    this.status = status
    this.code = body?.error
    this.fields = body?.fields
  }
}

export async function call(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' && csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('json') ? await res.json().catch(() => null) : null
  if (!res.ok) throw new AdminError(res.status, data)
  return data
}

export const rupees = (paise) => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN')
export const when = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
export const CATEGORY = { male: 'MALE / STAG', female: 'GIRLS', couple: 'COUPLE' }
