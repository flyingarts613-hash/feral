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

const V = 'PLACEHOLDER · VENUE PHOTO'

const JOBS = [
  // Hero
  ['images/hero/hero.jpg', 'party', 2400, 1350, 11],
  ['images/hero/hero-portrait.jpg', 'party', 1080, 1920, 12],

  // Party break + photo strip
  ['images/party/party-main.jpg', 'flashcrowd', 2400, 1350, 61],
  ['images/party/strip-01.jpg', 'flashcrowd', 1000, 1250, 62],
  ['images/party/strip-02.jpg', 'drinks', 1000, 1250, 63],
  ['images/party/strip-03.jpg', 'discoball', 1000, 1250, 64],
  ['images/party/strip-04.jpg', 'candles', 1000, 1250, 65],
  ['images/party/strip-05.jpg', 'party', 1000, 1250, 66],
  ['images/party/strip-06.jpg', 'pumpkin', 1000, 1250, 67],
  ['images/party/strip-07.jpg', 'mask', 1000, 1250, 68],
  ['images/party/strip-08.jpg', 'flashcrowd', 1000, 1250, 69],

  // What's waiting
  ['images/waiting/dj.jpg', 'dj', 1600, 1100, 21],
  ['images/waiting/dancing.jpg', 'flashcrowd', 1600, 1100, 25],
  ['images/waiting/games.jpg', 'games', 1200, 1500, 22],
  ['images/waiting/costumes.jpg', 'costume', 1200, 1500, 28],
  ['images/waiting/horror-room.jpg', 'room', 1200, 1500, 23],

  // Venue — replace with real Chhatarpur Farms photos (same file names)
  ['images/venue/venue-main.jpg', 'venue', 2400, 1350, 71, V],
  ['images/venue/venue-02.jpg', 'lights', 1000, 1250, 72, V],
  ['images/venue/venue-03.jpg', 'lanterns', 1000, 1250, 73, V],
  ['images/venue/venue-04.jpg', 'canopy', 1200, 900, 74, V],

  // Dress-up characters (seed % 11 picks the character)
  ['images/costumes/vampire.jpg', 'character', 900, 1200, 110],
  ['images/costumes/ghost.jpg', 'character', 900, 1200, 111],
  ['images/costumes/clown.jpg', 'character', 900, 1200, 112],
  ['images/costumes/zombie.jpg', 'character', 900, 1200, 113],
  ['images/costumes/witch.jpg', 'character', 900, 1200, 114],
  ['images/costumes/skeleton.jpg', 'character', 900, 1200, 115],
  ['images/costumes/demon.jpg', 'character', 900, 1200, 116],
  ['images/costumes/killer.jpg', 'character', 900, 1200, 117],
  ['images/costumes/creature.jpg', 'character', 900, 1200, 118],
  ['images/costumes/angel.jpg', 'character', 900, 1200, 119],
  ['images/costumes/doll.jpg', 'character', 900, 1200, 120],

  // Hell Ichor — replace with the real photo (same file names)
  ['images/hell-ichor/hell-ichor-main.jpg', 'goblet', 1200, 1500, 91, 'PLACEHOLDER · HELL ICHOR PHOTO'],
  ['images/hell-ichor/hell-ichor-detail.jpg', 'swirl', 1200, 900, 92, 'PLACEHOLDER · HELL ICHOR PHOTO'],

  // Horror room — what you see through the door
  ['images/horror-room/inside.jpg', 'room', 1200, 1600, 33],

  // Organisers
  ['images/organisers/organiser-01.jpg', 'costume', 1000, 1333, 41],
  ['images/organisers/organiser-02.jpg', 'costume', 1000, 1333, 42],

  // Archive
  ['images/archive/01.jpg', 'flashcrowd', 1200, 1500, 51],
  ['images/archive/02.jpg', 'party', 1800, 1200, 52],
  ['images/archive/03.jpg', 'drinks', 1200, 1500, 53],
  ['images/archive/04.jpg', 'discoball', 1800, 1200, 54],
  ['images/archive/05.jpg', 'candles', 1200, 1500, 55],
  ['images/archive/06.jpg', 'flashcrowd', 1800, 1200, 56],
]

// ---------------------------------------------------------------------------
// Runs inside the browser.
function paint(scene, W, H, seed, stamp) {
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
      x.roundRect(-6.5 * k, -215 * k, 13 * k, 235 * k, 6.5 * k)
      x.ellipse(0, -222 * k, 10 * k, 15 * k, 0, 0, Math.PI * 2)
      x.fill()
      x.restore()
    }
  }

  // ── Costume pieces, drawn onto a person() at (px, py) scale k ─────────────
  const headY = (py, k) => py - 40 * k
  const horns = (px, py, k, fill) => {
    const hy = headY(py, k)
    x.fillStyle = fill
    for (const d of [-1, 1]) {
      x.beginPath()
      x.moveTo(px + d * 12 * k, hy - 22 * k)
      x.quadraticCurveTo(px + d * 30 * k, hy - 60 * k, px + d * 14 * k, hy - 88 * k)
      x.quadraticCurveTo(px + d * 44 * k, hy - 58 * k, px + d * 22 * k, hy - 16 * k)
      x.fill()
    }
  }
  const witchHat = (px, py, k, fill) => {
    const hy = headY(py, k)
    x.fillStyle = fill
    x.beginPath()
    x.ellipse(px, hy - 18 * k, 48 * k, 9 * k, 0, 0, Math.PI * 2)
    x.fill()
    x.beginPath()
    x.moveTo(px - 24 * k, hy - 20 * k)
    x.quadraticCurveTo(px - 6 * k, hy - 70 * k, px + 22 * k, hy - 108 * k)
    x.quadraticCurveTo(px + 8 * k, hy - 60 * k, px + 26 * k, hy - 20 * k)
    x.fill()
  }
  const ears = (px, py, k, fill) => {
    const hy = headY(py, k)
    x.fillStyle = fill
    for (const d of [-1, 1]) {
      x.beginPath()
      x.moveTo(px + d * 8 * k, hy - 24 * k)
      x.lineTo(px + d * 22 * k, hy - 52 * k)
      x.lineTo(px + d * 25 * k, hy - 14 * k)
      x.fill()
    }
  }
  const maskEyes = (px, py, k) => {
    const hy = headY(py, k)
    x.fillStyle = 'rgba(0,0,0,0.85)'
    for (const d of [-1, 1]) {
      x.beginPath()
      x.ellipse(px + d * 9 * k, hy - 3 * k, 6 * k, 3.5 * k, d * 0.2, 0, Math.PI * 2)
      x.fill()
    }
  }
  // Flash-lit figure: bright where the flash hits, falling off to black.
  const litPerson = (px, py, k, level, arm = 0, costume) => {
    const g = x.createLinearGradient(px - 60 * k, 0, px + 80 * k, 0)
    const c = Math.round(235 * level)
    g.addColorStop(0, `rgb(${c},${c - 6},${c - 10})`)
    g.addColorStop(0.55, `rgb(${Math.round(c * 0.45)},${Math.round(c * 0.42)},${Math.round(c * 0.4)})`)
    g.addColorStop(1, 'rgb(8,6,6)')
    person(px, py, k, g, arm)
    if (costume === 'horns') horns(px, py, k, '#3a0508')
    if (costume === 'hat') witchHat(px, py, k, '#0a0808')
    if (costume === 'ears') ears(px, py, k, g)
    if (costume === 'mask') maskEyes(px, py, k)
  }
  const sparks = (n, area, color) => {
    for (let i = 0; i < n; i++) {
      const sx = area[0] + r() * area[2]
      const sy = area[1] + r() * area[3]
      const len = (2 + r() * 14) * U
      x.save()
      x.globalCompositeOperation = 'screen'
      x.strokeStyle = color(r())
      x.lineWidth = (1 + r() * 2.5) * U
      x.beginPath()
      x.moveTo(sx, sy)
      x.lineTo(sx + len * 0.3, sy + len)
      x.stroke()
      x.restore()
    }
  }
  const lasers = (ox, oy, n, spread, alpha) => {
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / (n - 1) - 0.5) * spread
      const ex = ox + Math.cos(a) * W * 2
      const ey = oy + Math.sin(a) * W * 2
      for (const [wd, al, bl] of [[10, alpha * 0.35, 8], [2.2, alpha, 0]]) {
        x.save()
        x.globalCompositeOperation = 'screen'
        if (bl) x.filter = `blur(${bl * U}px)`
        x.strokeStyle = `rgba(255,40,50,${al})`
        x.lineWidth = wd * U
        x.beginPath()
        x.moveTo(ox, oy)
        x.lineTo(ex, ey)
        x.stroke()
        x.restore()
      }
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

    // DJ behind the decks: laptop glow from below, beams, phones up in the crowd.
    dj() {
      const cx = W * (0.48 + r() * 0.04)
      const k = H / 1000
      const deskY = H * 0.56
      glow(cx, H * 0.24, Math.max(W, H) * 0.6, RED, 0.85, 0.75)
      glow(cx, H * 0.14, Math.max(W, H) * 0.16, [255, 110, 90], 0.28)
      for (let i = 0; i < 7; i++) {
        blur(16 * U, () => {
          x.globalCompositeOperation = 'screen'
          x.fillStyle = `rgba(255,215,205,${0.025 + r() * 0.04})`
          const bx = W * (r() * 1.2 - 0.1)
          x.beginPath()
          x.moveTo(cx + (r() - 0.5) * 80 * U, H * 0.08)
          x.lineTo(bx - 50 * U, H)
          x.lineTo(bx + 70 * U, H)
          x.fill()
        })
      }
      smoke(0.3, [120, 25, 30], 18)
      // DJ: rim light, headphones, one hand up
      const dk = k * 1.9
      const ny = deskY - 170 * k
      const dj = (fill) => {
        person(cx, ny, dk, fill, 0)
        x.save()
        x.translate(cx + 58 * dk, ny + 40 * dk)
        x.rotate(0.32)
        x.beginPath()
        x.roundRect(-10 * dk, -150 * dk, 20 * dk, 170 * dk, 10 * dk)
        x.ellipse(0, -154 * dk, 14 * dk, 19 * dk, 0, 0, Math.PI * 2)
        x.fill()
        x.restore()
      }
      blur(20 * U, () => dj('rgba(210,30,40,0.75)'))
      blur(3 * U, () => {
        dj('#060304')
        x.strokeStyle = '#060304'
        x.lineWidth = 9 * dk
        x.beginPath()
        x.arc(cx, ny - 42 * dk, 30 * dk, Math.PI * 1.08, Math.PI * 1.92)
        x.stroke()
        x.fillStyle = '#060304'
        for (const d of [-1, 1]) {
          x.beginPath()
          x.ellipse(cx + d * 25 * dk, ny - 36 * dk, 9 * dk, 14 * dk, 0, 0, Math.PI * 2)
          x.fill()
        }
      })
      glow(cx - 10 * k, deskY - 20 * k, 220 * k, [200, 205, 220], 0.2, 0.6)
      // booth: a slim table front, decks, laptop
      blur(2 * U, () => {
        x.fillStyle = '#070506'
        x.fillRect(W * 0.16, deskY, W * 0.68, H * 0.13)
        x.fillStyle = 'rgba(190,25,35,0.6)'
        x.fillRect(W * 0.16, deskY, W * 0.68, 3 * k)
        for (const [dx, dw] of [[-0.25, 0.14], [0.11, 0.14], [-0.06, 0.12]]) {
          x.fillStyle = '#120c0d'
          x.fillRect(cx + W * dx, deskY - 18 * k, W * dw, 18 * k)
        }
        x.strokeStyle = 'rgba(255,230,220,0.2)'
        x.lineWidth = 2 * k
        for (const dx of [-0.18, 0.18]) {
          x.beginPath()
          x.ellipse(cx + W * dx, deskY - 20 * k, W * 0.05, 7 * k, 0, 0, Math.PI * 2)
          x.stroke()
        }
        x.fillStyle = '#0d0b0c'
        x.fillRect(cx - 80 * k, deskY - 110 * k, 160 * k, 95 * k)
      })
      glow(cx, deskY - 62 * k, 130 * k, [230, 235, 245], 0.12)
      // crowd against a low red floor wash
      glow(W * 0.5, H * 0.8, W * 0.7, [120, 12, 20], 0.55, 0.35)
      blur(6 * U, () => {
        for (let px = -40 * k; px < W + 60 * k; px += 115 * k * (0.8 + r() * 0.4)) {
          const kk = k * (1.35 + r() * 0.3)
          person(px, H * (0.86 + r() * 0.04), kk, '#020101', r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0)
        }
      })
      for (let i = 0; i < 4; i++) {
        const px = W * (0.12 + i * 0.22 + r() * 0.08)
        const py = H * (0.72 + r() * 0.06)
        blur(1.5 * U, () => {
          x.fillStyle = '#020101'
          x.fillRect(px - 6 * k, py + 20 * k, 12 * k, H)
          x.fillStyle = 'rgba(235,238,245,0.8)'
          x.beginPath()
          x.roundRect(px - 15 * k, py - 28 * k, 30 * k, 54 * k, 4 * k)
          x.fill()
        })
        glow(px, py, 70 * k, [230, 235, 250], 0.2)
      }
    },

    // Top-down card table under one red lamp: cards, dice, a candle.
    games() {
      const k = Math.min(W, H) / 1000
      x.fillStyle = '#0a0808'
      x.fillRect(0, 0, W, H)
      glow(W * 0.5, H * 0.46, Math.max(W, H) * 0.55, [150, 20, 28], 0.75)
      glow(W * 0.5, H * 0.46, Math.max(W, H) * 0.3, [200, 150, 130], 0.18)
      const card = (cx, cy, rot, label, red) => {
        x.save()
        x.translate(cx, cy)
        x.rotate(rot)
        x.shadowColor = 'rgba(0,0,0,0.8)'
        x.shadowBlur = 30 * k
        x.shadowOffsetY = 12 * k
        x.fillStyle = '#d9d3cb'
        x.beginPath()
        x.roundRect(-105 * k, -150 * k, 210 * k, 300 * k, 14 * k)
        x.fill()
        x.shadowColor = 'transparent'
        x.fillStyle = red ? '#8e1119' : '#151212'
        x.font = `700 ${46 * k}px Georgia, serif`
        x.textAlign = 'left'
        x.fillText(label[0], -88 * k, -98 * k)
        x.font = `${40 * k}px Georgia, serif`
        x.fillText(label[1], -86 * k, -52 * k)
        x.font = `${150 * k}px Georgia, serif`
        x.textAlign = 'center'
        x.fillText(label[1], 0, 55 * k)
        x.restore()
      }
      card(W * 0.34, H * 0.4, -0.35, ['A', '♠'], false)
      card(W * 0.5, H * 0.37, 0.08, ['Q', '♥'], true)
      card(W * 0.66, H * 0.43, 0.42, ['K', '♠'], false)
      card(W * 0.28, H * 0.7, 2.6, ['7', '♥'], true)
      const die = (cx, cy, rot, n) => {
        x.save()
        x.translate(cx, cy)
        x.rotate(rot)
        x.shadowColor = 'rgba(0,0,0,0.85)'
        x.shadowBlur = 24 * k
        x.shadowOffsetY = 10 * k
        x.fillStyle = '#7d0c14'
        x.beginPath()
        x.roundRect(-45 * k, -45 * k, 90 * k, 90 * k, 16 * k)
        x.fill()
        x.shadowColor = 'transparent'
        x.fillStyle = 'rgba(255,120,110,0.35)'
        x.beginPath()
        x.roundRect(-45 * k, -45 * k, 90 * k, 22 * k, 16 * k)
        x.fill()
        x.fillStyle = '#efe9e2'
        const P = { 1: [[0, 0]], 3: [[-1, -1], [0, 0], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n]
        for (const [a, b] of P) {
          x.beginPath()
          x.arc(a * 22 * k, b * 22 * k, 8 * k, 0, Math.PI * 2)
          x.fill()
        }
        x.restore()
      }
      die(W * 0.57, H * 0.66, 0.5, 6)
      die(W * 0.7, H * 0.62, -0.3, 1)
      // candle, top-down: wax disc + flame glow
      const ccx = W * 0.78
      const ccy = H * 0.8
      x.fillStyle = '#cfc6bb'
      x.beginPath()
      x.arc(ccx, ccy, 42 * k, 0, Math.PI * 2)
      x.fill()
      glow(ccx, ccy, 220 * k, [255, 170, 110], 0.55)
      glow(ccx, ccy, 40 * k, [255, 235, 200], 0.9)
      // chips
      for (let i = 0; i < 6; i++) {
        x.fillStyle = i % 2 ? '#1a1415' : '#6a0a11'
        x.beginPath()
        x.arc(W * 0.42 + i * 6 * k, H * 0.82 - i * 5 * k, 34 * k, 0, Math.PI * 2)
        x.fill()
        x.strokeStyle = 'rgba(240,230,220,0.35)'
        x.setLineDash([8 * k, 8 * k])
        x.lineWidth = 4 * k
        x.stroke()
        x.setLineDash([])
      }
      smoke(0.12, [120, 100, 100], 10)
    },

    // The horror room: one bulb, one chair, one camera, something in the doorway.
    room() {
      const k = Math.min(W, H) / 1000
      const bx = W * 0.5
      const by = H * 0.3
      const floorY = H * 0.68
      x.fillStyle = '#0b0a0a'
      x.fillRect(0, 0, W, floorY)
      x.fillStyle = '#080707'
      x.fillRect(0, floorY, W, H - floorY)
      smoke(0.35, [40, 36, 34], 22, 'source-over')
      glow(bx, by + 60 * k, Math.max(W, H) * 0.55, [120, 110, 100], 0.55)
      glow(bx, floorY + 60 * k, W * 0.45, [110, 100, 92], 0.35, 0.25)
      // doorway, slightly open, red spill
      const dx = W * 0.8
      x.fillStyle = '#030202'
      x.fillRect(dx, floorY - 520 * k, 170 * k, 520 * k)
      glow(dx + 20 * k, floorY - 250 * k, 200 * k, [150, 10, 20], 0.5, 2.2)
      blur(3 * U, () => person(dx + 90 * k, floorY - 380 * k, k * 1.1, 'rgba(0,0,0,0.9)'))
      x.fillStyle = '#100d0d'
      x.beginPath()
      x.moveTo(dx - 4 * k, floorY - 520 * k)
      x.lineTo(dx + 60 * k, floorY - 505 * k)
      x.lineTo(dx + 60 * k, floorY + 10 * k)
      x.lineTo(dx - 4 * k, floorY)
      x.fill()
      // cord + bulb
      x.strokeStyle = '#050404'
      x.lineWidth = 4 * k
      x.beginPath()
      x.moveTo(bx, 0)
      x.lineTo(bx, by - 30 * k)
      x.stroke()
      glow(bx, by, 260 * k, [255, 220, 190], 0.45)
      glow(bx, by, 60 * k, [255, 245, 230], 0.95)
      // chair and its shadow
      const cx0 = bx - 10 * k
      const seatY = floorY - 110 * k
      blur(22 * U, () => {
        x.fillStyle = 'rgba(0,0,0,0.75)'
        x.beginPath()
        x.ellipse(cx0 + 10 * k, floorY + 45 * k, 170 * k, 30 * k, 0, 0, Math.PI * 2)
        x.fill()
      })
      blur(1.5 * U, () => {
        x.fillStyle = '#050404'
        x.fillRect(cx0 - 80 * k, seatY, 160 * k, 16 * k)
        for (const lx of [-74, 62]) x.fillRect(cx0 + lx * k, seatY, 12 * k, 110 * k)
        for (const lx of [-74, 62]) x.fillRect(cx0 + lx * k, seatY - 190 * k, 12 * k, 190 * k)
        for (const yy of [-180, -130, -80]) x.fillRect(cx0 - 74 * k, seatY + yy * k, 148 * k, 12 * k)
      })
      x.fillStyle = 'rgba(200,190,180,0.12)'
      x.fillRect(cx0 - 80 * k, seatY, 160 * k, 3 * k)
      // tripod camera, foreground left, red REC light
      const tx = W * 0.16
      const ty = H * 0.62
      blur(4 * U, () => {
        x.strokeStyle = '#020101'
        x.lineWidth = 12 * k
        for (const a of [-0.28, 0, 0.3]) {
          x.beginPath()
          x.moveTo(tx, ty)
          x.lineTo(tx + Math.sin(a) * 600 * k, ty + Math.cos(a) * 600 * k)
          x.stroke()
        }
        x.fillStyle = '#020101'
        x.beginPath()
        x.roundRect(tx - 110 * k, ty - 150 * k, 220 * k, 140 * k, 10 * k)
        x.fill()
        x.fillRect(tx + 100 * k, ty - 115 * k, 80 * k, 70 * k)
      })
      x.fillStyle = '#ff2a2a'
      x.beginPath()
      x.arc(tx - 75 * k, ty - 118 * k, 8 * k, 0, Math.PI * 2)
      x.fill()
      glow(tx - 75 * k, ty - 118 * k, 40 * k, [255, 30, 30], 0.8)
    },

    // ── PARTY ────────────────────────────────────────────────────────────
    // Packed floor, hands up, red lasers, sparks, one set of horns in the crowd.
    party() {
      const lx = W * (0.45 + r() * 0.1)
      glow(lx, H * 0.12, Math.max(W, H) * 0.8, RED, 0.9, 0.7)
      glow(W * 0.12, H * 0.3, Math.max(W, H) * 0.35, [190, 70, 20], 0.35)
      glow(lx, H * 0.08, Math.max(W, H) * 0.2, [255, 150, 120], 0.45)
      lasers(lx, H * 0.05, 9, 1.5, 0.55)
      smoke(0.35, [140, 30, 35], 18)
      sparks(70, [0, 0, W, H * 0.55], (t) => (t < 0.7 ? 'rgba(255,225,210,0.8)' : 'rgba(255,60,60,0.8)'))
      const rows = 4
      for (let row = 0; row < rows; row++) {
        const k = (0.6 + row * 0.5) * (H / 1000) * (W < H ? 0.75 : 1)
        const y = H * (0.5 + row * 0.12)
        const shade = ['#1c0708', '#110405', '#080304', '#030202'][row]
        blur([9, 5, 3, 2][row] * U, () => {
          let i = 0
          for (let px = -60 * k; px < W + 60 * k; px += 120 * k * (0.8 + r() * 0.35)) {
            const arm = r() < 0.45 ? (r() < 0.5 ? -1 : 1) : 0
            person(px, y + r() * 30 * k, k * (0.9 + r() * 0.2), shade, arm)
            if (row === 2 && Math.abs(px - W * 0.5) < 90 * k && i++ === 0) horns(px, y, k, shade)
          }
        })
      }
    },

    // A camera flash going off mid-floor: silhouettes rim-lit white, red haze,
    // costumes caught in the burst.
    flashcrowd() {
      const fx = W * (0.4 + r() * 0.2)
      const fy = H * (0.3 + r() * 0.1)
      glow(W * 0.5, H * 0.25, Math.max(W, H) * 0.7, [140, 12, 22], 0.75)
      glow(fx, fy, Math.max(W, H) * 0.45, [255, 245, 238], 0.55)
      glow(fx, fy, Math.max(W, H) * 0.08, [255, 255, 255], 1)
      // starburst
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + r() * 0.3
        blur(3 * U, () => {
          x.globalCompositeOperation = 'screen'
          x.strokeStyle = 'rgba(255,250,245,0.35)'
          x.lineWidth = 3 * U
          x.beginPath()
          x.moveTo(fx, fy)
          x.lineTo(fx + Math.cos(a) * W * 0.25, fy + Math.sin(a) * W * 0.25)
          x.stroke()
        })
      }
      smoke(0.3, [160, 40, 45], 16)
      sparks(90, [0, 0, W, H * 0.7], (t) => (t < 0.6 ? 'rgba(255,235,225,0.85)' : 'rgba(255,60,70,0.85)'))
      const k0 = H / 1000
      const costumes = ['horns', 'hat', 'ears', null, null, 'horns', null, 'ears']
      const rows = [
        { y: 0.62, k: 0.9, shade: '#140607', rim: 0.35 },
        { y: 0.76, k: 1.35, shade: '#070303', rim: 0.6 },
        { y: 0.95, k: 1.9, shade: '#020101', rim: 0.85 },
      ]
      rows.forEach((row, ri) => {
        const k = k0 * row.k
        let n = 0
        for (let px = -50 * k; px < W + 60 * k; px += 125 * k * (0.8 + r() * 0.35)) {
          const arm = r() < 0.55 ? (r() < 0.5 ? -1 : 1) : 0
          const costume = costumes[(n++ + ri * 3) % costumes.length]
          const py = H * row.y + r() * 25 * k
          const draw = (fill) => {
            person(px, py, k, fill, arm)
            if (costume === 'horns') horns(px, py, k, fill)
            if (costume === 'hat') witchHat(px, py, k, fill)
            if (costume === 'ears') ears(px, py, k, fill)
          }
          // flash light wrapping round the edges (a soft halo, not a copy)
          blur(7 * U, () => draw(`rgba(255,240,232,${row.rim * 0.55})`))
          blur((2 - ri) * 2 * U + 1, () => draw(row.shade))
        }
      })
    },

    // Three coupes on the bar, red drinks lit from behind, candle bokeh.
    drinks() {
      const k = Math.min(W, H) / 1000
      for (let i = 0; i < 26; i++) {
        const c = r() < 0.6 ? [255, 150, 80] : [220, 30, 40]
        glow(W * r(), H * (0.05 + r() * 0.5), (30 + r() * 90) * k, c, 0.35 + r() * 0.3)
      }
      const barY = H * 0.72
      x.fillStyle = '#0b0707'
      x.fillRect(0, barY, W, H - barY)
      glow(W * 0.5, barY, W * 0.6, [150, 30, 20], 0.35, 0.12)
      const coupe = (cx, sc, level) => {
        const top = barY - 330 * sc
        x.save()
        // liquid
        const lg = x.createLinearGradient(0, top, 0, top + 70 * sc)
        lg.addColorStop(0, `rgba(230,40,50,${0.95 * level})`)
        lg.addColorStop(1, `rgba(90,5,12,${level})`)
        x.fillStyle = lg
        x.beginPath()
        x.ellipse(cx, top + 8 * sc, 115 * sc, 72 * sc, 0, 0, Math.PI)
        x.fill()
        // glass
        x.strokeStyle = 'rgba(240,230,225,0.5)'
        x.lineWidth = 3 * sc
        x.beginPath()
        x.ellipse(cx, top, 125 * sc, 88 * sc, 0, 0, Math.PI)
        x.stroke()
        x.beginPath()
        x.ellipse(cx, top, 125 * sc, 14 * sc, 0, 0, Math.PI * 2)
        x.stroke()
        x.lineWidth = 5 * sc
        x.beginPath()
        x.moveTo(cx, top + 88 * sc)
        x.lineTo(cx, barY - 8 * sc)
        x.stroke()
        x.beginPath()
        x.ellipse(cx, barY - 6 * sc, 60 * sc, 8 * sc, 0, 0, Math.PI * 2)
        x.stroke()
        // highlight
        x.strokeStyle = 'rgba(255,255,255,0.7)'
        x.lineWidth = 4 * sc
        x.beginPath()
        x.arc(cx - 70 * sc, top + 20 * sc, 40 * sc, 0.9, 1.6)
        x.stroke()
        x.restore()
        glow(cx, top + 30 * sc, 150 * sc, [230, 40, 50], 0.25)
      }
      coupe(W * 0.28, k * 1.05, 1)
      coupe(W * 0.52, k * 1.25, 1)
      coupe(W * 0.77, k * 0.95, 0.9)
      // reflection
      x.save()
      x.globalAlpha = 0.18
      x.translate(0, barY * 2)
      x.scale(1, -1)
      x.drawImage(c, 0, barY - H * 0.28, W, H * 0.28, 0, barY - H * 0.28, W, H * 0.28)
      x.restore()
    },

    // A mirror ball, throwing red and white across the room.
    discoball() {
      const k = Math.min(W, H) / 1000
      const cx = W * 0.5
      const cy = H * 0.42
      const R = 250 * k
      glow(cx, cy, Math.max(W, H) * 0.5, [120, 10, 18], 0.6)
      x.strokeStyle = 'rgba(160,150,140,0.5)'
      x.lineWidth = 3 * k
      x.beginPath()
      x.moveTo(cx, 0)
      x.lineTo(cx, cy - R)
      x.stroke()
      // facets
      const rows = 18
      for (let i = 0; i < rows; i++) {
        const la0 = -Math.PI / 2 + (i / rows) * Math.PI
        const la1 = -Math.PI / 2 + ((i + 1) / rows) * Math.PI
        const cols = Math.max(4, Math.round(36 * Math.cos((la0 + la1) / 2)))
        for (let j = 0; j < cols; j++) {
          const lo0 = -Math.PI / 2 + (j / cols) * Math.PI
          const lo1 = -Math.PI / 2 + ((j + 1) / cols) * Math.PI
          const pt = (la, lo) => [cx + R * Math.cos(la) * Math.sin(lo), cy + R * Math.sin(la)]
          const q = [pt(la0, lo0), pt(la0, lo1), pt(la1, lo1), pt(la1, lo0)]
          const light = 0.25 + 0.75 * Math.max(0, Math.cos(la0 + 0.6) * Math.cos(lo0 + 0.5))
          const hot = r() < 0.06
          const red = r() < 0.12
          const v = Math.round((hot ? 255 : 70 + light * 150) * (0.7 + r() * 0.3))
          x.fillStyle = red ? `rgb(${Math.min(255, v + 40)},${v * 0.15},${v * 0.2})` : `rgb(${v},${v - 4},${v - 8})`
          x.beginPath()
          q.forEach(([a, b], n) => (n ? x.lineTo(a, b) : x.moveTo(a, b)))
          x.fill()
          x.strokeStyle = 'rgba(0,0,0,0.6)'
          x.lineWidth = 1.5 * k
          x.stroke()
          if (hot) glow(q[0][0], q[0][1], 40 * k, [255, 245, 235], 0.8)
        }
      }
      glow(cx - R * 0.4, cy - R * 0.4, R * 0.5, [255, 250, 245], 0.35)
      for (let i = 0; i < 80; i++) {
        const c2 = r() < 0.3 ? [255, 50, 60] : [255, 240, 230]
        glow(W * r(), H * r(), (4 + r() * 12) * k, c2, 0.5 + r() * 0.4)
      }
    },

    // Candles in the dark, wax running.
    candles() {
      const k = Math.min(W, H) / 1000
      glow(W * 0.5, H * 0.55, Math.max(W, H) * 0.5, [170, 70, 20], 0.35)
      const list = []
      for (let i = 0; i < 9; i++) list.push({ cx: W * (0.12 + r() * 0.76), h: (180 + r() * 380) * k, w: (46 + r() * 34) * k, d: r() })
      list.sort((a, b) => a.d - b.d)
      const base = H * 0.86
      for (const c2 of list) {
        const by = base - c2.d * 120 * k
        const top = by - c2.h
        const g = x.createLinearGradient(c2.cx - c2.w, 0, c2.cx + c2.w, 0)
        g.addColorStop(0, '#2a1a12')
        g.addColorStop(0.35, '#d9c6ad')
        g.addColorStop(1, '#1a100c')
        x.fillStyle = g
        x.fillRect(c2.cx - c2.w, top, c2.w * 2, c2.h)
        x.fillStyle = '#e8d9c4'
        x.beginPath()
        x.ellipse(c2.cx, top, c2.w, c2.w * 0.22, 0, 0, Math.PI * 2)
        x.fill()
        for (let dd = 0; dd < 3; dd++) {
          x.fillRect(c2.cx - c2.w + r() * c2.w * 2, top, 7 * k, (20 + r() * 70) * k)
        }
        glow(c2.cx, top - 30 * k, 180 * k, [255, 150, 60], 0.45)
        x.fillStyle = '#fff3d6'
        x.beginPath()
        x.ellipse(c2.cx, top - 26 * k, 8 * k, 22 * k, 0, 0, Math.PI * 2)
        x.fill()
        glow(c2.cx, top - 26 * k, 30 * k, [255, 220, 150], 0.9)
      }
      x.fillStyle = '#060404'
      x.fillRect(0, base + 10 * k, W, H)
    },

    // A carved pumpkin, only its light showing.
    pumpkin() {
      const k = Math.min(W, H) / 1000
      const cx = W * 0.5
      const cy = H * 0.58
      glow(cx, cy, Math.max(W, H) * 0.45, [150, 50, 10], 0.35)
      for (let i = -3; i <= 3; i++) {
        const g = x.createRadialGradient(cx + i * 60 * k, cy - 60 * k, 10 * k, cx + i * 60 * k, cy, 260 * k)
        g.addColorStop(0, '#4a1c06')
        g.addColorStop(1, '#0c0401')
        x.fillStyle = g
        x.beginPath()
        x.ellipse(cx + i * 58 * k, cy, (120 - Math.abs(i) * 12) * k, 230 * k, 0, 0, Math.PI * 2)
        x.fill()
      }
      x.fillStyle = '#1a1206'
      x.fillRect(cx - 14 * k, cy - 270 * k, 28 * k, 60 * k)
      const hole = (pts) =>
        blur(4 * U, () => {
          const g = x.createRadialGradient(cx, cy, 0, cx, cy, 200 * k)
          g.addColorStop(0, '#ffd27a')
          g.addColorStop(1, '#c2560f')
          x.fillStyle = g
          x.beginPath()
          pts.forEach(([a, b], n) => (n ? x.lineTo(cx + a * k, cy + b * k) : x.moveTo(cx + a * k, cy + b * k)))
          x.fill()
        })
      hole([[-150, -40], [-80, -40], [-115, -110]])
      hole([[150, -40], [80, -40], [115, -110]])
      hole([[-160, 60], [-110, 80], [-80, 60], [-40, 90], [0, 60], [40, 90], [80, 60], [110, 80], [160, 60], [100, 140], [-100, 140]])
      glow(cx, cy + 20 * k, 260 * k, [255, 140, 40], 0.45)
    },

    // Costume portraits: backlit, flash on the face, one prop each.
    costume() {
      const kind = ['horns', 'veil', 'hat', 'ears'][seed % 4]
      const px = W * 0.5
      const k = W / 330
      const py = H * 0.5
      const rim = kind === 'hat' ? [220, 90, 20] : [190, 15, 25]
      glow(px + 60 * k, py - 80 * k, Math.max(W, H) * 0.55, rim, 0.8)
      smoke(0.15, [110, 90, 90], 10)
      blur(14 * U, () => {
        person(px + 6 * k, py, k, `rgba(${rim[0]},${rim[1]},${rim[2]},0.85)`)
        if (kind === 'horns') horns(px + 6 * k, py, k, `rgba(${rim[0]},${rim[1]},${rim[2]},0.85)`)
        if (kind === 'hat') witchHat(px + 6 * k, py, k, `rgba(${rim[0]},${rim[1]},${rim[2]},0.85)`)
        if (kind === 'ears') ears(px + 6 * k, py, k, `rgba(${rim[0]},${rim[1]},${rim[2]},0.85)`)
      })
      blur(3 * U, () => {
        litPerson(px, py, k, 0.13, 0, kind === 'veil' ? null : kind)
        if (kind === 'ears' || kind === 'horns') maskEyes(px, py, k)
      })
      glow(px - 12 * k, headY(py, k), 34 * k, [255, 240, 230], 0.28)
      if (kind === 'veil') {
        blur(4 * U, () => {
          const hy = headY(py, k)
          const g = x.createLinearGradient(0, hy - 40 * k, 0, py + 160 * k)
          g.addColorStop(0, 'rgba(235,228,220,0.55)')
          g.addColorStop(1, 'rgba(235,228,220,0.05)')
          x.fillStyle = g
          x.beginPath()
          x.moveTo(px, hy - 38 * k)
          x.quadraticCurveTo(px - 60 * k, hy, px - 95 * k, py + 170 * k)
          x.lineTo(px + 95 * k, py + 170 * k)
          x.quadraticCurveTo(px + 60 * k, hy, px, hy - 38 * k)
          x.fill()
          x.fillStyle = '#1a0406'
          for (let i = -3; i <= 3; i++) {
            x.beginPath()
            x.arc(px + i * 9 * k, hy - 30 * k + Math.abs(i) * 3 * k, 6 * k, 0, Math.PI * 2)
            x.fill()
          }
        })
      }
    },

    // ── VENUE PLACEHOLDERS (replace with real Chhatarpur Farms photos) ──────
    venue() {
      const k = Math.min(W, H) / 1000
      const sky = x.createLinearGradient(0, 0, 0, H * 0.6)
      sky.addColorStop(0, '#040406')
      sky.addColorStop(1, '#120a0b')
      x.fillStyle = sky
      x.fillRect(0, 0, W, H)
      const horizon = H * 0.6
      // pavilion
      const pw = W * 0.34
      const px0 = W * 0.5 - pw / 2
      const ph = H * 0.2
      x.fillStyle = '#0d0909'
      x.fillRect(px0, horizon - ph, pw, ph)
      x.beginPath()
      x.moveTo(px0 - 30 * k, horizon - ph)
      x.lineTo(W * 0.5, horizon - ph - 90 * k)
      x.lineTo(px0 + pw + 30 * k, horizon - ph)
      x.fill()
      for (let i = 0; i < 7; i++) {
        const wx = px0 + 20 * k + i * (pw - 40 * k) / 7
        x.fillStyle = 'rgba(255,170,90,0.85)'
        x.fillRect(wx, horizon - ph + 30 * k, (pw - 40 * k) / 7 - 16 * k, ph - 50 * k)
      }
      glow(W * 0.5, horizon - ph / 2, pw, [255, 150, 70], 0.4, 0.5)
      // trees
      const tree = (tx, th, red) => {
        blur(3 * U, () => {
          x.fillStyle = '#050404'
          x.fillRect(tx - 8 * k, horizon - th * 0.45, 16 * k, th * 0.45)
          for (let i = 0; i < 26; i++) {
            x.beginPath()
            x.arc(tx + (r() - 0.5) * th * 0.6, horizon - th * 0.45 - r() * th * 0.55, (30 + r() * 60) * k, 0, Math.PI * 2)
            x.fill()
          }
        })
        if (red) glow(tx, horizon - th * 0.5, th * 0.6, [170, 15, 25], 0.35)
      }
      tree(W * 0.08, 620 * k, true)
      tree(W * 0.22, 480 * k, false)
      tree(W * 0.8, 560 * k, true)
      tree(W * 0.95, 700 * k, false)
      // lawn
      const lawn = x.createLinearGradient(0, horizon, 0, H)
      lawn.addColorStop(0, '#0c0d09')
      lawn.addColorStop(1, '#040403')
      x.fillStyle = lawn
      x.fillRect(0, horizon, W, H - horizon)
      smoke(0.25, [120, 110, 105], 16)
      // guests
      blur(2 * U, () => {
        for (let i = 0; i < 14; i++) person(W * (0.25 + r() * 0.5), horizon + (10 + r() * 40) * k, k * (0.35 + r() * 0.1), '#030202', r() < 0.3 ? 1 : 0)
      })
      // string lights across the foreground
      for (let n = 0; n < 3; n++) {
        const y0 = H * (0.08 + n * 0.1)
        const sag = H * (0.12 + n * 0.04)
        x.strokeStyle = 'rgba(30,25,20,0.9)'
        x.lineWidth = 2 * k
        x.beginPath()
        for (let t = 0; t <= 1.001; t += 0.01) {
          const lx2 = t * W
          const ly2 = y0 + sag * 4 * t * (1 - t)
          t ? x.lineTo(lx2, ly2) : x.moveTo(lx2, ly2)
        }
        x.stroke()
        for (let t = 0.02; t < 1; t += 0.045) {
          const lx2 = t * W
          const ly2 = y0 + sag * 4 * t * (1 - t) + 10 * k
          glow(lx2, ly2, (26 + n * 8) * k, [255, 190, 120], 0.8)
          glow(lx2, ly2, 6 * k, [255, 245, 220], 1)
        }
      }
    },

    // Close string lights, background melting into bokeh.
    lights() {
      const k = Math.min(W, H) / 1000
      for (let i = 0; i < 40; i++) {
        const c2 = r() < 0.75 ? [255, 180, 100] : [210, 30, 40]
        glow(W * r(), H * r(), (40 + r() * 110) * k, c2, 0.25 + r() * 0.3)
      }
      x.strokeStyle = 'rgba(20,16,14,1)'
      x.lineWidth = 4 * k
      x.beginPath()
      for (let t = 0; t <= 1.001; t += 0.01) {
        const lx2 = t * W
        const ly2 = H * 0.25 + H * 0.5 * t * t
        t ? x.lineTo(lx2, ly2) : x.moveTo(lx2, ly2)
      }
      x.stroke()
      for (let t = 0.08; t < 1; t += 0.14) {
        const lx2 = t * W
        const ly2 = H * 0.25 + H * 0.5 * t * t + 40 * k
        glow(lx2, ly2, 140 * k, [255, 190, 120], 0.55)
        x.fillStyle = '#fff1d8'
        x.beginPath()
        x.ellipse(lx2, ly2, 20 * k, 30 * k, 0, 0, Math.PI * 2)
        x.fill()
      }
    },

    // A path lined with lanterns, trees closing in.
    lanterns() {
      const k = Math.min(W, H) / 1000
      const vx = W * 0.5
      const vy = H * 0.42
      glow(vx, vy, Math.max(W, H) * 0.4, [140, 60, 30], 0.35)
      x.fillStyle = '#0a0807'
      x.beginPath()
      x.moveTo(vx - 20 * k, vy)
      x.lineTo(vx + 20 * k, vy)
      x.lineTo(W * 0.85, H)
      x.lineTo(W * 0.15, H)
      x.fill()
      for (let i = 0; i < 8; i++) {
        const t = Math.pow((i + 1) / 8, 1.6)
        for (const d of [-1, 1]) {
          const lx2 = vx + d * (20 * k + t * W * 0.4)
          const ly2 = vy + t * (H - vy) * 0.95
          const sz = (8 + t * 60) * k
          glow(lx2, ly2 - sz, sz * 5, [255, 160, 70], 0.5)
          x.fillStyle = 'rgba(255,215,160,0.9)'
          x.fillRect(lx2 - sz * 0.4, ly2 - sz * 1.4, sz * 0.8, sz * 1.1)
        }
      }
      for (const d of [-1, 1]) {
        blur(6 * U, () => {
          x.fillStyle = '#030202'
          for (let i = 0; i < 40; i++) {
            x.beginPath()
            x.arc(vx + d * (W * 0.25 + r() * W * 0.35), H * (r() * 0.5), (60 + r() * 120) * k, 0, Math.PI * 2)
            x.fill()
          }
        })
      }
      smoke(0.2, [120, 100, 90], 14)
    },

    // Looking up: branches strung with fairy lights.
    canopy() {
      const k = Math.min(W, H) / 1000
      glow(W * 0.5, H * 0.5, Math.max(W, H) * 0.6, [60, 20, 22], 0.6)
      const branch = (bx, by, ang, len, depth) => {
        if (depth === 0 || len < 20 * k) return
        const ex = bx + Math.cos(ang) * len
        const ey = by + Math.sin(ang) * len
        x.strokeStyle = '#040303'
        x.lineWidth = depth * 3.2 * k
        x.beginPath()
        x.moveTo(bx, by)
        x.lineTo(ex, ey)
        x.stroke()
        for (let i = 0; i < 4; i++) {
          const t = r()
          glow(bx + (ex - bx) * t, by + (ey - by) * t, 14 * k, [255, 200, 130], 0.9)
        }
        branch(ex, ey, ang - 0.3 - r() * 0.3, len * (0.62 + r() * 0.15), depth - 1)
        branch(ex, ey, ang + 0.3 + r() * 0.3, len * (0.62 + r() * 0.15), depth - 1)
      }
      branch(W * 0.5, H * 1.05, -Math.PI / 2, 380 * k, 8)
      branch(-20, H * 0.9, -Math.PI / 3, 300 * k, 7)
      branch(W + 20, H * 0.9, (-Math.PI * 2) / 3, 300 * k, 7)
    },

    // ── HELL ICHOR (placeholder for the real product photo) ─────────────────
    // One goblet on black stone: dark red liquid glowing at the surface,
    // gold rim light, smoke rising.
    goblet() {
      const k = Math.min(W, H) / 1000
      const cx = W * 0.5
      const baseY = H * 0.8
      glow(cx, H * 0.35, Math.max(W, H) * 0.55, [120, 8, 16], 0.7)
      glow(cx + 180 * k, H * 0.2, Math.max(W, H) * 0.3, [200, 140, 60], 0.25)
      // stone surface
      const st = x.createLinearGradient(0, baseY, 0, H)
      st.addColorStop(0, '#15100f')
      st.addColorStop(1, '#040303')
      x.fillStyle = st
      x.fillRect(0, baseY, W, H - baseY)
      x.strokeStyle = 'rgba(120,100,90,0.08)'
      for (let i = 0; i < 14; i++) {
        x.lineWidth = (1 + r() * 2) * k
        x.beginPath()
        x.moveTo(r() * W, baseY + r() * (H - baseY))
        x.bezierCurveTo(r() * W, baseY + r() * 200 * k, r() * W, H, r() * W, baseY + r() * (H - baseY))
        x.stroke()
      }
      // goblet body
      const bw = 190 * k
      const top = baseY - 560 * k
      const bowlH = 300 * k
      const goblet = (fillBowl) => {
        x.beginPath()
        x.moveTo(cx - bw, top)
        x.bezierCurveTo(cx - bw, top + bowlH * 0.9, cx - 40 * k, top + bowlH, cx - 22 * k, top + bowlH + 20 * k)
        x.lineTo(cx - 14 * k, baseY - 60 * k)
        x.bezierCurveTo(cx - 20 * k, baseY - 30 * k, cx - 130 * k, baseY - 20 * k, cx - 130 * k, baseY)
        x.lineTo(cx + 130 * k, baseY)
        x.bezierCurveTo(cx + 130 * k, baseY - 20 * k, cx + 20 * k, baseY - 30 * k, cx + 14 * k, baseY - 60 * k)
        x.lineTo(cx + 22 * k, top + bowlH + 20 * k)
        x.bezierCurveTo(cx + 40 * k, top + bowlH, cx + bw, top + bowlH * 0.9, cx + bw, top)
        x.closePath()
        fillBowl()
      }
      goblet(() => {
        const g = x.createLinearGradient(cx - bw, 0, cx + bw, 0)
        g.addColorStop(0, '#2a0508')
        g.addColorStop(0.45, '#100203')
        g.addColorStop(0.8, '#3a0a0c')
        g.addColorStop(1, '#120203')
        x.fillStyle = g
        x.fill()
      })
      // liquid surface (glowing)
      const ly = top + 60 * k
      glow(cx, ly, 260 * k, [230, 30, 45], 0.55, 0.35)
      x.fillStyle = '#b3121f'
      x.beginPath()
      x.ellipse(cx, ly, bw * 0.93, 26 * k, 0, 0, Math.PI * 2)
      x.fill()
      const sheen = x.createRadialGradient(cx - 50 * k, ly - 6 * k, 0, cx, ly, bw)
      sheen.addColorStop(0, 'rgba(255,120,110,0.9)')
      sheen.addColorStop(1, 'rgba(120,0,10,0)')
      x.fillStyle = sheen
      x.beginPath()
      x.ellipse(cx, ly, bw * 0.93, 26 * k, 0, 0, Math.PI * 2)
      x.fill()
      // gold rim + edge lights
      x.strokeStyle = 'rgba(230,185,110,0.9)'
      x.lineWidth = 4 * k
      x.beginPath()
      x.ellipse(cx, top, bw, 30 * k, 0, Math.PI, Math.PI * 2)
      x.stroke()
      x.strokeStyle = 'rgba(230,185,110,0.45)'
      x.beginPath()
      x.ellipse(cx, top, bw, 30 * k, 0, 0, Math.PI)
      x.stroke()
      blur(3 * U, () => {
        x.strokeStyle = 'rgba(245,200,130,0.75)'
        x.lineWidth = 6 * k
        x.beginPath()
        x.moveTo(cx + bw - 8 * k, top + 20 * k)
        x.bezierCurveTo(cx + bw - 8 * k, top + bowlH * 0.8, cx + 50 * k, top + bowlH, cx + 22 * k, top + bowlH + 30 * k)
        x.stroke()
        x.strokeStyle = 'rgba(255,255,255,0.35)'
        x.lineWidth = 10 * k
        x.beginPath()
        x.moveTo(cx - bw + 30 * k, top + 60 * k)
        x.bezierCurveTo(cx - bw + 36 * k, top + 170 * k, cx - bw + 70 * k, top + 230 * k, cx - bw + 100 * k, top + 260 * k)
        x.stroke()
      })
      x.fillStyle = 'rgba(230,185,110,0.6)'
      x.fillRect(cx - 130 * k, baseY - 4 * k, 260 * k, 4 * k)
      // reflection
      x.save()
      x.globalAlpha = 0.12
      x.translate(0, baseY * 2)
      x.scale(1, -1)
      x.drawImage(c, 0, baseY - 400 * k, W, 400 * k, 0, baseY - 400 * k, W, 400 * k)
      x.restore()
      // smoke rising off the surface
      for (let i = 0; i < 5; i++) {
        blur(18 * U, () => {
          x.strokeStyle = `rgba(230,220,215,${0.06 + r() * 0.06})`
          x.lineWidth = (18 + r() * 30) * k
          x.beginPath()
          let sx = cx + (r() - 0.5) * 120 * k
          let sy = ly
          x.moveTo(sx, sy)
          for (let j = 0; j < 6; j++) {
            const nx = sx + (r() - 0.5) * 160 * k
            const ny = sy - (60 + r() * 60) * k
            x.quadraticCurveTo(sx + (r() - 0.5) * 200 * k, (sy + ny) / 2, nx, ny)
            sx = nx
            sy = ny
          }
          x.stroke()
        })
      }
      sparks(26, [cx - 300 * k, top - 400 * k, 600 * k, 500 * k], () => 'rgba(255,190,120,0.7)')
    },

    // Macro: dark red swirling into black, flecks of gold.
    swirl() {
      const k = Math.min(W, H) / 1000
      x.fillStyle = '#080203'
      x.fillRect(0, 0, W, H)
      for (let i = 0; i < 26; i++) {
        blur((6 + r() * 20) * U, () => {
          x.strokeStyle = `rgba(${150 + r() * 80},${r() * 20},${10 + r() * 20},${0.25 + r() * 0.4})`
          x.lineWidth = (10 + r() * 60) * k
          x.beginPath()
          const cx = W * (0.3 + r() * 0.4)
          const cy = H * (0.3 + r() * 0.4)
          x.arc(cx, cy, (80 + r() * 380) * k, r() * 6, r() * 6 + 2 + r() * 3)
          x.stroke()
        })
      }
      glow(W * 0.55, H * 0.45, Math.max(W, H) * 0.35, [220, 40, 50], 0.35)
      for (let i = 0; i < 160; i++) glow(W * r(), H * r(), (2 + r() * 7) * k, [240, 190, 110], 0.5 + r() * 0.5)
    },

    // ── DRESS-UP: character portraits, each with its own light ──────────────
    character() {
      const CH = {
        vampire: [170, 10, 25], ghost: [150, 190, 220], clown: [230, 120, 30], zombie: [110, 170, 60],
        witch: [140, 70, 200], skeleton: [225, 215, 195], demon: [220, 30, 20], killer: [120, 140, 160],
        creature: [220, 150, 40], angel: [210, 170, 90], doll: [220, 80, 150],
      }
      const kind = Object.keys(CH)[seed % 11]
      const col = CH[kind]
      const rgba = (a) => `rgba(${col[0]},${col[1]},${col[2]},${a})`
      const px = W * 0.5
      const k = W / 330
      const py = H * 0.52
      const hy = headY(py, k)
      // nightlife bokeh + accent light
      for (let i = 0; i < 18; i++) glow(W * r(), H * r() * 0.7, (20 + r() * 60) * k * 0.3, r() < 0.5 ? col : [255, 200, 150], 0.25 + r() * 0.25)
      glow(px + 50 * k, py - 90 * k, Math.max(W, H) * 0.55, col, 0.75)
      smoke(0.14, [110, 100, 100], 10)
      const tilt = kind === 'zombie' ? 0.18 : 0
      const shape = (fill) => {
        x.save()
        x.translate(px, py)
        x.rotate(tilt)
        x.translate(-px, -py)
        if (kind === 'angel') {
          x.fillStyle = fill
          for (const d of [-1, 1]) {
            x.beginPath()
            x.moveTo(px + d * 30 * k, py + 20 * k)
            x.bezierCurveTo(px + d * 170 * k, py - 160 * k, px + d * 150 * k, py - 20 * k, px + d * 160 * k, py + 200 * k)
            x.bezierCurveTo(px + d * 100 * k, py + 120 * k, px + d * 60 * k, py + 80 * k, px + d * 30 * k, py + 20 * k)
            x.fill()
          }
        }
        if (kind === 'vampire') {
          x.fillStyle = fill
          for (const d of [-1, 1]) {
            x.beginPath()
            x.moveTo(px + d * 14 * k, py + 12 * k)
            x.lineTo(px + d * 44 * k, hy - 22 * k)
            x.lineTo(px + d * 58 * k, py + 30 * k)
            x.fill()
          }
        }
        person(px, py, k, fill)
        if (kind === 'demon') horns(px, py, k, fill)
        if (kind === 'witch') witchHat(px, py, k, fill)
        if (kind === 'clown') {
          x.fillStyle = fill
          x.beginPath()
          x.moveTo(px - 16 * k, hy - 24 * k)
          x.lineTo(px + 6 * k, hy - 96 * k)
          x.lineTo(px + 22 * k, hy - 22 * k)
          x.fill()
          x.beginPath()
          x.arc(px + 6 * k, hy - 98 * k, 9 * k, 0, Math.PI * 2)
          x.fill()
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2
            x.beginPath()
            x.arc(px + Math.cos(a) * 46 * k, py + 6 * k + Math.sin(a) * 14 * k, 14 * k, 0, Math.PI * 2)
            x.fill()
          }
        }
        if (kind === 'killer') {
          x.fillStyle = fill
          x.beginPath()
          x.moveTo(px - 40 * k, py + 20 * k)
          x.quadraticCurveTo(px - 46 * k, hy - 60 * k, px, hy - 52 * k)
          x.quadraticCurveTo(px + 46 * k, hy - 60 * k, px + 40 * k, py + 20 * k)
          x.fill()
        }
        if (kind === 'creature') {
          x.strokeStyle = fill
          x.lineWidth = 5 * k
          for (const d of [-1, 1]) {
            x.beginPath()
            x.moveTo(px + d * 12 * k, hy - 22 * k)
            x.lineTo(px + d * 50 * k, hy - 80 * k)
            x.lineTo(px + d * 80 * k, hy - 110 * k)
            x.moveTo(px + d * 40 * k, hy - 64 * k)
            x.lineTo(px + d * 30 * k, hy - 104 * k)
            x.moveTo(px + d * 62 * k, hy - 92 * k)
            x.lineTo(px + d * 92 * k, hy - 84 * k)
            x.stroke()
          }
        }
        if (kind === 'doll') {
          x.fillStyle = fill
          for (const d of [-1, 1]) {
            x.beginPath()
            x.moveTo(px, hy - 28 * k)
            x.lineTo(px + d * 34 * k, hy - 50 * k)
            x.lineTo(px + d * 30 * k, hy - 14 * k)
            x.fill()
          }
        }
        x.restore()
      }
      blur(16 * U, () => shape(rgba(0.9)))
      blur(3 * U, () => shape('#0b0909'))
      // faces: each character gets its own face treatment
      x.save()
      x.translate(px, py)
      x.rotate(tilt)
      x.translate(-px, -py)
      const face = (fill) => {
        x.fillStyle = fill
        x.beginPath()
        x.ellipse(px, hy, 21 * k, 27 * k, 0, 0, Math.PI * 2)
        x.fill()
      }
      const eyes = (fill, rx = 5, ry = 3) => {
        x.fillStyle = fill
        for (const d of [-1, 1]) {
          x.beginPath()
          x.ellipse(px + d * 8.5 * k, hy - 3 * k, rx * k, ry * k, d * 0.15, 0, Math.PI * 2)
          x.fill()
        }
      }
      blur(2 * U, () => {
        if (['ghost', 'skeleton', 'killer', 'clown', 'doll'].includes(kind)) {
          const g = x.createRadialGradient(px - 8 * k, hy - 8 * k, 0, px, hy, 30 * k)
          g.addColorStop(0, '#e8e2da')
          g.addColorStop(1, '#6a625c')
          face(g)
        } else face(rgba(0.25))
        if (kind === 'skeleton' || kind === 'killer') eyes('#050404', 6, 5)
        if (kind === 'skeleton') {
          x.fillStyle = '#050404'
          x.beginPath()
          x.moveTo(px, hy + 4 * k)
          x.lineTo(px - 3 * k, hy + 10 * k)
          x.lineTo(px + 3 * k, hy + 10 * k)
          x.fill()
          for (let i = -3; i <= 3; i++) x.fillRect(px + i * 3.2 * k, hy + 15 * k, 1.2 * k, 6 * k)
        }
        if (kind === 'clown') {
          eyes('#0a0a0a', 3.5, 3.5)
          x.fillStyle = '#c2121c'
          x.beginPath()
          x.arc(px, hy + 5 * k, 4 * k, 0, Math.PI * 2)
          x.fill()
          x.beginPath()
          x.ellipse(px, hy + 15 * k, 9 * k, 3 * k, 0, 0, Math.PI)
          x.fill()
        }
        if (kind === 'doll') {
          eyes('#0a0a0a', 4, 4)
          x.fillStyle = 'rgba(230,90,140,0.6)'
          for (const d of [-1, 1]) {
            x.beginPath()
            x.arc(px + d * 12 * k, hy + 8 * k, 4 * k, 0, Math.PI * 2)
            x.fill()
          }
          x.strokeStyle = '#2a2020'
          x.lineWidth = 0.8 * k
          x.beginPath()
          x.moveTo(px + 5 * k, hy - 26 * k)
          x.lineTo(px + 9 * k, hy - 10 * k)
          x.lineTo(px + 5 * k, hy)
          x.stroke()
        }
        if (kind === 'ghost') eyes('#1a1c22', 5, 4)
      })
      if (['vampire', 'demon', 'creature', 'zombie', 'witch', 'angel'].includes(kind)) {
        const ec = kind === 'zombie' ? [180, 230, 90] : kind === 'witch' ? [200, 150, 255] : kind === 'angel' ? [255, 220, 150] : kind === 'creature' ? [255, 180, 40] : [255, 40, 40]
        for (const d of [-1, 1]) glow(px + d * 8.5 * k, hy - 3 * k, 6 * k, ec, 1)
      }
      x.restore()
      if (kind === 'ghost') {
        blur(4 * U, () => {
          const g = x.createLinearGradient(0, hy - 40 * k, 0, H)
          g.addColorStop(0, 'rgba(225,235,245,0.5)')
          g.addColorStop(1, 'rgba(225,235,245,0.04)')
          x.fillStyle = g
          x.beginPath()
          x.moveTo(px, hy - 36 * k)
          x.quadraticCurveTo(px - 70 * k, hy, px - 120 * k, H)
          x.lineTo(px + 120 * k, H)
          x.quadraticCurveTo(px + 70 * k, hy, px, hy - 36 * k)
          x.fill()
        })
      }
      glow(px - 14 * k, hy, 40 * k, [255, 245, 235], 0.2)
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
  if (stamp) {
    x.font = `600 ${Math.round(U * 17)}px system-ui, sans-serif`
    x.fillStyle = 'rgba(242,240,236,0.55)'
    x.textBaseline = 'bottom'
    x.letterSpacing = `${Math.round(U * 4)}px`
    x.fillText(stamp, U * 34, H - U * 30)
  }
  return c.toDataURL('image/png')
}

// ---------------------------------------------------------------------------

const only = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()

for (const [file, scene, w, h, seed, stamp] of JOBS) {
  if (only && (only === 'og' || !file.includes(only))) continue
  const url = await page.evaluate(
    ([fn, ...args]) => new Function(`return (${fn})`)()(...args),
    [paint.toString(), scene, w, h, seed, stamp],
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
