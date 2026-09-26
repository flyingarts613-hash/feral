import { useRef } from 'react'
import { m, useReducedMotion, useScroll } from 'framer-motion'
import { useRange } from '../lib/motion'
import Img from './Img'

// Image that un-clips on entry and drifts slightly against the scroll.
export default function ParallaxImage({ src, alt = '', ratio = '4 / 5', sizes, className = '', strength = 12 }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useRange(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : [`-${strength}%`, `${strength}%`])

  return (
    <m.div
      ref={ref}
      className={`relative overflow-hidden bg-coal ${className}`}
      style={{ aspectRatio: ratio }}
      initial={{ clipPath: 'inset(14% 8% 14% 8%)' }}
      whileInView={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <m.div className="absolute inset-x-0 -inset-y-[14%]" style={{ y }}>
        <Img src={src} alt={alt} sizes={sizes} className="h-full w-full object-cover" />
      </m.div>
    </m.div>
  )
}
