import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { useBooking } from './booking/useBooking'
import { Steps } from './booking/ui'
import PriceMenu from './booking/PriceMenu'
import DetailsForm from './booking/DetailsForm'
import OtpStep from './booking/OtpStep'
import PaymentStep from './booking/PaymentStep'
import StatusStep from './booking/StatusStep'
import OfflineFallback from './booking/OfflineFallback'

const EASE = [0.76, 0, 0.24, 1]

// The pass sheet: price menu → details → email OTP → payment → confirmation.
// Every price and status comes from the booking server.
export default function PassModal({ onClose }) {
  const closeRef = useRef(null)
  const scroller = useRef(null)
  const b = useBooking()
  const [category, setCategory] = useState('male')
  const [draft, setDraft] = useState(null) // keeps typed details if they go back
  const [priceChanged, setPriceChanged] = useState(false)

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

  // new step → back to the top of the sheet
  useEffect(() => scroller.current?.scrollTo({ top: 0 }), [b.stage])

  const onCreated = useCallback(
    (out, values) => {
      setDraft(values)
      b.start(out)
    },
    [b],
  )

  const unavailable = !b.loading && b.configError

  return (
    <m.div
      ref={scroller}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pass-title"
      data-lenis-prevent
      className="fixed inset-0 z-[70] overflow-y-auto overflow-x-hidden overscroll-contain bg-ink"
      initial={{ clipPath: 'inset(100% 0% 0% 0%)' }}
      animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      exit={{ clipPath: 'inset(0% 0% 100% 0%)' }}
      transition={{ duration: 0.9, ease: EASE }}
    >
      <div className="gutter sticky top-0 z-20 flex h-16 items-center justify-between bg-ink md:h-20">
        <span className="display text-[22px] md:text-2xl">FERAL</span>
        <button ref={closeRef} onClick={onClose} className="eyebrow -mr-3 p-3" aria-label="Close">
          CLOSE ✕
        </button>
      </div>

      <m.div
        className="gutter mx-auto max-w-[1400px] pb-[max(3rem,env(safe-area-inset-bottom))] pt-4 md:pb-24 md:pt-[6vh]"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {b.stage !== 'menu' && !b.loading && !unavailable && (
          <div className="mb-10 flex flex-col gap-4 border-b border-bone/10 pb-6 md:mb-14 md:flex-row md:items-center md:justify-between">
            <h2 id="pass-title" className="display text-3xl tracking-[0.02em] md:text-4xl">
              GET YOUR PASS<span className="text-blood">.</span>
            </h2>
            <Steps stage={b.stage} />
          </div>
        )}

        {b.loading ? (
          <p className="eyebrow py-24 text-center text-bone/40">LOADING…</p>
        ) : unavailable ? (
          <OfflineFallback />
        ) : (
          <AnimatePresence mode="wait">
            <m.div key={b.stage} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              {b.stage === 'menu' && (
                <PriceMenu config={b.config} category={category} setCategory={setCategory} onBuy={() => b.setStage('details')} resumable={b.resumable} onResume={b.resume} />
              )}
              {b.stage === 'details' && <DetailsForm config={b.config} category={category} setCategory={setCategory} onCreated={onCreated} initial={draft} />}
              {b.stage === 'otp' && b.booking && (
                <OtpStep
                  session={b.session}
                  booking={b.booking}
                  onVerified={(booking, changed) => {
                    setPriceChanged(Boolean(changed))
                    b.update(booking)
                  }}
                  onStartOver={() => {
                    b.reset()
                    b.setStage('details')
                  }}
                />
              )}
              {b.stage === 'payment' && b.booking && <PaymentStep config={b.config} session={b.session} booking={b.booking} onSubmitted={b.update} priceChanged={priceChanged} />}
              {b.stage === 'status' && b.booking && <StatusStep config={b.config} session={b.session} booking={b.booking} refresh={b.refresh} />}
            </m.div>
          </AnimatePresence>
        )}
      </m.div>
    </m.div>
  )
}
