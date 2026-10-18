import { z } from 'zod'
import { NAME } from './public.js'
import { issueOffline, listOffline, offlineView, resendOffline, sendOfflineTestEmail, MAX_OFFLINE_PASSES } from '../services/offline.js'
import { getSettings } from '../services/settings.js'
import { httpError } from '../services/bookings.js'
import { CATEGORY_LABEL, cleanText, normalizeIndianMobile } from '../lib/format.js'

// Admin → Issue Offline Pass / Offline Bookings. Registered inside the admin
// plugin, so every route here already requires a signed-in admin (and the CSRF
// header for anything that changes state); issuing and resending need the
// approver role.

const name = (msg) => z.string().transform((s) => cleanText(s, 80)).pipe(z.string().min(2, msg).max(80).regex(NAME, 'Use English letters'))

const issueSchema = z
  .object({
    name: name('Enter the full name'),
    email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254)),
    phone: z.string().transform((s, c) => {
      const p = normalizeIndianMobile(s)
      if (!p) c.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number' })
      return p
    }),
    category: z.enum(['male', 'female', 'couple'], { error: 'Choose a pass category' }),
    quantity: z.number({ error: 'Enter the number of passes' }).int().min(1).max(MAX_OFFLINE_PASSES, `At most ${MAX_OFFLINE_PASSES} passes per booking`),
    attendeeNames: z.array(z.union([z.literal(''), z.null().transform(() => ''), name('Enter the full name')])).max(MAX_OFFLINE_PASSES).optional().default([]),
    notes: z.string().max(500).optional().default('').transform((s) => cleanText(s, 500)),
    paymentMethod: z.enum(['cash', 'upi', 'other'], { error: 'Choose how the payment was received' }),
    reference: z.string().max(64).optional().default('').transform((s) => cleanText(s, 64)),
    amountPaise: z.number({ error: 'Enter the amount received' }).int().min(0).max(10_000_000_00),
    overrideReason: z.string().max(300).optional().default('').transform((s) => cleanText(s, 300)),
    // the browser can only confirm that money was received; the server sets PAID itself
    paymentReceived: z.literal(true, { error: 'Confirm that the payment has been received' }),
    allowDuplicate: z.boolean().optional().default(false),
  })
  .refine((v) => v.attendeeNames.length <= v.quantity, { path: ['attendeeNames'], message: 'More attendee names than passes' })

const listSchema = z.object({
  q: z.string().max(100).optional(),
  category: z.enum(['male', 'female', 'couple']).optional(),
  emailStatus: z.enum(['sent', 'delivered', 'failed', 'sending']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const code = (req) => String(req.params.code || '').toUpperCase().slice(0, 20)

export function offlineRoutes(app, ctx, { need }) {
  app.get('/offline/config', async () => {
    const s = await getSettings(ctx.db)
    return {
      pricing: { male: s.pricing.male, female: s.pricing.female, couple: s.pricing.couple },
      labels: CATEGORY_LABEL,
      maxPasses: MAX_OFFLINE_PASSES,
      emailProvider: ctx.email.name,
      emailConfigured: !['none'].includes(ctx.email.name),
      event: { name: s.event.name, dateLabel: s.event.dateLabel, timeLabel: s.event.timeLabel, venue: s.event.venue },
    }
  })

  app.post('/offline/bookings', { config: { rateLimit: { max: 30 * ctx.cfg.rateLimitScale, timeWindow: 60000 } } }, async (req, reply) => {
    need(req, 'approver')
    const key = String(req.headers['idempotency-key'] || '')
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw httpError(400, 'idempotency_key', 'Missing request ID. Reload the page and try again.')
    const input = issueSchema.parse(req.body ?? {})
    const r = await issueOffline(ctx, req.admin, input, { idempotencyKey: key, ip: req.ip })
    return reply.code(r.duplicate ? 200 : 201).send(r)
  })

  app.get('/offline/bookings', async (req) => listOffline(ctx, listSchema.parse(req.query ?? {})))

  app.get('/offline/bookings/:code', async (req) => offlineView(ctx, code(req)))

  app.post('/offline/bookings/:code/resend', { config: { rateLimit: { max: 20 * ctx.cfg.rateLimitScale, timeWindow: 60000 } } }, async (req) => {
    need(req, 'approver')
    z.object({ confirm: z.literal(true, { error: 'Confirmation required' }) }).parse(req.body ?? {})
    return resendOffline(ctx, req.admin, code(req), { ip: req.ip })
  })

  app.post('/offline/test-email', { config: { rateLimit: { max: 5 * ctx.cfg.rateLimitScale, timeWindow: 60000 } } }, async (req) => {
    need(req, 'approver')
    return sendOfflineTestEmail(ctx, req.admin, { ip: req.ip })
  })
}
