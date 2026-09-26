import { useRef } from 'react'
import { m, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import { MANIFESTO } from '../data/content'

const WORDS = MANIFESTO.flatMap((line, l) => line.map((w, i) => ({ w, l, i })))

// Words light up one by one as the section scrolls past.
export default function Manifesto() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  return (
    <section ref={ref} aria-label="Manifesto" className="relative h-[240svh] bg-ink">
      <div className="gutter sticky top-0 flex h-[100svh] flex-col justify-center">
        <p className="eyebrow absolute top-24 text-bone/40 md:top-28">(01) — MANIFESTO</p>

        <h2 className="display text-[15.5vw] leading-[0.88] md:text-[9.6vw] md:leading-[0.86]">
          <span className="sr-only">{MANIFESTO.flat().join(' ').replace('*', '')}</span>
          <span aria-hidden="true">
            {MANIFESTO.map((line, l) => (
              <span key={l} className={`block ${l >= 2 ? 'md:pl-[18vw]' : ''}`}>
                {line.map((w, i) => {
                  const n = WORDS.findIndex((x) => x.l === l && x.i === i)
                  return <Word key={i} word={w} n={n} progress={scrollYProgress} />
                })}
              </span>
            ))}
          </span>
        </h2>
      </div>
    </section>
  )
}

function Word({ word, n, progress }) {
  const accent = word.startsWith('*')
  const text = accent ? word.slice(1) : word
  const step = 0.72 / WORDS.length
  const start = 0.08 + n * step
  const opacity = useRange(progress, [start, start + step * 1.6], [0.08, 1])
  const blur = useRange(progress, [start, start + step * 1.6], ['blur(6px)', 'blur(0px)'])

  return (
    <m.span style={{ opacity, filter: blur }} className={`mr-[0.18em] inline-block ${accent ? 'text-blood' : ''}`}>
      {text}
    </m.span>
  )
}
