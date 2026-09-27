// Composes FERAL's placeholder soundtrack: a dark 124 BPM Halloween party loop.
// Kick, rolling offbeat bass, claps, hats, minor-key stabs, a filter that
// breathes open and shut, and one music-box line for the Halloween edge.
// Renders in Chromium's OfflineAudioContext, folds the reverb tail back to the
// start so the loop is seamless, encodes MP3, and records the exact loop points.
//
//   node scripts/generate-music.mjs      → public/audio/feral.mp3
//
// To use a real track instead, just overwrite public/audio/feral.mp3.
// (The loop points below are only applied while the file is this generated one.)

import { chromium } from 'playwright-core'
import { Mp3Encoder } from '@breezystack/lamejs'
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = new URL('../public/audio/', import.meta.url).pathname
const BPM = 124

function compose(BPM) {
  const SR = 44100
  const BEAT = 60 / BPM
  const BAR = BEAT * 4
  const BARS = 32
  const LOOP = Math.round(BAR * BARS * SR) / SR
  const TAIL = 6
  const ctx = new OfflineAudioContext(2, Math.ceil((LOOP + TAIL) * SR), SR)

  let seed = 13
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

  // Reverb
  const rev = ctx.createConvolver()
  const irLen = SR * 3
  const ir = ctx.createBuffer(2, irLen, SR)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < irLen; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / irLen, 4)
  }
  rev.buffer = ir
  const revOut = ctx.createGain()
  revOut.gain.value = 0.4

  // Master: a low-pass that breathes open (bar 8) and shut (bar 32) — the
  // feeling of doors opening onto the floor — then glue compression.
  const master = ctx.createBiquadFilter()
  master.type = 'lowpass'
  master.Q.value = 0.6
  master.frequency.setValueAtTime(1100, 0)
  master.frequency.exponentialRampToValueAtTime(14000, BAR * 8)
  master.frequency.setValueAtTime(14000, BAR * 24)
  master.frequency.exponentialRampToValueAtTime(1100, BAR * 32)
  master.frequency.setValueAtTime(1100, LOOP + TAIL)
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.ratio.value = 4
  comp.attack.value = 0.01
  comp.release.value = 0.15
  master.connect(comp).connect(ctx.destination)
  rev.connect(revOut).connect(master)

  const bus = (dry, wet) => {
    const g = ctx.createGain()
    g.gain.value = dry
    g.connect(master)
    if (wet) {
      const w = ctx.createGain()
      w.gain.value = wet
      g.connect(w).connect(rev)
    }
    return g
  }
  const noise = (() => {
    const b = ctx.createBuffer(1, SR, SR)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1
    return b
  })()
  const env = (g, t, peak, a, d) => {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
  }

  // Sidechain-style duck applied to bass + stabs + pad on every kick.
  const duck = ctx.createGain()
  duck.connect(bus(1, 0))
  for (let i = 0; i < BARS * 4 + 12; i++) {
    const t = i * BEAT
    duck.gain.setValueAtTime(0.35, t)
    duck.gain.linearRampToValueAtTime(1, t + BEAT * 0.6)
  }

  // Kick
  const kickBus = bus(1, 0)
  for (let i = 0; i < BARS * 4; i++) {
    const t = i * BEAT
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(46, t + 0.09)
    env(g, t, 1, 0.003, 0.34)
    o.connect(g).connect(kickBus)
    o.start(t)
    o.stop(t + 0.4)
    const c = ctx.createBufferSource()
    c.buffer = noise
    const cg = ctx.createGain()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    env(cg, t, 0.12, 0.001, 0.012)
    c.connect(hp).connect(cg).connect(kickBus)
    c.start(t, r() * 0.5)
    c.stop(t + 0.03)
  }

  // Harmony: Dm · B♭ · Gm · A (2 bars each)
  const ROOTS = [38, 34, 31, 33]
  const CHORDS = [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]]

  // Rolling offbeat bass
  const bassF = ctx.createBiquadFilter()
  bassF.type = 'lowpass'
  bassF.frequency.value = 420
  bassF.Q.value = 4
  bassF.connect(duck)
  for (let bar = 0; bar < BARS; bar++) {
    const root = ROOTS[Math.floor(bar / 2) % 4]
    for (let b = 0; b < 4; b++) {
      for (const [off, note] of [[0.5, root], [0.75, b === 3 ? root + 12 : root]]) {
        const t = bar * BAR + (b + off) * BEAT
        for (const [type, det, amp] of [['sawtooth', 0, 0.22], ['sine', 0, 0.35]]) {
          const o = ctx.createOscillator()
          o.type = type
          o.frequency.value = hz(note)
          o.detune.value = det
          const g = ctx.createGain()
          env(g, t, amp, 0.004, BEAT * 0.22)
          o.connect(g).connect(bassF)
          o.start(t)
          o.stop(t + BEAT * 0.3)
        }
      }
    }
  }

  // Claps on 2 and 4
  const clapBus = bus(0.5, 0.35)
  const clapF = ctx.createBiquadFilter()
  clapF.type = 'bandpass'
  clapF.frequency.value = 1400
  clapF.Q.value = 1.2
  clapF.connect(clapBus)
  for (let bar = 0; bar < BARS; bar++) {
    for (const b of [1, 3]) {
      const t = bar * BAR + b * BEAT
      for (const d of [0, 0.011, 0.022]) {
        const s = ctx.createBufferSource()
        s.buffer = noise
        const g = ctx.createGain()
        env(g, t + d, d === 0.022 ? 0.9 : 0.6, 0.001, d === 0.022 ? 0.16 : 0.012)
        s.connect(g).connect(clapF)
        s.start(t + d, r() * 0.5)
        s.stop(t + d + 0.2)
      }
    }
  }

  // Hats: 16ths with accents, open hat on the offbeat
  const hatBus = bus(0.18, 0.08)
  const hatF = ctx.createBiquadFilter()
  hatF.type = 'highpass'
  hatF.frequency.value = 8000
  hatF.connect(hatBus)
  for (let i = 0; i < BARS * 16; i++) {
    const t = i * (BEAT / 4)
    const open = i % 4 === 2
    const s = ctx.createBufferSource()
    s.buffer = noise
    const g = ctx.createGain()
    env(g, t, open ? 0.55 : [0.35, 0.12, 0, 0.18][i % 4] || 0.001, 0.001, open ? 0.14 : 0.03)
    s.connect(g).connect(hatF)
    s.start(t, r() * 0.5)
    s.stop(t + 0.18)
  }

  // Dark stabs: minor chords on the "and" of 2, through a resonant filter
  const stabF = ctx.createBiquadFilter()
  stabF.type = 'lowpass'
  stabF.frequency.value = 1800
  stabF.Q.value = 6
  const stabBus = ctx.createGain()
  stabBus.gain.value = 0.55
  stabF.connect(stabBus).connect(duck)
  const stabRev = ctx.createGain()
  stabRev.gain.value = 0.5
  stabF.connect(stabRev).connect(rev)
  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORDS[Math.floor(bar / 2) % 4]
    for (const b of bar % 2 ? [1.5, 3.5] : [1.5]) {
      const t = bar * BAR + b * BEAT
      for (const n of chord)
        for (const det of [-12, 12]) {
          const o = ctx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = hz(n - 12)
          o.detune.value = det
          const g = ctx.createGain()
          env(g, t, 0.07, 0.005, 0.22)
          o.connect(g).connect(stabF)
          o.start(t)
          o.stop(t + 0.3)
        }
    }
  }

  // Low pad underneath everything
  const padF = ctx.createBiquadFilter()
  padF.type = 'lowpass'
  padF.frequency.value = 900
  const padBus = ctx.createGain()
  padBus.gain.value = 0.5
  padF.connect(padBus).connect(duck)
  for (let seg = 0; seg < BARS / 2; seg++) {
    const t = seg * BAR * 2
    const len = BAR * 2
    for (const n of CHORDS[seg % 4])
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = hz(n - 12)
        o.detune.value = det
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.022, t + 0.8)
        g.gain.setValueAtTime(0.022, t + len - 0.2)
        g.gain.linearRampToValueAtTime(0, t + len + 0.6)
        o.connect(g).connect(padF)
        o.start(t)
        o.stop(t + len + 0.7)
      }
  }

  // Music box — the Halloween wink, every other 8 bars
  const boxBus = bus(0.05, 0.6)
  const MOTIF = [74, 77, 81, 80, 77, 74, 73, 74]
  for (let bar = 8; bar < BARS; bar += 16) {
    MOTIF.forEach((note, i) => {
      const t = (bar + i) * BAR + BEAT * 2
      for (const [mult, amp] of [[1, 0.3], [2.01, 0.07], [3.98, 0.03]]) {
        const o = ctx.createOscillator()
        o.frequency.value = hz(note) * mult
        const g = ctx.createGain()
        env(g, t, amp, 0.005, 1.8)
        o.connect(g).connect(boxBus)
        o.start(t)
        o.stop(t + 1.9)
      }
    })
  }

  // Noise swell into every 8th bar
  const sweepBus = bus(0.12, 0.3)
  for (let bar = 8; bar <= BARS; bar += 8) {
    const t = bar * BAR - BAR
    const s = ctx.createBufferSource()
    s.buffer = noise
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 3
    f.frequency.setValueAtTime(500, t)
    f.frequency.exponentialRampToValueAtTime(7000, t + BAR)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + BAR * 0.98)
    g.gain.linearRampToValueAtTime(0.0001, t + BAR + 0.05)
    s.connect(f).connect(g).connect(sweepBus)
    s.start(t)
    s.stop(t + BAR + 0.1)
  }

  return ctx.startRendering().then((buf) => {
    const L = Math.round(LOOP * SR)
    const out = []
    let peak = 0
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      const o = new Float32Array(L)
      o.set(d.subarray(0, L))
      for (let i = L; i < d.length; i++) o[i - L] += d[i] // fold the tail → seamless
      for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(o[i]))
      out.push(o)
    }
    const norm = 0.89 / peak
    return out.map((ch) => Array.from(ch, (v) => Math.round(Math.max(-1, Math.min(1, v * norm)) * 32767)))
  })
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
const [L, R] = await page.evaluate(compose, BPM)

// Append the loop's first second after its end: the MP3 encoder pads/drops a
// frame at the very end, so the loop point must sit inside real audio.
const LOOP_SAMPLES = L.length
const enc = new Mp3Encoder(2, 44100, 96)
const left = Int16Array.from([...L, ...L.slice(0, 44100)])
const right = Int16Array.from([...R, ...R.slice(0, 44100)])
const chunks = []
for (let i = 0; i < left.length; i += 1152) {
  const b = enc.encodeBuffer(left.subarray(i, i + 1152), right.subarray(i, i + 1152))
  if (b.length) chunks.push(Buffer.from(b))
}
chunks.push(Buffer.from(enc.flush()))
await mkdir(OUT, { recursive: true })
const mp3 = Buffer.concat(chunks)
await writeFile(OUT + 'feral.mp3', mp3)
console.log(`✓ audio/feral.mp3  ${(mp3.length / 1024).toFixed(0)} KB, ${(left.length / 44100).toFixed(1)}s`)

// MP3 adds encoder padding at the start. Find exactly how much by decoding the
// file and lining it up with the original render, so the site loops it seamlessly.
const start = await page.evaluate(
  async ([b64, ref]) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const buf = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(bytes.buffer)
    const d = buf.getChannelData(0)
    let best = 0
    let bestScore = -Infinity
    for (let lag = 0; lag < 4000; lag++) {
      let sc = 0
      for (let i = 0; i < ref.length; i += 2) sc += d[i + lag] * ref[i]
      if (sc > bestScore) (bestScore = sc), (best = lag)
    }
    return best / buf.sampleRate
  },
  [mp3.toString('base64'), L.slice(0, 44100 * 3).map((v) => v / 32767)],
)
await browser.close()
// Keyed by src and file size: a different MP3 at the same path is simply looped end to end.
const loops = { '/audio/feral.mp3': { bytes: mp3.length, bpm: BPM, start, end: start + LOOP_SAMPLES / 44100 } }
await writeFile(new URL('../src/data/music-loop.json', import.meta.url), JSON.stringify(loops, null, 2) + '\n')
console.log(`✓ loop points ${start.toFixed(5)}s → ${(start + LOOP_SAMPLES / 44100).toFixed(5)}s`)
