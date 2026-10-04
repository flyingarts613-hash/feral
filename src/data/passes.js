// Pass types + pricing (rupees) — the single source of truth. Edit prices
// here; the ticket and the pass sheet read everything from this file.
//   price:  per person (per couple for the couple pass)
//   min:    lowest quantity allowed
//   group:  { from, price } — from this many people the per-person price drops
//   fixed:  no quantity selector (one pass = the unit)

export const ROUND = 'ROUND 3'
export const GROUP_SIZE = 5

const BOY_GROUP = 1899
const GIRL_GROUP = 1549

export const PASSES = [
  { id: 'boy', name: 'BOY', note: 'PER PERSON', price: 1999, min: 1, group: { from: GROUP_SIZE, price: BOY_GROUP } },
  { id: 'girl', name: 'GIRL', note: 'PER PERSON', price: 1699, min: 1, group: { from: GROUP_SIZE, price: GIRL_GROUP } },
  { id: 'boys', name: 'GROUP OF BOYS', note: `${GROUP_SIZE}+ PEOPLE · PER PERSON`, price: BOY_GROUP, min: GROUP_SIZE },
  { id: 'girls', name: 'GROUP OF GIRLS', note: `${GROUP_SIZE}+ PEOPLE · PER PERSON`, price: GIRL_GROUP, min: GROUP_SIZE },
  { id: 'couple', name: 'COUPLE', note: 'PER COUPLE', price: 3499, min: 1, fixed: true },
]

export const MAX_PEOPLE = 50

// Per-person price for a pass at a quantity (the 5+ rate kicks in automatically).
export const unitPrice = (pass, qty) => (pass.group && qty >= pass.group.from ? pass.group.price : pass.price)

// Lowest per-person entry price, for "FROM ₹…".
export const FROM_PRICE = Math.min(...PASSES.filter((p) => !p.fixed).map((p) => p.group?.price ?? p.price))

export const inr = (n) => '₹' + n.toLocaleString('en-IN')

// Payment: register first, then DM this number (opens WhatsApp).
export const PAYMENT = {
  phone: '+91 8377098457',
  whatsapp: 'https://wa.me/918377098457',
}
