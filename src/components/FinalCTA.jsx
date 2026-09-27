import { EVENT, isSet } from '../data/event'
import { scrollToId } from '../lib/scroll'
import { useOpenPass } from '../lib/usePass'
import { Fade, Line } from './Reveal'
import { InstagramIcon, WhatsAppIcon } from './Icons'

export default function FinalCTA() {
  const openPass = useOpenPass()
  return (
    <section id="final" aria-label="Get your pass" className="relative overflow-hidden bg-ink">
      <div className="leak pointer-events-none absolute -bottom-1/3 left-1/2 h-[80vmax] w-[80vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(158,15,24,0.22),transparent)] blur-2xl" />

      <div className="gutter relative flex min-h-[100svh] flex-col items-center justify-center py-28 text-center">
        <h2 className="display text-[30vw] leading-[0.8] md:text-[16vw]">
          <Line>READY</Line>
          <Line delay={0.08}>TO GO</Line>
          <Line delay={0.16} className="text-blood">
            FERAL?
          </Line>
        </h2>

        <Fade delay={0.3} className="mt-10 flex flex-col items-center gap-8 md:mt-14">
          <div className="flex flex-col items-center gap-2">
            <p className="display text-3xl tracking-[0.04em] md:text-4xl">{EVENT.date}</p>
            <p className="eyebrow text-bone/60">{EVENT.location}</p>
          </div>
          <button
            onClick={openPass}
            className="display group flex items-center gap-4 bg-bone px-9 py-5 text-2xl tracking-[0.03em] text-ink transition-colors duration-500 hover:bg-blood hover:text-bone md:px-12 md:py-6 md:text-3xl"
          >
            GET YOUR PASS
            <span className="inline-block transition-transform duration-500 group-hover:translate-x-1.5">→</span>
          </button>
        </Fade>
      </div>

      {/* the last thing you see */}
      <div className="gutter relative grid gap-12 border-t border-bone/10 py-[12vh] md:grid-cols-12 md:gap-8 md:py-[16vh]">
        <div className="md:col-span-7">
          <h2 className="display text-[19vw] leading-[0.82] md:text-[9.5vw]">
            <Line>SEE YOU</Line>
            <Line delay={0.07} className="md:pl-[6vw]">
              AT <span className="text-blood">FERAL.</span>
            </Line>
          </h2>
          <Fade delay={0.15} className="mt-8">
            <p className="display text-3xl tracking-[0.04em] md:text-4xl">{EVENT.date}</p>
            <p className="eyebrow mt-2 text-bone/60">{EVENT.location}</p>
          </Fade>
        </div>

        <Fade delay={0.2} className="flex flex-col gap-10 md:col-span-5 md:justify-end">
          <div>
            <p className="eyebrow text-bone/50">FOLLOW THE CHAOS</p>
            <a
              href={EVENT.socials.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="display group mt-2 inline-flex items-center gap-3 text-[13vw] leading-[0.9] transition-colors duration-500 hover:text-blood md:text-[4.6vw]"
            >
              @{EVENT.instagram}
              <span className="text-[0.5em] transition-transform duration-500 group-hover:-translate-y-1 group-hover:translate-x-1">↗</span>
            </a>
          </div>
          <div>
            <p className="eyebrow mb-4 text-bone/50">JOIN THE FERAL COMMUNITY</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={EVENT.socials.instagram}
                target="_blank"
                rel="noopener noreferrer"
                data-social="instagram"
                className="display flex flex-1 items-center justify-center gap-3 border border-bone/25 px-5 py-4 text-xl tracking-[0.04em] transition-colors duration-500 hover:border-bone hover:bg-bone hover:text-ink"
              >
                <InstagramIcon /> INSTAGRAM
              </a>
              <a
                href={EVENT.socials.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                data-social="whatsapp"
                className="display flex flex-1 items-center justify-center gap-3 border border-bone/25 px-5 py-4 text-xl tracking-[0.04em] transition-colors duration-500 hover:border-bone hover:bg-bone hover:text-ink"
              >
                <WhatsAppIcon /> WHATSAPP
              </a>
            </div>
          </div>
        </Fade>
      </div>

      <footer className="gutter eyebrow relative flex items-center justify-between border-t border-bone/10 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-bone/40">
        <span>© FERAL 2026</span>
        <span className="flex items-center gap-5">
          {isSet(EVENT.instagram) && (
            <a href={EVENT.socials.instagram} target="_blank" rel="noopener noreferrer" className="link-line hover:text-bone">
              @{EVENT.instagram}
            </a>
          )}
          <a href={EVENT.socials.whatsapp} target="_blank" rel="noopener noreferrer" className="link-line hidden hover:text-bone sm:inline">
            WHATSAPP
          </a>
        </span>
        <button onClick={() => scrollToId('top')} className="link-line hover:text-bone">
          TOP ↑
        </button>
      </footer>
    </section>
  )
}
