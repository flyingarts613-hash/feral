// Pass categories as the booking system sells them. These are display
// defaults only: the live prices come from the server (/api/public/config) and
// every amount a customer pays is calculated on the server.

export const ROUND = 'ROUND 3'

export const PASSES = [
  { id: 'male', name: 'MALE / STAG', note: 'ADMITS ONE', gender: 'MALE', pricePaise: 199900 },
  { id: 'female', name: 'GIRLS', note: 'ADMITS ONE', gender: 'FEMALE', pricePaise: 169900 },
  { id: 'couple', name: 'COUPLE', note: 'ADMITS TWO', gender: null, pricePaise: 349900 },
]

// Lowest entry price, for "FROM ₹…" on the ticket.
export const FROM_PRICE = Math.min(...PASSES.map((p) => p.pricePaise)) / 100

export const inr = (n) => '₹' + n.toLocaleString('en-IN')
export const rupees = (paise) => inr(paise / 100)

// Coordinators — referral codes and help.
export const PAYMENT = {
  phone: '+91 8377098457',
  whatsapp: 'https://wa.me/918377098457',
}
