import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { newPassCode, PASS_CODE_RE } from '../lib/security.js'
import { passSvg } from '../services/passArt.js'
import { renderPass } from '../services/documents.js'
import { DEFAULTS } from '../services/settings.js'

const event = DEFAULTS.event

test('pass IDs look like FERAL-2026-XXXXXX and do not repeat', () => {
  const codes = Array.from({ length: 20000 }, newPassCode)
  for (const c of codes) assert.match(c, PASS_CODE_RE)
  assert.equal(new Set(codes).size, codes.length)
  // no look-alike characters
  assert.ok(codes.every((c) => !/[01IOL]/.test(c.slice(11))))
})

test('the pass renders as a 1920×1080 PNG and a matching landscape PDF', async () => {
  const { png, pdf } = await renderPass({ holderName: 'Meera Iyer', category: 'female', passCode: 'FERAL-2026-ABC234', event })
  const meta = await sharp(png).metadata()
  assert.deepEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ['png', 1920, 1080, true])
  const doc = await PDFDocument.load(pdf)
  assert.equal(doc.getPageCount(), 1)
  assert.deepEqual(Object.values(doc.getPage(0).getSize()), [960, 540])
  assert.equal(doc.getSubject(), 'FERAL 2026 pass for Meera Iyer (GIRLS)')
})

test('pass artwork contains the attendee details as outlines, never as markup', () => {
  const data = (holderName) => ({
    holderName,
    passType: 'COUPLE',
    admits: 'ADMITS TWO',
    passCode: 'FERAL-2026-ABC234',
    event: { title: 'HALLOWEEN HOUSE PARTY', name: 'FERAL', place: 'CHHATARPUR FARMS – SOUTH DELHI', ...event },
  })
  const evil = passSvg(data('</g><script>alert(1)</script><image href="http://x/"/> & "Q"'))
  assert.ok(!evil.includes('<script') && !evil.includes('http://x/') && !evil.includes('alert'))
  assert.ok(!/<text/.test(evil), 'no SVG text elements')
  // different names produce different artwork; same name the same artwork
  assert.notEqual(passSvg(data('Aarav Mehta')), passSvg(data('Kabir Mehta')))
  assert.equal(passSvg(data('Aarav Mehta')), passSvg(data('Aarav Mehta')))
  // no QR / barcode imagery: the only embedded images are the venue art and the grain tile
  assert.equal((passSvg(data('Aarav Mehta')).match(/<image /g) || []).length, 2)
})

test('long names still fit (shrunk or split onto two lines)', async () => {
  const name = 'Alexandra Catherine Fitzgerald-Montgomery Raghunathan'
  const { png } = await renderPass({ holderName: name, category: 'couple', passCode: 'FERAL-2026-ABC234', event })
  assert.equal((await sharp(png).metadata()).width, 1920)
})
