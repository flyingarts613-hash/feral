import { m } from 'framer-motion'

// Masked line reveal: text slides up from behind its own baseline.
// (The wrapper is what's observed — the moving span starts fully clipped.)
export function Line({ children, delay = 0, className = '' }) {
  return (
    <m.span
      className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
    >
      <m.span
        className={`block will-change-transform ${className}`}
        variants={{ hidden: { y: '120%' }, show: { y: '0%' } }}
        transition={{ duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </m.span>
    </m.span>
  )
}

// Plain fade-up for small type.
export function Fade({ children, delay = 0, className = '', y = 14 }) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </m.div>
  )
}
