// Composes FERAL's ambient loop: a party heard through a wall on a cold night.
// Muffled four-on-the-floor, a low D-minor drone, slow detuned pads, a music-box
// motif drowned in reverb, and wind. Renders in Chromium's OfflineAudioContext,
// folds the reverb tail back to the start so the loop is seamless, encodes MP3.
//
//   node scripts/generate-music.mjs      → public/audio/feral-ambient.mp3

import { chromium } from 'playwright-core'
import { Mp3Encoder } from '@breezystack/lamejs'
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = new URL('../public/audio/', import.meta.url).pathname

function compose() {
  const SR = 44100
  const BPM = 120
  const BEAT = 60 / BPM
  const BAR = BEAT * 4
  const BARS = 32
  const LOOP = BAR * BARS // 64s
  const TAIL = 8
  const ctx = new OfflineAudioContext(2, Math.ceil((LOOP + TAIL) * SR), SR)

  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

  // Reverb: long, dark, stereo.
  const rev = ctx.createConvolver()
  const irLen = SR * 5
  const ir = ctx.createBuffer(2, irLen, SR)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < irLen; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / irLen, 3.2)
  }
  rev.buffer = ir
  const revTone = ctx.createBiquadFilter()
  revTone.type = 'lowpass'
  revTone.frequency.value = 3200
  const revOut = ctx.createGain()
  revOut.gain.value = 0.55
  rev.connect(revTone).connect(revOut)

  const master = ctx.createGain()
  master.gain.value = 0.8
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 3
  master.connect(comp).connect(ctx.destination)
  revOut.connect(master)

  const bus = (dry, wet) => {
    const g = ctx.createGain()
    g.gain.value = dry
    g.connect(master)
    const s = ctx.createGain()
    s.gain.value = wet
    g.connect(s).connect(rev)
    return g
  }

  const noise = (() => {
    const b = ctx.createBuffer(1, SR * 2, SR)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1
    return b
  })()

  // ── The party next door: kick through a wall ──────────────────────────
  const wall = ctx.createBiquadFilter()
  wall.type = 'lowpass'
  wall.frequency.value = 170
  wall.Q.value = 0.5
  wall.connect(bus(0.9, 0.12))
  for (let i = 0; i < BARS * 4; i++) {
    const t = i * BEAT
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(115, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.95, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
    o.connect(g).connect(wall)
    o.start(t)
    o.stop(t + 0.45)
  }
  // off-beat hats, barely there, far away
  const hatBus = bus(0.05, 0.35)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7000
  hp.connect(hatBus)
  for (let i = 0; i < BARS * 4; i++) {
    const t = i * BEAT + BEAT / 2
    const s = ctx.createBufferSource()
    s.buffer = noise
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    s.connect(g).connect(hp)
    s.start(t, r())
    s.stop(t + 0.08)
  }

  // ── Harmony: Dm · B♭ · Gm · A — 4 bars each ────────────────────────────
  const CHORDS = [
    [50, 53, 57, 60], // Dm(7)
    [46, 50, 53, 57], // B♭maj7
    [43, 50, 55, 58], // Gm
    [45, 49, 52, 57], // A (the leading tone does the unsettling)
  ]
  const padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = 700
  padFilter.Q.value = 0.8
  const lfo = ctx.createOscillator()
  const lfoAmt = ctx.createGain()
  lfo.frequency.value = 1 / 16
  lfoAmt.gain.value = 350
  lfo.connect(lfoAmt).connect(padFilter.frequency)
  lfo.start(0)
  padFilter.connect(bus(0.1, 0.6))

  const droneBus = bus(0.5, 0.2)
  const segs = BARS / 4
  for (let s = 0; s < segs; s++) {
    const t = s * BAR * 4
    const len = BAR * 4
    const chord = CHORDS[s % 4]
    for (const n of chord) {
      for (const det of [-9, 0, 8]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = hz(n)
        o.detune.value = det
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.05, t + 2.5)
        g.gain.setValueAtTime(0.05, t + len - 1)
        g.gain.linearRampToValueAtTime(0, t + len + 2.5)
        o.connect(g).connect(padFilter)
        o.start(t)
        o.stop(t + len + 2.6)
      }
    }
    // sub drone on the root
    const o = ctx.createOscillator()
    o.frequency.value = hz(chord[0] - 12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.28, t + 3)
    g.gain.setValueAtTime(0.28, t + len - 1)
    g.gain.linearRampToValueAtTime(0, t + len + 3)
    o.connect(g).connect(droneBus)
    o.start(t)
    o.stop(t + len + 3.1)
  }

  // ── Music box: a slow, off-kilter motif drowned in reverb ─────────────
  const boxBus = bus(0.06, 0.9)
  const MOTIF = [74, 77, 81, 73, 74, 70, 69, 73] // D F A C♯ D B♭ A C♯
  for (let s = 0; s < segs; s++) {
    if (s % 2 === 0) continue // every other phrase — leave space
    for (let i = 0; i < 4; i++) {
      const note = MOTIF[(s * 2 + i) % MOTIF.length]
      const t = s * BAR * 4 + i * BAR + BEAT * (r() < 0.5 ? 0 : 0.5)
      for (const [mult, amp] of [[1, 0.2], [2.01, 0.05], [3.98, 0.02]]) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = hz(note) * mult
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(amp, t + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3)
        o.connect(g).connect(boxBus)
        o.start(t)
        o.stop(t + 3.1)
      }
    }
  }

  // ── Wind: band-passed noise, slowly sweeping ──────────────────────────
  const windBus = bus(0.18, 0.3)
  for (let s = 0; s < segs; s++) {
    const t = s * BAR * 4
    const len = BAR * 4
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 6
    bp.frequency.setValueAtTime(300 + r() * 200, t)
    bp.frequency.linearRampToValueAtTime(700 + r() * 500, t + len / 2)
    bp.frequency.linearRampToValueAtTime(300 + r() * 200, t + len + 2)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.14, t + len / 2)
    g.gain.linearRampToValueAtTime(0, t + len + 2)
    src.connect(bp).connect(g).connect(windBus)
    src.start(t, r() * 1.5)
    src.stop(t + len + 2.1)
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
const [L, R] = await page.evaluate(compose)

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
await writeFile(OUT + 'feral-ambient.mp3', mp3)
console.log(`✓ audio/feral-ambient.mp3  ${(mp3.length / 1024).toFixed(0)} KB, ${(left.length / 44100).toFixed(1)}s`)

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
const loops = { '/audio/feral-ambient.mp3': { start, end: start + LOOP_SAMPLES / 44100 } }
await writeFile(new URL('../src/data/music-loop.json', import.meta.url), JSON.stringify(loops, null, 2) + '\n')
console.log(`✓ loop points ${start.toFixed(5)}s → ${(start + LOOP_SAMPLES / 44100).toFixed(5)}s`)
