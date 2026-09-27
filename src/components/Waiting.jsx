import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import { WAITING } from '../data/content'
import { Line } from './Reveal'
import Img from './Img'

const pad = (n) => String(n).padStart(2, '0')

// WHAT'S WAITING — a big list. Desktop: hover a line and its photo follows the
// cursor. Phones: the line in the middle of the screen opens up with its photo.
export default function Waiting() {
  const [hover, setHover] = useState(null)
  const [active, setActive] = useState(0)
  const section = useRef(null)
  const reduced = useReducedMotion()
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(mx, { stiffness: 180, damping: 22 })
  const y = useSpring(my, { stiffness: 180, damping: 22 })

  // Phones: whichever row crosses the middle band becomes active.
  useEffect(() => {
    const rows = section.current.querySelectorAll('[data-row]')
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number(e.target.dataset.row))),
      { rootMargin: '-45% 0px -45% 0px' },
    )
    rows.forEach((r) => io.observe(r))
    return () => io.disconnect()
  }, [])

  const onMove = (e) => {
    const r = section.current.getBoundingClientRect()
    mx.set(e.clientX - r.left)
    my.set(e.clientY - r.top)
  }

  return (
    <section
      id="waiting"
      ref={section}
      onPointerMove={onMove}
      aria-label="What's waiting"
      className="gutter relative bg-ink pb-[16vh] pt-[14vh] md:pb-[22vh] md:pt-[20vh]"
    >
      <div className="mb-[8vh] flex items-end justify-between md:mb-[12vh]">
        <h2 className="display text-[22vw] leading-[0.82] md:text-[12vw]">
          <Line>WHAT&apos;S</Line>
          <Line delay={0.08} className="md:pl-[16vw]">
            WAITING<span className="text-blood">.</span>
          </Line>
        </h2>
        <p className="eyebrow mb-2 hidden text-bone/40 md:block">(05)</p>
      </div>

      <ul className="relative z-10 border-t border-bone/10" onPointerLeave={() => setHover(null)}>
        {WAITING.map((item, i) => {
          const dim = hover !== null && hover !== i
          const open = active === i
          return (
            <li
              key={item.title}
              data-row={i}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
              className="border-b border-bone/10"
            >
              <div className={`flex items-baseline gap-4 py-5 transition-opacity duration-500 md:gap-8 md:py-7 ${dim ? 'opacity-25' : ''}`}>
                <span className={`eyebrow w-7 shrink-0 transition-colors duration-500 ${open || hover === i ? 'text-blood' : 'text-bone/40'}`}>{pad(i + 1)}</span>
                <h3 className="display flex-1 text-[11.5vw] leading-[0.9] md:text-[6.8vw]">
                  <Line delay={i * 0.05}>{item.title}</Line>
                </h3>
                <span className="eyebrow hidden text-right text-bone/50 md:block">{item.note}</span>
              </div>
              {/* phones: the photo opens under the active line */}
              <div className="grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
                <div className="overflow-hidden">
                  <div className="relative mb-6 aspect-[4/3] overflow-hidden">
                    <Img src={item.image} sizes="92vw" className={`h-full w-full object-cover transition-transform duration-[1.4s] ${open ? 'scale-100' : 'scale-110'}`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
                    <span className="eyebrow absolute bottom-3 left-3 text-bone/80">{item.note}</span>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {/* desktop: the photo that follows the cursor */}
      <m.div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-0 hidden md:block"
        style={{ x, y, translateX: '-50%', translateY: '-50%' }}
      >
        <AnimatePresence>
          {hover !== null && (
            <m.div
              key={hover}
              className="absolute left-1/2 top-1/2 h-[34vh] w-[26vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
              initial={{ opacity: 0, scale: 0.85, rotate: reduced ? 0 : -6, clipPath: 'inset(50% 50% 50% 50%)' }}
              animate={{ opacity: 1, scale: 1, rotate: reduced ? 0 : hover % 2 ? 4 : -4, clipPath: 'inset(0% 0% 0% 0%)' }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <Img src={WAITING[hover].image} sizes="26vh" loading="eager" className="h-full w-full object-cover" />
            </m.div>
          )}
        </AnimatePresence>
      </m.div>
    </section>
  )
}
