// Server-side pricing. The browser only ever sends a pass category and a code;
// every amount is computed here, in integer paise.

export const CATEGORIES = ['male', 'female', 'couple']

export const normalizeCode = (raw) => String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')

// Bookings that count against a code's usage limit: everything past email
// verification that has not been cancelled.
const COUNTED = `status NOT IN ('EMAIL_VERIFICATION_PENDING', 'CANCELLED')`

export async function referralUses(q, codeId, excludeBookingId = null) {
  const r = await q.one(
    `SELECT count(*)::int AS n FROM bookings WHERE referral_code_id = $1 AND ${COUNTED} AND ($2::bigint IS NULL OR id <> $2)`,
    [codeId, excludeBookingId],
  )
  return r.n
}

/**
 * quote(q, settings, { category, code, lock, excludeBookingId })
 *  → { category, originalPaise, discountPaise, finalPaise, referral: { code, status, id } }
 * referral.status: none | applied | invalid | expired | exhausted
 * Never stacks: a booking gets at most one code, and the result never goes below zero.
 */
export async function quote(q, settings, { category, code, lock = false, excludeBookingId = null, now = new Date() }) {
  if (!CATEGORIES.includes(category)) throw Object.assign(new Error('Unknown pass category'), { statusCode: 400 })
  const originalPaise = settings.pricing[category]
  if (!Number.isInteger(originalPaise) || originalPaise < 0) throw new Error(`Price for ${category} is not configured`)

  const base = { category, originalPaise, discountPaise: 0, finalPaise: originalPaise }
  const norm = normalizeCode(code)
  if (!norm) return { ...base, referral: { code: null, status: 'none', id: null } }

  const row = await q.one(`SELECT * FROM referral_codes WHERE code = $1 ${lock ? 'FOR UPDATE' : ''}`, [norm])
  if (!row || !row.active) return { ...base, referral: { code: norm, status: 'invalid', id: null } }
  if (row.expires_at && new Date(row.expires_at) <= now) return { ...base, referral: { code: norm, status: 'expired', id: null } }
  if (row.max_uses && (await referralUses(q, row.id, excludeBookingId)) >= row.max_uses) {
    return { ...base, referral: { code: norm, status: 'exhausted', id: null } }
  }

  const flat = row.discount_paise ?? settings.pricing.referralDiscount
  let discountPaise
  const special = row.kind === 'fixed_price' ? row[`${category}_price_paise`] : null
  if (special !== null && special !== undefined) discountPaise = originalPaise - Math.min(special, originalPaise)
  else discountPaise = flat
  discountPaise = Math.max(0, Math.min(discountPaise, originalPaise))

  return {
    category,
    originalPaise,
    discountPaise,
    finalPaise: originalPaise - discountPaise,
    referral: { code: row.code, status: 'applied', id: row.id },
  }
}
