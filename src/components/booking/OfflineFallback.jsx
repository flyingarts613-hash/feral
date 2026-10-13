import { EVENT } from '../../data/event'
import { PASSES, PAYMENT, rupees } from '../../data/passes'
import { Notice } from './ui'

// Shown only when the booking server can't be reached (e.g. the site is
// deployed as static files before the server is live). It keeps the previous
// way to book working: the registration form, then a WhatsApp DM for payment.
export default function OfflineFallback() {
  return (
    <div className="grid gap-12 md:grid-cols-12 md:gap-8" data-offline-fallback>
      <div className="md:col-span-6">
        <h2 id="pass-title" className="display text-[22vw] leading-[0.86] md:text-[8vw]">
          GET YOUR
          <br />
          PASS<span className="text-blood">.</span>
        </h2>
        <p className="eyebrow mt-6 text-bone/50">
          {EVENT.date} / {EVENT.location}
        </p>
        <div className="mt-10 border-t border-bone/10">
          {PASSES.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-4 border-b border-bone/10 py-4">
              <span>
                <span className="display block text-2xl tracking-[0.02em] md:text-3xl">{p.name}</span>
                <span className="eyebrow mt-1 block text-[10px] text-bone/45">{p.note}</span>
              </span>
              <span className="display text-2xl md:text-3xl">{rupees(p.pricePaise)}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-bone/60">Contact coordinators for referral code.</p>
      </div>
      <div className="md:col-span-5 md:col-start-8 md:pt-4">
        <Notice tone="info">Online booking is being set up. Until then, book in two steps:</Notice>
        <p className="eyebrow mt-8 text-bone/50">
          <span className="text-blood">STEP 1</span>&nbsp;&nbsp;FILL REGISTRATION FORM
        </p>
        <a
          href={EVENT.googleFormUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="display group mt-4 flex w-full items-center justify-between bg-bone px-6 py-5 text-xl tracking-[0.03em] text-ink transition-colors duration-500 hover:bg-blood hover:text-bone md:px-7 md:text-2xl"
        >
          FILL REGISTRATION FORM <span className="transition-transform duration-500 group-hover:translate-x-1.5">→</span>
        </a>
        <p className="mt-3 text-sm leading-relaxed text-bone/50">For more than 1 person, enter all participant details in the form using comma separation.</p>
        <div className="mt-10 border-t border-bone/10 pt-8">
          <p className="eyebrow text-bone/50">
            <span className="text-blood">STEP 2</span>&nbsp;&nbsp;DM FOR PAYMENT
          </p>
          <a href={PAYMENT.whatsapp} target="_blank" rel="noopener noreferrer" className="display mt-3 inline-flex items-center gap-3 text-[11vw] leading-none hover:text-blood md:text-5xl">
            {PAYMENT.phone} <span className="text-[0.5em]">↗</span>
          </a>
          <p className="mt-3 text-sm leading-relaxed text-bone/50">After submitting the form, DM this number for payment and complete your booking.</p>
        </div>
      </div>
    </div>
  )
}
