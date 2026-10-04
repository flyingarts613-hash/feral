import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { EVENT, isSet } from '../data/event'
import { MAX_PEOPLE, PASSES, PAYMENT, ROUND, inr, unitPrice } from '../data/passes'

const EASE = [0.76, 0, 0.24, 1]

export default function PassModal({ onClose }) {
  const closeRef = useRef(null)
  const [passId, setPassId] = useState(PASSES[0].id)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    const prev = document.activeElement
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.({ preventScroll: true })
    }
  }, [onClose])

  const pass = PASSES.find((p) => p.id === passId)
  const fixed = !!pass.fixed
  const count = fixed ? 1 : qty
  const each = unitPrice(pass, count)
  const total = each * count
  const saved = (pass.price - each) * count

  // Switching pass keeps the head-count, lifted to the pass's minimum.
  const choose = (p) => {
    setPassId(p.id)
    setQty((q) => Math.min(MAX_PEOPLE, Math.max(p.min, q)))
  }
  const step = (d) => setQty((q) => Math.min(MAX_PEOPLE, Math.max(pass.min, q + d)))

  const meta = [EVENT.date, isSet(EVENT.venue) ? EVENT.location : EVENT.area]

  return (
    <m.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pass-title"
      data-lenis-prevent
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-ink"
      initial={{ clipPath: 'inset(100% 0% 0% 0%)' }}
      animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      exit={{ clipPath: 'inset(0% 0% 100% 0%)' }}
      transition={{ duration: 0.9, ease: EASE }}
    >
      <div className="gutter sticky top-0 z-10 flex h-16 items-center justify-between bg-ink md:h-20">
        <span className="display text-[22px] md:text-2xl">FERAL</span>
        <button ref={closeRef} onClick={onClose} className="eyebrow -mr-3 p-3" aria-label="Close">
          CLOSE ✕
        </button>
      </div>

      <m.div
        className="gutter mx-auto grid max-w-[1400px] gap-14 pb-[max(3rem,env(safe-area-inset-bottom))] pt-6 md:grid-cols-12 md:gap-8 md:pb-24 md:pt-[8vh]"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Left — title + pass type */}
        <div className="md:col-span-6">
          <h2 id="pass-title" className="display text-[24vw] leading-[0.86] md:text-[9vw]">
            GET YOUR
            <br />
            PASS<span className="text-blood">.</span>
          </h2>
          <p className="eyebrow mt-6 text-bone/50">{meta.join('  /  ')}</p>

          <p id="pass-type" className="eyebrow mt-12 flex items-center justify-between gap-4 text-bone/50 md:mt-16">
            <span>
              <span className="text-blood">01</span>&nbsp;&nbsp;SELECT PASS TYPE
            </span>
            <span className="text-blood" data-round>
              ● {ROUND} PRICING
            </span>
          </p>
          <div role="radiogroup" aria-labelledby="pass-type" className="mt-4 border-t border-bone/10">
            {PASSES.map((p) => {
              const on = p.id === passId
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => choose(p)}
                  data-pass={p.id}
                  className={`group flex w-full items-center justify-between gap-4 border-b border-bone/10 py-4 text-left transition-colors duration-300 md:py-5 ${on ? 'text-bone' : 'text-bone/45 hover:text-bone/80'}`}
                >
                  <span className="flex items-center gap-4">
                    <span className={`h-2 w-2 shrink-0 transition-colors duration-300 ${on ? 'bg-blood' : 'bg-bone/15'}`} aria-hidden="true" />
                    <span>
                      <span className="display block text-2xl tracking-[0.02em] md:text-3xl">{p.name}</span>
                      <span className="eyebrow mt-1 block text-[10px] text-bone/45">
                        {p.note}
                      </span>
                    </span>
                  </span>
                  <span className="display shrink-0 text-2xl md:text-3xl">{inr(p.price)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right — quantity, total, then form → DM */}
        <div className="md:col-span-5 md:col-start-8 md:pt-4">
          <p className="eyebrow text-bone/50">
            <span className="text-blood">02</span>&nbsp;&nbsp;{fixed ? 'YOUR PASS' : 'HOW MANY PEOPLE?'}
          </p>
          {fixed ? (
            <p className="display mt-4 flex h-14 items-center text-3xl tracking-[0.02em]">1 COUPLE · 2 PEOPLE</p>
          ) : (
            <div className="mt-4 flex items-center gap-5">
              <div className="flex items-center border border-bone/20">
                <button onClick={() => step(-1)} disabled={qty <= pass.min} aria-label="One less person" className="grid h-14 w-14 place-items-center text-2xl transition-colors hover:bg-bone/10 disabled:opacity-25 disabled:hover:bg-transparent">
                  −
                </button>
                <span className="display w-16 text-center text-3xl tabular-nums" aria-live="polite" aria-label={`${qty} people`} data-qty>
                  {qty}
                </span>
                <button onClick={() => step(1)} disabled={qty >= MAX_PEOPLE} aria-label="One more person" className="grid h-14 w-14 place-items-center text-2xl transition-colors hover:bg-bone/10 disabled:opacity-25 disabled:hover:bg-transparent">
                  +
                </button>
              </div>
              <span className="eyebrow text-bone/45">{qty === 1 ? 'PERSON' : 'PEOPLE'}</span>
            </div>
          )}

          {/* live price */}
          <div className="mt-8 border-y border-bone/10 py-6">
            <div className="flex items-baseline justify-between gap-4">
              <p className="eyebrow text-bone/50">{fixed ? 'PER COUPLE' : 'PER PERSON'}</p>
              <p className="display text-2xl" data-each>
                {saved > 0 && <s className="mr-3 text-bone/35">{inr(pass.price)}</s>}
                {inr(each)}
              </p>
            </div>
            <AnimatePresence initial={false} mode="wait">
              {saved > 0 ? (
                <m.p key="on" className="eyebrow mt-3 text-blood" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-discount>
                  GROUP RATE APPLIED · YOU SAVE {inr(saved)}
                </m.p>
              ) : (
                pass.group && (
                  <m.p key="hint" className="eyebrow mt-3 text-bone/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-hint>
                    ADD {pass.group.from - qty} MORE FOR {inr(pass.group.price)} EACH
                  </m.p>
                )
              )}
            </AnimatePresence>
            <div className="mt-6 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-bone/50">TOTAL</p>
                {count > 1 && (
                  <p className="eyebrow mt-1.5 text-bone/40">
                    {count} × {inr(each)}
                  </p>
                )}
              </div>
              <p className="display text-6xl leading-none md:text-7xl" aria-live="polite" data-total>
                {inr(total)}
              </p>
            </div>
          </div>

          {/* step 1 — form */}
          <div className="mt-10">
            <p className="eyebrow text-bone/50">
              <span className="text-blood">STEP 1</span>&nbsp;&nbsp;FILL REGISTRATION FORM
            </p>
            <a
              href={EVENT.googleFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-register
              className="display group mt-4 flex w-full items-center justify-between bg-bone px-6 py-5 text-xl tracking-[0.03em] text-ink transition-colors duration-500 hover:bg-blood hover:text-bone md:px-7 md:text-2xl"
            >
              FILL REGISTRATION FORM
              <span className="transition-transform duration-500 group-hover:translate-x-1.5">→</span>
            </a>
            <p className="mt-3 text-sm leading-relaxed text-bone/50">For more than 1 person, enter all participant details in the form using comma separation.</p>
          </div>

          {/* step 2 — DM for payment */}
          <div className="mt-10 border-t border-bone/10 pt-8">
            <p className="eyebrow text-bone/50">
              <span className="text-blood">STEP 2</span>&nbsp;&nbsp;DM FOR PAYMENT
            </p>
            <a href={PAYMENT.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`DM ${PAYMENT.phone} on WhatsApp`} data-phone className="display group mt-3 inline-flex items-center gap-3 text-[11vw] leading-none tracking-[0.01em] transition-colors duration-500 hover:text-blood md:text-5xl">
              {PAYMENT.phone}
              <span className="text-[0.5em] transition-transform duration-500 group-hover:translate-x-1">↗</span>
            </a>
            <p className="mt-3 text-sm leading-relaxed text-bone/50">After submitting the form, DM this number for payment and complete your booking.</p>
            <p className="eyebrow mt-5 text-bone/35">
              YOUR PASS: {pass.name}
              {!fixed && ` × ${count}`} · {inr(total)}
            </p>
          </div>
        </div>
      </m.div>
    </m.div>
  )
}
