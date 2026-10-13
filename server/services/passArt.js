import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import sharp from 'sharp'

// FERAL 2026 pass artwork — horizontal 16:9 ticket, gothic editorial style.
// Built as SVG with every piece of text converted to glyph outlines (no SVG
// text or fonts at render time, so attendee input can never become markup),
// then rasterised with sharp. One design for every attendee; only the fields
// in PassArtData change.

// Small hosts (512 MB): no libvips cache between renders.
sharp.cache(false)

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const fontFile = (pkg, file) => fs.readFileSync(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), file))
const FONT = {
  serifBold: fontkit.create(fontFile('@expo-google-fonts/cormorant-garamond', '700Bold/CormorantGaramond_700Bold.ttf')),
  serifSemi: fontkit.create(fontFile('@expo-google-fonts/cormorant-garamond', '600SemiBold/CormorantGaramond_600SemiBold.ttf')),
  caps: fontkit.create(fontFile('@expo-google-fonts/cinzel', '500Medium/Cinzel_500Medium.ttf')),
  capsBold: fontkit.create(fontFile('@expo-google-fonts/cinzel', '700Bold/Cinzel_700Bold.ttf')),
}
const VENUE_ART = fs.readFileSync(path.join(here, '../assets/pass-venue.jpg')).toString('base64')

// Very subtle film grain: a fixed 256px noise tile (deterministic, so every pass is identical).
const GRAIN = await (async () => {
  const n = 256
  const raw = Buffer.alloc(n * n * 2)
  let x = 2026
  for (let i = 0; i < n * n; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    const v = (x >>> 0) & 255
    raw[i * 2] = v > 127 ? 255 : 0
    raw[i * 2 + 1] = Math.round((Math.abs(v - 127.5) / 127.5) * 16)
  }
  const png = await sharp(raw, { raw: { width: n, height: n, channels: 2 } }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
})()

export const PASS_COLORS = { background: '#0B0808', crimson: '#641B20', burgundy: '#351014', gold: '#C8A477', cream: '#F0E5D2' }
const C = PASS_COLORS

export const PASS_W = 1920
export const PASS_H = 1080
const SPLIT = 1100 // left art panel | right details panel
const NOTCH = 44

// lining figures: Cormorant's default old-style numerals are harder to read in dates and IDs
const FEATURES = ['lnum', 'kern', 'liga']

const f2 = (n) => Math.round(n * 100) / 100

// Width of a string in px at `size`, with extra letter `spacing` in px.
function measure(font, str, size, spacing = 0) {
  const run = font.layout(str, FEATURES)
  const adv = run.positions.reduce((w, p) => w + p.xAdvance, 0)
  return (adv * size) / font.unitsPerEm + spacing * Math.max(0, run.glyphs.length - 1)
}

// Text as outlines. Returns { svg, width, size }. `maxWidth` shrinks the size
// to fit (never below `minSize`).
function outline(str, { font, size, x, y, fill, spacing = 0, align = 'left', maxWidth, minSize = 10, opacity = 1 }) {
  str = String(str)
  let s = size
  if (maxWidth) while (s > minSize && measure(font, str, s, spacing * (s / size)) > maxWidth) s -= 1
  const sp = spacing * (s / size)
  const width = measure(font, str, s, sp)
  const x0 = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x
  const k = s / font.unitsPerEm
  const run = font.layout(str, FEATURES)
  let pen = 0
  const parts = []
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i]
    const d = g.path.toSVG()
    if (d) parts.push(`<path transform="translate(${f2(pen + pos.xOffset)} ${f2(pos.yOffset)})" d="${d}"/>`)
    pen += pos.xAdvance + sp / k
  })
  const svg = `<g fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''} transform="translate(${f2(x0)} ${f2(y)}) scale(${f2(k * 1e4) / 1e4} ${-f2(k * 1e4) / 1e4})">${parts.join('')}</g>`
  return { svg, width, size: s }
}

// Splits a long name onto two balanced lines.
function twoLines(str) {
  const words = str.split(' ')
  if (words.length < 2) return [str]
  let best = null
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const score = Math.max(a.length, b.length)
    if (!best || score < best.score) best = { score, lines: [a, b] }
  }
  return best.lines
}

// Small gold ornament: a line — diamond — line.
function ornament(cx, y, half, { gap = 14, d = 7, opacity = 0.9 } = {}) {
  return `<g stroke="${C.gold}" stroke-opacity="${opacity}" fill="none">
    <line x1="${cx - half}" y1="${y}" x2="${cx - gap}" y2="${y}" stroke-width="1.6"/>
    <line x1="${cx + gap}" y1="${y}" x2="${cx + half}" y2="${y}" stroke-width="1.6"/>
    <path d="M${cx} ${y - d} L${cx + d} ${y} L${cx} ${y + d} L${cx - d} ${y} Z" fill="${C.gold}" fill-opacity="${opacity}" stroke="none"/>
  </g>`
}

function corner(x, y, sx, sy) {
  // a fine gold L with an inner diamond at each corner of the border
  return `<g stroke="${C.gold}" fill="none" stroke-width="1.6" transform="translate(${x} ${y}) scale(${sx} ${sy})">
    <path d="M0 46 L0 0 L46 0"/>
    <path d="M10 30 L10 10 L30 10" stroke-opacity="0.6" stroke-width="1"/>
    <path d="M18 14 L22 18 L18 22 L14 18 Z" fill="${C.gold}" stroke="none"/>
  </g>`
}

/**
 * PassArtData: {
 *   holderName, passType (e.g. "MALE / STAG"), admits ("ADMITS ONE"), passCode,
 *   event: { title, name, place, dateLabel, timeLabel, venue }
 * }
 * Returns the SVG source.
 */
export function passSvg(p) {
  const W = PASS_W
  const H = PASS_H
  const L = SPLIT
  const out = []

  // ── left panel: venue art ───────────────────────────────────────────────
  const leftCx = L / 2
  const title = outline(p.event.title, { font: FONT.caps, size: 30, x: leftCx, y: 706, fill: C.gold, spacing: 12, align: 'center', maxWidth: L - 220 })
  const feral = outline(p.event.name, { font: FONT.serifBold, size: 262, x: leftCx, y: 914, fill: C.cream, spacing: 14, align: 'center', maxWidth: L - 200 })
  const place = outline(p.event.place, { font: FONT.caps, size: 24, x: leftCx, y: 1004, fill: C.cream, spacing: 8, align: 'center', maxWidth: L - 220, opacity: 0.86 })

  // ── right panel: details ────────────────────────────────────────────────
  const rx = L + 86
  const rw = W - rx - 96
  const rcx = L + (W - L) / 2
  const label = (s, x, y) => outline(s, { font: FONT.caps, size: 17, x, y, fill: C.gold, spacing: 5.5 }).svg
  const value = (s, x, y, w, size = 42) => outline(s, { font: FONT.serifSemi, size, x, y, fill: C.cream, maxWidth: w, minSize: 24 }).svg

  const right = []
  right.push(outline('OFFICIAL PASS', { font: FONT.capsBold, size: 34, x: rcx, y: 158, fill: C.gold, spacing: 15, align: 'center' }).svg)
  right.push(ornament(rcx, 196, 150))

  // attendee name: one line, or two balanced lines if it would get too small
  right.push(label('ATTENDEE NAME', rx, 288))
  let name = outline(p.holderName, { font: FONT.serifBold, size: 72, x: rx, y: 366, fill: C.cream, maxWidth: rw, minSize: 30 })
  let nameBottom = 366
  if (name.size < 50 && p.holderName.includes(' ')) {
    const [a, b] = twoLines(p.holderName)
    const s1 = outline(a, { font: FONT.serifBold, size: 56, x: rx, y: 352, fill: C.cream, maxWidth: rw, minSize: 30 })
    const s2 = outline(b, { font: FONT.serifBold, size: s1.size, x: rx, y: 352 + s1.size * 1.02, fill: C.cream, maxWidth: rw, minSize: 24 })
    name = { svg: s1.svg + s2.svg }
    nameBottom = 352 + s1.size * 1.02
  }
  right.push(name.svg)
  const r1 = Math.max(nameBottom + 52, 418)
  right.push(`<line x1="${rx}" y1="${r1}" x2="${rx + rw}" y2="${r1}" stroke="${C.gold}" stroke-opacity="0.35" stroke-width="1.2"/>`)

  const colB = rx + 300
  const wA = 270
  const wB = rx + rw - colB
  let y = r1 + 72
  right.push(label('PASS TYPE', rx, y), label('UNIQUE ID', colB, y))
  right.push(value(p.passType, rx, y + 54, wA, 40))
  right.push(outline(p.passCode, { font: FONT.capsBold, size: 31, x: colB, y: y + 50, fill: C.cream, spacing: 2.5, maxWidth: wB, minSize: 18 }).svg)
  y += 128
  right.push(label('DATE', rx, y), label('TIMING', colB, y))
  right.push(value(p.event.dateLabel, rx, y + 54, wA, 40), value(p.event.timeLabel, colB, y + 54, wB, 40))
  y += 128
  right.push(label('VENUE', rx, y))
  right.push(value(p.event.venue, rx, y + 54, rw, 40))

  right.push(ornament(rcx, 950, 190, { opacity: 0.55 }))
  right.push(outline(p.admits, { font: FONT.caps, size: 18, x: rcx, y: 1004, fill: C.gold, spacing: 9, align: 'center', opacity: 0.9 }).svg)

  // ── assembly ────────────────────────────────────────────────────────────
  const notchCuts = `<circle cx="${L}" cy="0" r="${NOTCH}"/><circle cx="${L}" cy="${H}" r="${NOTCH}"/>`
  const ringR = NOTCH + 12
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <mask id="ticket"><rect width="${W}" height="${H}" rx="26" fill="#fff"/><g fill="#000">${notchCuts}</g></mask>
    <mask id="trim"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000"><circle cx="${L}" cy="0" r="${ringR}"/><circle cx="${L}" cy="${H}" r="${ringR}"/></g></mask>
    <linearGradient id="fadeR" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${C.background}" stop-opacity="0.35"/>
      <stop offset="0.12" stop-color="${C.background}" stop-opacity="0"/>
      <stop offset="0.93" stop-color="${C.background}" stop-opacity="0"/>
      <stop offset="1" stop-color="${C.background}" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="fadeB" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${C.background}" stop-opacity="0.3"/>
      <stop offset="0.2" stop-color="${C.background}" stop-opacity="0.05"/>
      <stop offset="0.48" stop-color="${C.background}" stop-opacity="0.15"/>
      <stop offset="0.66" stop-color="${C.background}" stop-opacity="0.82"/>
      <stop offset="1" stop-color="${C.background}" stop-opacity="0.97"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.75">
      <stop offset="0" stop-color="${C.burgundy}" stop-opacity="0.95"/>
      <stop offset="0.6" stop-color="${C.burgundy}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${C.background}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ember" cx="0.5" cy="1" r="0.6">
      <stop offset="0" stop-color="${C.crimson}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${C.crimson}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grain" width="256" height="256" patternUnits="userSpaceOnUse"><image width="256" height="256" href="${GRAIN}" xlink:href="${GRAIN}"/></pattern>
    <clipPath id="leftClip"><rect width="${L}" height="${H}"/></clipPath>
  </defs>
  <g mask="url(#ticket)">
    <rect width="${W}" height="${H}" fill="${C.background}"/>
    <g clip-path="url(#leftClip)">
      <image width="${L}" height="${H}" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/jpeg;base64,${VENUE_ART}" href="data:image/jpeg;base64,${VENUE_ART}"/>
      <rect width="${L}" height="${H}" fill="${C.crimson}" fill-opacity="0.1"/>
      <rect width="${L}" height="${H}" fill="url(#fadeB)"/>
      <rect width="${L}" height="${H}" fill="url(#fadeR)"/>
      <rect y="${H - 420}" width="${L}" height="420" fill="url(#ember)"/>
    </g>
    <rect x="${L}" width="${W - L}" height="${H}" fill="url(#glow)"/>
    <rect width="${W}" height="${H}" fill="url(#grain)"/>
    ${title.svg}
    ${ornament(leftCx, 740, 120, { opacity: 0.8 })}
    ${feral.svg}
    ${ornament(leftCx, 952, 210)}
    ${place.svg}
    ${right.join('\n    ')}
    <g mask="url(#trim)" fill="none" stroke="${C.gold}">
      <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="6" stroke-width="2.2"/>
      <rect x="38" y="38" width="${W - 76}" height="${H - 76}" rx="3" stroke-width="0.9" stroke-opacity="0.55"/>
      <line x1="${L}" y1="${ringR + 10}" x2="${L}" y2="${H - ringR - 10}" stroke-width="2" stroke-dasharray="2 12" stroke-linecap="round" stroke-opacity="0.75"/>
    </g>
    <g fill="none" stroke="${C.gold}" stroke-width="2.2">
      <circle cx="${L}" cy="0" r="${ringR}"/><circle cx="${L}" cy="${H}" r="${ringR}"/>
    </g>
    ${corner(52, 52, 1, 1)}${corner(W - 52, 52, -1, 1)}${corner(52, H - 52, 1, -1)}${corner(W - 52, H - 52, -1, -1)}
  </g>
</svg>`)
  return out.join('')
}

// PNG (transparent outside the ticket edge and notches). Palette-quantised:
// visually the same, about a third of the size (~1 MB), which keeps emails
// light and 100 passes well inside a small database.
export async function passPng(p, { width = PASS_W } = {}) {
  const full = await sharp(Buffer.from(passSvg(p)), { density: 72 * (width / PASS_W) }).png().toBuffer()
  return sharp(full).png({ palette: true, quality: 90, colours: 256, dither: 1, compressionLevel: 9, effort: 10 }).toBuffer()
}

// Flattened JPEG for embedding in the PDF.
export async function passJpeg(png) {
  return sharp(png).flatten({ background: '#ffffff' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
}
