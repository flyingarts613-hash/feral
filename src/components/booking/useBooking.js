import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

const KEY = 'feral_booking'
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}
const save = (v) => {
  try {
    v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY)
  } catch {
    /* private mode — the booking still works for this visit */
  }
}

export const stageFor = (status) =>
  ({
    EMAIL_VERIFICATION_PENDING: 'otp',
    AWAITING_PAYMENT: 'payment',
    PAYMENT_REJECTED: 'payment',
    PAYMENT_PENDING_VERIFICATION: 'status',
    PAID: 'status',
    PASS_ISSUED: 'status',
  })[status] || 'menu'

// State for one customer booking: the public config, the booking itself and
// the access token that lets this browser see it.
export function useBooking() {
  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState(null)
  const [session, setSession] = useState(null) // { code, token }
  const [booking, setBooking] = useState(null)
  const [stage, setStage] = useState('menu')
  const [loading, setLoading] = useState(true)
  const [resumable, setResumable] = useState(null)
  const started = useRef(false)

  const refresh = useCallback(async (s = session) => {
    if (!s) return null
    const b = await api(`/api/public/bookings/${s.code}`, { token: s.token })
    setBooking(b)
    return b
  }, [session])

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        setConfig(await api('/api/public/config'))
      } catch (e) {
        setConfigError(e)
      }
      // a link from one of our emails: #booking=FRL-XXXXXX.<token>
      const m = window.location.hash.match(/^#booking=([A-Za-z0-9-]+)\.([A-Za-z0-9_-]+)$/)
      let s = m ? { code: decodeURIComponent(m[1]).toUpperCase(), token: m[2] } : null
      if (m) window.history.replaceState({ pass: true }, '', '#pass') // keep the token out of the address bar
      if (s) {
        try {
          const b = await api(`/api/public/bookings/${s.code}`, { token: s.token })
          save(s)
          setSession(s)
          setBooking(b)
          setStage(stageFor(b.status))
        } catch {
          setStage('menu')
        }
      } else {
        s = load()
        if (s) {
          try {
            const b = await api(`/api/public/bookings/${s.code}`, { token: s.token })
            if (stageFor(b.status) !== 'menu') setResumable({ session: s, booking: b })
            else save(null)
          } catch (e) {
            if (e.status === 404) save(null)
          }
        }
      }
      setLoading(false)
    })()
  }, [])

  const start = useCallback((created) => {
    const s = { code: created.booking.bookingId, token: created.accessToken }
    save(s)
    setSession(s)
    setBooking(created.booking)
    setResumable(null)
    setStage(stageFor(created.booking.status))
  }, [])

  const resume = useCallback(() => {
    if (!resumable) return
    setSession(resumable.session)
    setBooking(resumable.booking)
    setStage(stageFor(resumable.booking.status))
    setResumable(null)
  }, [resumable])

  const reset = useCallback(() => {
    save(null)
    setSession(null)
    setBooking(null)
    setResumable(null)
    setStage('menu')
  }, [])

  const update = useCallback((b) => {
    setBooking(b)
    setStage(stageFor(b.status))
  }, [])

  return { config, configError, session, booking, stage, setStage, loading, resumable, start, resume, reset, refresh, update }
}
