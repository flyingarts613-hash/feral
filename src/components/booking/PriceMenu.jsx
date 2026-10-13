import { PASSES, PAYMENT, rupees } from '../../data/passes'
import { Button } from './ui'

// Step 0: the price menu and BUY PASS.
export default function PriceMenu({ config, category, setCategory, onBuy, resumable, onResume }) {
  const price = (id) => config?.pricing?.[id] ?? PASSES.find((p) => p.id === id).pricePaise
  const off = config?.pricing?.referralDiscount ?? 40000
  const contact = config?.event?.coordinatorContact || PAYMENT.phone

  return (
    <div className="grid gap-12 md:grid-cols-12 md:gap-8">
      <div className="md:col-span-6">
        <p className="eyebrow mb-6 flex items-center gap-4 text-bone/50">
          <span className="h-px w-8 bg-blood" />
          {config?.event ? `${config.event.dateLabel} · ${config.event.timeLabel}` : 'HALLOWEEN 2026'}
        </p>
        <h2 id="pass-title" className="display text-[22vw] leading-[0.86] md:text-[8vw]">
          GET YOUR
          <br />
          PASS<span className="text-blood">.</span>
        </h2>
        <p className="eyebrow mt-6 text-bone/50">{config?.event?.venue ?? 'Chhatarpur Farms, South Delhi'}</p>

        {resumable && (
          <div className="mt-10 border border-dusk/60 bg-dusk/10 p-4">
            <p className="eyebrow text-bone/60">BOOKING IN PROGRESS</p>
            <p className="mt-2 text-sm text-bone/80">
              {resumable.booking.bookingId} · {resumable.booking.categoryLabel} · {rupees(resumable.booking.finalPaise)}
            </p>
            <button onClick={onResume} className="eyebrow link-line mt-3 text-bone" data-resume>
              CONTINUE THIS BOOKING →
            </button>
          </div>
        )}
      </div>

      <div className="md:col-span-5 md:col-start-8 md:pt-4">
        <p id="pass-type" className="eyebrow text-bone/50">
          <span className="text-blood">01</span>&nbsp;&nbsp;CHOOSE YOUR PASS
        </p>
        <div role="radiogroup" aria-labelledby="pass-type" className="mt-4 border-t border-bone/10">
          {PASSES.map((p) => {
            const on = p.id === category
            const original = price(p.id)
            return (
              <button
                key={p.id}
                role="radio"
                aria-checked={on}
                onClick={() => setCategory(p.id)}
                data-pass={p.id}
                className={`flex w-full items-center justify-between gap-4 border-b border-bone/10 py-4 text-left transition-colors duration-300 md:py-5 ${on ? 'text-bone' : 'text-bone/45 hover:text-bone/80'}`}
              >
                <span className="flex items-center gap-4">
                  <span className={`h-2 w-2 shrink-0 transition-colors ${on ? 'bg-blood' : 'bg-bone/15'}`} aria-hidden="true" />
                  <span>
                    <span className="display block text-2xl tracking-[0.02em] md:text-3xl">{p.name}</span>
                    <span className="eyebrow mt-1 block text-[10px] text-bone/45">
                      {p.note} · WITH A REFERRAL CODE {rupees(Math.max(0, original - off))}
                    </span>
                  </span>
                </span>
                <span className="display shrink-0 text-2xl md:text-3xl">{rupees(original)}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-6 space-y-2 text-sm text-bone/60">
          <p>
            Referral codes take {rupees(off)} off the original price. Some coordinator codes give a bigger discount — the final price is worked out when you enter
            your code.
          </p>
          <p className="text-bone" data-referral-note>
            Contact coordinators for referral code.{' '}
            <a href={PAYMENT.whatsapp} target="_blank" rel="noopener noreferrer" className="link-line text-bone/70">
              {contact} ↗
            </a>
          </p>
        </div>

        <Button className="mt-8 w-full" onClick={onBuy} data-buy>
          BUY PASS <span>→</span>
        </Button>
      </div>
    </div>
  )
}
