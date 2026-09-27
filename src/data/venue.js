// THE VENUE — Chhatarpur Farms, South Delhi.
//
// The images in public/images/venue are PLACEHOLDERS (stamped as such).
// Replace them with real venue photos using the same file names:
//   venue-main.jpg  → the big one (landscape, 16:9 or wider)
//   venue-02.jpg    → portrait (4:5)
//   venue-03.jpg    → portrait (4:5)
//   venue-04.jpg    → landscape (4:3)
// then run `npm run images`. Captions are optional — '' hides one.

export const VENUE = {
  eyebrow: 'THE VENUE',
  heading: ['WHERE', 'FERAL', 'HAPPENS.'],
  main: { image: '/images/venue/venue-main.jpg', caption: 'CHHATARPUR FARMS · AFTER DARK' },
  details: [
    { image: '/images/venue/venue-02.jpg', caption: 'THE LIGHTS' },
    { image: '/images/venue/venue-03.jpg', caption: 'THE WAY IN' },
    { image: '/images/venue/venue-04.jpg', caption: 'THE GROUNDS' },
  ],
  // Link for "GET DIRECTIONS" — leave as a placeholder to hide the link.
  mapsUrl: '[GOOGLE MAPS URL]',
}
