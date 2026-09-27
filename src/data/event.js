// ─────────────────────────────────────────────────────────────
//  FERAL — event config
//  Change anything here; no component logic needs to be touched.
//  Values wrapped in [BRACKETS] are placeholders and are hidden
//  or rendered as-is until you replace them.
// ─────────────────────────────────────────────────────────────

export const EVENT = {
  name: 'FERAL',
  edition: 'HALLOWEEN 2026',
  date: '28 OCTOBER 2026',
  dateShort: '28.10.26',
  startsAt: '2026-10-28T20:00:00+05:30', // drives the "nights left" countdown
  city: 'DELHI',
  area: 'SOUTH DELHI',
  venue: 'CHHATARPUR FARMS',
  coordinates: ['28.50° N', '77.17° E'], // shown small in the hero corner
  get location() {
    return `${this.venue}, ${this.area}` // CHHATARPUR FARMS, SOUTH DELHI
  },

  // Pass / payment
  googleFormUrl: '[GOOGLE FORM URL]',
  upiId: '[UPI ID]',
  upiName: 'FERAL', // name shown in the payer's UPI app
  price: '[PRICE]', // e.g. '999' — numbers only, rupees
  qrCode: '/assets/qr.png',

  // Background music. Drop your own MP3 at public/audio/feral.mp3 (same name)
  // and it's used automatically. Browsers only allow sound after the visitor's
  // first tap/click/key — it starts then, fading in; they can switch it off.
  music: { src: '/audio/feral.mp3', volume: 0.25 },

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
