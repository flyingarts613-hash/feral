import { useEffect, useRef, useState } from 'react'
import { EVENT } from '../data/event'
import { isPlaying, play, preload, stop, subscribe, wantsSound } from '../lib/ambient'

// Small sound switch, bottom-right. Music starts with the intro when the browser
// allows it, otherwise on the visitor's first tap, click or key press.
export default function SoundToggle() {
  const [on, setOn] = useState(isPlaying())
  const ref = useRef(null)

  useEffect(() => subscribe(setOn), [])

  useEffect(() => {
    if (!EVENT.music?.src || !wantsSound()) return
    preload()
    // Some browsers let already-engaged visitors hear sound straight away.
    if (navigator.userActivation?.hasBeenActive) play()

    const first = (e) => {
      if (ref.current?.contains(e.target)) return // the toggle handles itself
      if (wantsSound()) play()
      off()
    }
    const off = () => ['pointerdown', 'keydown', 'touchend'].forEach((t) => window.removeEventListener(t, first, true))
    ;['pointerdown', 'keydown', 'touchend'].forEach((t) => window.addEventListener(t, first, true))

    // Fade out in a background tab, back in on return.
    let resume = false
    const onVis = () => {
      if (document.hidden) {
        resume = isPlaying()
        if (resume) stop({ persist: false })
      } else if (resume) play()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      off()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (!EVENT.music?.src) return null

  return (
    <button
      ref={ref}
      onClick={() => (on ? stop() : play())}
      aria-pressed={on}
      aria-label={on ? 'Mute music' : 'Play music'}
      className="eyebrow group fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2.5 py-2 pl-3 text-bone/55 transition-colors duration-500 hover:text-bone md:bottom-24 md:right-8"
    >
      <span className={`sound-bars flex h-3 items-end gap-[2px] ${on ? 'is-on' : ''}`} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="block w-px bg-current" style={{ animationDelay: `${i * -0.37}s` }} />
        ))}
      </span>
      <span className="whitespace-nowrap">{on ? 'SOUND ON' : 'SOUND OFF'}</span>
    </button>
  )
}
