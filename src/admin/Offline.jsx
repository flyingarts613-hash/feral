import { useCallback, useEffect, useMemo, useState } from 'react'
import { call, rupees, when } from './api'
import { Btn, Card, Chip, Dialog, ErrorLine, Input, Select } from './ui'

// Admin → Issue Offline Pass / Offline Bookings.
// The browser only collects details and the admin's confirmation that money was
// received; the server prices, validates, creates the booking, passes and QR
// codes, and sends the email.

const newKey = () =>
  crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
const LABEL = { male: 'MALE / STAG', female: 'GIRLS', couple: 'COUPLE' }
const METHODS = [
  ['cash', 'Cash'],
  ['upi', 'UPI'],
  ['other', 'Other'],
]
const EMAIL_TONE = { SENT: 'info', DELIVERED: 'ok', FAILED: 'bad', QUEUED: 'warn', SENDING: 'warn', NONE: 'dim' }
const emailLabel = (e) =>
  ({
    SENT: 'EMAIL SENT',
    DELIVERED: 'EMAIL DELIVERED',
    FAILED: 'EMAIL FAILED',
    QUEUED: e.attempts ? `EMAIL NOT SENT YET — RETRYING (TRY ${e.attempts}/${e.maxAttempts})` : 'EMAIL QUEUED',
    SENDING: 'EMAIL SENDING',
    NONE: 'NO EMAIL',
  })[e.status] || e.status

const toPaise = (rupeesText) => {
  const n = Number(String(rupeesText).replace(/[,\s₹]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN
}

function CopyId({ id }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="eyebrow text-[10px] text-bone/50 hover:text-bone"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          /* clipboard blocked: the ID is still selectable */
        }
      }}
      aria-label={`Copy booking ID ${id}`}
    >
      {done ? 'COPIED ✓' : 'COPY ID'}
    </button>
  )
}

// ─── Issue Offline Pass ───────────────────────────────────────────────────────
const EMPTY = { name: '', email: '', phone: '', category: 'male', quantity: 1, attendeeNames: [], paymentMethod: 'cash', reference: '', notes: '', amount: '', overrideReason: '' }

export function IssueOffline({ can, openBookings }) {
  const [cfg, setCfg] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [amountTouched, setAmountTouched] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [key, setKey] = useState(newKey)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [dup, setDup] = useState(null) // possible-duplicate warning
  const [allowDup, setAllowDup] = useState(false)
  const [result, setResult] = useState(null)
  const [test, setTest] = useState(null)

  useEffect(() => {
    call('/offline/config')
      .then(setCfg)
      .catch(setErr)
  }, [])

  const listPaise = cfg ? cfg.pricing[f.category] * f.quantity : 0
  // the amount follows the price list until the admin changes it
  useEffect(() => {
    if (cfg && !amountTouched) setF((s) => ({ ...s, amount: String(listPaise / 100) }))
  }, [cfg, listPaise, amountTouched])

  const amountPaise = toPaise(f.amount)
  const override = Number.isFinite(amountPaise) && amountPaise !== listPaise
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const fe = (k) => err?.fields?.[k] || (err?.field === k ? err.message : null)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setErr(null)
    setBusy(true)
    try {
      const r = await call('/offline/bookings', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: {
          name: f.name,
          email: f.email,
          phone: f.phone,
          category: f.category,
          quantity: Number(f.quantity),
          attendeeNames: Array.from({ length: Number(f.quantity) }, (_, i) => (f.attendeeNames[i] || '').trim()),
          paymentMethod: f.paymentMethod,
          reference: f.reference,
          notes: f.notes,
          amountPaise,
          overrideReason: override ? f.overrideReason : '',
          paymentReceived: confirmed,
          allowDuplicate: allowDup,
        },
      })
      setResult(r)
      setDup(null)
    } catch (x) {
      if (x.code === 'possible_duplicate') setDup(x)
      else setErr(x)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setF(EMPTY)
    setAmountTouched(false)
    setConfirmed(false)
    setAllowDup(false)
    setDup(null)
    setErr(null)
    setResult(null)
    setKey(newKey()) // a new request ID only for a new booking
  }

  const sendTest = async () => {
    setTest({ busy: true })
    try {
      setTest(await call('/offline/test-email', { method: 'POST' }))
    } catch (x) {
      setTest({ ok: false, error: x.message })
    }
  }

  if (!can('approver'))
    return (
      <div className="max-w-2xl">
        <h1 className="display text-4xl md:text-5xl">ISSUE OFFLINE PASS</h1>
        <Card className="mt-6">
          <p className="text-bone/70">Issuing passes needs the approver or owner role. You can view offline bookings in OFFLINE BOOKINGS.</p>
        </Card>
      </div>
    )

  if (result) return <IssuedResult r={result} onAnother={reset} openBookings={openBookings} />

  const qty = Number(f.quantity) || 1
  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl md:text-5xl">ISSUE OFFLINE PASS</h1>
          <p className="mt-2 text-sm text-bone/55">For payments received in person. The customer gets their official FERAL pass PDF and entry QR by email.</p>
        </div>
        <div className="text-right">
          <Btn tone="ghost" onClick={sendTest} busy={test?.busy} data-offline-test>
            SEND TEST EMAIL TO ME
          </Btn>
          {test && !test.busy && (
            <p className={`mt-2 text-xs ${test.ok ? 'text-emerald-300' : 'text-alarm'}`} role="status">
              {test.ok ? `Sample sent to ${test.to}. It is marked "not valid for entry".` : `Test email failed: ${test.error}`}
            </p>
          )}
        </div>
      </div>
      {cfg && !cfg.emailConfigured && (
        <Card className="mb-5 border-alarm/50">
          <p className="text-sm text-alarm">No email provider is configured on the server (EMAIL_PROVIDER). Bookings and passes will be saved, but emails cannot be sent until it is set up.</p>
        </Card>
      )}

      <form onSubmit={submit} className="space-y-5" noValidate data-offline-form>
        <Card title="CUSTOMER">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={fe('name')}>
              <Input label="FULL NAME" value={f.name} onChange={set('name')} autoComplete="off" required maxLength={80} />
            </Field>
            <Field error={fe('email')}>
              <Input label="EMAIL (PASSES ARE SENT HERE)" type="email" value={f.email} onChange={set('email')} autoComplete="off" required maxLength={254} />
            </Field>
            <Field error={fe('phone')}>
              <Input label="PHONE" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="98765 43210" autoComplete="off" required maxLength={16} />
            </Field>
            <Field error={fe('notes')}>
              <Input label="GROUP NAME / NOTES (OPTIONAL)" value={f.notes} onChange={set('notes')} maxLength={500} />
            </Field>
          </div>
        </Card>

        <Card title="PASSES">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field error={fe('category')}>
              <Select label="PASS CATEGORY" value={f.category} onChange={set('category')}>
                <option value="male">Male / Stag{cfg ? ` — ${rupees(cfg.pricing.male)}` : ''}</option>
                <option value="female">Female (Girls){cfg ? ` — ${rupees(cfg.pricing.female)}` : ''}</option>
                <option value="couple">Couple{cfg ? ` — ${rupees(cfg.pricing.couple)}` : ''}</option>
              </Select>
            </Field>
            <Field error={fe('quantity')}>
              <Select label="NUMBER OF PASSES" value={f.quantity} onChange={set('quantity')}>
                {Array.from({ length: cfg?.maxPasses ?? 10 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="self-end pb-2 text-sm text-bone/60">
              Price list: <span className="text-bone">{cfg ? rupees(listPaise) : '…'}</span>
            </div>
          </div>
          {qty > 1 && (
            <div className="mt-4">
              <p className="eyebrow mb-2 text-[10px] text-bone/50">NAMES ON EACH PASS (OPTIONAL — EMPTY USES THE CUSTOMER&apos;S NAME)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: qty }, (_, i) => (
                  <Field key={i} error={fe(`attendeeNames.${i}`)}>
                  <Input
                    label={`PASS ${i + 1}`}
                    value={f.attendeeNames[i] || ''}
                    placeholder={f.name || 'Customer name'}
                    maxLength={80}
                    onChange={(e) =>
                      setF((s) => {
                        const a = [...s.attendeeNames]
                        a[i] = e.target.value
                        return { ...s, attendeeNames: a }
                      })
                    }
                  />
                  </Field>
                ))}
              </div>
              {fe('attendeeNames') && <p className="mt-2 text-sm text-alarm">{fe('attendeeNames')}</p>}
            </div>
          )}
        </Card>

        <Card title="PAYMENT RECEIVED">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field error={fe('paymentMethod')}>
              <Select label="PAYMENT METHOD" value={f.paymentMethod} onChange={set('paymentMethod')}>
                {METHODS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field error={fe('amountPaise')}>
              <Input
                label="AMOUNT RECEIVED (₹)"
                inputMode="decimal"
                value={f.amount}
                onChange={(e) => {
                  setAmountTouched(true)
                  set('amount')(e)
                }}
              />
            </Field>
            <Field error={fe('reference')}>
              <Input label={f.paymentMethod === 'cash' ? 'RECEIPT NO. (OPTIONAL)' : 'TRANSACTION / REFERENCE ID (OPTIONAL)'} value={f.reference} onChange={set('reference')} maxLength={64} />
            </Field>
          </div>
          {override && (
            <div className="mt-4">
              <Field error={fe('overrideReason')}>
                <Input
                  label={`REASON FOR CHANGING THE PRICE (LIST ${rupees(listPaise)} → ${Number.isFinite(amountPaise) ? rupees(amountPaise) : '?'})`}
                  value={f.overrideReason}
                  onChange={set('overrideReason')}
                  maxLength={300}
                  required
                  hint="Recorded in the booking and the audit log."
                />
              </Field>
            </div>
          )}
          <label className="mt-5 flex items-start gap-3 border border-bone/15 p-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-offline-confirm />
            <span>
              I confirm that <strong className="text-bone">{Number.isFinite(amountPaise) ? rupees(amountPaise) : '—'}</strong> has been received
              {f.paymentMethod === 'cash' ? ' in cash' : f.paymentMethod === 'upi' ? ' by UPI (checked in the bank / UPI app)' : ''} for {qty} {LABEL[f.category]} pass
              {qty > 1 ? 'es' : ''}.
            </span>
          </label>
          {fe('paymentReceived') && <p className="mt-2 text-sm text-alarm">{fe('paymentReceived')}</p>}
        </Card>

        {dup && (
          <Card className="border-amber-400/50">
            <p className="text-sm text-amber-300">{dup.message}</p>
            <label className="mt-3 flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} data-offline-allow-dup />
              Issue anyway — this is a separate purchase
            </label>
          </Card>
        )}
        {err && !err.fields && !err.field && <ErrorLine error={err} />}
        {err?.fields && <p className="text-sm text-alarm">Please check the highlighted fields.</p>}

        <Btn type="submit" tone="confirm" busy={busy} disabled={!confirmed || !cfg || (dup && !allowDup)} className="w-full py-4 text-[13px] sm:w-auto" data-offline-submit>
          GENERATE &amp; SEND PASS{qty > 1 ? 'ES' : ''}
        </Btn>
        {busy && <p className="text-sm text-bone/55">Generating {qty} pass{qty > 1 ? 'es' : ''} and sending the email — this can take up to a minute. Don&apos;t close this page.</p>}
      </form>
    </div>
  )
}

const Field = ({ error, children }) => (
  <div>
    {children}
    {error && <p className="mt-1 text-xs text-alarm">{error}</p>}
  </div>
)

function IssuedResult({ r, onAnother, openBookings }) {
  const [b, setB] = useState(r.booking)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const sent = ['SENT', 'DELIVERED'].includes(b.emailStatus.status)
  const resend = async () => {
    setBusy(true)
    setErr(null)
    try {
      setB(await call(`/offline/bookings/${b.bookingId}/resend`, { method: 'POST', body: { confirm: true } }))
    } catch (x) {
      setErr(x)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="max-w-3xl" data-offline-result>
      <h1 className="display text-4xl md:text-5xl">{r.duplicate ? 'ALREADY ISSUED' : 'PASS ISSUED'}</h1>
      {r.duplicate && <p className="mt-2 text-sm text-amber-300">This form was already submitted — showing the booking it created. No new passes were made.</p>}
      <Card className={`mt-6 ${sent ? 'border-emerald-500/40' : 'border-amber-400/50'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="display select-all text-3xl" data-offline-booking-id>
            {b.bookingId}
          </span>
          <CopyId id={b.bookingId} />
          <Chip tone="info">OFFLINE</Chip>
          <Chip tone="ok">PAID</Chip>
          <Chip tone={EMAIL_TONE[b.emailStatus.status]} data-offline-email-status={b.emailStatus.status}>
            {emailLabel(b.emailStatus)}
          </Chip>
        </div>
        <p className="mt-3 text-sm text-bone/70">
          {b.holderName} · {b.email} · {b.categoryLabel} × {b.quantity} · {rupees(b.amountPaise)} ({b.methodLabel})
        </p>
        {sent ? (
          <p className="mt-3 text-sm text-emerald-300">The pass{b.quantity > 1 ? 'es were' : ' was'} emailed to {b.email}.</p>
        ) : (
          <div className="mt-3 text-sm text-amber-300">
            <p>The booking and passes are saved, but the email has not been sent{b.emailStatus.error ? `: ${b.emailStatus.error}` : '.'}</p>
            <p className="mt-1 text-bone/60">It is retried automatically. You can also resend it now — this never creates new passes.</p>
          </div>
        )}
        <ul className="mt-4 divide-y divide-bone/10 border-y border-bone/10">
          {b.passes.map((p) => (
            <li key={p.seq} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-mono text-bone">{p.passCode}</span>
              <span className="text-bone/60">
                {p.holderName} · pass {p.seq} of {b.quantity}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className="eyebrow inline-flex min-h-11 items-center border border-bone/25 px-4 text-[11px] hover:border-bone" href={`/api/admin/bookings/${b.bookingId}/pass.pdf`} target="_blank" rel="noopener noreferrer">
            DOWNLOAD PASS{b.quantity > 1 ? 'ES' : ''} (PDF) ↗
          </a>
          <Btn tone={sent ? 'ghost' : 'solid'} onClick={resend} busy={busy} data-offline-resend>
            {sent ? 'RESEND EMAIL' : 'SEND EMAIL NOW'}
          </Btn>
          <Btn tone="ghost" onClick={openBookings}>
            OFFLINE BOOKINGS
          </Btn>
          <Btn onClick={onAnother} data-offline-another>
            ISSUE ANOTHER
          </Btn>
        </div>
        <ErrorLine error={err} />
      </Card>
    </div>
  )
}

// ─── Offline Bookings ─────────────────────────────────────────────────────────
export function OfflineBookings({ can }) {
  const [f, setF] = useState({ q: '', category: '', emailStatus: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)
  const qs = useMemo(() => new URLSearchParams(Object.entries({ ...f, page, limit: 50 }).filter(([, v]) => v)).toString(), [f, page])
  const load = useCallback(async () => {
    try {
      setData(await call(`/offline/bookings?${qs}`))
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [qs])
  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])
  const set = (k) => (e) => {
    setPage(1)
    setF((s) => ({ ...s, [k]: e.target.value }))
  }
  return (
    <div>
      <h1 className="display mb-6 text-4xl md:text-5xl">OFFLINE BOOKINGS</h1>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Input label="SEARCH" value={f.q} onChange={set('q')} placeholder="Name, email, phone, booking ID" className="sm:col-span-2" />
        <Select label="PASS" value={f.category} onChange={set('category')}>
          <option value="">All</option>
          <option value="male">Male / Stag</option>
          <option value="female">Girls</option>
          <option value="couple">Couple</option>
        </Select>
        <Select label="EMAIL" value={f.emailStatus} onChange={set('emailStatus')}>
          <option value="">All</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="sending">Sending / retrying</option>
          <option value="failed">Failed</option>
        </Select>
      </div>
      <ErrorLine error={error} />
      {data && <p className="mb-3 text-sm text-bone/50">{data.total} offline booking{data.total === 1 ? '' : 's'}</p>}
      {data && !data.rows.length && (
        <Card>
          <p className="text-bone/60">No offline bookings{f.q || f.category || f.emailStatus ? ' match these filters' : ' yet'}.</p>
        </Card>
      )}
      <div className="space-y-3">
        {data?.rows.map((r) => (
          <Card key={r.bookingId}>
            <div className="flex flex-wrap items-start justify-between gap-3" data-offline-row={r.bookingId}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="display select-all text-2xl">{r.bookingId}</span>
                  <CopyId id={r.bookingId} />
                  <Chip tone="info">OFFLINE</Chip>
                  <Chip tone="ok">{r.paymentStatus}</Chip>
                  <Chip tone={EMAIL_TONE[r.emailStatus.status]}>{emailLabel(r.emailStatus)}</Chip>
                  {r.priceOverride && <Chip tone="warn">PRICE CHANGED</Chip>}
                </div>
                <p className="mt-2 text-sm text-bone/80">
                  {r.holderName} · {r.email} · {r.phone}
                </p>
                <p className="mt-1 text-sm text-bone/55">
                  {r.categoryLabel} × {r.quantity} · {rupees(r.amountPaise)} ({r.methodLabel}) · {when(r.createdAt)} · by {r.issuedBy}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn tone="ghost" onClick={() => setOpen(r.bookingId)}>
                  DETAILS
                </Btn>
                <a className="eyebrow inline-flex min-h-11 items-center border border-bone/25 px-4 text-[11px] hover:border-bone" href={`/api/admin/bookings/${r.bookingId}/pass.pdf`} target="_blank" rel="noopener noreferrer">
                  PASSES ↗
                </a>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {data && data.total > page * 50 && (
        <Btn tone="ghost" className="mt-6" onClick={() => setPage((p) => p + 1)}>
          NEXT PAGE →
        </Btn>
      )}
      {page > 1 && (
        <Btn tone="ghost" className="ml-3 mt-6" onClick={() => setPage((p) => p - 1)}>
          ← PREVIOUS
        </Btn>
      )}
      {open && <OfflineDetail code={open} can={can} onClose={() => (setOpen(null), load())} />}
    </div>
  )
}

function OfflineDetail({ code, can, onClose }) {
  const [b, setB] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmResend, setConfirmResend] = useState(false)
  useEffect(() => {
    call(`/offline/bookings/${code}`)
      .then(setB)
      .catch(setErr)
  }, [code])
  const resend = async () => {
    setBusy(true)
    setErr(null)
    try {
      setB(await call(`/offline/bookings/${code}/resend`, { method: 'POST', body: { confirm: true } }))
      setConfirmResend(false)
    } catch (x) {
      setErr(x)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title={code} onClose={onClose}>
      {!b ? (
        err ? <ErrorLine error={err} /> : <p className="text-sm text-bone/50">Loading…</p>
      ) : (
        <div className="space-y-4 text-sm" data-offline-detail>
          <div className="flex flex-wrap gap-2">
            <Chip tone="info">OFFLINE</Chip>
            <Chip tone="ok">{b.paymentStatus}</Chip>
            <Chip tone={EMAIL_TONE[b.emailStatus.status]}>{emailLabel(b.emailStatus)}</Chip>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {[
              ['Customer', b.holderName],
              ['Email', b.email],
              ['Phone', b.phone],
              ['Passes', `${b.categoryLabel} × ${b.quantity}`],
              ['Amount', `${rupees(b.amountPaise)} · ${b.methodLabel}${b.reference ? ` · ${b.reference}` : ''}`],
              ...(b.priceOverride ? [['Price change', b.overrideReason]] : []),
              ...(b.notes ? [['Notes', b.notes]] : []),
              ['Issued', `${when(b.createdAt)} by ${b.issuedBy}`],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-bone/45">{k}</dt>
                <dd className="break-words text-bone/85">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="eyebrow mb-2 text-[10px] text-bone/50">PASSES</p>
            <ul className="divide-y divide-bone/10 border-y border-bone/10">
              {b.passes.map((p) => (
                <li key={p.seq} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono">{p.passCode}</span>
                  <span className="text-bone/60">{p.holderName}</span>
                  <Chip tone={p.checkedInAt ? 'warn' : p.status === 'CANCELLED' ? 'bad' : 'ok'}>{p.checkedInAt ? `CHECKED IN ${when(p.checkedInAt)}` : p.status}</Chip>
                </li>
              ))}
            </ul>
          </div>
          {b.emailStatus.error && !['SENT', 'DELIVERED'].includes(b.emailStatus.status) && <p className="text-alarm">Last email error: {b.emailStatus.error}</p>}
          <div className="flex flex-wrap gap-2">
            <a className="eyebrow inline-flex min-h-11 items-center border border-bone/25 px-4 text-[11px] hover:border-bone" href={`/api/admin/bookings/${b.bookingId}/pass.pdf`} target="_blank" rel="noopener noreferrer">
              DOWNLOAD PASSES ↗
            </a>
            <a className="eyebrow inline-flex min-h-11 items-center border border-bone/25 px-4 text-[11px] hover:border-bone" href={`/api/admin/bookings/${b.bookingId}/receipt.pdf`} target="_blank" rel="noopener noreferrer">
              RECEIPT ↗
            </a>
            {can('approver') &&
              (confirmResend ? (
                <Btn tone="confirm" onClick={resend} busy={busy} data-offline-resend-confirm>
                  YES, SEND TO {b.email}
                </Btn>
              ) : (
                <Btn tone="ghost" onClick={() => setConfirmResend(true)} data-offline-resend>
                  RESEND EMAIL
                </Btn>
              ))}
          </div>
          <ErrorLine error={err} />
          <div>
            <p className="eyebrow mb-2 text-[10px] text-bone/50">HISTORY</p>
            <ul className="space-y-1 text-xs text-bone/60">
              {b.audit.map((a, i) => (
                <li key={i}>
                  {when(a.created_at)} · {a.action.replaceAll('_', ' ')} · {a.actor}
                </li>
              ))}
              {b.emailHistory.map((n) => (
                <li key={`n${n.id}`}>
                  {when(n.sent_at || n.created_at)} · email {n.status.toLowerCase()}
                  {n.attempts ? ` (${n.attempts} tr${n.attempts === 1 ? 'y' : 'ies'})` : ''}
                  {n.last_error && n.status !== 'SENT' ? ` · ${n.last_error}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  )
}
