import { m } from 'framer-motion'
import { EVENT } from '../data/event'
import { SOCIAL_IMAGES } from '../data/gallery'
import { InstagramIcon, WhatsAppIcon } from './Icons'
import { Fade, Line } from './Reveal'
import Img from './Img'

// FOLLOW THE FERAL — two big doors out: Instagram and the WhatsApp community.
export default function Social() {
  return (
    <section id="community" aria-label="Follow FERAL" className="gutter relative overflow-hidden bg-ink pb-[14vh] pt-[14vh] md:pb-[18vh]">
      <div className="mb-10 flex flex-col gap-6 md:mb-14 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow mb-5 flex items-center gap-4 text-bone/50">
            <span className="h-px w-8 bg-blood" />
            STAY CLOSE
          </p>
          <h2 className="display text-[21vw] leading-[0.82] md:text-[10.5vw]">
            <Line>FOLLOW</Line>
            <Line delay={0.07} className="md:pl-[8vw]">
              THE <span className="text-blood">FERAL.</span>
            </Line>
          </h2>
        </div>
        <Fade>
          <p className="serif max-w-[22rem] text-2xl text-bone/80 md:text-right md:text-3xl">Line-ups, drops, the first look at who you become.</p>
        </Fade>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <Card
          href={EVENT.socials.instagram}
          image={SOCIAL_IMAGES.instagram}
          icon={<InstagramIcon className="h-8 w-8 md:h-10 md:w-10" />}
          label="INSTAGRAM"
          title={`FOLLOW @${EVENT.instagram.toUpperCase()}`}
          big={`@${EVENT.instagram}`}
          glow="rgba(225,48,108,0.55)"
          i={0}
        />
        <Card
          href={EVENT.socials.whatsapp}
          image={SOCIAL_IMAGES.whatsapp}
          icon={<WhatsAppIcon className="h-8 w-8 md:h-10 md:w-10" />}
          label="WHATSAPP · THE FERAL COMMUNITY"
          title="JOIN THE WHATSAPP GROUP"
          big="THE COMMUNITY"
          glow="rgba(37,211,102,0.4)"
          i={1}
        />
      </div>
    </section>
  )
}

function Card({ href, image, icon, label, title, big, glow, i }) {
  return (
    <m.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-social={label.startsWith('INSTA') ? 'instagram' : 'whatsapp'}
      className="group relative block aspect-[4/5] overflow-hidden border border-bone/10 bg-coal sm:aspect-[16/11] md:aspect-[5/4]"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 1.1, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
      style={{ '--glow': glow }}
    >
      <Img src={image} alt="" sizes="(min-width: 768px) 48vw, 92vw" className="absolute inset-0 h-full w-full scale-105 object-cover brightness-[0.45] transition-[transform,filter] duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-100 group-hover:brightness-[0.6]" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
      {/* brand-tinted glow that blooms on hover */}
      <div className="pointer-events-none absolute -bottom-1/3 left-1/2 h-[90%] w-[120%] -translate-x-1/2 bg-[radial-gradient(closest-side,var(--glow),transparent)] opacity-40 blur-2xl transition-opacity duration-700 group-hover:opacity-100" />

      <div className="relative flex h-full flex-col justify-between p-5 md:p-8">
        <div className="flex items-start justify-between">
          <span className="text-bone transition-transform duration-700 group-hover:-rotate-6 group-hover:scale-110">{icon}</span>
          <span className="eyebrow text-right text-bone/60">{label}</span>
        </div>
        <div>
          <p className="display text-[14vw] leading-[0.85] text-bone/90 md:text-[5.2vw]">{big}</p>
          <span className="display mt-5 inline-flex items-center gap-3 bg-bone px-5 py-3.5 text-lg tracking-[0.04em] text-ink transition-colors duration-500 group-hover:bg-blood group-hover:text-bone md:text-2xl">
            {title}
            <span className="inline-block transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
          </span>
        </div>
      </div>
    </m.a>
  )
}
