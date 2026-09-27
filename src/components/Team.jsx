import { m } from 'framer-motion'
import { TEAM } from '../data/team'
import { isSet } from '../data/event'
import { Line } from './Reveal'
import Img from './Img'

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
        <p className="eyebrow mb-2 hidden text-bone/40 md:block">(06)</p>
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

function Portrait({ member, sizes, big }) {
  const hasIg = isSet(member.instagram)
  const Tag = hasIg ? 'a' : 'div'
  return (
    <m.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <Tag
        {...(hasIg && { href: `https://instagram.com/${member.instagram.replace('@', '')}`, target: '_blank', rel: 'noreferrer' })}
        className="group block"
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
            <div className="overflow-hidden">
              <p className="eyebrow mt-2 translate-y-0 text-bone/70 transition-transform delay-75 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [@media(hover:hover)]:translate-y-full [@media(hover:hover)]:group-hover:translate-y-0">
                {member.role}
                {hasIg && <span className="ml-2 text-bone/40">↗</span>}
              </p>
            </div>
          </div>
        </div>
      </Tag>
    </m.div>
  )
}
