import { useEffect, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { asset } from '../lib/image'

// Black curtain with a flickering warning while the display face loads, then lifts.
export default function Intro({ onDone }) {
  const [show, setShow] = useState(true)
  const reduced = useReducedMotion()

  useEffect(() => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setShow(false)
    }
    const min = new Promise((r) => setTimeout(r, reduced ? 0 : 1700))
    const fonts = document.fonts?.ready ?? Promise.resolve()
    Promise.all([min, fonts]).then(finish)
    const cap = setTimeout(finish, 2600)
    return () => clearTimeout(cap)
  }, [reduced])

  return (
    <AnimatePresence onExitComplete={onDone}>
      {show && (
        <m.div
          key="intro"
          className="fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-ink"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: reduced ? 'none' : 'blur(6px)' }}
          transition={{ duration: reduced ? 0.01 : 1.2, ease: [0.65, 0, 0.35, 1] }}
          aria-hidden="true"
        >
          {/* Something standing in the dark behind the words — barely there. */}
          <div
            className="intro-figure pointer-events-none absolute inset-0 bg-cover bg-center grayscale"
            style={{ backgroundImage: `url(${asset('/images/archive/01-960.webp')})` }}
          />
          <div className="fog fog-intro pointer-events-none absolute inset-x-0 bottom-0 h-1/2" />

          <div className="relative flex flex-col items-center gap-5 px-6 text-center">
            <span className="whisper display text-[8vw] leading-none tracking-[0.02em] md:text-6xl">
              DON&apos;T LOOK BEHIND YOU<span className="text-blood">.</span>
            </span>
            <span className="relative h-px w-16 overflow-hidden bg-bone/15">
              <m.span
                className="absolute inset-0 origin-left bg-blood"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1.6, ease: [0.76, 0, 0.24, 1] }}
              />
            </span>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
