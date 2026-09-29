import { useRef } from 'react'
import { m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import { EVENT } from '../data/event'
import { FROM_PRICE, ROUND, inr } from '../data/passes'
import { PASS_STEPS } from '../data/content'
import { useOpenPass } from '../lib/usePass'
import { Fade, Line } from './Reveal'

// PASSES — the pass as an object: a ticket with a chrome FERAL, a perforated
// stub and a sheen that follows the cursor. Opens the existing pass sheet.
export default function Passes() {
  const openPass = useOpenPass()
  return (
    <section id="passes" aria-label="Passes" className="gutter relative overflow-hidden bg-ink pb-[16vh] pt-[14vh] md:pb-[22vh]">
      <div className="leak pointer-events-none absolute left-1/2 top-1/3 h-[70vmax] w-[70vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(158,15,24,0.2),transparent)] blur-2xl" />

      <div className="relative mb-[8vh] flex items-end justify-between md:mb-[10vh]">
        <h2 className="display text-[24vw] leading-[0.82] md:text-[12vw]">
          <Line>GET</Line>
          <Line delay={0.07} className="md:pl-[8vw]">
            IN<span className="text-blood">.</span>
          </Line>
        </h2>
        <p className="eyebrow mb-2 hidden text-bone/40 md:block">(06)</p>
      </div>

      <Ticket onOpen={openPass} />

      <Fade className="relative mx-auto mt-12 grid max-w-[1100px] gap-6 md:mt-16 md:grid-cols-3 md:gap-10">
        {PASS_STEPS.map((s, i) => (
          <div key={s.title} className="flex gap-4 border-t border-bone/10 pt-5">
            <span className="eyebrow text-blood">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <p className="display text-xl tracking-[0.02em] md:text-2xl">{s.title}</p>
              {s.href ? (
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="link-line mt-1 inline-block text-sm text-bone/70 hover:text-bone">
                  {s.note}
                </a>
              ) : (
                <p className="mt-1 text-sm text-bone/50">{s.note}</p>
              )}
            </div>
          </div>
        ))}
      </Fade>
    </section>
  )
}

function Ticket({ onOpen }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const rx = useSpring(useMotionValue(0), { stiffness: 150, damping: 18 })
  const ry = useSpring(useMotionValue(0), { stiffness: 150, damping: 18 })
  const gx = useMotionValue(30)
  const sheen = useMotionTemplate`linear-gradient(115deg, transparent ${gx}%, rgba(255,255,255,0.09) calc(${gx}% + 8%), transparent calc(${gx}% + 18%))`

  const onMove = (e) => {
    if (reduced || e.pointerType !== 'mouse') return
    const r = ref.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    ry.set((px - 0.5) * 10)
    rx.set(-(py - 0.5) * 8)
    gx.set(px * 100 - 20)
  }
  const reset = () => {
    rx.set(0)
    ry.set(0)
  }

  const price = `FROM ${inr(FROM_PRICE)}`

  return (
    <m.div
      initial={{ opacity: 0, y: 60, rotate: reduced ? 0 : -2 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto max-w-[1100px] [perspective:1200px]"
    >
      <m.div
        ref={ref}
        onClick={onOpen}
        onPointerMove={onMove}
        onPointerLeave={reset}
        style={{ rotateX: rx, rotateY: ry }}
        className="group relative grid cursor-pointer w-full grid-rows-[1fr_auto] overflow-hidden border border-bone/15 bg-[linear-gradient(135deg,#141111,#0a0909_60%,#140a0b)] text-left text-bone shadow-[0_50px_120px_rgba(0,0,0,0.8)] md:grid-cols-[1fr_auto] md:grid-rows-1"
      >
        {/* main */}
        <div className="relative p-6 md:p-10">
          <div className="flex items-start justify-between">
            <p className="eyebrow text-bone/50">{EVENT.edition} · PASS</p>
            <p className="eyebrow text-blood">● {ROUND}</p>
          </div>
          <p className="display chrome mt-6 text-[26vw] leading-[0.8] md:mt-8 md:text-[10vw]">FERAL</p>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 md:mt-10 md:grid-cols-4">
            {[
              ['DATE', EVENT.date],
              ['VENUE', EVENT.venue],
              ['AREA', EVENT.area],
              ['ENTRY', price],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow text-bone/40">{k}</dt>
                <dd className="display mt-1.5 text-lg tracking-[0.03em] md:text-2xl">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* stub */}
        <div className="relative flex flex-col items-stretch gap-4 border-t border-dashed border-bone/25 p-6 md:border-l md:border-t-0 md:p-8">
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-ink md:-left-3 md:-top-3" aria-hidden="true" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-ink md:-bottom-3 md:-left-3 md:right-auto md:top-auto" aria-hidden="true" />
          <p className="display text-xl tracking-[0.08em] text-bone/80 md:flex-1 md:rotate-180 md:text-3xl md:[writing-mode:vertical-rl]">ADMIT ONE</p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
            className="display flex items-center justify-between gap-3 bg-bone px-5 py-3.5 text-xl tracking-[0.03em] text-ink transition-colors duration-500 group-hover:bg-blood group-hover:text-bone md:justify-center md:text-2xl"
          >
            GET YOUR PASS <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
          </button>
        </div>

        <m.span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: sheen }} />
      </m.div>
    </m.div>
  )
}
