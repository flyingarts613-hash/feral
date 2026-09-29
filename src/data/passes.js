// Pass types + pricing (rupees). Edit prices here; the pass sheet does the maths.
//   price:  per unit — a person, a group of GROUP_SIZE, or a couple
//   unit:   'person' | 'group' | 'couple' (the couple pass has no counter)
//   group:  for a single pass, the id of its group pass (offered at 5+ people)

export const ROUND = 'ROUND 2'
export const GROUP_SIZE = 5

export const PASSES = [
  { id: 'boy', name: 'BOY', note: 'PER PERSON', price: 1799, unit: 'person', group: 'boys' },
  { id: 'girl', name: 'GIRL', note: 'PER PERSON', price: 1599, unit: 'person', group: 'girls' },
  { id: 'boys', name: 'GROUP OF 5 BOYS', note: 'PER GROUP · 5 PEOPLE', price: 8499, unit: 'group' },
  { id: 'girls', name: 'GROUP OF 5 GIRLS', note: 'PER GROUP · 5 PEOPLE', price: 7499, unit: 'group' },
  { id: 'couple', name: 'COUPLE', note: 'PER COUPLE', price: 3199, unit: 'couple' },
]

export const MAX = { person: 50, group: 10, couple: 1 }

// Lowest single-person entry price, for "FROM ₹…".
export const FROM_PRICE = Math.min(...PASSES.filter((p) => p.unit === 'person').map((p) => p.price))

export const inr = (n) => '₹' + n.toLocaleString('en-IN')

// Payment: register first, then DM this number (opens WhatsApp).
export const PAYMENT = {
  phone: '+91 8377098457',
  whatsapp: 'https://wa.me/918377098457',
}
