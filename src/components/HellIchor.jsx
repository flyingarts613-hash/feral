import { useRef } from 'react'
import { m, useReducedMotion, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import { HELL_ICHOR as H } from '../data/experiences'
import { Fade, Line } from './Reveal'
import Img from './Img'

// HELL ICHOR — a signature-product reveal: the lights come up on the drink,
// it drifts slower than the page, a seal turns beside it, gold on black.
export default function HellIchor() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const imgY = useRange(p, [0, 1], reduced ? ['0%', '0%'] : ['-8%', '8%'])
  const detailY = useRange(p, [0, 1], reduced ? ['0%', '0%'] : ['30%', '-30%'])
  const glow = useRange(p, [0.15, 0.45], [0.2, 1])
  const [first, second] = H.name.split(' ')

  return (
    <section id="hell-ichor" ref={ref} aria-label={H.name} className="relative overflow-hidden bg-[#070404] pb-[14vh] pt-[14vh] md:pb-[20vh] md:pt-[18vh]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_65%_40%,rgba(120,10,20,0.35),transparent_70%)]" />
      <Embers />

      <div className="gutter relative grid grid-cols-12 gap-y-12 md:gap-x-8">
        {/* title */}
        <div className="col-span-12 md:col-span-6 md:row-start-1">
          <p className="eyebrow mb-6 flex items-center gap-4 text-[#c9a15b]">
            <span className="h-px w-8 bg-[#c9a15b]" />
            THE SIGNATURE <span className="text-bone/30">(02)</span>
          </p>
          <h2 className="display text-[30vw] leading-[0.8] md:text-[13vw]">
            <Line className="gold">{first}</Line>
            <Line delay={0.08} className="gold md:pl-[5vw]">
              {second}
            </Line>
          </h2>
          <Fade delay={0.2}>
            <p className="serif mt-6 text-3xl text-bone/85 md:text-5xl">{H.tagline}</p>
          </Fade>
        </div>

        {/* the drink */}
        <div className="relative col-span-12 md:col-span-5 md:col-start-8 md:row-span-2 md:row-start-1">
          <m.div className="absolute -inset-[12%] rounded-full bg-[radial-gradient(closest-side,rgba(200,25,40,0.55),transparent)] blur-3xl" style={{ opacity: glow }} aria-hidden="true" />
          <m.div
            className="relative aspect-[4/5] overflow-hidden bg-coal shadow-[0_60px_120px_rgba(0,0,0,0.85)]"
            initial={{ clipPath: 'inset(100% 0% 0% 0%)', filter: 'brightness(0.2)' }}
            whileInView={{ clipPath: 'inset(0% 0% 0% 0%)', filter: 'brightness(1)' }}
            viewport={{ once: true, margin: '0px 0px -15% 0px' }}
            transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <m.div className="absolute inset-x-0 -inset-y-[10%]" style={{ y: imgY }}>
              <Img src={H.image} alt={`${H.name}, the signature drink of FERAL`} sizes="(min-width: 768px) 40vw, 92vw" className="h-full w-full object-cover" />
            </m.div>
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#c9a15b]/25" />
          </m.div>

          <Seal label={H.label} />

          {H.detail && (
            <m.div className="absolute -bottom-[10%] -left-[6%] w-[46%] md:-left-[22%] md:w-[44%]" style={{ y: detailY }}>
              <m.div
                className="aspect-[4/3] overflow-hidden border border-[#c9a15b]/30 shadow-[0_30px_60px_rgba(0,0,0,0.8)]"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <Img src={H.detail} alt="" sizes="(min-width: 768px) 18vw, 44vw" className="h-full w-full object-cover" />
              </m.div>
            </m.div>
          )}
        </div>

        {/* the story */}
        <div className="col-span-12 mt-10 md:col-span-5 md:row-start-2 md:mt-0 md:self-end">
          {H.story.map((s, i) => (
            <Fade key={i} delay={i * 0.12}>
              <p className={`mb-5 max-w-[30rem] ${i === 0 ? 'text-lg leading-relaxed text-bone/70 md:text-xl' : 'text-lg text-bone md:text-xl'}`}>{s}</p>
            </Fade>
          ))}
          <ul className="display mt-10 text-[13vw] leading-[0.92] md:text-[5.2vw]">
            {H.beats.map((b, i) => (
              <li key={b}>
                <Line delay={i * 0.1} className={i === H.beats.length - 1 ? 'gold' : ''}>
                  {b}
                </Line>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* the closer */}
      <Fade className="gutter relative mt-[12vh] text-center md:mt-[16vh]">
        <p className="serif text-3xl text-bone/70 md:text-5xl">{H.closer[0]}</p>
        <p className="serif mt-2 text-5xl text-[#e0283c] md:text-8xl">{H.closer[1]}</p>
      </Fade>
    </section>
  )
}

// A slowly turning wax-seal style badge with the label running round it.
function Seal({ label }) {
  const text = `${label} · ${label} · `
  return (
    <div className="absolute -right-3 -top-8 z-10 h-28 w-28 md:-right-10 md:-top-12 md:h-40 md:w-40" aria-label={label}>
      <svg viewBox="0 0 200 200" className="seal-spin h-full w-full" aria-hidden="true">
        <defs>
          <path id="seal-ring" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <circle cx="100" cy="100" r="98" fill="#0b0606" stroke="#c9a15b" strokeOpacity="0.5" />
        <text fill="#e3c68a" fontSize="15.5" letterSpacing="4.2" fontFamily="Inter Variable, Inter, sans-serif" fontWeight="600">
          <textPath href="#seal-ring">{text}</textPath>
        </text>
      </svg>
      <span className="display absolute inset-0 grid place-items-center text-2xl text-[#e0283c] md:text-3xl" aria-hidden="true">
        F
      </span>
    </div>
  )
}

// Embers drifting up through the section.
function Embers() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className="ember absolute bottom-0 block h-1 w-1 rounded-full bg-[#ffb070]"
          style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 1.7) % 11}s`, animationDuration: `${9 + (i % 5) * 2}s` }}
        />
      ))}
    </div>
  )
}
