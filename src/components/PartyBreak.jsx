import { useRef } from 'react'
import { m, useReducedMotion, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import { BREAK_LINES } from '../data/content'
import { PARTY_MAIN } from '../data/gallery'
import Img from './Img'

// The first full-bleed photograph: a camera flash as it arrives, the frame
// easing out from a zoom, and the two big lines passing each other.
export default function PartyBreak() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const still = (a) => (reduced ? [a[0], a[0]] : a)

  const scale = useRange(p, [0, 1], still([1.28, 1]))
  const bright = useRange(p, [0, 0.35], reduced ? ['brightness(0.8)', 'brightness(0.8)'] : ['brightness(0.45)', 'brightness(0.85)'])
  const flash = useRange(p, [0, 0.04, 0.09, 0.16], reduced ? [0, 0, 0, 0] : [0, 0.75, 0.15, 0])
  const x1 = useRange(p, [0, 1], still(['18%', '-38%']))
  const x2 = useRange(p, [0, 1], still(['-40%', '14%']))
  const [a, b] = BREAK_LINES

  return (
    <section ref={ref} aria-label={BREAK_LINES.join(' ')} className="relative h-[190svh] bg-ink">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <m.div className="absolute inset-0" style={{ scale, filter: bright }}>
          <Img src={PARTY_MAIN} sizes="100vw" className="h-full w-full object-cover" />
        </m.div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink via-transparent to-ink" />
        <div className="leak pointer-events-none absolute -left-1/4 bottom-0 h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(closest-side,rgba(158,15,24,0.35),transparent)] blur-2xl" />

        <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-center gap-[2vh] overflow-hidden">
          <m.p className="display whitespace-nowrap text-[27vw] leading-[0.85] md:text-[17vw]" style={{ x: x1 }}>
            {a}
          </m.p>
          <m.p className="display whitespace-nowrap text-[27vw] leading-[0.85] text-blood md:text-[17vw]" style={{ x: x2 }}>
            {b}
          </m.p>
        </div>

        <p className="gutter eyebrow absolute inset-x-0 bottom-6 flex justify-between text-bone/50 md:bottom-10">
          <span>FERAL · HALLOWEEN 2026</span>
          <span className="text-blood">● FLASH ON</span>
        </p>
        <m.div className="pointer-events-none absolute inset-0 bg-[#fffaf4]" style={{ opacity: flash }} />
      </div>
    </section>
  )
}
