import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { Button, Notice, PriceSummary } from './ui'

export default function OtpStep({ session, booking, onVerified, onStartOver }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { tone, text }
  const [wait, setWait] = useState(booking.otp?.resendInSeconds ?? 0)
  const input = useRef(null)

  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const verify = async (e) => {
    e?.preventDefault()
    if (!/^\d{6}$/.test(code)) return setMsg({ tone: 'error', text: 'Enter the 6-digit code from the email.' })
    setBusy(true)
    setMsg(null)
    try {
      const r = await api(`/api/public/bookings/${session.code}/otp/verify`, { method: 'POST', token: session.token, body: { code } })
      setMsg({ tone: 'ok', text: 'Email verified.' })
      onVerified(r.booking, r.priceChanged)
    } catch (err) {
      const text =
        err.code === 'otp_incorrect'
          ? `That code is incorrect. ${err.attemptsLeft} ${err.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`
          : err.code === 'otp_expired'
            ? 'This code has expired. Request a new one.'
            : err.code === 'otp_locked'
              ? 'Too many incorrect attempts. Request a new code.'
              : err.message
      setMsg({ tone: 'error', text })
      setCode('')
      input.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setMsg(null)
    try {
      const r = await api(`/api/public/bookings/${session.code}/otp/resend`, { method: 'POST', token: session.token })
      setWait(r.otp.resendInSeconds)
      setMsg({ tone: 'info', text: `A new code is on its way to ${booking.email}. Earlier codes no longer work.` })
    } catch (err) {
      if (err.retryAfter) setWait(err.retryAfter)
      setMsg({ tone: 'error', text: err.message })
    }
  }

  return (
    <div className="grid gap-10 md:grid-cols-12 md:gap-8">
      <form onSubmit={verify} className="md:col-span-7" data-otp-form>
        <h3 className="display text-4xl leading-none md:text-6xl">VERIFY YOUR EMAIL</h3>
        <p className="mt-4 text-bone/70">
          We sent a 6-digit code to <span className="text-bone">{booking.email}</span>. It expires in 5 minutes. Check spam if you can't see it.
        </p>
        <label htmlFor="otp" className="eyebrow mt-10 block text-bone/55">
          VERIFICATION CODE
        </label>
        <input
          ref={input}
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="mt-3 w-full max-w-[22rem] border border-dusk/70 bg-dusk/10 px-5 py-4 text-center font-mono text-3xl tracking-[0.6em] text-bone outline-none focus:border-bone"
          aria-describedby="otp-help"
        />
        <div className="mt-5 max-w-[22rem]">{msg && <Notice tone={msg.tone}>{msg.text}</Notice>}</div>
        <Button type="submit" busy={busy} className="mt-6 w-full max-w-[22rem]" data-verify>
          VERIFY EMAIL <span>→</span>
        </Button>
        <div id="otp-help" className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <button type="button" onClick={resend} disabled={wait > 0} className="eyebrow link-line text-bone/70 disabled:text-bone/30" data-resend>
            {wait > 0 ? `RESEND CODE IN ${wait}S` : 'RESEND CODE'}
          </button>
          <button type="button" onClick={onStartOver} className="eyebrow link-line text-bone/50">
            WRONG EMAIL? START AGAIN
          </button>
        </div>
        <p className="mt-8 max-w-[28rem] text-xs leading-relaxed text-bone/40">
          This code only verifies your email address. FERAL will never ask for your UPI PIN, bank password or any OTP from your bank.
        </p>
      </form>
      <aside className="md:col-span-4 md:col-start-9">
        <PriceSummary label={booking.categoryLabel} originalPaise={booking.originalPaise} discountPaise={booking.discountPaise} finalPaise={booking.finalPaise} code={booking.referralCode} status={`Booking ${booking.bookingId}`} />
      </aside>
    </div>
  )
}
