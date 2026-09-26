import { EXPERIENCE } from '../data/content'
import { Line } from './Reveal'
import ParallaxImage from './ParallaxImage'

const pad = (n) => String(n).padStart(2, '0')

const IMAGE_LAYOUT = {
  full: 'w-full',
  left: 'w-[82%] md:w-[46%] mr-auto',
  right: 'w-[82%] md:w-[42%] ml-auto',
}
const WORD_ALIGN = ['text-left', 'text-right md:pr-[8vw]', 'text-left md:pl-[14vw]']

export default function Experience() {
  return (
    <section id="experience" aria-label="The night" className="gutter relative bg-ink pb-[18vh] pt-[16vh] md:pb-[28vh]">
      <header className="mb-[14vh] flex items-end justify-between md:mb-[22vh]">
        <h2 className="display text-[26vw] md:text-[17vw]">
          <Line>THE NIGHT.</Line>
        </h2>
        <p className="eyebrow mb-2 hidden text-bone/40 md:block">(02)</p>
      </header>

      <ol className="flex flex-col gap-[12vh] md:gap-[20vh]">
        {EXPERIENCE.map((item, i) => (
          <li key={item.word} className="relative">
            <div className={`relative z-10 ${WORD_ALIGN[i % 3]}`}>
              <span className="eyebrow mb-3 block text-bone/50">{pad(i + 1)} / {pad(EXPERIENCE.length)}</span>
              <h3 className="display text-[16vw] md:text-[10.5vw]">
                <Line>{item.word}</Line>
              </h3>
            </div>

            {item.image && (
              <div className={`relative -mt-[6vw] md:-mt-[4vw] ${IMAGE_LAYOUT[item.align]}`}>
                <ParallaxImage
                  src={item.image}
                  ratio={item.ratio}
                  sizes={item.align === 'full' ? '100vw' : '(min-width: 768px) 46vw, 82vw'}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
