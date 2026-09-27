import { useEffect, useRef, useState } from 'react'
import { available, getState, pauseForHidden, play, prepare, resumeFromHidden, stop, subscribe, wantsSound } from '../lib/ambient'

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']

// Sound switch, bottom-right. Music is prepared during the intro and starts on
// the visitor's first tap/click/key anywhere on the page (browsers block sound
// before that). While blocked, the switch says so.
export default function SoundToggle() {
  const [state, setState] = useState(getState())
  const ref = useRef(null)

  useEffect(() => subscribe(setState), [])

  useEffect(() => {
    if (!available()) return
    prepare()
    if (!wantsSound()) return

    // Firefox can say up front whether sound is allowed; elsewhere, wait for a gesture.
    if (navigator.getAutoplayPolicy?.('audiocontext') === 'allowed' || navigator.userActivation?.isActive) play()

    const onGesture = (e) => {
      if (ref.current?.contains(e.target)) return // the switch handles its own clicks
      if (getState() === 'waiting' && wantsSound()) play()
      if (getState() === 'on' || getState() === 'off') detach()
    }
    const detach = () => GESTURES.forEach((t) => window.removeEventListener(t, onGesture, true))
    GESTURES.forEach((t) => window.addEventListener(t, onGesture, true))

    let resume = false
    const onVis = () => {
      if (document.hidden) resume = pauseForHidden()
      else if (resume) resumeFromHidden()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      detach()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (!available()) return null
  const on = state === 'on'
  const waiting = state === 'waiting' || state === 'idle'

  return (
    <button
      ref={ref}
      onClick={() => (on ? stop() : play())}
      aria-pressed={on}
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
      className="group fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-[45] flex items-center gap-3 border border-bone/15 bg-ink/70 py-2.5 pl-3.5 pr-4 text-bone backdrop-blur-sm transition-colors duration-500 hover:border-bone/40 md:bottom-24 md:right-8"
    >
      <span className={`sound-bars flex h-3 items-end gap-[2px] ${on ? 'is-on' : ''}`} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`block w-[1.5px] ${on ? 'bg-blood' : 'bg-bone/60'}`} style={{ animationDelay: `${i * -0.37}s` }} />
        ))}
      </span>
      <span className="eyebrow whitespace-nowrap text-[9px] md:text-[10px]">
        {on ? 'SOUND ON' : waiting ? 'TAP FOR SOUND' : 'SOUND OFF'}
      </span>
      {waiting && <span className="sound-ping absolute -right-1 -top-1 h-2 w-2 bg-blood" aria-hidden="true" />}
    </button>
  )
}
