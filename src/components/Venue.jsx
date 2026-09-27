import { useRef } from 'react'
import { m, useReducedMotion, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import { VENUE } from '../data/venue'
import { EVENT, isSet } from '../data/event'
import { Fade, Line } from './Reveal'
import Img from './Img'

// THE VENUE — one big frame that opens up as you arrive, with smaller shots
// drifting over it at different speeds.
export default function Venue() {
  const [a, b, c] = VENUE.heading
  return (
    <section id="venue" aria-label="The venue" className="relative overflow-hidden bg-ink pb-[14vh] pt-[10vh] md:pb-[22vh]">
      <div className="gutter mb-10 flex items-end justify-between md:mb-16">
        <div>
          <p className="eyebrow mb-5 flex items-center gap-4 text-bone/50">
            <span className="h-px w-8 bg-blood" />
            {VENUE.eyebrow}
          </p>
          <h2 className="display text-[21vw] leading-[0.82] md:text-[11.5vw]">
            <Line>{a}</Line>
            <Line delay={0.07} className="text-blood md:pl-[12vw]">
              {b}
            </Line>
            <Line delay={0.14} className="md:pl-[24vw]">
              {c}
            </Line>
          </h2>
        </div>
        <p className="eyebrow mb-2 hidden text-bone/40 md:block">(04)</p>
      </div>

      <MainFrame />
      <Details />

      <Fade className="gutter mt-[10vh] flex flex-col gap-6 md:mt-[14vh] md:flex-row md:items-end md:justify-between">
        <div>
          <p className="display text-[13vw] leading-[0.85] md:text-[6vw]">{EVENT.venue}</p>
          <p className="eyebrow mt-3 text-bone/60">
            {EVENT.area} <span className="mx-2 text-blood">/</span> {EVENT.coordinates.join('  ')}
          </p>
        </div>
        {isSet(VENUE.mapsUrl) && (
          <a href={VENUE.mapsUrl} target="_blank" rel="noreferrer" className="eyebrow link-line self-start pb-1 text-bone md:self-auto">
            GET DIRECTIONS ↗
          </a>
        )}
      </Fade>
    </section>
  )
}

function MainFrame() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'center center'] })
  const clip = useRange(p, [0, 1], reduced ? ['inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 0%)'] : ['inset(18% 22% 18% 22%)', 'inset(0% 0% 0% 0%)'])
  const scale = useRange(p, [0, 1], reduced ? [1, 1] : [1.35, 1])
  const { image, caption } = VENUE.main

  return (
    <m.div ref={ref} className="relative aspect-[4/5] w-full overflow-hidden bg-coal md:aspect-[21/10]" style={{ clipPath: clip }}>
      <m.div className="absolute inset-0" style={{ scale }}>
        <Img src={image} sizes="100vw" className="h-full w-full object-cover" />
      </m.div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-ink/40" />
      {caption && (
        <p className="gutter eyebrow absolute inset-x-0 top-6 flex justify-between text-bone/70 md:top-10">
          <span>{caption}</span>
          <span className="text-blood">●</span>
        </p>
      )}
    </m.div>
  )
}

// Three smaller photos: overlapping the main frame, each moving at its own speed.
const LAYOUT = [
  { box: 'left-[4%] top-0 w-[54%] md:left-[6%] md:w-[24%]', ratio: '4 / 5', speed: 90, tilt: -2 },
  { box: 'right-[4%] top-[34vw] w-[48%] md:right-auto md:left-[38%] md:top-[12vh] md:w-[22%]', ratio: '4 / 5', speed: 40, tilt: 1.5 },
  { box: 'left-[12%] top-[100vw] w-[78%] md:left-auto md:right-[5%] md:top-[2vh] md:w-[30%]', ratio: '4 / 3', speed: 130, tilt: -1 },
]

function Details() {
  return (
    <div className="relative -mt-[14vw] h-[165vw] md:-mt-[16vh] md:h-[64vh]">
      {VENUE.details.slice(0, 3).map((d, i) => (
        <Detail key={d.image} {...d} {...LAYOUT[i]} />
      ))}
    </div>
  )
}

function Detail({ image, caption, box, ratio, speed, tilt }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useRange(p, [0, 1], reduced ? [0, 0] : [speed, -speed])

  return (
    <m.figure ref={ref} className={`group absolute ${box}`} style={{ y }}>
      <m.div
        className="relative overflow-hidden bg-coal shadow-[0_30px_60px_rgba(0,0,0,0.6)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-2 group-hover:rotate-0"
        style={{ aspectRatio: ratio, rotate: `${tilt}deg` }}
        initial={{ clipPath: 'inset(100% 0% 0% 0%)' }}
        whileInView={{ clipPath: 'inset(0% 0% 0% 0%)' }}
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <Img src={image} sizes="(min-width: 768px) 30vw, 78vw" className="h-full w-full scale-105 object-cover transition-transform duration-[1.2s] group-hover:scale-100" />
        <div className="absolute inset-0 bg-ink/15 transition-colors duration-700 group-hover:bg-transparent" />
      </m.div>
      {caption && <figcaption className="eyebrow mt-3 text-bone/50">{caption}</figcaption>}
    </m.figure>
  )
}
