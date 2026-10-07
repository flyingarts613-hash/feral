import { useRef } from 'react'
import { m, useReducedMotion, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import { STRIP } from '../data/gallery'
import { EVENT } from '../data/event'
import Img from './Img'

const TILT = [-3, 2, -1.5, 3, -2.5, 1.5, -3.5, 2.5]
// Disposable-camera date stamp: '26 10 27
const STAMP = (() => {
  const [d, mo, y] = EVENT.dateShort.split('.')
  return `'${y} ${mo} ${d}`
})()

// Two rows of flash photos sliding past each other as you scroll.
export default function PhotoStrip() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const left = useRange(p, [0, 1], reduced ? ['-10%', '-10%'] : ['0%', '-38%'])
  const right = useRange(p, [0, 1], reduced ? ['-20%', '-20%'] : ['-38%', '0%'])
  const half = Math.ceil(STRIP.length / 2)
  const rows = [STRIP.slice(0, half).concat(STRIP.slice(0, half)), STRIP.slice(half).concat(STRIP.slice(half))]

  return (
    <section ref={ref} aria-label="Photos from the night" className="relative overflow-hidden bg-ink py-[12vh] md:py-[18vh]">
      <div className="gutter mb-10 flex items-end justify-between md:mb-14">
        <p className="eyebrow text-bone/50">CAUGHT ON FLASH</p>
        <p className="eyebrow text-bone/30">{STAMP}</p>
      </div>
      <div className="flex flex-col gap-4 md:gap-7">
        {rows.map((row, ri) => (
          <m.ul key={ri} className="flex w-max gap-3 will-change-transform md:gap-6" style={{ x: ri ? right : left }}>
            {row.map((src, i) => (
              <li
                key={i}
                className="group relative h-[58vw] w-[46vw] shrink-0 overflow-hidden bg-coal transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:z-10 hover:!rotate-0 hover:scale-[1.04] md:h-[40vh] md:w-[32vh]"
                style={{ rotate: `${TILT[(i + ri * 3) % TILT.length]}deg` }}
              >
                <Img src={src} sizes="(min-width: 768px) 32vh, 46vw" className="h-full w-full object-cover transition-[filter] duration-500 group-hover:brightness-125" />
                <span className="pointer-events-none absolute bottom-2 right-2.5 font-mono text-[10px] tracking-[0.12em] text-[#ff6a2b] [text-shadow:0_0_6px_rgba(255,90,30,0.8)] md:text-xs">
                  {STAMP}
                </span>
              </li>
            ))}
          </m.ul>
        ))}
      </div>
    </section>
  )
}
