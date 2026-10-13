import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// The pass sheet lives at #pass so it can be linked directly
// (e.g. from an Instagram bio) and closed with the back button.
// Links in booking emails open it at #booking=FRL-XXXXXX.<token>.
const HASH = '#pass'
const isOpenHash = (h) => h === HASH || h.startsWith('#booking=')

export function usePass() {
  const [open, setOpen] = useState(() => isOpenHash(window.location.hash))

  useEffect(() => {
    const sync = () => setOpen(isOpenHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const openPass = useCallback(() => {
    if (window.location.hash === HASH) return
    window.history.pushState({ pass: true }, '', HASH)
    setOpen(true)
  }, [])

  const closePass = useCallback(() => {
    if (window.history.state?.pass) window.history.back()
    else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setOpen(false)
    }
  }, [])

  return { open, openPass, closePass }
}

export const PassContext = createContext(() => {})
export const useOpenPass = () => useContext(PassContext)
