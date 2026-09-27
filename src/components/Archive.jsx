import { useLayoutEffect, useRef, useState } from 'react'
import { m, useReducedMotion, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import { ARCHIVE } from '../data/archive'
import { EVENT } from '../data/event'
import { imageProps } from '../lib/image'
import { Line } from './Reveal'
import Img from './Img'

const ratioOf = (src) => {
  const { width, height } = imageProps(src)
  return width && height ? width / height : 4 / 5
}

// Desktop: the page pins and the strip slides sideways as you scroll.
// Touch / reduced motion: a native swipeable strip.
export default function Archive() {
  const reduced = useReducedMotion()
  const [pinned, setPinned] = useState(false)

  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (pointer: fine)')
    const set = () => setPinned(mq.matches && !reduced)
    set()
    mq.addEventListener('change', set)
    return () => mq.removeEventListener('change', set)
  }, [reduced])

  return pinned ? <Pinned /> : <Swipe />
}

function Heading() {
  return (
    <div className="gutter flex items-end justify-between">
      <h2 className="display text-[25vw] leading-[0.8] md:text-[11vw]">
        <Line>THE ARCHIVE.</Line>
      </h2>
      <p className="eyebrow mb-2 hidden text-bone/40 md:block">(05)</p>
    </div>
  )
}

function Frame({ item, width, height }) {
  const ratio = ratioOf(item.image)
  return (
    <figure className="shrink-0" style={{ width }}>
      <div className="relative overflow-hidden bg-coal" style={height ? { height } : { aspectRatio: ratio }}>
        <Img src={item.image} alt={item.title} sizes="(min-width: 768px) 50vw, 80vw" className="h-full w-full object-cover grayscale-[0.25]" />
      </div>
      <figcaption className="eyebrow mt-4 text-bone/60">{item.title}</figcaption>
    </figure>
  )
}

function Pinned() {
  const section = useRef(null)
  const track = useRef(null)
  const [distance, setDistance] = useState(0)

  useLayoutEffect(() => {
    const measure = () => setDistance(Math.max(0, track.current.scrollWidth - window.innerWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(track.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] })
  const x = useRange(scrollYProgress, [0.05, 0.95], [0, -distance])
  const bar = useRange(scrollYProgress, [0.05, 0.95], [0, 1])

  return (
    <section id="archive" ref={section} aria-label="The archive" className="relative bg-ink" style={{ height: `calc(100vh + ${distance}px)` }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center gap-[6vh] overflow-hidden pt-16">
        <Heading />
        <m.ul ref={track} style={{ x }} className="gutter flex w-max items-start gap-[3vw] will-change-transform">
          {ARCHIVE.map((item) => (
            <li key={item.image}>
              <Frame item={item} height="52vh" width={`${52 * ratioOf(item.image)}vh`} />
            </li>
          ))}
          <li className="flex h-[52vh] w-[22vw] items-end">
            <p className="eyebrow text-bone/30">MORE AFTER {EVENT.dateShort.slice(0, 5)}</p>
          </li>
        </m.ul>
        <div className="gutter">
          <div className="h-px w-full bg-bone/10">
            <m.div className="h-px origin-left bg-bone/60" style={{ scaleX: bar }} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Swipe() {
  return (
    <section id="archive" aria-label="The archive" className="relative bg-ink pb-[14vh] pt-[8vh]">
      <Heading />
      <p className="eyebrow gutter mb-6 mt-8 flex justify-between text-bone/40">
        <span>{ARCHIVE.length} FRAMES</span>
        <span>SWIPE →</span>
      </p>
      <ul className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 md:gap-6 md:scroll-px-8 md:px-8">
        {ARCHIVE.map((item) => (
          <li key={item.image} className="snap-start">
            <Frame item={item} width={`min(${ratioOf(item.image) >= 1 ? 88 : 72}vw, ${58 * ratioOf(item.image)}svh)`} />
          </li>
        ))}
        <li aria-hidden="true" className="w-1 shrink-0" />
      </ul>
    </section>
  )
}
