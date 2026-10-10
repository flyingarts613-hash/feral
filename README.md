# FERAL — Halloween 2026

26 October 2026. Chhatarpur Farms, South Delhi. React + Vite + Tailwind + Framer Motion.

```bash
npm install
npm run dev       # local
npm run build     # production build → dist/ (optimises images first)
```

## Edit the event (no component code needed)

| What | Where |
| --- | --- |
| Date, city, venue, registration form, Instagram, hero media | `src/data/event.js` |
| Pass types, prices, pricing round label, payment DM number | `src/data/passes.js` |
| Safety section copy + points | `src/data/content.js` → `SAFETY` |
| Team (names, roles, Instagram links) | `src/data/team.js` |
| Archive strip | `src/data/archive.js` |
| Manifesto, "The Night" phrases + images, horror room lines, pass steps | `src/data/content.js` |
| Instagram + WhatsApp community links | `src/data/event.js` → `instagram` (handle) and `socials` (the two URLs) |
| Site URL for the OpenGraph image | `.env` → `VITE_SITE_URL` |

Values written as `[PLACEHOLDER]` are placeholders. Optional ones stay hidden
until you replace them.

## Drop in your real assets

Every photo and the music are plain files: overwrite them with the same name, run
`npm run images`, done. No code changes.

| What | Where |
| --- | --- |
| **Hell Ichor** (the real drink photo) | `public/images/hell-ichor/hell-ichor-main.jpg` (portrait 4:5) and `hell-ichor-detail.jpg` (close-up, 4:3). Copy in `src/data/experiences.js` |
| **Horror room** (seen through the door) | `public/images/horror-room/inside.jpg` (3:4). Copy in `src/data/experiences.js` |
| **Who are you tonight?** characters | `public/images/costumes/vampire.jpg`, `clown.jpg`, `demon.jpg`, `ghost.jpg`, `witch.jpg`, `zombie.jpg`, `skeleton.jpg`, `killer.jpg`, `creature.jpg`, `angel.jpg`, `doll.jpg` (3:4). Names, lines, colours in `src/data/experiences.js` — add or remove a character by editing that list |
| Venue photos (Chhatarpur Farms) | `public/images/venue/venue-main.jpg` (wide), `venue-02.jpg`, `venue-03.jpg` (portrait), `venue-04.jpg` (4:3). Captions + maps link in `src/data/venue.js` |
| Party photos | `public/images/party/party-main.jpg` (the big one after the hero), `strip-01…08.jpg` (the flash strip) — list in `src/data/gallery.js` |
| What's waiting | `public/images/waiting/dj.jpg`, `dancing.jpg`, `games.jpg`, `costumes.jpg`, `horror-room.jpg` — lines in `src/data/content.js` |
| Team | `public/images/organisers/organiser-01.jpg` (Kritik Aggarwal), `nandita.jpg` (Nandita Verma), `ritika.jpg` (Ritika), 3:4 — names, roles + Instagram in `src/data/team.js`. Tapping a card offers their Instagram |
| Archive | `public/images/archive/…` — list in `src/data/archive.js` |
| Music | `public/audio/feral.mp3` (any MP3; it loops, fades in at low volume, starts on the visitor's first tap/click/key) |

The current images are generated placeholders; the venue and Hell Ichor ones
are stamped "PLACEHOLDER" so they can't be mistaken for the real thing.
`npm run placeholders` / `node scripts/generate-music.mjs` regenerate them.

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
that URL directly, for example from an Instagram bio.

1. **Select pass type** (Round 3): Boy ₹1999, Girl ₹1699, Couple ₹3499,
   Group of boys (5+) ₹1899 per person, Group of girls (5+) ₹1549 per person.
2. **How many people**: − / + buttons. Boy and Girl drop to the group rate
   automatically at 5 people; the group passes start at 5; the couple pass
   has no counter. The per-person price and total update live.
3. **Step 1 — FILL REGISTRATION FORM →** opens the Google Form (everyone's
   details, comma-separated).
4. **Step 2 — DM FOR PAYMENT**: +91 8377098457 — opens a WhatsApp chat
   (https://wa.me/918377098457).

Prices, the group size and the number live in `src/data/passes.js`.
