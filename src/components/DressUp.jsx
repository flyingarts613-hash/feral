import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { DRESS_UP } from '../data/experiences'
import { EVENT, isSet } from '../data/event'
import { useOpenPass } from '../lib/usePass'
import { Line } from './Reveal'
import Img from './Img'

const pad = (n) => String(n).padStart(2, '0')
const CHARS = DRESS_UP.characters

// WHO ARE YOU TONIGHT? — a swipeable line-up of characters. The one in front
// sets the colour of the whole section. "Choose your alter ego" spins to one.
export default function DressUp() {
  const track = useRef(null)
  const [active, setActive] = useState(0)
  const [flash, setFlash] = useState(0)
  const [picked, setPicked] = useState(null)
  const reduced = useReducedMotion()
  const openPass = useOpenPass()
  const accent = CHARS[active].accent

  // Which card is closest to the middle of the strip.
  useEffect(() => {
    const el = track.current
    let raf = 0
    const measure = () => {
      raf = 0
      const mid = el.scrollLeft + el.clientWidth / 2
      let best = 0
      let dist = Infinity
      ;[...el.children].forEach((c, i) => {
        const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid)
        if (d < dist) (dist = d), (best = i)
      })
      setActive(best)
    }
    const onScroll = () => raf || (raf = requestAnimationFrame(measure))
    el.addEventListener('scroll', onScroll, { passive: true })
    measure()
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  const goTo = useCallback(
    (i) => {
      const el = track.current
      const c = el.children[(i + CHARS.length) % CHARS.length]
      el.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2, behavior: reduced ? 'auto' : 'smooth' })
    },
    [reduced],
  )

  const shuffle = () => {
    let i = active
    while (i === active) i = Math.floor(Math.random() * CHARS.length)
    goTo(i)
    setPicked(i)
    setFlash((n) => n + 1)
  }

  // Desktop: drag the strip with the mouse.
  const drag = useRef(null)
  const onDown = (e) => {
    if (e.pointerType !== 'mouse') return
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false }
  }
  const onMove = (e) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    if (Math.abs(dx) > 4) drag.current.moved = true
    track.current.scrollLeft = drag.current.left - dx
  }
  const onUp = () => {
    if (drag.current?.moved) goTo(active)
    drag.current = null
  }

  return (
    <section id="dress-up" aria-label="Who are you tonight?" className="relative overflow-hidden bg-ink pb-[12vh] pt-[14vh] md:pb-[16vh] md:pt-[18vh]">
      {/* the room takes the colour of whoever is in front */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[color] duration-[900ms]"
        style={{ color: accent, background: 'radial-gradient(60% 55% at 70% 45%, currentColor, transparent 70%)', opacity: 0.22 }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink to-transparent" />

      <div className="gutter relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <h2 className="display text-[22vw] leading-[0.82] md:text-[11vw]">
          <Line>{DRESS_UP.heading[0]}</Line>
          <Line delay={0.06} className="md:pl-[9vw]">
            {DRESS_UP.heading[1]}
          </Line>
          <Line delay={0.12} className="md:pl-[4vw]">
            <span className="transition-colors duration-[900ms]" style={{ color: accent }}>
              {DRESS_UP.heading[2]}
            </span>
          </Line>
        </h2>
        <div className="max-w-[26rem] md:mb-3 md:text-right">
          <p className="eyebrow mb-4 hidden text-bone/40 md:block">(01)</p>
          <p className="serif text-2xl leading-snug text-bone md:text-3xl">{DRESS_UP.sub}</p>
          <p className="eyebrow mt-4 text-bone/55">{DRESS_UP.waiting}</p>
        </div>
      </div>

      {/* the line-up */}
      <ul
        ref={track}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        className="no-scrollbar relative mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-[14vw] py-6 md:mt-16 md:cursor-grab md:gap-6 md:px-[38vw] md:active:cursor-grabbing"
        aria-label="Characters"
      >
        {CHARS.map((c, i) => {
          const on = i === active
          return (
            <li key={c.name} className="w-[72vw] shrink-0 snap-center md:w-[24vw]">
              <button
                onClick={() => (on ? null : goTo(i))}
                aria-label={c.name}
                aria-current={on}
                className={`group relative block aspect-[3/4] w-full overflow-hidden bg-coal text-left transition-[transform,opacity,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  on ? 'scale-100 opacity-100' : 'scale-[0.88] opacity-45 saturate-50'
                }`}
                style={{ boxShadow: on ? `0 40px 90px -30px ${c.accent}` : 'none' }}
              >
                <Img src={c.image} alt="" sizes="(min-width: 768px) 24vw, 72vw" draggable="false" className="h-full w-full object-cover transition-transform duration-[1.4s] group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-transparent" />
                <span className="eyebrow absolute left-4 top-4 text-bone/70">
                  {pad(i + 1)} / {pad(CHARS.length)}
                </span>
                <div className="absolute inset-x-4 bottom-4">
                  <p className="display text-[13vw] leading-[0.85] md:text-[4.6vw]">{c.name}</p>
                  <p className="eyebrow mt-2 text-[9px] text-bone/60 md:text-[10px]">{c.look}</p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {/* what your friends will say */}
      <div className="gutter relative mt-4 flex min-h-[3.5rem] items-center justify-center text-center md:mt-6">
        <AnimatePresence mode="wait">
          <m.p
            key={active}
            className="serif text-2xl md:text-4xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45 }}
          >
            “{CHARS[active].line}”
          </m.p>
        </AnimatePresence>
      </div>

      {/* controls */}
      <div className="gutter relative mt-8 flex flex-col items-center gap-6 md:mt-10 md:flex-row md:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => goTo(active - 1)} aria-label="Previous character" className="grid h-12 w-12 place-items-center border border-bone/20 transition-colors hover:border-bone">
            ←
          </button>
          <button onClick={() => goTo(active + 1)} aria-label="Next character" className="grid h-12 w-12 place-items-center border border-bone/20 transition-colors hover:border-bone">
            →
          </button>
          <span className="eyebrow ml-2 text-bone/50">SWIPE THE LINE-UP</span>
        </div>

        <div className="flex flex-col items-center gap-4 md:flex-row">
          <button
            onClick={shuffle}
            className="display flex items-center gap-3 px-7 py-4 text-xl tracking-[0.04em] text-ink transition-[background-color] duration-[900ms] md:text-2xl"
            style={{ backgroundColor: accent }}
          >
            {DRESS_UP.shuffle} <span aria-hidden="true">↻</span>
          </button>
          {isSet(EVENT.instagram) ? (
            <a href={EVENT.socials.instagram} target="_blank" rel="noopener noreferrer" className="eyebrow link-line pb-1">
              {DRESS_UP.share} ↗
            </a>
          ) : (
            <button onClick={openPass} className="eyebrow link-line pb-1">
              GET YOUR PASS →
            </button>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {picked !== null ? `Tonight you're the ${CHARS[picked].name.toLowerCase()}.` : ''}
      </p>

      {!reduced && (
        <m.div
          key={flash}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[#fffaf4]"
          initial={{ opacity: flash ? 0.5 : 0 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}
    </section>
  )
}
