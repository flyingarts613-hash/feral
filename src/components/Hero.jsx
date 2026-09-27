import { useEffect, useRef, useState } from 'react'
import { m, useReducedMotion, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import { EVENT } from '../data/event'
import { imageProps } from '../lib/image'
import { useOpenPass } from '../lib/usePass'
import { nightsLeft } from '../lib/countdown'

const EASE = [0.16, 1, 0.3, 1]

export default function Hero({ ready }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const openPass = useOpenPass()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useRange(scrollYProgress, [0, 1], ['0%', reduced ? '0%' : '22%'])
  const fade = useRange(scrollYProgress, [0, 0.7], [1, 0])
  const titleY = useRange(scrollYProgress, [0, 1], ['0%', reduced ? '0%' : '-18%'])

  const mobile = imageProps(EVENT.hero.imageMobile)
  const desktop = imageProps(EVENT.hero.image)

  return (
    <section id="top" ref={ref} className="relative h-[100svh] min-h-[560px] overflow-hidden bg-ink">
      {/* Media */}
      <m.div className="absolute inset-0" style={{ y }}>
        <m.div
          className="absolute inset-0"
          initial={{ scale: 1.14, opacity: 0 }}
          animate={ready ? { scale: 1.02, opacity: 1 } : {}}
          transition={{ duration: 2.8, ease: EASE }}
        >
          <picture>
            <source media="(max-width: 767px) and (orientation: portrait)" srcSet={mobile.srcSet ?? EVENT.hero.imageMobile} sizes="100vw" />
            <img
              src={EVENT.hero.image}
              srcSet={desktop.srcSet}
              sizes="100vw"
              alt=""
              fetchPriority="high"
              className="h-full w-full object-cover"
            />
          </picture>
          {EVENT.hero.video && <HeroVideo src={EVENT.hero.video} />}
        </m.div>
      </m.div>

      {/* Grade: crush the blacks, red leak top-right */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/10 to-ink" />
      <div className="leak pointer-events-none absolute -right-1/4 -top-1/4 h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgba(158,15,24,0.38),transparent)] blur-2xl" />

      {/* A failing bulb, low fog, something watching from the crowd */}
      <div className="flicker pointer-events-none absolute inset-0 bg-ink" />
      <div className="fog pointer-events-none absolute inset-x-0 bottom-0 h-[55%]" />
      <Eyes className="left-[14%] top-[71%] md:left-[18%] md:top-[66%]" delay="-1.6s" />
      <Eyes className="right-[12%] top-[78%] hidden md:block" delay="8s" small />

      {/* Type */}
      <m.div
        className="gutter relative z-10 flex h-full flex-col items-center justify-center text-center"
        style={{ y: titleY, opacity: fade }}
      >
        <h1 className="display w-full overflow-hidden text-[44vw] leading-[0.78] md:text-[min(36vw,64vh)]">
          <span className="sr-only">{`FERAL — Halloween 2026, ${EVENT.date}, ${EVENT.location}`}</span>
          <span aria-hidden="true" className="flex justify-center">
            {'FERAL'.split('').map((ch, i) => (
              <m.span
                key={i}
                className="inline-block"
                initial={{ y: '118%' }}
                animate={ready ? { y: '0%' } : {}}
                transition={{ duration: 1.4, delay: 0.15 + i * 0.06, ease: EASE }}
              >
                {ch}
              </m.span>
            ))}
          </span>
        </h1>

        <m.div
          className="mt-6 flex flex-col items-center gap-5 md:mt-8"
          initial={{ opacity: 0, y: 12 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1.2, delay: 0.9, ease: EASE }}
        >
          <p className="eyebrow text-bone/60">{EVENT.edition}</p>
          <div className="flex flex-col items-center gap-2.5">
            <p className="display text-2xl tracking-[0.04em] md:text-3xl">{EVENT.date}</p>
            <p className="eyebrow text-bone/80 md:text-xs">{EVENT.location}</p>
          </div>
          <button
            onClick={openPass}
            className="eyebrow group mt-3 border border-bone/40 px-7 py-4 transition-colors duration-500 hover:border-blood hover:bg-blood"
          >
            GET YOUR PASS <span className="inline-block transition-transform duration-500 group-hover:translate-x-1">→</span>
          </button>
        </m.div>
      </m.div>

      {/* Corners */}
      <m.div
        className="gutter eyebrow absolute inset-x-0 bottom-5 z-10 flex items-end justify-between text-bone/40 md:bottom-8"
        initial={{ opacity: 0 }}
        animate={ready ? { opacity: 1 } : {}}
        transition={{ duration: 1.2, delay: 1.3 }}
      >
        <span>
          {EVENT.coordinates[0]}
          <br />
          {EVENT.coordinates[1]}
        </span>
        <span className="flex flex-col items-center gap-2">
          <span className="relative h-10 w-px overflow-hidden bg-bone/15">
            <span className="scroll-cue absolute inset-0 bg-bone/70" />
          </span>
        </span>
        <span className="text-right">
          {EVENT.dateShort}
          <br />
          <span className="text-blood">{nightsLeft()}</span>
        </span>
      </m.div>
    </section>
  )
}

// Loads only after the page is idle, never on data-saver, never with reduced motion.
function HeroVideo({ src }) {
  const [load, setLoad] = useState(false)
  const [playing, setPlaying] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced || navigator.connection?.saveData) return
    const start = () => setLoad(true)
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200))
    if (document.readyState === 'complete') idle(start)
    else window.addEventListener('load', () => idle(start), { once: true })
  }, [reduced])

  if (!load) return null
  return (
    <video
      src={src}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      onPlaying={() => setPlaying(true)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[2s] ${playing ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

// Two small red eyes that open in the dark, blink, and are gone.
function Eyes({ className = '', delay = '0s', small = false }) {
  return (
    <div aria-hidden="true" className={`eyes pointer-events-none absolute flex ${small ? 'gap-2' : 'gap-3'} ${className}`} style={{ animationDelay: delay }}>
      {[0, 1].map((i) => (
        <span
          key={i}
          className={`eye block rounded-[50%] bg-[radial-gradient(ellipse_at_center,#ff6a5a_0%,#e0101c_55%,#7a0008_100%)] ${small ? 'h-[4px] w-[8px]' : 'h-[6px] w-[12px]'}`}
          style={{ animationDelay: delay, rotate: i ? '-16deg' : '16deg' }}
        />
      ))}
    </div>
  )
}
