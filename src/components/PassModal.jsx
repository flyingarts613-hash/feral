import { useEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { EVENT, isSet } from '../data/event'
import { PASS_STEPS } from '../data/content'
import { asset } from '../lib/image'

const EASE = [0.76, 0, 0.24, 1]

export default function PassModal({ onClose }) {
  const closeRef = useRef(null)
  const [copied, setCopied] = useState(false)

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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EVENT.upiId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — the ID is visible and selectable anyway */
    }
  }

  const upiLink = isSet(EVENT.upiId)
    ? `upi://pay?${new URLSearchParams({
        pa: EVENT.upiId,
        pn: EVENT.upiName,
        cu: 'INR',
        tn: `${EVENT.name} PASS`,
        ...(isSet(EVENT.price) && { am: EVENT.price }),
      })}`
    : null

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
        className="gutter mx-auto grid max-w-[1400px] gap-16 pb-[max(3rem,env(safe-area-inset-bottom))] pt-6 md:grid-cols-12 md:gap-8 md:pb-24 md:pt-[8vh]"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Left — title + steps */}
        <div className="md:col-span-6">
          <h2 id="pass-title" className="display text-[24vw] leading-[0.86] md:text-[9vw]">
            GET YOUR
            <br />
            PASS<span className="text-blood">.</span>
          </h2>
          <p className="eyebrow mt-6 text-bone/50">{meta.join('  /  ')}</p>

          <ol className="mt-14 border-t border-bone/10 md:mt-20">
            {PASS_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-6 border-b border-bone/10 py-6 md:gap-10">
                <span className="eyebrow pt-1.5 text-blood">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <p className="display text-2xl tracking-[0.02em] md:text-3xl">{s.title}</p>
                  <p className="mt-1.5 text-sm text-bone/50">{s.note}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Right — payment + register */}
        <div className="md:col-span-5 md:col-start-8 md:pt-4">
          <div className="flex flex-col items-start gap-8">
            <div className="flex w-full items-end justify-between">
              <p className="eyebrow text-bone/50">SCAN TO PAY</p>
              {isSet(EVENT.price) && <p className="display text-4xl">₹{EVENT.price}</p>}
            </div>

            <div className="w-full max-w-[340px] bg-bone p-3">
              <img src={asset(EVENT.qrCode)} alt={`UPI QR code for ${EVENT.upiId}`} className="aspect-square w-full" />
            </div>

            <div className="w-full">
              <p className="eyebrow text-bone/50">UPI ID</p>
              <div className="mt-3 flex items-center justify-between gap-4 border-b border-bone/20 pb-3">
                <span className="select-all break-all font-medium tracking-wide">{EVENT.upiId}</span>
                <button onClick={copy} className="eyebrow shrink-0 text-bone/60 transition-colors hover:text-bone">
                  {copied ? 'COPIED' : 'COPY'}
                </button>
              </div>
              {upiLink && (
                <a href={upiLink} className="eyebrow link-line mt-4 inline-block text-bone/60 md:hidden">
                  PAY IN UPI APP →
                </a>
              )}
            </div>

            <a
              href={EVENT.googleFormUrl}
              target="_blank"
              rel="noreferrer"
              className="display group mt-4 flex w-full items-center justify-between bg-bone px-7 py-5 text-2xl tracking-[0.03em] text-ink transition-colors duration-500 hover:bg-blood hover:text-bone md:text-3xl"
            >
              REGISTER
              <span className="transition-transform duration-500 group-hover:translate-x-1.5">→</span>
            </a>
            <p className="text-xs leading-relaxed text-bone/40">Opens the registration form. Keep your payment screenshot ready.</p>
          </div>
        </div>
      </m.div>
    </m.div>
  )
}
