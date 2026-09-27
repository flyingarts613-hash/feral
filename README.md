# FERAL — Halloween 2026

28 October 2026. Chhatarpur Farms, South Delhi. React + Vite + Tailwind + Framer Motion.

```bash
npm install
npm run dev       # local
npm run build     # production build → dist/ (optimises images first)
```

## Edit the event (no component code needed)

| What | Where |
| --- | --- |
| Date, city, venue, Google Form, UPI ID, price, QR, Instagram, hero media | `src/data/event.js` |
| Team (event heads, coordinators) | `src/data/team.js` |
| Archive strip | `src/data/archive.js` |
| Manifesto, "The Night" phrases + images, horror room lines, pass steps | `src/data/content.js` |
| Site URL for the OpenGraph image | `.env` → `VITE_SITE_URL` |

Values written as `[PLACEHOLDER]` are placeholders. Optional ones (price,
venue, Instagram links) stay hidden until you replace them.

**Before going live:** replace `public/assets/qr.png` with your real UPI QR
(the current one is a stamped sample), and fill in `googleFormUrl` and `upiId`.

## Images

All photography lives in `public/images`. The current images are generated
placeholders. To use real photos:

1. Drop a photo into `public/images/...`, either over a placeholder (same name) or as a new file.
2. Point to it from `src/data/*.js`.
3. Run `npm run images`. This makes responsive WebP sizes and updates
   `src/data/image-manifest.json`. It also runs automatically on `npm run build`.

Suggested shapes: team portraits 3:4, hero 16:9 plus a 9:16 mobile crop
(`hero.imageMobile`), and anything for the archive (the strip keeps each
image's own ratio). Dark, flash-lit, grainy photos suit the site best.

To add a hero video, put a short, muted MP4 (under 4 MB) in `public/videos/` and set
`EVENT.hero.video`. It loads only after the page is idle and never on
data-saver or reduced motion. The image shows first.

`npm run placeholders` regenerates the placeholder art, OG image and icons
(it needs Chromium; see `scripts/generate-placeholders.mjs`).

## Pass flow

Every "GET YOUR PASS" opens a full-screen sheet at `/#pass`. You can link
that URL directly, for example from an Instagram bio. The sheet has three steps, the QR, the UPI ID
(copy button, plus a "pay in UPI app" deep link on phones) and **REGISTER →**,
which opens the Google Form.
