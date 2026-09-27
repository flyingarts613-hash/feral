import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { TEAM } from '../data/team'
import { isSet } from '../data/event'
import { Line } from './Reveal'
import Img from './Img'
import { InstagramIcon } from './Icons'

// Layout per group: heads are big and side by side, coordinators smaller and staggered.
const GRID = {
  0: { grid: 'grid-cols-1 gap-y-14 md:grid-cols-12 md:gap-x-8', item: (i) => (i % 2 ? 'md:col-span-5 md:col-start-8 md:mt-[22vh]' : 'md:col-span-6'), sizes: '(min-width: 768px) 46vw, 92vw' },
  1: { grid: 'grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-4 md:gap-x-8', item: (i) => (i % 2 ? 'mt-[10vh] md:mt-[14vh]' : ''), sizes: '(min-width: 768px) 24vw, 46vw' },
}

export default function Team() {
  return (
    <section id="team" aria-label="Behind FERAL" className="gutter relative bg-ink pb-[20vh] pt-[8vh]">
      <div className="mb-[12vh] flex items-end justify-between md:mb-[18vh]">
        <h2 className="display text-[25vw] leading-[0.8] md:text-[15vw]">
          <Line>BEHIND</Line>
          <Line delay={0.08} className="md:pl-[12vw]">
            FERAL.
          </Line>
        </h2>
        <p className="eyebrow mb-2 hidden text-bone/40 md:block">(07)</p>
      </div>

      <div className="flex flex-col gap-[14vh] md:gap-[20vh]">
        {TEAM.map((g, gi) => {
          const layout = GRID[gi] ?? GRID[1]
          return (
            <div key={g.group}>
              <p className="eyebrow mb-6 flex items-center gap-4 text-bone/50 md:mb-10">
                <span className="h-px w-8 bg-blood" />
                {g.group}
              </p>
              <ul className={`grid ${layout.grid}`}>
                {g.members.map((m, i) => (
                  <li key={i} className={layout.item(i)}>
                    <Portrait member={m} sizes={layout.sizes} big={gi === 0} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// Instagram handle from a profile URL (or a bare handle).
const handleOf = (ig) => ig.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/[/?#].*$/, '').replace('@', '')
const urlOf = (ig) => (ig.startsWith('http') ? ig : `https://www.instagram.com/${handleOf(ig)}/`)

function Portrait({ member, sizes, big }) {
  const hasIg = isSet(member.instagram)
  const hasRole = isSet(member.role)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Tap/click elsewhere or Escape closes the Instagram option.
  useEffect(() => {
    if (!open) return
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <m.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        ref={ref}
        {...(hasIg && {
          role: 'button',
          tabIndex: 0,
          'aria-expanded': open,
          'aria-label': `${member.name} — Instagram`,
          onClick: () => setOpen((o) => !o),
          onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((o) => !o)),
        })}
        className={`group block ${hasIg ? 'cursor-pointer' : ''}`}
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-coal">
          <Img
            src={member.image}
            alt={member.name}
            sizes={sizes}
            className="h-full w-full scale-[1.02] object-cover grayscale contrast-[1.15] brightness-90 transition-[transform,filter] duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.07] group-hover:brightness-110"
          />
          {/* red wash on hover */}
          <div className="absolute inset-0 bg-blood opacity-0 mix-blend-multiply transition-opacity duration-700 group-hover:opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent opacity-60 transition-opacity duration-700 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100" />

          {/* name + role: always on touch, revealed on hover elsewhere */}
          <div className="absolute inset-x-0 bottom-0 p-3 md:p-5">
            <div className="overflow-hidden">
              <p
                className={`display translate-y-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [@media(hover:hover)]:translate-y-full [@media(hover:hover)]:group-hover:translate-y-0 ${big ? 'text-4xl md:text-6xl' : 'text-xl md:text-3xl'}`}
              >
                {member.name}
              </p>
            </div>
            {(hasRole || hasIg) && (
              <div className="overflow-hidden">
                <p className="eyebrow mt-2 translate-y-0 text-bone/70 transition-transform delay-75 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [@media(hover:hover)]:translate-y-full [@media(hover:hover)]:group-hover:translate-y-0">
                  {hasRole && member.role}
                  {hasIg && <span className={hasRole ? 'ml-2 text-bone/40' : 'text-bone/55'}>{hasRole ? '↗' : 'INSTAGRAM ↗'}</span>}
                </p>
              </div>
            )}
          </div>

          {/* the Instagram option, on tap/click */}
          <AnimatePresence>
            {hasIg && open && (
              <m.div
                className="absolute inset-x-3 top-3 flex items-center justify-between gap-3 border border-bone/15 bg-ink/85 p-3 backdrop-blur-sm md:inset-x-5 md:top-5 md:p-4"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="flex min-w-0 items-center gap-2.5 text-bone">
                  <InstagramIcon className="h-5 w-5 shrink-0" />
                  <span className="eyebrow truncate normal-case tracking-[0.12em] text-bone/80">@{handleOf(member.instagram)}</span>
                </span>
                <a
                  href={urlOf(member.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  data-social="instagram"
                  className="display shrink-0 bg-bone px-3 py-2 text-sm tracking-[0.05em] text-ink transition-colors duration-300 hover:bg-blood hover:text-bone md:text-base"
                >
                  OPEN INSTAGRAM ↗
                </a>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </m.div>
  )
}
