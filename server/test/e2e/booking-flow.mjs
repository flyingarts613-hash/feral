// End-to-end: the real built site (dist/) + server + Postgres, driven in
// Chromium at desktop and mobile sizes. Email/SMS use the in-memory test
// providers (NODE_ENV=test), so the OTP is read from the captured email.
//
//   npm run build && npm run test:e2e
// Needs TEST_DATABASE_URL (default postgresql://feral@localhost:5433/feral_test)
// and a Chromium for playwright-core (PLAYWRIGHT_CHROMIUM or /opt/pw-browsers/chromium).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright-core'
import { setup, adminSession, lastOtp } from '../helpers.js'
import { startWorker } from '../../services/worker.js'

process.env.NODE_ENV = 'test'
const PORT = 8790
const BASE = `http://localhost:${PORT}`
const shots = process.env.E2E_SHOTS || null
const results = []
const ok = (name, cond, info = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} · ${name}${info ? ` — ${info}` : ''}`)
}

const t = await setup({ SERVE_STATIC: 'true', APP_URL: BASE, WORKER_INTERVAL_MS: '500' })
// the organiser's payment QR (server/assets/payment-qr.png) is installed on start
const stop = startWorker({ ...t.ctx, log: { info() {}, warn() {}, error: console.error } })
await t.app.listen({ port: PORT, host: '127.0.0.1' })
const admin = await adminSession(t.ctx, t.app, 'approver')

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium' })
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('[role=dialog] *')].every((e) => e.getBoundingClientRect().right <= innerWidth + 1))

for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true], [375, 667, true]]) {
  const tag = `${w}`
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile })
  // Newer browsers return a Promise from scroll methods; React must never get one
  // back from an effect (it would call it as the cleanup → blank page).
  await ctx.addInitScript(() => {
    for (const proto of [Element.prototype, window]) {
      for (const k of ['scrollTo', 'scroll', 'scrollBy', 'scrollIntoView']) {
        const orig = proto[k]
        if (orig) proto[k] = function (...a) { orig.apply(this, a); return Promise.resolve() }
      }
    }
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const click = (sel) => (mobile ? page.locator(sel).first().tap() : page.locator(sel).first().click())
  const dialog = page.locator('[role=dialog]')

  await page.goto(`${BASE}/#pass`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-buy]', { timeout: 15000 })
  const menu = await dialog.innerText()
  ok(`${tag}: price menu shows all three passes at Round 3 prices`, ['MALE / STAG', '₹1,999', 'GIRLS', '₹1,699', 'COUPLE', '₹3,499'].every((s) => menu.includes(s)))
  ok(`${tag}: "Contact coordinators for referral code." shown`, menu.includes('Contact coordinators for referral code.'))
  ok(`${tag}: menu fits the screen`, await noOverflow(page))
  if (shots) {
    await page.waitForTimeout(4500) // let the site's intro finish
    await page.screenshot({ path: `${shots}/e2e-${tag}-1-menu.png` })
  }

  await click('[data-pass=female]')
  await click('[data-buy]')
  await page.waitForSelector('[data-details-form]')
  const email = `e2e.${w}.${Date.now()}@example.com`
  await page.fill('#f-name', 'Meera Iyer')
  await page.fill('#f-email', email)
  await page.fill('#f-phone', '91234 56789')
  await page.fill('#f-age', '24')
  await click('[data-gender=FEMALE]')
  await page.fill('#f-ref', 'ethan')
  await page.waitForSelector('[data-referral-status=applied]', { timeout: 5000 })
  const finalText = await page.locator(mobile ? '[data-mobile-final]' : '[data-price=final]').first().innerText()
  ok(`${tag}: ETHAN gives the girls pass at ₹1,000 (live, from the server)`, finalText.includes('₹1,000'), finalText)
  ok(`${tag}: details form fits the screen`, await noOverflow(page))
  if (shots) await page.screenshot({ path: `${shots}/e2e-${tag}-2-details.png`, fullPage: false })
  await click(mobile ? '[data-submit-mobile]' : '[data-submit]')

  await page.waitForSelector('[data-otp-form]', { timeout: 10000 })
  ok(`${tag}: progress shows EMAIL VERIFICATION`, (await dialog.innerText()).includes('EMAIL VERIFICATION'))
  let otp
  for (let i = 0; i < 20 && !otp; i++) {
    otp = lastOtp(t.capture, email)
    if (!otp) await page.waitForTimeout(100)
  }
  // a wrong code first
  await page.fill('#otp', String((Number(otp) + 1) % 1e6).padStart(6, '0'))
  await click('[data-verify]')
  await page.waitForSelector('text=That code is incorrect', { timeout: 5000 })
  ok(`${tag}: incorrect OTP message`, true)
  await page.fill('#otp', otp)
  if (shots) await page.screenshot({ path: `${shots}/e2e-${tag}-3-otp.png` })
  await click('[data-verify]')

  await page.waitForSelector('[data-payment-step]', { timeout: 10000 })
  const pay = await dialog.innerText()
  const bookingId = pay.match(/FRL-[A-Z0-9]{6}/)?.[0]
  ok(`${tag}: payment page shows booking, amount, QR and the exact instruction`,
    Boolean(bookingId) && pay.includes('₹1,000') && pay.includes('Meera Iyer') && pay.includes('Scan the QR code and pay the exact amount shown above. After completing your payment, submit your UPI transaction/reference ID below.') && (await page.locator('[data-payment-qr]').isVisible()))
  ok(`${tag}: QR image loads`, await page.locator('[data-payment-qr]').evaluate((i) => i.complete && i.naturalWidth > 0))
  ok(`${tag}: payment page fits the screen`, await noOverflow(page))
  if (shots) await page.screenshot({ path: `${shots}/e2e-${tag}-4-payment.png` })
  await page.fill('#p-ref', `41${String(Date.now()).slice(-10)}`)
  await click('[data-submit-payment]')

  await page.waitForSelector('[data-status-step=PAYMENT_PENDING_VERIFICATION]', { timeout: 10000 })
  ok(`${tag}: after submitting, the customer sees "awaiting organizer approval" (not a pass)`, (await dialog.innerText()).toUpperCase().includes('AWAITING ORGANIZER APPROVAL'))
  if (shots) await page.screenshot({ path: `${shots}/e2e-${tag}-5-pending.png` })

  // organiser alert went out
  await page.waitForTimeout(1500)
  ok(`${tag}: organizer phone alert sent`, t.capture.notifications.some((n) => n.body.includes(bookingId)))

  // organiser approves in the dashboard
  const ap = await browser.newContext({ viewport: { width: mobile ? w : 1280, height: 900 }, isMobile: mobile, hasTouch: mobile })
  await ap.addCookies([{ name: 'feral_admin', value: admin.cookie, url: BASE }])
  const ad = await ap.newPage()
  ad.on('pageerror', (e) => errors.push(`admin: ${e.message}`))
  await ad.goto(`${BASE}/admin/#approvals`, { waitUntil: 'networkidle' })
  const card = ad.locator(`[data-booking="${bookingId}"]`)
  await card.waitFor({ timeout: 15000 })
  ok(`${tag}: booking appears in PAYMENT APPROVALS with the pending count`, (await ad.locator('[data-pending-count]').count()) === 1)
  if (shots) await ad.screenshot({ path: `${shots}/e2e-${tag}-6-admin.png` })
  await card.locator('[data-approve]').click()
  const confirmBtn = ad.locator('[data-approve-confirm]')
  ok(`${tag}: confirm is disabled until the payment is checked`, await confirmBtn.isDisabled())
  await ad.locator('[data-confirm-received]').check()
  await confirmBtn.click()
  await ad.waitForSelector('text=PAYMENT APPROVED', { timeout: 15000 }).catch(async (e) => {
    if (shots) await ad.screenshot({ path: `${shots}/e2e-${tag}-approve-failed.png` })
    console.error('approve dialog:', await ad.locator('[role=dialog]').innerText().catch(() => '-'))
    throw e
  })
  ok(`${tag}: dashboard confirms the approval`, true)
  await ad.locator('[data-approved-done]').click()
  await ap.close()

  // the customer page updates by itself
  await page.waitForSelector('[data-status-step=PASS_ISSUED]', { timeout: 30000 })
  ok(`${tag}: customer sees PASS ISSUED once the email went out`, true)
  const mail = t.capture.emails.find((m) => m.to === email && m.subject === 'Your Official FERAL 2026 Pass')
  ok(`${tag}: pass (PNG + PDF) + receipt emailed`, Boolean(mail) && mail.attachments.map((a) => a.contentType).join() === 'image/png,application/pdf,application/pdf')
  if (shots && mail) fs.writeFileSync(`${shots}/e2e-${tag}-pass.png`, mail.attachments[0].content)
  const dl = page.waitForEvent('download', { timeout: 10000 })
  await click('[data-download]')
  const file = await dl
  ok(`${tag}: pass downloads`, /^FERAL-2026-Pass-FERAL-2026-[A-Z2-9]{6}\.pdf$/.test(file.suggestedFilename()), file.suggestedFilename())
  const dlPng = page.waitForEvent('download', { timeout: 10000 })
  await click('[data-download-png]')
  ok(`${tag}: pass image downloads`, /^FERAL-2026-Pass-FERAL-2026-[A-Z2-9]{6}\.png$/.test((await dlPng).suggestedFilename()))
  ok(`${tag}: confirmation fits the screen`, await noOverflow(page))
  if (shots) await page.screenshot({ path: `${shots}/e2e-${tag}-7-issued.png` })
  ok(`${tag}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// the rest of the site still renders
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await p.goto(BASE, { waitUntil: 'networkidle' })
for (const id of ['top', 'dress-up', 'hell-ichor', 'venue', 'passes', 'team', 'archive', 'safety', 'final']) ok(`site: #${id} renders`, (await p.locator(`#${id}`).count()) === 1)

await browser.close()
stop()
await t.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
