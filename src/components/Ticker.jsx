import { useRef } from 'react'
import { m, useAnimationFrame, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from 'framer-motion'
import { TICKER } from '../data/content'

const wrap = (min, max, v) => {
  const r = max - min
  return ((((v - min) % r) + r) % r) + min
}

// A band of huge type that drifts sideways and speeds up with your scroll,
// flipping direction when you scroll back up.
export default function Ticker() {
  return (
    <section aria-label="Event details" className="relative overflow-hidden border-y border-bone/10 bg-ink py-4 md:py-6">
      <p className="sr-only">{TICKER.join(', ')}</p>
      <Row speed={3.2} />
      <Row speed={-2.4} small />
    </section>
  )
}

function Row({ speed, small = false }) {
  const reduced = useReducedMotion()
  const base = useMotionValue(0)
  const { scrollY } = useScroll()
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 })
  const boost = useTransform(velocity, [0, 1000], [0, 5], { clamp: false })
  const dir = useRef(1)
  const x = useTransform(base, (v) => `${wrap(-50, 0, v)}%`)

  useAnimationFrame((_, delta) => {
    if (reduced) return
    const b = boost.get()
    if (b < 0) dir.current = -1
    else if (b > 0) dir.current = 1
    base.set(base.get() - dir.current * speed * (delta / 1000) * (1 + Math.abs(b)))
  })

  const items = [...TICKER, ...TICKER]
  return (
    <div aria-hidden="true" className="flex whitespace-nowrap">
      <m.div className="flex shrink-0 items-center will-change-transform" style={{ x }}>
        {[0, 1].map((copy) =>
          items.map((t, i) => (
            <span key={`${copy}-${i}`} className="flex items-center">
              <span
                className={`display leading-[1] ${small ? 'text-[7vw] md:text-[3.2vw]' : 'text-[15vw] md:text-[7.5vw]'} ${
                  i % 2 ? 'text-outline' : small ? 'text-bone/40' : 'text-bone'
                }`}
              >
                {t}
              </span>
              <span className={`mx-[0.35em] inline-block bg-blood ${small ? 'h-2 w-2 md:h-2.5 md:w-2.5' : 'h-3 w-3 md:h-4 md:w-4'} rotate-45`} />
            </span>
          )),
        )}
      </m.div>
    </div>
  )
}
