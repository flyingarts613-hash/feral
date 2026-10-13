// Money is integer paise everywhere; these only format for display.
export const rupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })
// "Rs" variant for SMS (₹ is fine on WhatsApp but not every SMS route).
export const rupeesPlain = (paise) => 'Rs ' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const CATEGORY_LABEL = { male: 'MALE / STAG', female: 'GIRLS', couple: 'COUPLE' }

// Indian mobile → E.164 (+91XXXXXXXXXX), or null if it is not a valid Indian mobile.
export function normalizeIndianMobile(raw) {
  let d = String(raw ?? '').replace(/[\s\-().]/g, '')
  if (d.startsWith('+91')) d = d.slice(3)
  else if (d.startsWith('0091')) d = d.slice(4)
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Collapse whitespace and strip control characters from free text.
export const cleanText = (s, max = 200) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

export const firstName = (name) => cleanText(name).split(' ')[0] || ''
