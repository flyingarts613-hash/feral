// Pass types + pricing (rupees). Edit prices here; the pass sheet does the maths.
//   price:  per person (or per couple for the couple pass)
//   group:  { from, price } — from this many people the per-person price drops
//   min:    lowest quantity allowed
//   fixed:  no quantity selector (one pass = the unit)

export const GROUP_SIZE = 5

export const PASSES = [
  { id: 'boy', name: 'BOY', note: 'PER PERSON', price: 1599, min: 1, group: { from: GROUP_SIZE, price: 1499 } },
  { id: 'girl', name: 'GIRL', note: 'PER PERSON', price: 1499, min: 1, group: { from: GROUP_SIZE, price: 1399 } },
  { id: 'boys', name: 'GROUP OF BOYS', note: '5+ PEOPLE · PER PERSON', price: 1499, min: GROUP_SIZE },
  { id: 'girls', name: 'GROUP OF GIRLS', note: '5+ PEOPLE · PER PERSON', price: 1399, min: GROUP_SIZE },
  { id: 'couple', name: 'COUPLE', note: 'PER COUPLE', price: 2949, min: 1, fixed: true },
]

export const MAX_PEOPLE = 50

// Per-person price for a pass at a quantity (the 5+ rate kicks in automatically).
export const unitPrice = (pass, qty) => (pass.group && qty >= pass.group.from ? pass.group.price : pass.price)

export const inr = (n) => '₹' + n.toLocaleString('en-IN')

// Payment: register first, then DM this number (opens WhatsApp).
export const PAYMENT = {
  phone: '+91 8377098457',
  whatsapp: 'https://wa.me/918377098457',
}
