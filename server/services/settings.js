// Admin-editable configuration, stored in the settings table and merged over
// these defaults. No secrets live here — those stay in the environment.

export const DEFAULTS = {
  event: {
    name: 'FERAL — Halloween House Party 2026',
    shortName: 'FERAL 2026',
    dateLabel: '26 October 2026',
    timeLabel: '5:30 PM – 11:00 PM',
    venue: 'Chhatarpur Farms, South Delhi',
    startsAt: '2026-10-26T17:30:00+05:30',
    endsAt: '2026-10-26T23:00:00+05:30',
    entryInstructions:
      'Show this pass at the entrance — on your phone or printed. Entry is checked against your unique pass ID, once.',
    coordinatorContact: '+91 8377098457',
  },
  pricing: {
    // integer paise
    male: 199900,
    female: 169900,
    couple: 349900,
    referralDiscount: 40000, // flat discount for any valid code without a special price
  },
  minAge: 18,
  paymentMode: null, // null → PAYMENT_MODE from the environment
  organizerPhones: [], // empty → ORGANIZER_PHONE from the environment
  upi: { vpa: '9818241332@kotakbank', payeeName: 'KHUSHAL AGARWAL' }, // shown under the QR when set
  paymentQrFileId: null,
  emailTemplates: {
    otp: { subject: 'Verify Your Email — FERAL 2026', intro: 'Use this code to verify your email for your FERAL booking.' },
    booking: { subject: 'Your FERAL Booking — Payment Required', intro: 'Your email is verified. Pay the exact amount below to complete your booking.' },
    confirmed: {
      subject: 'Your Official FERAL 2026 Pass',
      intro: 'Your entry pass for FERAL - Halloween House Party 2026 is ready. Keep this pass accessible and present it at entry. We look forward to seeing you.',
    },
    rejected: { subject: 'FERAL 2026 — Payment Needs Attention', intro: 'We could not confirm the payment you submitted for this booking.' },
  },
}

const KEYS = Object.keys(DEFAULTS)
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const merge = (a, b) => {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b
  const out = { ...a }
  for (const k of Object.keys(b)) out[k] = merge(a[k], b[k])
  return out
}

export async function getSettings(db) {
  const rows = await db.many('SELECT key, value FROM settings')
  const s = structuredClone(DEFAULTS)
  for (const { key, value } of rows) if (KEYS.includes(key)) s[key] = merge(s[key], value)
  return s
}

export async function setSetting(db, key, value, actor) {
  if (!KEYS.includes(key)) throw Object.assign(new Error(`Unknown setting ${key}`), { statusCode: 400 })
  await db.query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), actor],
  )
}

export const paymentMode = (settings, cfg) => settings.paymentMode || cfg.payment.defaultMode
export const organizerPhones = (settings, cfg) => (settings.organizerPhones?.length ? settings.organizerPhones : cfg.notify.organizerPhones)
