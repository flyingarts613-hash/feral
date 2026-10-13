// Booking API client. Same origin by default; set VITE_API_URL when the site is
// hosted separately from the Node server.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || (status === 0 ? 'Network error' : `Request failed (${status})`))
    this.status = status
    this.code = body?.error
    this.fields = body?.fields
    this.field = body?.field
    this.attemptsLeft = body?.attemptsLeft
    this.retryAfter = body?.retryAfter
  }
}

export const apiUrl = (path) => `${BASE}${path}`

export async function api(path, { method = 'GET', body, token, headers = {}, form } = {}) {
  let res
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'X-Booking-Token': token } : {}),
        ...headers,
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new ApiError(0, { error: 'network', message: "Couldn't reach the booking server. Check your connection and try again." })
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json')
  const data = isJson ? await res.json().catch(() => null) : null
  if (!res.ok) throw new ApiError(res.status, data)
  // A static host answering /api/* with its own HTML page means no booking server.
  if (!isJson) throw new ApiError(0, { error: 'no_api', message: "Couldn't reach the booking server." })
  return data
}

export const uuid = () =>
  crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
