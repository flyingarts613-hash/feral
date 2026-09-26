// ─────────────────────────────────────────────────────────────
//  FERAL — event config
//  Change anything here; no component logic needs to be touched.
//  Values wrapped in [BRACKETS] are placeholders and are hidden
//  or rendered as-is until you replace them.
// ─────────────────────────────────────────────────────────────

export const EVENT = {
  name: 'FERAL',
  edition: 'HALLOWEEN 2026',
  date: '23 OCTOBER 2026',
  dateShort: '23.10.26',
  city: 'DELHI',
  venue: '[VENUE]',

  // Pass / payment
  googleFormUrl: '[GOOGLE FORM URL]',
  upiId: '[UPI ID]',
  upiName: 'FERAL', // name shown in the payer's UPI app
  price: '[PRICE]', // e.g. '999' — numbers only, rupees
  qrCode: '/assets/qr.png',

  instagram: '[INSTAGRAM]', // handle without @, e.g. 'feral.delhi'

  // Hero media. `video` is optional (mp4, keep it short + < 4 MB);
  // it only loads after the page is idle, the image is shown first.
  hero: {
    image: '/images/hero/hero.jpg',
    imageMobile: '/images/hero/hero-portrait.jpg',
    video: null, // e.g. '/videos/hero.mp4'
  },
}

// True once a [PLACEHOLDER] has been replaced with a real value.
export const isSet = (v) => typeof v === 'string' && v.trim() !== '' && !v.trim().startsWith('[')
