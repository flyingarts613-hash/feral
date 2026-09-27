import { EVENT } from '../data/event'
import { asset } from './image'
import LOOPS from '../data/music-loop.json'

// Background music.
//
// Browsers only allow sound after the visitor interacts, and Safari only if the
// audio is switched on *inside* that tap/click — not after an await. So:
//   1. the track is fetched + decoded ahead of time (no AudioContext needed),
//   2. on the first tap/click/key the AudioContext is created and resumed
//      synchronously, then playback starts on the already-decoded buffer,
//   3. volume only ever moves through a GainNode, so fades work everywhere.
// iOS mutes Web Audio on the silent switch unless the page asks for "playback".

const KEY = 'feral-sound'
const FADE_IN = 3.5
const FADE_OUT = 0.9

let ctx = null
let gain = null
let source = null
let startedAt = 0
let decoded = null
let fileBytes = 0
let decoding = null
let state = 'idle' // idle → waiting (blocked until a tap) → on | off
const listeners = new Set()

const set = (s) => {
  state = s
  listeners.forEach((fn) => fn(s))
}
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn))
export const getState = () => state
export const available = () => Boolean(EVENT.music?.src) && Boolean(window.AudioContext || window.webkitAudioContext)

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

// Fetch + decode early so the first tap starts sound instantly.
export function prepare() {
  if (decoding || !available()) return decoding
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  decoding = fetch(asset(EVENT.music.src))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`music ${r.status}`))))
    .then((data) => ((fileBytes = data.byteLength), data))
    .then((data) => new Promise((res, rej) => new Offline(2, 1, 44100).decodeAudioData(data, res, rej)))
    .then((buf) => (decoded = buf))
    .catch(() => null)
  if (state === 'idle') set(wantsSound() ? 'waiting' : 'off')
  return decoding
}

// Must be called synchronously from a user gesture (or when sound is allowed).
function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!ctx) {
    ctx = new AC()
    gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(ctx.destination)
  }
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'
  } catch {
    /* not supported */
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {})
  // A silent tick inside the gesture fully unlocks older iOS.
  const tick = ctx.createBufferSource()
  tick.buffer = ctx.createBuffer(1, 1, 22050)
  tick.connect(ctx.destination)
  tick.start(0)
}

// Exact loop points + tempo recorded for the generated track. Any other file
// at the same path (e.g. your real MP3) is looped end to end.
const known = () => {
  const k = LOOPS[EVENT.music.src]
  return k && k.bytes === fileBytes ? k : null
}
function loopPoints(buf) {
  const k = known()
  return k && k.end <= buf.duration ? [k.start, k.end] : [0, buf.duration]
}

function fadeTo(value, seconds) {
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(value, now + seconds)
}

async function begin() {
  const buf = decoded || (await prepare())
  if (!buf || !ctx) return false
  if (!source) {
    const [a, b] = loopPoints(buf)
    source = ctx.createBufferSource()
    source.buffer = buf
    source.loop = true
    source.loopStart = a
    source.loopEnd = b
    source.connect(gain)
    source.start(0, a)
    startedAt = ctx.currentTime
  }
  if (ctx.state !== 'running') await ctx.resume().catch(() => {})
  if (ctx.state !== 'running') return false
  fadeTo(EVENT.music.volume ?? 0.25, FADE_IN)
  set('on')
  return true
}

// Called from a tap/click/key handler.
export function play() {
  if (!available()) return Promise.resolve(false)
  unlock()
  remember(true)
  return begin()
}

export function stop({ persist = true } = {}) {
  if (persist) {
    remember(false)
    set('off')
  } else if (state === 'on') set('waiting')
  if (!ctx) return
  fadeTo(0, FADE_OUT)
  setTimeout(() => state !== 'on' && ctx.suspend(), FADE_OUT * 1000 + 60)
}

// Background tab: fade out; coming back: fade in again.
export function pauseForHidden() {
  if (state !== 'on') return false
  stop({ persist: false })
  return true
}
export function resumeFromHidden() {
  if (!ctx) return
  ctx.resume().then(() => ctx.state === 'running' && begin(), () => {})
}

// Where we are in the bar, for visuals that pulse on the beat (0–1, or null).
export function beatPhase() {
  const bpm = known()?.bpm
  if (state !== 'on' || !ctx || !bpm) return null
  const beats = ((ctx.currentTime - startedAt) * bpm) / 60
  return beats - Math.floor(beats)
}
