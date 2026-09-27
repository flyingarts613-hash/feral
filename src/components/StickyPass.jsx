import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { EVENT } from '../data/event'
import { useOpenPass } from '../lib/usePass'

// Mobile only: a slim pass bar once the hero is gone, hidden again at the final CTA.
export default function StickyPass() {
  const [show, setShow] = useState(false)
  const openPass = useOpenPass()

  useEffect(() => {
    const final = document.getElementById('final')
    let finalVisible = false
    const update = () => setShow(window.scrollY > window.innerHeight * 0.9 && !finalVisible)
    const io = new IntersectionObserver(([e]) => {
      finalVisible = e.isIntersecting
      update()
    })
    if (final) io.observe(final)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', update)
    }
  }, [])

  return (
    <AnimatePresence>
      {show && (
        <m.div
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
          initial={{ y: '120%' }}
          animate={{ y: '0%' }}
          exit={{ y: '120%' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <button onClick={openPass} className="flex h-14 w-full items-center justify-between border border-bone/15 bg-ink/90 px-5 text-bone">
            <span className="flex items-center gap-3 text-left">
              <span className="h-1.5 w-1.5 shrink-0 bg-blood" />
              <span className="font-sans text-[9px] font-medium uppercase leading-[1.5] tracking-[0.22em] text-bone/55">
                {EVENT.dateShort}
                <br />
                {EVENT.venue}
              </span>
            </span>
            <span className="display shrink-0 text-xl tracking-[0.03em]">GET YOUR PASS →</span>
          </button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
