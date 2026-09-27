import { EVENT } from '../data/event'
import { asset } from './image'
import LOOPS from '../data/music-loop.json'

// Background music on the Web Audio API: sample-accurate looping (no MP3 gap),
// smooth gain fades, and nothing is created until the browser allows sound.

const KEY = 'feral-sound'
const FADE_IN = 3
const FADE_OUT = 0.8

let ctx = null
let gain = null
let source = null
let bufferPromise = null
let playing = false
const listeners = new Set()

const emit = () => listeners.forEach((fn) => fn(playing))
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn))
export const isPlaying = () => playing

export function wantsSound() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}
function remember(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* private mode — fine */
  }
}

// Fetch the track early so it's ready the moment sound is allowed.
export function preload() {
  if (bufferPromise || !EVENT.music?.src || navigator.connection?.saveData) return
  bufferPromise = fetch(asset(EVENT.music.src))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
    .catch(() => null)
}

// Exact loop points measured when the track was made (skips MP3 padding);
// a replacement track without an entry simply loops end to end.
function loopPoints(buf) {
  const known = LOOPS[EVENT.music.src]
  return known ? [known.start, known.end] : [0, buf.duration]
}

export async function play() {
  if (playing) return true
  preload()
  const data = await bufferPromise
  if (!data) return false
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      gain = ctx.createGain()
      gain.gain.value = 0
      gain.connect(ctx.destination)
      const buf = await ctx.decodeAudioData(data.slice(0))
      const [start, end] = loopPoints(buf)
      source = ctx.createBufferSource()
      source.buffer = buf
      source.loop = true
      source.loopStart = start
      source.loopEnd = end
      source.connect(gain)
      source.start(0, start)
    }
    await ctx.resume()
    if (ctx.state !== 'running') return false
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(EVENT.music.volume ?? 0.22, now + FADE_IN)
    playing = true
    remember(true)
    emit()
    return true
  } catch {
    return false
  }
}

export function stop({ persist = true } = {}) {
  if (persist) remember(false)
  if (!ctx || !playing) return
  playing = false
  emit()
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(0, now + FADE_OUT)
  setTimeout(() => !playing && ctx.suspend(), FADE_OUT * 1000 + 50)
}
