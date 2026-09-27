import { useEffect, useRef } from 'react'
import { animate, m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import { HORROR } from '../data/content'
import { Fade, Line } from './Reveal'
import Img from './Img'
import ParallaxImage from './ParallaxImage'

export default function HorrorWorld() {
  const [main, second] = HORROR.images
  return (
    <section id="dark" aria-label="The horror room" className="relative overflow-hidden bg-ink pb-[18vh] pt-[10vh] md:pb-[26vh]">
      <div className="gutter mb-10 flex items-end justify-between md:mb-16">
        <h2 className="display text-[27vw] leading-[0.8] md:text-[15vw]">
          <Line>ENTER</Line>
          <Line delay={0.08} className="md:pl-[20vw]">
            THE DARK<span className="text-blood">.</span>
          </Line>
        </h2>
        <p className="eyebrow mb-2 hidden text-bone/40 md:block">(04)</p>
      </div>

      <Flashlight src={main} />

      <div className="gutter mt-[12vh] grid grid-cols-12 items-end gap-y-12 md:mt-[18vh]">
        <Fade className="col-span-12 md:col-span-5 md:col-start-2 md:pb-[8vh]">
          <p className="eyebrow mb-6 text-bone/40">THE HORROR ROOM</p>
          <ul className="display text-[11vw] leading-[0.95] md:text-[4.6vw]">
            {HORROR.lines.map((line, i) => (
              <li key={line} className={i === HORROR.lines.length - 1 ? 'text-blood' : ''}>
                <Line delay={i * 0.12}>{line}</Line>
              </li>
            ))}
          </ul>
        </Fade>
        {second && (
          <div className="col-span-10 col-start-3 md:col-span-4 md:col-start-8">
            <ParallaxImage src={second} ratio="3 / 4" sizes="(min-width: 768px) 34vw, 84vw" />
          </div>
        )}
      </div>
    </section>
  )
}

// The image sits almost black; a soft beam of light follows the cursor
// (or drifts on its own on touch screens) and reveals what's in the room.
function Flashlight({ src }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const rawX = useMotionValue(50)
  const rawY = useMotionValue(50)
  const x = useSpring(rawX, { stiffness: 60, damping: 20 })
  const y = useSpring(rawY, { stiffness: 60, damping: 20 })
  const mask = useMotionTemplate`radial-gradient(circle at ${x}% ${y}%, #000 0%, rgba(0,0,0,.55) 14%, transparent 34%)`

  useEffect(() => {
    if (reduced) return
    const fine = window.matchMedia('(pointer: fine)').matches
    if (fine) return
    // Touch: wander slowly around the frame.
    const cx = animate(rawX, [50, 30, 62, 44, 70, 50], { duration: 16, repeat: Infinity, ease: 'easeInOut' })
    const cy = animate(rawY, [50, 40, 58, 64, 42, 50], { duration: 13, repeat: Infinity, ease: 'easeInOut' })
    return () => {
      cx.stop()
      cy.stop()
    }
  }, [reduced, rawX, rawY])

  const onMove = (e) => {
    if (reduced || e.pointerType !== 'mouse') return
    const r = ref.current.getBoundingClientRect()
    rawX.set(((e.clientX - r.left) / r.width) * 100)
    rawY.set(((e.clientY - r.top) / r.height) * 100)
  }

  return (
    <m.div
      ref={ref}
      onPointerMove={onMove}
      className="relative aspect-[4/5] w-full cursor-crosshair overflow-hidden bg-ink md:aspect-[21/9]"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '0px 0px -15% 0px' }}
      transition={{ duration: 1.8 }}
    >
      <Img src={src} sizes="100vw" className="absolute inset-0 h-full w-full object-cover brightness-[0.28] grayscale-[0.4]" />
      <m.div
        className="absolute inset-0"
        style={reduced ? { opacity: 0.6 } : { WebkitMaskImage: mask, maskImage: mask }}
      >
        <Img src={src} sizes="100vw" className="h-full w-full object-cover brightness-125 contrast-110" />
      </m.div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink via-transparent to-ink opacity-80" />
      <p className="eyebrow pointer-events-none absolute bottom-5 left-4 text-bone/40 md:left-8">
        <span className="hidden md:inline">MOVE TO LOOK AROUND</span>
        <span className="md:hidden">SOMETHING IS IN THERE</span>
      </p>
    </m.div>
  )
}
