import { SAFETY } from '../data/content'
import { Fade, Line } from './Reveal'

// SAFETY COMES FIRST — small and calm, just before the last call.
export default function Safety() {
  return (
    <section id="safety" aria-label="Safety comes first" className="gutter relative bg-ink py-[12vh] md:py-[16vh]">
      <div className="grid gap-10 border-t border-bone/10 pt-10 md:grid-cols-12 md:gap-8 md:pt-14">
        <div className="md:col-span-5">
          <p className="eyebrow mb-5 flex items-center gap-4 text-bone/50">
            <span className="h-px w-8 bg-blood" />
            BEFORE YOU ASK
          </p>
          <h2 className="display text-[15vw] leading-[0.86] md:text-[5.5vw]">
            <Line>{SAFETY.heading[0]}</Line>
            <Line delay={0.07}>
              {SAFETY.heading[1]}
              <span className="text-blood">.</span>
            </Line>
          </h2>
        </div>

        <Fade delay={0.1} className="md:col-span-6 md:col-start-7 md:pt-12">
          <p className="text-lg leading-relaxed text-bone/75 md:text-xl">{SAFETY.copy}</p>
          <ul className="mt-8 grid gap-x-8 border-t border-bone/10 sm:grid-cols-2">
            {SAFETY.points.map((pt) => (
              <li key={pt} className="eyebrow flex items-center gap-3 border-b border-bone/10 py-4 text-bone/70">
                <ShieldIcon />
                {pt}
              </li>
            ))}
          </ul>
        </Fade>
      </div>
    </section>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-blood" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M8 1.5 2.75 3.5v4.1c0 3.2 2.2 5.8 5.25 6.9 3.05-1.1 5.25-3.7 5.25-6.9V3.5L8 1.5Z" />
      <path d="m5.6 8 1.7 1.7 3.1-3.3" />
    </svg>
  )
}
