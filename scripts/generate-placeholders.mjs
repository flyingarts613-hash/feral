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

  ['images/experience/dj.jpg', 'dj', 1800, 1200, 21],
  ['images/experience/games.jpg', 'games', 1200, 1500, 22],
  ['images/experience/horror-room.jpg', 'room', 1200, 1500, 23],
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
