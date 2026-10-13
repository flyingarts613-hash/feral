import { useEffect, useState } from 'react'
import { apiUrl } from '../../lib/api'
import { PAYMENT, rupees } from '../../data/passes'
import { Button, Notice, PriceSummary } from './ui'

// Confirmation: what has actually happened so far — never ahead of the server.
export default function StatusStep({ config, session, booking, refresh }) {
  const [dlError, setDlError] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const waiting = ['PAYMENT_PENDING_VERIFICATION', 'PAID'].includes(booking.status)

  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => refresh().catch(() => {}), booking.status === 'PAID' ? 5000 : 15000)
    return () => clearInterval(t)
  }, [waiting, booking.status, refresh])

  const download = async (ext) => {
    setDlError(null)
    setDownloading(ext)
    try {
      const res = await fetch(apiUrl(`/api/public/bookings/${session.code}/pass.${ext}`), { headers: { 'X-Booking-Token': session.token } })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Download failed.')
      const url = URL.createObjectURL(await res.blob())
      const a = Object.assign(document.createElement('a'), { href: url, download: `FERAL-2026-Pass-${booking.pass?.passId || booking.bookingId}.${ext}` })
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) {
      setDlError(e.message)
    } finally {
      setDownloading(false)
    }
  }

  const view = {
    PAYMENT_PENDING_VERIFICATION: {
      title: 'PAYMENT SUBMITTED',
      tone: 'info',
      head: 'Awaiting organizer approval',
      body: `We've received your payment details${booking.payment?.reference ? ` (reference ${booking.payment.reference})` : ''}. The organisers check every payment against their records. Your pass is emailed to ${booking.email} as soon as it's confirmed — you can close this page.`,
    },
    PAID: {
      title: 'PAYMENT APPROVED',
      tone: 'ok',
      head: 'Generating your pass',
      body: 'Your payment is confirmed. Your pass and receipt are being prepared and emailed to you.',
    },
    PASS_ISSUED: {
      title: 'YOU’RE IN.',
      tone: 'ok',
      head: 'Pass issued',
      body: `Your pass${booking.pass?.passId ? ` (${booking.pass.passId})` : ''} and receipt have been emailed to ${booking.email}. Show your pass at the entrance.`,
    },
  }[booking.status]

  return (
    <div className="grid gap-10 md:grid-cols-12 md:gap-8" data-status-step={booking.status}>
      <div className="md:col-span-7">
        <h3 className="display text-5xl leading-none md:text-7xl">{view?.title}</h3>
        <div className="mt-8">
          <Notice tone={view?.tone} title={view?.head?.toUpperCase()}>
            {view?.body}
          </Notice>
        </div>
        {waiting && (
          <p className="eyebrow mt-6 flex items-center gap-3 text-bone/45">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blood" /> THIS PAGE UPDATES AUTOMATICALLY
          </p>
        )}
        {booking.status === 'PASS_ISSUED' && (
          <>
            <Button className="mt-8 w-full max-w-[26rem]" onClick={() => download('pdf')} busy={downloading === 'pdf'} disabled={Boolean(downloading)} data-download>
              DOWNLOAD MY PASS (PDF) <span>↓</span>
            </Button>
            <Button variant="outline" className="mt-3 w-full max-w-[26rem]" onClick={() => download('png')} busy={downloading === 'png'} disabled={Boolean(downloading)} data-download-png>
              SAVE AS IMAGE (PNG) <span>↓</span>
            </Button>
            {dlError && <div className="mt-4 max-w-[26rem]"><Notice tone="error">{dlError}</Notice></div>}
          </>
        )}
        <dl className="mt-10 grid max-w-[30rem] grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="eyebrow text-[10px] text-bone/45">BOOKING ID</dt>
            <dd className="mt-1">{booking.bookingId}</dd>
          </div>
          <div>
            <dt className="eyebrow text-[10px] text-bone/45">EVENT</dt>
            <dd className="mt-1">{config?.event ? `${config.event.dateLabel} · ${config.event.timeLabel}` : '26 October 2026'}</dd>
          </div>
        </dl>
        <p className="mt-8 text-sm text-bone/50">
          Questions? Contact the coordinators on{' '}
          <a className="link-line text-bone/70" href={PAYMENT.whatsapp} target="_blank" rel="noopener noreferrer">
            {config?.event?.coordinatorContact || PAYMENT.phone}
          </a>
          .
        </p>
      </div>
      <aside className="md:col-span-4 md:col-start-9">
        <PriceSummary
          label={booking.categoryLabel}
          originalPaise={booking.originalPaise}
          discountPaise={booking.discountPaise}
          finalPaise={booking.finalPaise}
          code={booking.referralCode}
          status={booking.status === 'PAYMENT_PENDING_VERIFICATION' ? `${rupees(booking.finalPaise)} — awaiting verification` : 'Paid'}
        />
      </aside>
    </div>
  )
}
