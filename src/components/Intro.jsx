import { useEffect, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'

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
          className="fixed inset-0 z-[90] grid place-items-center bg-ink"
          initial={{ clipPath: 'inset(0% 0% 0% 0%)' }}
          exit={{ clipPath: 'inset(0% 0% 100% 0%)' }}
          transition={{ duration: reduced ? 0.01 : 1, ease: [0.76, 0, 0.24, 1] }}
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-5 px-6 text-center">
            <span className="whisper display text-[10vw] leading-none tracking-[0.02em] md:text-6xl">
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
