import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useInView, useReducedMotion } from 'framer-motion'
import { HORROR_ROOM as R } from '../data/experiences'
import { creak } from '../lib/ambient'
import { Fade, Line } from './Reveal'
import Img from './Img'

// THE HORROR ROOM — a door you're invited to open. It cracks open on its own
// when you arrive, opens further on hover, swings wide on tap. Red light,
// fog, something moving inside.
const ANGLE = { closed: 0, ajar: -9, peek: -34, open: -104 }

export default function HorrorRoom() {
  const [state, setState] = useState('closed')
  const [hover, setHover] = useState(false)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -25% 0px' })
  const reduced = useReducedMotion()

  useEffect(() => {
    if (inView && state === 'closed') {
      const t = setTimeout(() => setState('ajar'), 500)
      return () => clearTimeout(t)
    }
  }, [inView, state])

  const toggle = () => {
    const next = state === 'open' ? 'ajar' : 'open'
    setState(next)
    if (next === 'open') creak()
  }

  const shown = state === 'open' ? 'open' : hover ? 'peek' : state
  const light = { closed: 0, ajar: 0.35, peek: 0.65, open: 1 }[shown]

  return (
    <section id="horror-room" aria-label="The horror room" className="relative overflow-hidden bg-black pb-[14vh] pt-[14vh] md:pb-[18vh] md:pt-[18vh]">
      <div className="gutter relative grid grid-cols-12 items-center gap-y-14 md:gap-x-10">
        {/* copy */}
        <div className="col-span-12 md:col-span-6">
          <p className="eyebrow mb-6 flex items-center gap-4 text-blood">
            <span className="h-px w-8 bg-blood" />
            {R.eyebrow} <span className="text-bone/30">(03)</span>
          </p>
          <h2 className="display text-[19vw] leading-[0.84] md:text-[8.6vw]">
            <Line>{R.headline[0]}</Line>
            <Line delay={0.08} className="text-blood">
              {R.headline[1]}
            </Line>
          </h2>
          <Fade delay={0.15}>
            <p className="mt-8 max-w-[28rem] text-lg leading-relaxed text-bone/70 md:text-xl">{R.intro}</p>
          </Fade>
          <ul className="display mt-8 space-y-1 text-3xl md:text-4xl">
            {R.steps.map((s, i) => (
              <li key={s}>
                <Line delay={0.2 + i * 0.12}>{s}</Line>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-5">
            <button
              onClick={toggle}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
              onPointerLeave={() => setHover(false)}
              aria-pressed={state === 'open'}
              className="display group flex items-center gap-3 border border-blood px-7 py-4 text-xl tracking-[0.05em] text-bone transition-colors duration-500 hover:bg-blood md:text-2xl"
            >
              {state === 'open' ? 'CLOSE THE DOOR' : R.cta}
              <span className="inline-block transition-transform duration-500 group-hover:translate-x-1">→</span>
            </button>
            <span className="eyebrow text-bone/40">{state === 'open' ? 'TOO LATE.' : 'TAP THE DOOR'}</span>
          </div>
        </div>

        {/* the door */}
        <div ref={ref} className="col-span-12 md:col-span-5 md:col-start-8">
          <div
            className="relative mx-auto w-[82%] cursor-pointer md:w-full"
            onClick={toggle}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
            onPointerLeave={() => setHover(false)}
            role="button"
            tabIndex={0}
            aria-label={state === 'open' ? 'Close the door' : 'Open the door'}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
          >
            <p className="eyebrow mb-3 flex justify-between text-bone/40">
              <span>ROOM 13</span>
              <span className="text-blood">● REC</span>
            </p>

            {/* frame */}
            <div className="relative aspect-[3/4] border-[10px] border-[#0f0b0b] bg-black shadow-[inset_0_0_0_1px_rgba(242,240,236,0.08),0_0_0_1px_rgba(242,240,236,0.06)] [perspective:1400px] md:border-[14px]">
              {/* what's inside */}
              <div className="absolute inset-0 overflow-hidden">
                <Img src={R.inside} alt="" sizes="(min-width: 768px) 38vw, 80vw" className="h-full w-full object-cover" />
                <m.div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_40%,rgba(200,20,30,0.55),rgba(0,0,0,0.6)_75%)] mix-blend-multiply" animate={{ opacity: 0.6 + light * 0.4 }} />
                <div className="fog pointer-events-none absolute inset-x-0 bottom-0 h-1/2 !opacity-30" />
                {!reduced && <div className="room-shadow pointer-events-none absolute bottom-0 h-[70%] w-[30%]" />}
                <AnimatePresence>
                  {state === 'open' && (
                    <m.div
                      className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 px-6 text-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.8, delay: 0.5 }}
                    >
                      <p className="serif text-2xl text-bone/90 md:text-3xl">{R.secret[0]}</p>
                      <p className="display mt-3 text-5xl text-blood md:text-6xl">{R.secret[1]}</p>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>

              {/* the door itself */}
              <m.div
                className="absolute inset-0 origin-left [transform-style:preserve-3d]"
                animate={reduced ? { opacity: shown === 'open' ? 0 : 1 } : { rotateY: ANGLE[shown] }}
                transition={{ type: 'spring', stiffness: shown === 'open' ? 40 : 70, damping: 14 }}
              >
                <div className="door absolute inset-0 [backface-visibility:hidden]">
                  <div className="absolute inset-[9%_10%_52%] border border-black/60 shadow-[inset_0_0_30px_rgba(0,0,0,0.6)]" />
                  <div className="absolute inset-[54%_10%_8%] border border-black/60 shadow-[inset_0_0_30px_rgba(0,0,0,0.6)]" />
                  <div className="absolute left-[46%] top-[12%] -translate-x-1/2 border border-[#8a6a3a]/60 bg-[#1b140d] px-2 py-1">
                    <span className="display text-sm tracking-[0.2em] text-[#c9a15b]">13</span>
                  </div>
                  <div className="absolute right-[9%] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_30%_30%,#e0c48c,#6b5530)] shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                  <div className="keyhole absolute right-[9.6%] top-[55%] h-3 w-1.5 rounded-full bg-[#ff2a2a]" />
                </div>
              </m.div>

              {/* light leaking round the edge */}
              <m.div className="pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-[#ff3040] blur-[2px]" animate={{ opacity: shown === 'closed' ? 0 : 0.9 }} />
            </div>

            {/* red spill on the floor */}
            <m.div
              aria-hidden="true"
              className="pointer-events-none mx-auto -mt-1 h-16 w-[120%] -translate-x-[8%] bg-[radial-gradient(50%_100%_at_50%_0%,rgba(220,20,35,0.7),transparent)] blur-md"
              animate={{ opacity: light }}
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
