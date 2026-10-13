import crypto from 'node:crypto'
import { safeEqual } from '../lib/security.js'

// Razorpay (payment mode B). Orders are created server-side for the amount
// stored on the booking; checkout results and webhooks are accepted only with a
// valid HMAC signature, and approvals are reconciled against the payment record
// fetched from Razorpay's API.

export function createRazorpay(cfg, { fetchImpl = fetch } = {}) {
  const r = cfg.payment.razorpay
  const configured = Boolean(r.keyId && r.keySecret)
  const auth = 'Basic ' + Buffer.from(`${r.keyId}:${r.keySecret}`).toString('base64')
  const call = async (method, path, body) => {
    if (!configured) throw Object.assign(new Error('Razorpay is not configured'), { statusCode: 503 })
    const res = await fetchImpl(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(`Razorpay ${res.status}: ${out.error?.description || 'request failed'}`), { statusCode: 502 })
    return out
  }
  const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex')

  return {
    configured,
    keyId: r.keyId,
    createOrder: ({ amountPaise, receipt, notes }) => call('POST', '/orders', { amount: amountPaise, currency: 'INR', receipt, notes }),
    fetchPayment: (paymentId) => call('GET', `/payments/${encodeURIComponent(paymentId)}`),
    verifyCheckoutSignature: ({ orderId, paymentId, signature }) =>
      configured && Boolean(signature) && safeEqual(hmac(r.keySecret, `${orderId}|${paymentId}`), signature),
    verifyWebhook: (rawBody, signature) => Boolean(r.webhookSecret && signature) && safeEqual(hmac(r.webhookSecret, rawBody), signature),
  }
}
