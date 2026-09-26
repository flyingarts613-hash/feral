import Lenis from 'lenis'

let lenis = null

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Smooth wheel scrolling on desktop only; touch keeps native momentum.
export function initSmoothScroll() {
  if (reduced() || !window.matchMedia('(pointer: fine)').matches) return () => {}
  lenis = new Lenis({ duration: 1.15, smoothWheel: true })
  let id
  const raf = (t) => {
    lenis.raf(t)
    id = requestAnimationFrame(raf)
  }
  id = requestAnimationFrame(raf)
  return () => {
    cancelAnimationFrame(id)
    lenis.destroy()
    lenis = null
  }
}

export function scrollToId(id) {
  const el = id === 'top' ? 0 : document.getElementById(id)
  if (el === null) return
  if (lenis) lenis.scrollTo(el, { duration: 1.6 })
  else if (el === 0) window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })
  else el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' })
}

export function lockScroll(lock) {
  if (lenis) lock ? lenis.stop() : lenis.start()
  document.documentElement.style.overflow = lock ? 'hidden' : ''
}
