// Generates dark, cinematic placeholder imagery (and the OG image, favicon
// PNGs and sample QR) so the site looks finished before real photography
// exists. Swap any file in public/images for a real photo with the same name,
// then run `npm run images` to re-optimise.
//
//   node scripts/generate-placeholders.mjs
//
// Draws on a <canvas> in headless Chromium (Playwright) and encodes with sharp.

import { chromium } from 'playwright-core'
import sharp from 'sharp'
import QRCode from 'qrcode'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const ROOT = new URL('../', import.meta.url).pathname
const OUT = ROOT + 'public/'

const JOBS = [
  ['images/hero/hero.jpg', 'crowd', 2400, 1350, 11],
  ['images/hero/hero-portrait.jpg', 'crowd', 1080, 1920, 12],

  ['images/experience/01.jpg', 'crowd', 1800, 1200, 21],
  ['images/experience/02.jpg', 'mask', 1200, 1500, 22],
  ['images/experience/03.jpg', 'hands', 1200, 1500, 23],
  ['images/experience/04.jpg', 'figure', 1800, 1100, 24],

  ['images/horror/01.jpg', 'corridor', 2400, 1350, 31],
  ['images/horror/02.jpg', 'mask', 1200, 1600, 32],

  ['images/team/placeholder-01.jpg', 'mask', 1000, 1333, 41],
  ['images/team/placeholder-02.jpg', 'mask', 1000, 1333, 42],
  ['images/team/placeholder-03.jpg', 'mask', 1000, 1333, 43],
  ['images/team/placeholder-04.jpg', 'mask', 1000, 1333, 44],
  ['images/team/placeholder-05.jpg', 'mask', 1000, 1333, 45],
  ['images/team/placeholder-06.jpg', 'mask', 1000, 1333, 46],

  ['images/archive/01.jpg', 'figure', 1200, 1500, 51],
  ['images/archive/02.jpg', 'crowd', 1800, 1200, 52],
  ['images/archive/03.jpg', 'mask', 1200, 1500, 53],
  ['images/archive/04.jpg', 'corridor', 1800, 1200, 54],
  ['images/archive/05.jpg', 'hands', 1200, 1500, 55],
  ['images/archive/06.jpg', 'figure', 1800, 1200, 56],
]

// ---------------------------------------------------------------------------
// Runs inside the browser.
function paint(scene, W, H, seed) {
  let s = seed
  const r = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')
  const U = Math.min(W, H) / 1000 // unit
  const RED = [150, 10, 20]

  x.fillStyle = '#050505'
  x.fillRect(0, 0, W, H)

  const glow = (cx, cy, rad, [R, G, B], a, sy = 1) => {
    x.save()
    x.globalCompositeOperation = 'screen'
    x.translate(cx, cy)
    x.scale(1, sy)
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rad)
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      g.addColorStop(t, `rgba(${R},${G},${B},${a * Math.pow(1 - t, 2.2)})`)
    }
    x.fillStyle = g
    x.fillRect(-rad, -rad, rad * 2, rad * 2)
    x.restore()
  }

  // Low-frequency smoke: tiny random canvas upscaled + blurred.
  const smoke = (alpha, [R, G, B], scale = 14, mode = 'screen') => {
    const sc = document.createElement('canvas')
    sc.width = scale
    sc.height = Math.ceil((scale * H) / W)
    const sx = sc.getContext('2d')
    const img = sx.createImageData(sc.width, sc.height)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.pow(r(), 2.5)
      img.data[i] = R
      img.data[i + 1] = G
      img.data[i + 2] = B
      img.data[i + 3] = v * 255
    }
    sx.putImageData(img, 0, 0)
    x.save()
    x.globalCompositeOperation = mode
    x.globalAlpha = alpha
    x.filter = `blur(${40 * U}px)`
    x.imageSmoothingQuality = 'high'
    x.drawImage(sc, -W * 0.1, -H * 0.1, W * 1.2, H * 1.2)
    x.restore()
  }

  const blur = (px, fn) => {
    x.save()
    x.filter = `blur(${px}px)`
    fn()
    x.restore()
  }

  // Head + shoulders silhouette; (px, py) = base of neck.
  const person = (px, py, k, fill, arm = 0) => {
    x.fillStyle = fill
    x.beginPath()
    x.ellipse(px, py - 40 * k, 23 * k, 29 * k, 0, 0, Math.PI * 2)
    x.fill()
    x.fillRect(px - 9 * k, py - 20 * k, 18 * k, 26 * k)
    x.beginPath()
    x.moveTo(px - 75 * k, py + 500 * k)
    x.bezierCurveTo(px - 78 * k, py + 60 * k, px - 60 * k, py + 8 * k, px, py + 4 * k)
    x.bezierCurveTo(px + 60 * k, py + 8 * k, px + 78 * k, py + 60 * k, px + 75 * k, py + 500 * k)
    x.fill()
    if (arm) {
      x.save()
      x.translate(px + arm * 48 * k, py + 30 * k)
      x.rotate(arm * (0.15 + r() * 0.35))
      x.beginPath()
      x.roundRect(-10 * k, -230 * k, 20 * k, 250 * k, 10 * k)
      x.ellipse(0, -235 * k, 14 * k, 20 * k, 0, 0, Math.PI * 2)
      x.fill()
      x.restore()
    }
  }

  const scenes = {
    crowd() {
      const lx = W * (0.35 + r() * 0.3)
      glow(lx, H * 0.2, Math.max(W, H) * 0.75, RED, 0.85, 0.7)
      glow(lx, H * 0.12, Math.max(W, H) * 0.22, [255, 120, 100], 0.35)
      smoke(0.35, [120, 20, 25], 18)
      // light beams
      for (let i = 0; i < 6; i++) {
        blur(18 * U, () => {
          x.globalCompositeOperation = 'screen'
          x.fillStyle = `rgba(255,210,200,${0.02 + r() * 0.035})`
          const bx = W * (r() * 1.2 - 0.1)
          x.beginPath()
          x.moveTo(lx - 10, -20)
          x.lineTo(bx - 60 * U, H)
          x.lineTo(bx + 90 * U, H)
          x.closePath()
          x.fill()
        })
      }
      const rows = 4
      for (let row = 0; row < rows; row++) {
        const k = (0.55 + row * 0.5) * (H / 1000) * (W < H ? 0.8 : 1)
        const y = H * (0.5 + row * 0.12)
        const shade = ['#170607', '#0e0405', '#070304', '#030202'][row]
        blur([10, 6, 3, 2][row] * U, () => {
          for (let px = -60 * k; px < W + 60 * k; px += 125 * k * (0.85 + r() * 0.3))
            person(px, y + r() * 30 * k, k * (0.9 + r() * 0.2), shade, r() < 0.2 ? (r() < 0.5 ? -1 : 1) : 0)
        })
      }
    },

    figure() {
      const fx = W * (0.35 + r() * 0.3)
      const k = H / 900
      glow(fx + 140 * k, H * 0.3, Math.max(W, H) * 0.6, RED, 0.7)
      smoke(0.25, [90, 80, 80], 12)
      blur(24 * U, () => person(fx + 12 * k, H * 0.42, k * 1.9, 'rgba(200,20,30,0.8)'))
      blur(4 * U, () => person(fx, H * 0.42, k * 1.9, '#040202'))
    },

    // A pale mask caught in on-camera flash.
    mask() {
      const cx = W * (0.44 + r() * 0.12)
      const cy = H * 0.44
      const k = U * 1.1
      glow(cx, cy, Math.max(W, H) * 0.55, [70, 62, 58], 0.8)
      blur(8 * U, () => {
        x.fillStyle = '#0b0a0a'
        x.beginPath()
        x.moveTo(cx - 280 * k, H)
        x.bezierCurveTo(cx - 270 * k, cy + 260 * k, cx - 120 * k, cy + 205 * k, cx, cy + 205 * k)
        x.bezierCurveTo(cx + 120 * k, cy + 205 * k, cx + 270 * k, cy + 260 * k, cx + 280 * k, H)
        x.fill()
        const g = x.createRadialGradient(cx - 30 * k, cy - 50 * k, 0, cx, cy, 230 * k)
        g.addColorStop(0, '#e6e1db')
        g.addColorStop(0.5, '#8b8580')
        g.addColorStop(1, '#141312')
        x.fillStyle = g
        x.beginPath()
        x.ellipse(cx, cy, 150 * k, 200 * k, 0, 0, Math.PI * 2)
        x.fill()
      })
      blur(12 * U, () => {
        x.fillStyle = '#060505'
        for (const d of [-1, 1]) {
          x.beginPath()
          x.ellipse(cx + d * 56 * k, cy - 25 * k, 32 * k, 18 * k, d * 0.15, 0, Math.PI * 2)
          x.fill()
        }
      })
      glow(cx + 40 * k, cy + 240 * k, 300 * k, RED, 0.5, 0.6)
    },

    corridor() {
      const cx = W * (0.46 + r() * 0.08)
      const cy = H * 0.5
      const dw = Math.min(W, H) * 0.085
      const dh = dw * 2.15
      const [L, R, T, B] = [cx - dw / 2, cx + dw / 2, cy - dh / 2, cy + dh / 2]
      const poly = (pts, fill) => {
        x.fillStyle = fill
        x.beginPath()
        pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)))
        x.fill()
      }
      poly([[0, 0], [L, T], [L, B], [0, H]], '#0c0808')
      poly([[W, 0], [R, T], [R, B], [W, H]], '#0a0707')
      poly([[0, H], [L, B], [R, B], [W, H]], '#120707')
      poly([[0, 0], [L, T], [R, T], [W, 0]], '#060505')
      glow(cx, cy, Math.max(W, H) * 0.45, RED, 0.85)
      blur(2 * U, () => {
        x.strokeStyle = 'rgba(0,0,0,0.6)'
        for (let i = 1; i < 8; i++) {
          const t = Math.pow(i / 8, 2)
          x.lineWidth = (2 + t * 14) * U
          for (const [ex, sgn] of [[L, -1], [R, 1]]) {
            const xx = ex + sgn * (sgn < 0 ? L : W - R) * t * 1.05
            x.beginPath()
            x.moveTo(xx, T - T * t * 1.05)
            x.lineTo(xx, B + (H - B) * t * 1.05)
            x.stroke()
          }
        }
      })
      x.fillStyle = '#b3121c'
      x.fillRect(L, T, dw, dh)
      glow(cx, cy, dh * 1.1, [255, 90, 70], 0.5)
      blur(1.5 * U, () => person(cx, B - dh * 0.6, dh / 560, '#0a0203'))
      blur(30 * U, () => {
        x.globalCompositeOperation = 'screen'
        x.fillStyle = 'rgba(140,10,18,0.35)'
        x.beginPath()
        x.moveTo(L, B)
        x.lineTo(R, B)
        x.lineTo(cx + W * 0.2, H)
        x.lineTo(cx - W * 0.2, H)
        x.fill()
      })
      smoke(0.18, [110, 20, 25], 16)
    },

    hands() {
      const k = H / 1000
      glow(W * 0.5, H * 0.05, Math.max(W, H) * 0.6, RED, 0.8)
      blur(40 * U, () => {
        x.globalCompositeOperation = 'screen'
        x.fillStyle = 'rgba(240,225,220,0.09)'
        x.beginPath()
        x.moveTo(W * 0.44, 0)
        x.lineTo(W * 0.56, 0)
        x.lineTo(W * 0.9, H)
        x.lineTo(W * 0.1, H)
        x.fill()
      })
      smoke(0.3, [120, 110, 110], 12)
      blur(5 * U, () => {
        x.fillStyle = '#060303'
        for (let i = 0; i < 7; i++) {
          const hx = W * (0.08 + i * 0.14 + r() * 0.04)
          const hy = H * (0.42 + r() * 0.3)
          x.save()
          x.translate(hx, H)
          x.rotate(-0.35 + r() * 0.7)
          x.translate(-hx, -H)
          x.beginPath()
          x.roundRect(hx - 17 * k, hy, 34 * k, H, 17 * k)
          x.ellipse(hx, hy, 32 * k, 40 * k, 0, 0, Math.PI * 2)
          x.fill()
          for (let f = 0; f < 4; f++) {
            x.beginPath()
            x.roundRect(hx - 28 * k + f * 15.5 * k, hy - 78 * k - (f === 1 || f === 2 ? 14 * k : 0), 11 * k, 80 * k, 6 * k)
            x.fill()
          }
          x.beginPath()
          x.roundRect(hx + 26 * k, hy - 30 * k, 11 * k, 50 * k, 6 * k)
          x.fill()
          x.restore()
        }
      })
    },

    // Low-key monochrome portrait: mostly shadow, one rim of light.
    portrait() {
      const px = W * (0.47 + r() * 0.06)
      const k = W / 520
      const side = r() < 0.5 ? -1 : 1
      glow(px + side * 200 * k, H * 0.28, Math.max(W, H) * 0.6, [58, 56, 54], 0.9)
      const hy = H * 0.4
      // rim
      blur(10 * U, () => {
        x.fillStyle = 'rgba(190,184,178,0.55)'
        x.beginPath()
        x.ellipse(px + side * 7 * k, hy, 92 * k, 120 * k, 0, 0, Math.PI * 2)
        x.fill()
        x.beginPath()
        x.moveTo(px - 250 * k + side * 8 * k, H)
        x.bezierCurveTo(px - 250 * k, hy + 210 * k, px - 110 * k, hy + 175 * k, px + side * 8 * k, hy + 170 * k)
        x.bezierCurveTo(px + 110 * k, hy + 175 * k, px + 250 * k, hy + 210 * k, px + 250 * k + side * 8 * k, H)
        x.fill()
      })
      blur(5 * U, () => {
        const g = x.createLinearGradient(px + side * 100 * k, 0, px - side * 100 * k, 0)
        g.addColorStop(0, '#3a3836')
        g.addColorStop(0.35, '#121212')
        g.addColorStop(1, '#070707')
        x.fillStyle = g
        x.beginPath()
        x.ellipse(px, hy, 90 * k, 118 * k, 0, 0, Math.PI * 2)
        x.fill()
        x.fillRect(px - 38 * k, hy + 90 * k, 76 * k, 95 * k)
        x.beginPath()
        x.moveTo(px - 250 * k, H)
        x.bezierCurveTo(px - 250 * k, hy + 210 * k, px - 110 * k, hy + 175 * k, px, hy + 170 * k)
        x.bezierCurveTo(px + 110 * k, hy + 175 * k, px + 250 * k, hy + 210 * k, px + 250 * k, H)
        x.fill()
      })
    },
  }

  scenes[scene]()

  // Vignette
  const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.85)')
  x.fillStyle = v
  x.fillRect(0, 0, W, H)

  // Film grain (zero-mean, also dithers away gradient banding)
  const img = x.getImageData(0, 0, W, H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() + r() + r() - 1.5) * 22
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  x.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

// ---------------------------------------------------------------------------

const only = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()

for (const [file, scene, w, h, seed] of JOBS) {
  if (only && (only === 'og' || !file.includes(only))) continue
  const url = await page.evaluate(
    ([fn, ...args]) => new Function(`return (${fn})`)()(...args),
    [paint.toString(), scene, w, h, seed],
  )
  const path = OUT + file
  await mkdir(dirname(path), { recursive: true })
  await sharp(Buffer.from(url.split(',')[1], 'base64'))
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path)
  console.log('✓', file)
}

if (!only || only === 'og') {
  // OpenGraph image + favicons, set in the real display face.
  const anton = (await readFile(ROOT + 'node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2')).toString('base64')
  const hero = (await sharp(OUT + 'images/hero/hero.jpg').resize(1200, 630, { fit: 'cover' }).jpeg().toBuffer()).toString('base64')
  const css = `@font-face{font-family:A;src:url(data:font/woff2;base64,${anton})}*{margin:0}body{background:#050505}`

  await page.setViewportSize({ width: 1200, height: 630 })
  await page.setContent(`<style>${css}
    .og{position:relative;width:1200px;height:630px;overflow:hidden;background:#050505 url(data:image/jpeg;base64,${hero}) center/cover;color:#F2F0EC;font-family:A}
    .og:after{content:"";position:absolute;inset:0;background:rgba(5,5,5,.45)}
    h1{position:absolute;inset:0;display:grid;place-items:center;font-size:360px;font-weight:400;line-height:1;letter-spacing:-4px;z-index:1}
    p{position:absolute;left:0;right:0;bottom:48px;text-align:center;font:500 18px/1 system-ui,sans-serif;letter-spacing:.32em;z-index:1}
    </style><div class="og"><h1>FERAL</h1><p>28.10.26 &nbsp;·&nbsp; CHHATARPUR FARMS, SOUTH DELHI</p></div>`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: OUT + 'og.jpg', type: 'jpeg', quality: 86 })
  console.log('✓ og.jpg')

  for (const size of [180, 512]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>${css}
      div{width:${size}px;height:${size}px;background:#050505;color:#F2F0EC;font-family:A;font-size:${size * 0.78}px;line-height:1;display:grid;place-items:center;position:relative}
      i{position:absolute;width:${size * 0.09}px;height:${size * 0.09}px;background:#9E0F18;right:${size * 0.2}px;bottom:${size * 0.2}px}
      </style><div>F<i></i></div>`)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: OUT + (size === 180 ? 'apple-touch-icon.png' : 'icon-512.png') })
    console.log(`✓ icon ${size}`)
  }

  // Sample QR — clearly stamped so it never ships by accident.
  const qrSvg = await QRCode.toString('upi://pay?pa=REPLACE-ME@upi&pn=FERAL', {
    type: 'svg',
    margin: 2,
    color: { dark: '#050505', light: '#f2f0ec' },
  })
  const stamp = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720">
    <rect x="170" y="318" width="380" height="84" fill="#9E0F18"/>
    <text x="360" y="373" font-family="sans-serif" font-weight="700" font-size="34" letter-spacing="6" fill="#f2f0ec" text-anchor="middle">SAMPLE QR</text></svg>`
  await sharp(await sharp(Buffer.from(qrSvg)).resize(720, 720).png().toBuffer())
    .composite([{ input: Buffer.from(stamp) }])
    .png()
    .toFile(OUT + 'assets/qr.png')
  console.log('✓ assets/qr.png')
}

await browser.close()
