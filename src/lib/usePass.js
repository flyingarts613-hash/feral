import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// The pass sheet lives at #pass so it can be linked directly
// (e.g. from an Instagram bio) and closed with the back button.
const HASH = '#pass'

export function usePass() {
  const [open, setOpen] = useState(() => window.location.hash === HASH)

  useEffect(() => {
    const sync = () => setOpen(window.location.hash === HASH)
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
