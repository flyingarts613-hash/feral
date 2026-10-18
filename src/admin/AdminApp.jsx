import { useCallback, useEffect, useState } from 'react'
import { call, setCsrf } from './api'
import { Approvals, AllBookings } from './Bookings'
import Overview from './Overview'
import { ReferralCodes, Settings } from './Settings'
import { AuditLog, CheckIn, Notifications } from './Misc'
import { IssueOffline, OfflineBookings } from './Offline'
import { Btn, Input } from './ui'

const TABS = [
  ['approvals', 'PAYMENT APPROVALS'],
  ['overview', 'OVERVIEW'],
  ['bookings', 'ALL BOOKINGS'],
  ['offline-issue', 'ISSUE OFFLINE PASS'],
  ['offline', 'OFFLINE BOOKINGS'],
  ['checkin', 'CHECK-IN'],
  ['notifications', 'NOTIFICATIONS'],
  ['referrals', 'REFERRAL CODES'],
  ['settings', 'SETTINGS'],
  ['audit', 'AUDIT LOG'],
]

export default function AdminApp() {
  const [me, setMe] = useState(undefined)
  const [tab, setTab] = useState(() => (location.hash.slice(1) in Object.fromEntries(TABS) ? location.hash.slice(1) : 'approvals'))
  const [pending, setPending] = useState(0)

  useEffect(() => {
    call('/me')
      .then((r) => {
        setCsrf(r.csrfToken)
        setMe(r.admin)
      })
      .catch(() => setMe(null))
  }, [])

  // Pending count, refreshed every 10 s (also drives the tab title).
  const poll = useCallback(async () => {
    try {
      const r = await call('/bookings?status=pending&limit=1')
      setPending(r.pending)
    } catch (e) {
      if (e.status === 401) setMe(null)
    }
  }, [])
  useEffect(() => {
    if (!me) return
    poll()
    const t = setInterval(poll, 10000)
    return () => clearInterval(t)
  }, [me, poll])
  useEffect(() => {
    document.title = `${pending ? `(${pending}) ` : ''}FERAL — Admin`
  }, [pending])

  const go = (t) => {
    setTab(t)
    history.replaceState(null, '', `#${t}`)
  }

  if (me === undefined) return <p className="eyebrow p-10 text-bone/40">LOADING…</p>
  if (!me) return <Login onIn={(a) => setMe(a)} />

  const can = (role) => ({ viewer: 1, approver: 2, owner: 3 })[me.role] >= ({ viewer: 1, approver: 2, owner: 3 })[role]

  return (
    <div className="min-h-screen bg-ink text-bone">
      <header className="sticky top-0 z-30 border-b border-bone/10 bg-ink/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-baseline gap-3">
            <span className="display text-2xl">FERAL</span>
            <span className="eyebrow text-[10px] text-bone/40">ADMIN</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-bone/50 sm:inline">
              {me.name} · {me.role}
            </span>
            <button
              className="eyebrow text-bone/60 hover:text-bone"
              onClick={async () => {
                await call('/logout', { method: 'POST' }).catch(() => {})
                setMe(null)
              }}
            >
              SIGN OUT
            </button>
          </div>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-2 md:px-6" aria-label="Admin sections">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`eyebrow shrink-0 border-b-2 px-3 py-3 text-[11px] transition-colors ${tab === id ? 'border-blood text-bone' : 'border-transparent text-bone/50 hover:text-bone/80'}`}
            >
              {label}
              {id === 'approvals' && pending > 0 && (
                <span className="ml-2 inline-grid min-w-5 place-items-center bg-blood px-1.5 text-[10px] text-bone" data-pending-count>
                  {pending}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>
      <main className="px-4 py-6 md:px-8 md:py-8">
        {tab === 'approvals' && <Approvals can={can} onChange={poll} />}
        {tab === 'overview' && <Overview />}
        {tab === 'bookings' && <AllBookings can={can} onChange={poll} />}
        {tab === 'offline-issue' && <IssueOffline can={can} openBookings={() => go('offline')} />}
        {tab === 'offline' && <OfflineBookings can={can} />}
        {tab === 'checkin' && <CheckIn can={can} />}
        {tab === 'notifications' && <Notifications can={can} />}
        {tab === 'referrals' && <ReferralCodes can={can} />}
        {tab === 'settings' && <Settings can={can} />}
        {tab === 'audit' && <AuditLog />}
      </main>
    </div>
  )
}

function Login({ onIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(false)
  const [created, setCreated] = useState(null)
  useEffect(() => {
    call('/setup')
      .then((r) => setSetup(Boolean(r?.available)))
      .catch(() => {})
  }, [])
  if (setup && !created) return <FirstOwner onDone={(a) => (setCreated(a.email), setEmail(a.email), setSetup(false))} />
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const r = await call('/login', { method: 'POST', body: { email, password } })
      setCsrf(r.csrfToken)
      onIn(r.admin)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4 text-bone">
      <form onSubmit={submit} className="w-full max-w-sm border border-bone/10 bg-coal p-8">
        <p className="display text-5xl">FERAL</p>
        <p className="eyebrow mt-2 text-bone/45">ADMIN SIGN-IN</p>
        {created && <p className="mt-4 text-sm text-bone/70">Owner {created} created. Sign in with the password you just chose.</p>}
        <div className="mt-8 space-y-5">
          <Input label="EMAIL" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="PASSWORD" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {err && <p className="mt-4 text-sm text-alarm" role="alert">{err}</p>}
        <Btn type="submit" busy={busy} className="mt-8 w-full">
          SIGN IN
        </Btn>
      </form>
    </div>
  )
}

// Shown only while the server has no admins and ADMIN_SETUP_TOKEN is set.
function FirstOwner({ onDone }) {
  const [f, setF] = useState({ token: '', name: '', email: '', password: '', confirm: '' })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    if (f.password !== f.confirm) return setErr("The passwords don't match.")
    setBusy(true)
    try {
      const r = await call('/setup', { method: 'POST', body: { token: f.token, name: f.name, email: f.email, password: f.password } })
      onDone(r.admin)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4 py-10 text-bone">
      <form onSubmit={submit} className="w-full max-w-sm border border-bone/10 bg-coal p-8">
        <p className="display text-5xl">FERAL</p>
        <p className="eyebrow mt-2 text-bone/45">FIRST-TIME SETUP · CREATE THE OWNER</p>
        <p className="mt-4 text-sm text-bone/60">Enter the ADMIN_SETUP_TOKEN from the server's environment. This page closes for good once an owner exists.</p>
        <div className="mt-6 space-y-5">
          <Input label="SETUP TOKEN" type="password" autoComplete="off" value={f.token} onChange={set('token')} required />
          <Input label="YOUR NAME" autoComplete="name" value={f.name} onChange={set('name')} required />
          <Input label="EMAIL" type="email" autoComplete="username" value={f.email} onChange={set('email')} required />
          <Input label="PASSWORD (12+ CHARACTERS)" type="password" autoComplete="new-password" minLength={12} value={f.password} onChange={set('password')} required />
          <Input label="CONFIRM PASSWORD" type="password" autoComplete="new-password" minLength={12} value={f.confirm} onChange={set('confirm')} required />
        </div>
        {err && <p className="mt-4 text-sm text-alarm" role="alert">{err}</p>}
        <Btn type="submit" busy={busy} className="mt-8 w-full">
          CREATE OWNER
        </Btn>
      </form>
    </div>
  )
}
