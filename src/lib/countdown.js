import { EVENT } from '../data/event'

// "31 NIGHTS LEFT" → "TOMORROW NIGHT" → "TONIGHT" → nothing once it's over.
export function nightsLeft(now = new Date()) {
  const start = new Date(EVENT.startsAt)
  if (Number.isNaN(start.getTime())) return null
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const n = Math.round((day(start) - day(now)) / 86400000)
  if (n > 1) return `${n} NIGHTS LEFT`
  if (n === 1) return 'TOMORROW NIGHT'
  if (n === 0) return 'TONIGHT'
  return null
}
