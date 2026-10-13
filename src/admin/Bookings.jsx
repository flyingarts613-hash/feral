import { useCallback, useEffect, useState } from 'react'
import { call, CATEGORY, rupees, when } from './api'
import { Btn, Card, Chip, Dialog, ErrorLine, Input, Select } from './ui'

const STATUS_TONE = {
  EMAIL_VERIFICATION_PENDING: 'dim',
  AWAITING_PAYMENT: 'dim',
  PAYMENT_PENDING_VERIFICATION: 'warn',
  PAID: 'info',
  PASS_ISSUED: 'ok',
  PAYMENT_REJECTED: 'bad',
  CANCELLED: 'dim',
}
const nTone = { SENT: 'info', DELIVERED: 'ok', FAILED: 'bad', QUEUED: 'warn', SENDING: 'warn' }

function useList(filters, onChange) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString()
  const load = useCallback(async () => {
    try {
      setData(await call(`/bookings?${qs}`))
      setError(null)
    } catch (e) {
      setError(e)
    }
  }, [qs])
  useEffect(() => {
    load()
    const t = setInterval(load, 10000) // new pending bookings appear without a reload
    return () => clearInterval(t)
  }, [load])
  const reload = () => {
    load()
    onChange?.()
  }
  return { data, error, reload }
}

export function Approvals({ can, onChange }) {
  const [q, setQ] = useState('')
  const { data, error, reload } = useList({ status: 'pending', q, limit: 100 }, onChange)
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl md:text-5xl">PAYMENT APPROVALS</h1>
          <p className="mt-2 text-sm text-bone/55">
            {data ? `${data.pending} payment${data.pending === 1 ? '' : 's'} awaiting verification` : 'Loading…'} · oldest first · updates every 10 s
          </p>
        </div>
        <Input label="SEARCH" placeholder="Name, booking ID, email, phone" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-80" />
      </div>
      <ErrorLine error={error} />
      {data && !data.rows.length && <Card><p className="text-bone/60">Nothing waiting. New payment submissions appear here automatically.</p></Card>}
      <div className="space-y-4">{data?.rows.map((r) => <BookingCard key={r.id} r={r} can={can} reload={reload} />)}</div>
    </div>
  )
}

export function AllBookings({ can, onChange }) {
  const [f, setF] = useState({ status: '', category: '', referral: '', from: '', to: '', q: '' })
  const [page, setPage] = useState(1)
  const { data, error, reload } = useList({ ...f, page, limit: 50 }, onChange)
  const set = (k) => (e) => {
    setPage(1)
    setF((s) => ({ ...s, [k]: e.target.value }))
  }
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-4xl md:text-5xl">ALL BOOKINGS</h1>
        <a href="/api/admin/export.csv" className="eyebrow border border-bone/25 px-4 py-2.5 text-[11px] hover:border-bone">
          EXPORT CSV ↓
        </a>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Input label="SEARCH" value={f.q} onChange={set('q')} placeholder="Name, ID, email, phone" className="lg:col-span-2" />
        <Select label="STATUS" value={f.status} onChange={set('status')}>
          <option value="">All</option>
          <option value="pending">Pending payments</option>
          <option value="approved">Approved payments</option>
          <option value="rejected">Rejected payments</option>
          <option value="awaiting">Awaiting payment</option>
          <option value="unverified">Email not verified</option>
        </Select>
        <Select label="PASS" value={f.category} onChange={set('category')}>
          <option value="">All</option>
          <option value="male">Male / Stag</option>
          <option value="female">Girls</option>
          <option value="couple">Couple</option>
        </Select>
        <Input label="REFERRAL CODE" value={f.referral} onChange={set('referral')} placeholder="e.g. ETHAN or none" />
        <div className="grid grid-cols-2 gap-2">
          <Input label="FROM" type="date" value={f.from} onChange={set('from')} />
          <Input label="TO" type="date" value={f.to} onChange={set('to')} />
        </div>
      </div>
      <ErrorLine error={error} />
      {data && <p className="mb-3 text-sm text-bone/50">{data.total} bookings</p>}
      <div className="space-y-4">{data?.rows.map((r) => <BookingCard key={r.id} r={r} can={can} reload={reload} />)}</div>
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
    </div>
  )
}

function emailState(r) {
  const n = r.notifications.find((x) => x.type === 'payment_confirmed')
  if (!n) return null
  if (n.status === 'DELIVERED') return ['DELIVERED', 'ok', n]
  if (n.status === 'SENT') return ['SENT', 'info', n]
  if (n.status === 'FAILED') return ['FAILED — RETRY AVAILABLE', 'bad', n]
  return [`SENDING (attempt ${n.attempts})`, 'warn', n]
}

function BookingCard({ r, can, reload }) {
  const [dialog, setDialog] = useState(null)
  const [detail, setDetail] = useState(false)
  const [err, setErr] = useState(null)
  const pending = r.status === 'PAYMENT_PENDING_VERIFICATION'
  const org = r.notifications.filter((n) => n.type === 'organizer_payment_pending')
  const orgState = org.length ? (org.some((n) => n.status === 'FAILED') ? 'bad' : org.every((n) => ['SENT', 'DELIVERED'].includes(n.status)) ? 'ok' : 'warn') : null
  const email = emailState(r)

  const act = async (fn) => {
    setErr(null)
    try {
      await fn()
      reload()
    } catch (e) {
      setErr(e)
    }
  }

  return (
    <article className="border border-bone/10 bg-coal/70 p-4 md:p-5" data-booking={r.booking_code}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="display text-2xl leading-tight md:text-3xl">{r.holder_name}</p>
          <p className="mt-1 text-sm text-bone/60">
            {r.booking_code} · {CATEGORY[r.category]} · booked {when(r.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone={STATUS_TONE[r.status]}>{r.status.replaceAll('_', ' ')}</Chip>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['EMAIL', r.email],
          ['PHONE', r.phone],
          ['AGE / GENDER', `${r.age} · ${r.gender}`],
          ['REFERRAL', r.referral_code || 'None'],
          ['ORIGINAL', rupees(r.original_paise)],
          ['DISCOUNT', r.discount_paise ? `−${rupees(r.discount_paise)}` : '—'],
          ['FINAL PAYABLE', rupees(r.final_paise)],
          ['UPI / PAYMENT REF', r.transaction_reference || '—'],
          ['METHOD', r.method ? (r.method === 'razorpay' ? `Razorpay${r.gateway_verified ? ' · signature verified' : ''}` : 'UPI QR') : '—'],
          ['SUBMITTED', when(r.submitted_at)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="eyebrow text-[9px] text-bone/40">{k}</dt>
            <dd className={`mt-0.5 break-words ${k === 'FINAL PAYABLE' ? 'display text-2xl' : ''} ${k === 'UPI / PAYMENT REF' ? 'font-mono' : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-bone/45">Payment:</span>
        <Chip tone={{ SUBMITTED: 'warn', APPROVED: 'ok', REJECTED: 'bad' }[r.payment_status] || 'dim'}>{r.payment_status === 'APPROVED' ? 'APPROVED' : r.payment_status || 'NONE'}</Chip>
        {r.pass_status && (
          <>
            <span className="ml-2 text-bone/45">Pass:</span>
            <Chip tone={r.pass_status === 'ISSUED' ? 'ok' : 'info'}>{r.pass_status}</Chip>
          </>
        )}
        {email && (
          <>
            <span className="ml-2 text-bone/45">Email:</span>
            <Chip tone={email[1]} data-email-status={email[2].status}>{email[0]}</Chip>
          </>
        )}
        {orgState && (
          <>
            <span className="ml-2 text-bone/45">Organizer alert:</span>
            <Chip tone={orgState}>{orgState === 'ok' ? 'SENT' : orgState === 'bad' ? 'FAILED' : 'SENDING'}</Chip>
          </>
        )}
        {r.redeemed_at && <Chip tone="ok">CHECKED IN {when(r.redeemed_at)}</Chip>}
      </div>
      {r.rejection_reason && r.payment_status === 'REJECTED' && <p className="mt-2 text-sm text-alarm">Rejected: {r.rejection_reason}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {pending && can('approver') && (
          <>
            <Btn tone="confirm" onClick={() => setDialog('approve')} data-approve>
              CONFIRM PAYMENT
            </Btn>
            <Btn tone="danger" onClick={() => setDialog('reject')} data-reject>
              REJECT PAYMENT
            </Btn>
          </>
        )}
        {r.has_screenshot && (
          <a className="eyebrow inline-flex min-h-11 items-center border border-bone/25 px-4 text-[11px] hover:border-bone" href={`/api/admin/bookings/${r.booking_code}/screenshot/${r.payment_id}`} target="_blank" rel="noopener noreferrer">
            VIEW SCREENSHOT ↗
          </a>
        )}
        {r.pass_code && (
          <>
            <a className="eyebrow inline-flex min-h-11 items-center border border-bone/25 px-4 text-[11px] hover:border-bone" href={`/api/admin/bookings/${r.booking_code}/pass.pdf`} target="_blank" rel="noopener noreferrer">
              PASS PDF ↗
            </a>
            <a className="eyebrow inline-flex min-h-11 items-center border border-bone/25 px-4 text-[11px] hover:border-bone" href={`/api/admin/bookings/${r.booking_code}/receipt.pdf`} target="_blank" rel="noopener noreferrer">
              RECEIPT ↗
            </a>
          </>
        )}
        {r.status === 'PAID' && !r.pass_code && can('approver') && (
          <Btn tone="ghost" onClick={() => act(() => call(`/bookings/${r.booking_code}/issue-pass`, { method: 'POST' }))}>
            RETRY PASS GENERATION
          </Btn>
        )}
        {email?.[2].status === 'FAILED' && can('approver') && (
          <Btn tone="ghost" onClick={() => act(() => call(`/notifications/${email[2].id}/retry`, { method: 'POST' }))} data-retry-email>
            RETRY EMAIL
          </Btn>
        )}
        {org.filter((n) => n.status === 'FAILED').map((n) =>
          can('approver') ? (
            <Btn key={n.id} tone="ghost" onClick={() => act(() => call(`/notifications/${n.id}/retry`, { method: 'POST' }))}>
              RETRY ALERT TO {n.recipient}
            </Btn>
          ) : null,
        )}
        <Btn tone="ghost" onClick={() => setDetail(true)}>
          DETAILS
        </Btn>
      </div>
      <ErrorLine error={err} />
      {dialog === 'approve' && <ApproveDialog r={r} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === 'reject' && <RejectDialog r={r} onClose={() => setDialog(null)} onDone={reload} />}
      {detail && <Detail code={r.booking_code} onClose={() => setDetail(false)} />}
    </article>
  )
}

function ApproveDialog({ r, onClose, onDone }) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [result, setResult] = useState(null)
  const go = async () => {
    setBusy(true)
    setErr(null)
    try {
      // the list refreshes when this result is dismissed (the card leaves the pending list)
      setResult(await call(`/bookings/${r.booking_code}/approve`, { method: 'POST', body: { confirm: true } }))
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  if (result)
    return (
      <Dialog
        title="PAYMENT APPROVED"
        onClose={() => {
          onClose()
          onDone()
        }}
      >
        <p className="text-sm text-bone/75">
          {result.passError
            ? `The approval is saved, but generating the pass failed (${result.passError}). Use "Retry pass generation" on the booking.`
            : 'The pass and receipt have been generated and the confirmation email is being sent. Its status appears on the booking.'}
        </p>
        <Btn
          className="mt-6"
          onClick={() => {
            onClose()
            onDone()
          }}
          data-approved-done
        >
          DONE
        </Btn>
      </Dialog>
    )
  return (
    <Dialog title="CONFIRM PAYMENT" onClose={onClose}>
      <p className="text-sm text-bone/75">
        {r.method === 'razorpay'
          ? 'This gateway payment will be re-checked with Razorpay before it is confirmed.'
          : 'Check your bank / UPI app before confirming. This issues the pass and emails it to the customer.'}
      </p>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-bone/50">Customer</dt><dd>{r.holder_name}</dd></div>
        <div className="flex justify-between"><dt className="text-bone/50">Booking</dt><dd>{r.booking_code}</dd></div>
        <div className="flex justify-between"><dt className="text-bone/50">Reference</dt><dd className="font-mono">{r.transaction_reference}</dd></div>
        <div className="flex justify-between"><dt className="text-bone/50">Amount expected</dt><dd className="display text-2xl">{rupees(r.final_paise)}</dd></div>
      </dl>
      {r.method !== 'razorpay' && (
        <label className="mt-5 flex items-start gap-3 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-4 w-4 accent-[#9e0f18]" data-confirm-received />
          <span>
            I have checked my bank / UPI records and received {rupees(r.final_paise)} with reference <span className="font-mono">{r.transaction_reference}</span>.
          </span>
        </label>
      )}
      <ErrorLine error={err} />
      <div className="mt-6 flex gap-2">
        <Btn tone="confirm" busy={busy} disabled={r.method !== 'razorpay' && !checked} onClick={go} data-approve-confirm>
          CONFIRM PAYMENT
        </Btn>
        <Btn tone="ghost" onClick={onClose}>
          CANCEL
        </Btn>
      </div>
    </Dialog>
  )
}

function RejectDialog({ r, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const go = async () => {
    setBusy(true)
    setErr(null)
    try {
      await call(`/bookings/${r.booking_code}/reject`, { method: 'POST', body: { confirm: true, reason } })
      onDone()
      onClose()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title="REJECT PAYMENT" onClose={onClose}>
      <p className="text-sm text-bone/75">
        {r.holder_name} ({r.booking_code}) will be emailed that their payment needs attention and can submit payment details again. The booking and its history are kept.
        No refund is made by this action.
      </p>
      <label className="mt-5 block">
        <span className="eyebrow mb-1.5 block text-[10px] text-bone/50">REASON (OPTIONAL — SENT TO THE CUSTOMER)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="w-full border border-bone/15 bg-ink p-3 text-sm outline-none focus:border-bone/60" data-reject-reason />
      </label>
      <ErrorLine error={err} />
      <div className="mt-6 flex gap-2">
        <Btn tone="danger" busy={busy} onClick={go} data-reject-confirm>
          REJECT PAYMENT
        </Btn>
        <Btn tone="ghost" onClick={onClose}>
          CANCEL
        </Btn>
      </div>
    </Dialog>
  )
}

function Detail({ code, onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    call(`/bookings/${code}`).then(setD).catch(setErr)
  }, [code])
  return (
    <Dialog title={code} onClose={onClose}>
      <ErrorLine error={err} />
      {d && (
        <div className="space-y-6 text-sm">
          <section>
            <p className="eyebrow mb-2 text-[10px] text-bone/50">PAYMENTS</p>
            {d.payments.map((p) => (
              <div key={p.id} className="border-b border-bone/10 py-2">
                <span className="font-mono">{p.transaction_reference || p.gateway_order_id || '—'}</span> · {p.method} · {rupees(p.amount_paise)} · <b>{p.status}</b>
                {p.reviewed_by_label && <span className="text-bone/50"> · {p.reviewed_by_label}</span>}
                {p.rejection_reason && <div className="text-alarm">“{p.rejection_reason}”</div>}
              </div>
            ))}
            {!d.payments.length && <p className="text-bone/50">No payment submitted.</p>}
          </section>
          <section>
            <p className="eyebrow mb-2 text-[10px] text-bone/50">MESSAGES</p>
            {d.notifications.map((n) => (
              <div key={n.id} className="border-b border-bone/10 py-2">
                {n.type.replaceAll('_', ' ')} → {n.recipient} · <Chip tone={nTone[n.status]}>{n.status}</Chip> · {n.attempts}/{n.max_attempts} tries
                {n.provider && <span className="text-bone/40"> · {n.provider}</span>}
                {n.last_error && <div className="text-xs text-alarm">{n.last_error}</div>}
              </div>
            ))}
          </section>
          <section>
            <p className="eyebrow mb-2 text-[10px] text-bone/50">AUDIT TRAIL</p>
            {d.audit.map((a, i) => (
              <div key={i} className="border-b border-bone/10 py-2">
                <span className="text-bone/50">{when(a.created_at)}</span> · {a.action.replaceAll('_', ' ')} · {a.actor}
                {a.from_status && <span className="text-bone/50"> · {a.from_status} → {a.to_status}</span>}
              </div>
            ))}
          </section>
        </div>
      )}
      <Btn tone="ghost" className="mt-6" onClick={onClose}>
        CLOSE
      </Btn>
    </Dialog>
  )
}
