import { useState } from 'react'
import { api, apiUrl } from '../../lib/api'
import { PAYMENT, rupees } from '../../data/passes'
import { Button, Field, Notice, PriceSummary, STATUS_LABEL, inputClass } from './ui'

const loadRazorpay = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay)
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(window.Razorpay)
    s.onerror = () => reject(new Error('Could not load the payment window.'))
    document.head.appendChild(s)
  })

export default function PaymentStep({ config, session, booking, onSubmitted, priceChanged }) {
  const [reference, setReference] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)
  const rejected = booking.status === 'PAYMENT_REJECTED'
  const gateway = config?.paymentMode === 'razorpay'

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setFieldError(null)
    const ref = reference.replace(/[\s-]/g, '')
    if (!/^[A-Za-z0-9]{6,35}$/.test(ref)) return setFieldError('Enter the UPI transaction / reference ID from your payment app (letters and numbers only).')
    if (file && file.size > 5 * 1024 * 1024) return setError('Screenshot must be under 5 MB.')
    setBusy(true)
    try {
      const form = new FormData()
      form.append('reference', ref)
      if (file) form.append('screenshot', file)
      const b = await api(`/api/public/bookings/${session.code}/payment`, { method: 'POST', token: session.token, form })
      onSubmitted(b)
    } catch (err) {
      if (err.field === 'reference') setFieldError(err.message)
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const payOnline = async () => {
    setError(null)
    setBusy(true)
    try {
      const order = await api(`/api/public/bookings/${session.code}/razorpay/order`, { method: 'POST', token: session.token })
      const Razorpay = await loadRazorpay()
      const rz = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'FERAL',
        description: `${booking.categoryLabel} pass · ${booking.bookingId}`,
        prefill: order.prefill,
        theme: { color: '#9e0f18' },
        handler: async (r) => {
          try {
            const b = await api(`/api/public/bookings/${session.code}/razorpay/verify`, {
              method: 'POST',
              token: session.token,
              body: { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature },
            })
            onSubmitted(b)
          } catch (err) {
            setError(err.message)
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      rz.open()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-10 md:grid-cols-12 md:gap-8" data-payment-step>
      <div className="md:col-span-7">
        <h3 className="display text-4xl leading-none md:text-6xl">PAYMENT</h3>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          {[
            ['BOOKING ID', booking.bookingId],
            ['NAME', booking.holderName],
            ['PASS', booking.categoryLabel],
            ['STATUS', STATUS_LABEL[booking.status]],
          ].map(([k, val]) => (
            <div key={k}>
              <dt className="eyebrow text-[10px] text-bone/45">{k}</dt>
              <dd className="mt-1 break-words text-bone" data-field={k}>
                {val}
              </dd>
            </div>
          ))}
        </dl>

        {priceChanged && (
          <div className="mt-6">
            <Notice tone="warn">Your referral code is no longer available, so the price has been updated. The amount below is what you pay.</Notice>
          </div>
        )}
        {rejected && (
          <div className="mt-6">
            <Notice tone="error" title="PAYMENT NEEDS ATTENTION">
              We couldn't confirm the payment you submitted{booking.payment?.rejectionReason ? `: ${booking.payment.rejectionReason}` : '.'} Check the transaction ID and submit it again, or contact the coordinators.
            </Notice>
          </div>
        )}

        {gateway ? (
          <div className="mt-10">
            <p className="text-bone/70">Pay securely online. Your payment is confirmed by the gateway, then reviewed by the organisers before your pass is issued.</p>
            {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}
            <Button className="mt-6 w-full" busy={busy} onClick={payOnline} disabled={!config?.razorpayKeyId}>
              PAY {rupees(booking.finalPaise)} <span>→</span>
            </Button>
            {!config?.razorpayKeyId && <p className="mt-3 text-sm text-alarm">Online payments aren't configured yet. Contact the coordinators.</p>}
          </div>
        ) : (
          <>
            <div className="mt-10 grid items-start gap-6 sm:grid-cols-[minmax(0,15rem)_1fr]">
              {config?.paymentQr ? (
                <img src={apiUrl(config.paymentQr)} alt="FERAL UPI payment QR code" className="w-full max-w-[15rem] bg-white p-3" data-payment-qr />
              ) : (
                <Notice tone="error" title="PAYMENT QR NOT AVAILABLE">
                  The payment QR hasn't been set up yet. Please contact the coordinators on{' '}
                  <a className="underline" href={PAYMENT.whatsapp} target="_blank" rel="noopener noreferrer">
                    {PAYMENT.phone}
                  </a>
                  .
                </Notice>
              )}
              <div>
                <p className="eyebrow text-bone/50">AMOUNT TO PAY</p>
                <p className="display mt-1 text-5xl leading-none" data-amount>{rupees(booking.finalPaise)}</p>
                {config?.upi && (
                  <p className="mt-4 text-sm text-bone/70">
                    UPI ID: <span className="select-all text-bone">{config.upi.vpa}</span>
                  </p>
                )}
                <p className="mt-4 text-sm leading-relaxed text-bone/75" data-instruction>
                  Scan the QR code and pay the exact amount shown above. After completing your payment, submit your UPI transaction/reference ID below.
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-10 space-y-7" noValidate>
              <Field id="p-ref" label="UPI TRANSACTION / REFERENCE ID" error={fieldError} hint="Usually a 12-digit number (UTR) in your payment app's transaction details.">
                <input id="p-ref" autoComplete="off" spellCheck={false} value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass(fieldError)} aria-invalid={Boolean(fieldError)} maxLength={40} />
              </Field>
              <Field id="p-shot" label="PAYMENT SCREENSHOT (OPTIONAL)" hint="PNG, JPEG or WebP, up to 5 MB.">
                <input
                  id="p-shot"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-bone/70 file:mr-4 file:border file:border-bone/25 file:bg-transparent file:px-4 file:py-2 file:text-bone"
                />
              </Field>
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" busy={busy} className="w-full" disabled={!config?.paymentQr} data-submit-payment>
                SUBMIT PAYMENT DETAILS <span>→</span>
              </Button>
              <p className="text-xs leading-relaxed text-bone/40">
                Submitting a transaction ID doesn't confirm your pass — the organisers check it against their payment records first. Never share your UPI PIN with
                anyone.
              </p>
            </form>
          </>
        )}
      </div>
      <aside className="md:col-span-4 md:col-start-9">
        <div className="md:sticky md:top-24">
          <PriceSummary label={booking.categoryLabel} originalPaise={booking.originalPaise} discountPaise={booking.discountPaise} finalPaise={booking.finalPaise} code={booking.referralCode} status="Pay exactly this amount." />
        </div>
      </aside>
    </div>
  )
}
