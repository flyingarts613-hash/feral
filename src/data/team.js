// Behind FERAL. Portraits: 3:4 — drop them in public/images/organisers (same
// file names) and run `npm run images`.
//   role:      shown under the name ('' shows none).
//   instagram: full profile URL — tapping the card offers it. '' hides it.
//   focus:     optional crop position (CSS object-position), default centre.

export const TEAM = [
  {
    group: 'ORGANISERS',
    members: [
      {
        name: 'KRITIK AGGARWAL',
        role: 'ORGANISER',
        image: '/images/organisers/organiser-01.jpg',
        instagram: 'https://www.instagram.com/kritik_aggarwal2006/',
      },
      {
        name: 'SHASHANK',
        role: '',
        image: '/images/organisers/shashank.jpg',
        instagram: '',
        focus: 'center top', // tall photo: keep the head in frame when cropped to 3:4
      },
    ],
  },
  {
    group: 'PR HEAD',
    members: [
      {
        name: 'NANDITA VERMA',
        role: 'PR HEAD',
        image: '/images/organisers/nandita.jpg',
        instagram: 'https://www.instagram.com/nanditaaa.v/',
      },
    ],
  },
  {
    group: 'COORDINATORS',
    members: [
      {
        name: 'RITIKA',
        role: 'COORDINATOR',
        image: '/images/organisers/ritika.jpg',
        instagram: 'https://www.instagram.com/ritika.298/',
      },
    ],
  },
]
