import { EVENT, isSet } from '../data/event'
import { scrollToId } from '../lib/scroll'
import { useOpenPass } from '../lib/usePass'
import { Fade, Line } from './Reveal'

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
            <p className="display text-3xl tracking-[0.04em] md:text-4xl">{EVENT.dateShort}</p>
            <p className="eyebrow text-bone/60">
              {EVENT.venue}
              <span className="mx-3 text-blood">/</span>
              {EVENT.area}
            </p>
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

      <footer className="gutter eyebrow relative flex items-center justify-between border-t border-bone/10 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-bone/40">
        <span>© FERAL 2026</span>
        {isSet(EVENT.instagram) && (
          <a href={`https://instagram.com/${EVENT.instagram}`} target="_blank" rel="noreferrer" className="link-line hover:text-bone">
            @{EVENT.instagram}
          </a>
        )}
        <button onClick={() => scrollToId('top')} className="link-line hover:text-bone">
          TOP ↑
        </button>
      </footer>
    </section>
  )
}
