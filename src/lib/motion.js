import { transform, useTransform } from 'framer-motion'

// useTransform(value, input, output) — but always computed in JS.
// Framer Motion hands array ranges on target-based useScroll to the browser's
// native ViewTimeline, which mis-maps sticky / pinned sections. A function
// transformer opts out of that.
export function useRange(value, input, output) {
  return useTransform(value, transform(input, output))
}
