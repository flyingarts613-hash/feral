// FERAL's three signature experiences. Copy + images live here; the
// components never need to change. Replace images with the same file names
// and run `npm run images`.

// ── HELL ICHOR ───────────────────────────────────────────────────────────
// public/images/hell-ichor/hell-ichor-main.jpg   → the drink (portrait, 4:5)
// public/images/hell-ichor/hell-ichor-detail.jpg → a close-up / texture (4:3)
export const HELL_ICHOR = {
  name: 'HELL ICHOR',
  tagline: 'The drink of FERAL',
  label: 'EXCLUSIVE TO FERAL',
  image: '/images/hell-ichor/hell-ichor-main.jpg',
  detail: null, // no close-up yet — set to '/images/hell-ichor/hell-ichor-detail.jpg' once that photo exists
  story: [
    'Born from the mythology of ichor, the mysterious substance said to flow through the veins of the gods.',
    'FERAL gives it a darker identity.',
  ],
  beats: ['DARK.', 'STRANGE.', 'UNFORGETTABLE.'],
  closer: ['You don’t just come to FERAL.', 'You taste it.'],
}

// ── THE HORROR ROOM ──────────────────────────────────────────────────────
// public/images/horror-room/inside.jpg → what you see through the door (3:4)
export const HORROR_ROOM = {
  eyebrow: 'THE HORROR ROOM',
  headline: ['DON’T GO IN', 'ALONE.'],
  intro: 'A hidden corner of FERAL built for those who want something darker.',
  steps: ['Step inside.', 'Lights out.', 'Doors closed.'],
  secret: ['And whatever happens in there…', 'stays there.'],
  cta: 'ENTER IF YOU DARE',
  inside: '/images/horror-room/inside.jpg',
}

// ── WHO ARE YOU TONIGHT? ─────────────────────────────────────────────────
// One card per character. Images: public/images/costumes/<name>.jpg (3:4).
// `accent` tints the whole section while that character is in front.
// `line` is the thing your friends will say. `look` = styling hints.
export const DRESS_UP = {
  heading: ['WHO ARE', 'YOU', 'TONIGHT?'],
  sub: 'Your costume. Your character. Your night.',
  waiting: 'We’ve been waiting to see who you become.',
  shuffle: 'CHOOSE YOUR ALTER EGO',
  share: 'SHOW US YOUR CHARACTER',
  characters: [
    { name: 'VAMPIRE', line: 'Main vampire banunga.', look: 'HIGH COLLAR · SLICKED HAIR · RED LIP', accent: '#b0101c', image: '/images/costumes/vampire.jpg' },
    { name: 'CLOWN', line: 'Main Joker banungi.', look: 'RUFF COLLAR · SMEARED SMILE · ONE BALLOON', accent: '#e07b1f', image: '/images/costumes/clown.jpg' },
    { name: 'DEMON', line: 'Main demon banunga.', look: 'HORNS · RED EVERYTHING · NO APOLOGIES', accent: '#d8261a', image: '/images/costumes/demon.jpg' },
    { name: 'GHOST', line: 'Main ghost banungi.', look: 'SHEER WHITE · HOLLOW EYES · QUIET ENTRANCE', accent: '#9bbad6', image: '/images/costumes/ghost.jpg' },
    { name: 'WITCH', line: 'Main witch banungi.', look: 'POINTED HAT · DARK LIP · SILVER RINGS', accent: '#8c4ad0', image: '/images/costumes/witch.jpg' },
    { name: 'ZOMBIE', line: 'Main zombie banunga.', look: 'TORN SHIRT · GREY SKIN · SLOW WALK', accent: '#6fb03c', image: '/images/costumes/zombie.jpg' },
    { name: 'SKELETON', line: 'Main skeleton banunga.', look: 'BONE PAINT · ALL BLACK · BARE TEETH', accent: '#dcd3c0', image: '/images/costumes/skeleton.jpg' },
    { name: 'KILLER', line: 'Main killer banunga.', look: 'BLANK MASK · DARK HOOD · NO WORDS', accent: '#7f93a8', image: '/images/costumes/killer.jpg' },
    { name: 'CREATURE', line: 'Main creature banungi.', look: 'ANTLERS · GLOWING EYES · WILD HAIR', accent: '#dc9728', image: '/images/costumes/creature.jpg' },
    { name: 'FALLEN ANGEL', line: 'Main fallen angel banungi.', look: 'BLACK WINGS · GOLD DUST · BROKEN HALO', accent: '#d2aa5a', image: '/images/costumes/angel.jpg' },
    { name: 'DOLL', line: 'Main doll banungi.', look: 'GIANT BOW · PAINTED CHEEKS · ONE CRACK', accent: '#dc5096', image: '/images/costumes/doll.jpg' },
  ],
}
