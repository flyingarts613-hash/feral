import { useRef, useState } from 'react'
import { m, useReducedMotion, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import { COSTUMES } from '../data/gallery'
import { Line } from './Reveal'
import Img from './Img'

// Layered, slightly rotated costume portraits — like prints thrown on a table.
// Hover (or tap) one to pull it to the front with a flash.
const PLACE = [
  { box: 'left-[2%] top-[4%] w-[52%] md:left-[4%] md:top-[6%] md:w-[24%]', tilt: -6, speed: 60 },
  { box: 'right-[2%] top-[0%] w-[50%] md:left-[27%] md:right-auto md:top-[24%] md:w-[22%]', tilt: 4, speed: 120 },
  { box: 'left-[6%] top-[46%] w-[48%] md:left-auto md:right-[26%] md:top-[2%] md:w-[23%]', tilt: 3, speed: 30 },
  { box: 'right-[4%] top-[52%] w-[50%] md:right-[3%] md:top-[30%] md:w-[22%]', tilt: -4, speed: 90 },
]

export default function Costumes() {
  const [front, setFront] = useState(null)
  return (
    <section id="costumes" aria-label="Costumes" className="relative overflow-hidden bg-ink pb-[12vh] pt-[12vh] md:pt-[16vh]">
      <div className="gutter relative z-20 flex items-end justify-between">
        <h2 className="display text-[19vw] leading-[0.82] md:text-[10vw]">
          <Line>COME AS</Line>
          <Line delay={0.07} className="md:pl-[10vw]">
            SOMEONE
          </Line>
          <Line delay={0.14} className="text-blood md:pl-[20vw]">
            ELSE.
          </Line>
        </h2>
        <p className="eyebrow mb-2 hidden text-bone/40 md:block">(03)</p>
      </div>

      <div className="relative mx-auto -mt-[4vh] h-[150vw] max-w-[1600px] md:-mt-[16vh] md:h-[92vh]">
        {COSTUMES.slice(0, 4).map((c, i) => (
          <Card key={c.image} {...c} {...PLACE[i]} i={i} front={front === i} onFront={() => setFront(i)} />
        ))}
      </div>
    </section>
  )
}

function Card({ image, label, box, tilt, speed, i, front, onFront }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useRange(p, [0, 1], reduced ? [0, 0] : [speed, -speed])
  const [flash, setFlash] = useState(0)

  const pick = () => {
    onFront()
    setFlash((n) => n + 1)
  }

  return (
    <m.figure
      ref={ref}
      className={`absolute ${box} ${front ? 'z-30' : ''}`}
      style={{ y, zIndex: front ? 30 : 10 + i }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && pick()}
      onClick={pick}
    >
      <m.div
        className="relative aspect-[3/4] cursor-pointer overflow-hidden bg-coal shadow-[0_40px_80px_rgba(0,0,0,0.7)]"
        initial={{ opacity: 0, y: 60, rotate: tilt }}
        whileInView={{ opacity: 1, y: 0 }}
        animate={{ rotate: front ? 0 : tilt, scale: front ? 1.05 : 1 }}
        viewport={{ once: true, margin: '0px 0px -8% 0px' }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.05 * i }}
      >
        <Img src={image} alt={label} sizes="(min-width: 768px) 24vw, 52vw" className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
        {!reduced && (
          <m.div
            key={flash}
            className="pointer-events-none absolute inset-0 bg-[#fffaf4]"
            initial={{ opacity: flash ? 0.7 : 0 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
        <figcaption className="eyebrow absolute bottom-3 left-3 text-bone/85 md:bottom-4 md:left-4">{label}</figcaption>
      </m.div>
    </m.figure>
  )
}
