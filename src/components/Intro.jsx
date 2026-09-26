import { useEffect, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'

// Black curtain while the display face + hero image load, then lifts.
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
    const min = new Promise((r) => setTimeout(r, reduced ? 0 : 900))
    const fonts = document.fonts?.ready ?? Promise.resolve()
    Promise.all([min, fonts]).then(finish)
    const cap = setTimeout(finish, 2200)
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
          <div className="flex flex-col items-center gap-4">
            <span className="display text-xl tracking-[0.02em]">FERAL</span>
            <span className="relative h-px w-16 overflow-hidden bg-bone/15">
              <m.span
                className="absolute inset-0 origin-left bg-blood"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
              />
            </span>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
