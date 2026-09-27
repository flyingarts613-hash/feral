import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { EVENT } from '../data/event'
import { lockScroll, scrollToId } from '../lib/scroll'
import { useOpenPass } from '../lib/usePass'
import { InstagramIcon, WhatsAppIcon } from './Icons'

// Desktop nav — the three signature experiences, the venue, passes.
const LINKS = [
  ['DRESS UP', 'dress-up'],
  ['HELL ICHOR', 'hell-ichor'],
  ['HORROR ROOM', 'horror-room'],
  ['VENUE', 'venue'],
  ['PASSES', 'passes'],
]
// Phone menu — everything (PASS → opens the pass sheet itself).
const MENU = [
  ['DRESS UP', 'dress-up'],
  ['HELL ICHOR', 'hell-ichor'],
  ['HORROR ROOM', 'horror-room'],
  ['VENUE', 'venue'],
  ["WHAT'S WAITING", 'waiting'],
  ['TEAM', 'team'],
  ['ARCHIVE', 'archive'],
]

export default function Navbar() {
  const [menu, setMenu] = useState(false)
  const openPass = useOpenPass()

  useEffect(() => {
    if (!menu) return
    lockScroll(true)
    const onKey = (e) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', onKey)
    return () => {
      lockScroll(false)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const go = (id) => {
    setMenu(false)
    // wait for the menu curtain before scrolling
    setTimeout(() => scrollToId(id), menu ? 450 : 0)
  }
  const pass = () => {
    setMenu(false)
    openPass()
  }

  return (
    <>
      <header className="gutter fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between text-bone md:h-20">
        <button onClick={() => go('top')} className="display text-[22px] tracking-[0.01em] md:text-2xl" aria-label="FERAL — back to top">
          FERAL
        </button>

        <div className="flex items-center">
          <nav className="hidden items-center gap-6 lg:flex xl:gap-8" aria-label="Main">
            {LINKS.map(([label, id]) => (
              <button key={id} onClick={() => go(id)} className="eyebrow link-line pb-0.5 opacity-70 transition-opacity hover:opacity-100">
                {label}
              </button>
            ))}
            <button onClick={pass} className="eyebrow link-line pb-0.5">
              GET YOUR PASS →
            </button>
          </nav>

          <Socials className="lg:ml-6 lg:border-l lg:border-bone/15 lg:pl-3" />

          <button onClick={() => setMenu(true)} className="eyebrow -mr-3 p-3 lg:hidden" aria-expanded={menu} aria-controls="menu">
            MENU
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menu && (
          <m.div
            id="menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="gutter fixed inset-0 z-[60] flex flex-col bg-ink pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden"
            initial={{ clipPath: 'inset(0% 0% 100% 0%)' }}
            animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
            exit={{ clipPath: 'inset(0% 0% 100% 0%)' }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="flex h-16 items-center justify-between">
              <span className="display text-[22px]">FERAL</span>
              <button onClick={() => setMenu(false)} className="eyebrow -mr-3 p-3" autoFocus>
                CLOSE
              </button>
            </div>

            <nav className="mt-auto flex flex-col" aria-label="Menu">
              {MENU.map(([label, id], i) => (
                <MenuItem key={id} i={i} onClick={() => go(id)}>
                  {label}
                </MenuItem>
              ))}
              <MenuItem i={MENU.length} onClick={pass} accent>
                PASS →
              </MenuItem>
            </nav>

            <m.div
              className="eyebrow mt-10 flex justify-between text-bone/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
            >
              <span>
                {EVENT.date}
                <br />
                {EVENT.location}
              </span>
              <span className="flex flex-col items-end gap-2">
                <a href={EVENT.socials.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-bone/80">
                  <InstagramIcon className="h-4 w-4" /> @{EVENT.instagram}
                </a>
                <a href={EVENT.socials.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-bone/80">
                  <WhatsAppIcon className="h-4 w-4" /> COMMUNITY
                </a>
              </span>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}

function MenuItem({ children, i, onClick, accent }) {
  return (
    <span className="block overflow-hidden">
      <m.button
        onClick={onClick}
        className={`display block py-1 text-left text-[11vw] leading-[0.92] md:text-[7vw] ${accent ? 'text-blood' : ''}`}
        initial={{ y: '100%' }}
        animate={{ y: '0%' }}
        transition={{ delay: 0.25 + i * 0.06, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </m.button>
    </span>
  )
}

// Small, always-there links to Instagram and the WhatsApp community.
function Socials({ className = '' }) {
  const link = 'grid h-10 w-10 place-items-center text-bone/70 transition-colors duration-300 hover:text-bone'
  return (
    <div className={`flex items-center ${className}`}>
      <a href={EVENT.socials.instagram} target="_blank" rel="noopener noreferrer" aria-label={`FERAL on Instagram, @${EVENT.instagram}`} className={link} data-social="instagram">
        <InstagramIcon className="h-[18px] w-[18px]" />
      </a>
      <a href={EVENT.socials.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Join the FERAL WhatsApp community" className={link} data-social="whatsapp">
        <WhatsAppIcon className="h-[18px] w-[18px]" />
      </a>
    </div>
  )
}
