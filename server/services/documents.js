import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { PDFDocument, rgb, setCharacterSpacing, pushGraphicsState, popGraphicsState } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { passPng, passJpeg, PASS_W, PASS_H } from './passArt.js'
import { CATEGORY_LABEL, rupees } from '../lib/format.js'

// Pass (artwork in passArt.js) + receipt PDFs.

const require = createRequire(import.meta.url)
const fontFile = (pkg, file) => fs.readFileSync(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), file))
const FONTS = {
  display: fontFile('@expo-google-fonts/anton', '400Regular/Anton_400Regular.ttf'),
  bodyMedium: fontFile('@expo-google-fonts/inter', '500Medium/Inter_500Medium.ttf'),
}

const BLOOD = rgb(158 / 255, 15 / 255, 24 / 255)

async function setup(meta) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(meta.title)
  if (meta.subject) doc.setSubject(meta.subject)
  doc.setAuthor('FERAL')
  doc.setCreator('FERAL bookings')
  doc.setProducer('FERAL bookings')
  // Full embeds: pdf-lib's font subsetting drops glyphs with these fonts.
  // One Inter weight keeps each PDF small.
  const medium = await doc.embedFont(FONTS.bodyMedium, { subset: false })
  const f = { display: await doc.embedFont(FONTS.display, { subset: false }), body: medium, medium, semi: medium }
  return { doc, f }
}

// Text helper: optional letter-spacing, alignment and shrink-to-fit.
function text(page, str, { x, y, font, size, color = rgb(0, 0, 0), spacing = 0, align = 'left', maxWidth }) {
  str = String(str)
  const widthAt = (s) => font.widthOfTextAtSize(str, s) + spacing * Math.max(0, str.length - 1)
  let s = size
  if (maxWidth) while (s > 6 && widthAt(s) > maxWidth) s -= 0.5
  const w = widthAt(s)
  const dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0
  page.pushOperators(pushGraphicsState(), setCharacterSpacing(spacing))
  page.drawText(str, { x: x + dx, y, size: s, font, color })
  page.pushOperators(popGraphicsState())
  return s
}

function wrap(font, size, str, maxWidth) {
  const words = String(str).split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(t, size) > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = t
  }
  if (line) lines.push(line)
  return lines
}

/**
 * PassData: { holderName, category, passCode, event: { name, dateLabel, timeLabel, venue } }
 * Returns { png, pdf }: the pass artwork as a 1920×1080 PNG and as a landscape
 * 16:9 PDF of the same image. Contains no payment data and no QR code.
 */
export async function renderPass(p) {
  const art = {
    holderName: p.holderName,
    passType: CATEGORY_LABEL[p.category],
    admits: p.category === 'couple' ? 'ADMITS TWO' : 'ADMITS ONE',
    passCode: p.passCode,
    event: {
      title: 'HALLOWEEN HOUSE PARTY',
      name: 'FERAL',
      place: 'CHHATARPUR FARMS \u2013 SOUTH DELHI',
      dateLabel: p.event.dateLabel,
      timeLabel: p.event.timeLabel,
      venue: p.event.venue,
    },
  }
  const png = await passPng(art)
  const doc = await PDFDocument.create()
  doc.setTitle(`FERAL 2026 Official Pass ${p.passCode}`)
  doc.setSubject(`FERAL 2026 pass for ${p.holderName} (${art.passType})`)
  doc.setAuthor('FERAL')
  doc.setCreator('FERAL bookings')
  doc.setProducer('FERAL bookings')
  const W = PASS_W / 2
  const H = PASS_H / 2
  const page = doc.addPage([W, H])
  page.drawImage(await doc.embedJpg(await passJpeg(png)), { x: 0, y: 0, width: W, height: H })
  return { png, pdf: Buffer.from(await doc.save()) }
}

/**
 * ReceiptData: { preliminary, bookingCode, holderName, email, phone, category, referralCode,
 *   originalPaise, discountPaise, finalPaise, method, reference, verifiedAt, issuedAt, event }
 */
export async function renderReceipt(r) {
  const { doc, f } = await setup({ title: `FERAL ${r.preliminary ? 'booking' : 'payment'} receipt ${r.bookingCode}` })
  const W = 420
  const H = 595
  const page = doc.addPage([W, H])
  const M = 36
  const BLACK = rgb(0.06, 0.06, 0.06)
  const GREY = rgb(0.42, 0.42, 0.42)
  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: BLOOD })

  text(page, 'FERAL', { x: M, y: H - 62, font: f.display, size: 40, color: BLACK })
  text(page, r.preliminary ? 'BOOKING RECEIPT' : 'PAYMENT RECEIPT', { x: W - M, y: H - 46, font: f.semi, size: 9, color: BLACK, spacing: 1.8, align: 'right' })
  text(page, r.bookingCode, { x: W - M, y: H - 60, font: f.body, size: 9, color: GREY, align: 'right' })

  let y = H - 92
  if (r.preliminary) {
    page.drawRectangle({ x: M, y: y - 26, width: W - 2 * M, height: 30, color: rgb(1, 0.93, 0.93), borderColor: BLOOD, borderWidth: 0.8 })
    text(page, 'PAYMENT PENDING — NOT A CONFIRMED PASS', { x: W / 2, y: y - 15, font: f.semi, size: 9.5, color: BLOOD, spacing: 0.8, align: 'center' })
    y -= 46
  }

  const row = (k, v, { bold = false, color = BLACK } = {}) => {
    text(page, k, { x: M, y, font: f.body, size: 9, color: GREY })
    text(page, v, { x: W - M, y, font: bold ? f.semi : f.medium, size: bold ? 11 : 9.5, color, align: 'right', maxWidth: W - 2 * M - 120 })
    y -= bold ? 22 : 17
  }
  const rule = () => {
    page.drawRectangle({ x: M, y: y + 6, width: W - 2 * M, height: 0.5, color: rgb(0.85, 0.85, 0.85) })
    y -= 10
  }

  text(page, r.event.name, { x: M, y, font: f.semi, size: 10, color: BLACK, maxWidth: W - 2 * M })
  y -= 15
  text(page, `${r.event.dateLabel} · ${r.event.timeLabel} · ${r.event.venue}`, { x: M, y, font: f.body, size: 8.5, color: GREY, maxWidth: W - 2 * M })
  y -= 26
  rule()
  row('Name', r.holderName)
  row('Email', r.email)
  row('Phone', r.phone)
  rule()
  row('Pass', CATEGORY_LABEL[r.category])
  row('Original price', rupees(r.originalPaise))
  row(`Referral discount${r.referralCode ? ` (${r.referralCode})` : ''}`, r.discountPaise ? `−${rupees(r.discountPaise)}` : rupees(0))
  rule()
  row(r.preliminary ? 'Amount payable' : 'Amount paid', rupees(r.finalPaise), { bold: true, color: r.preliminary ? BLOOD : BLACK })
  if (!r.preliminary) {
    row('Payment method', r.method === 'razorpay' ? 'Razorpay' : 'UPI')
    row('Payment reference', r.reference || '—')
    row('Payment verified', fmtDate(r.verifiedAt))
  } else {
    row('Status', 'Awaiting payment')
  }
  row('Issued', fmtDate(r.issuedAt))

  const foot = r.preliminary
    ? 'This receipt confirms your booking request only. It is not a pass and not proof of payment. Your pass is emailed after the organisers verify your payment.'
    : 'This is a payment receipt for your FERAL pass. It is not a tax invoice.'
  wrap(f.body, 8, foot, W - 2 * M).forEach((l, i) => text(page, l, { x: M, y: 70 - i * 12, font: f.body, size: 8, color: GREY }))
  return Buffer.from(await doc.save())
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST' : '—'

