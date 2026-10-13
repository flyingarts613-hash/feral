import { useEffect, useState } from 'react'
import { call, when } from './api'
import { Btn, Card, Chip, ErrorLine, Input, Select } from './ui'

const tone = { SENT: 'info', DELIVERED: 'ok', FAILED: 'bad', QUEUED: 'warn', SENDING: 'warn' }

export function Notifications({ can }) {
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => call(`/notifications${status ? `?status=${status}` : ''}`).then(setRows).catch(setErr)
  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [status])
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl md:text-5xl">NOTIFICATIONS</h1>
          <p className="mt-2 max-w-2xl text-sm text-bone/55">
            Every email and phone alert. SENT = accepted by the provider; DELIVERED only appears when the provider confirms delivery. Failed messages retry
            automatically, then wait here for a manual retry.
          </p>
        </div>
        <Select label="STATUS" value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
          <option value="">All</option>
          <option value="FAILED">Failed</option>
          <option value="QUEUED">Queued</option>
          <option value="SENT">Sent</option>
          <option value="DELIVERED">Delivered</option>
        </Select>
      </div>
      <ErrorLine error={err} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-[10px] text-bone/40">
            <tr>
              {['WHEN', 'BOOKING', 'TYPE', 'TO', 'STATUS', 'TRIES', 'PROVIDER', ''].map((h) => (
                <th key={h} className="pb-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows?.map((n) => (
              <tr key={n.id} className="border-b border-bone/10 align-top">
                <td className="py-2 pr-3 text-bone/60">{when(n.created_at)}</td>
                <td className="py-2 pr-3 font-mono">{n.booking_code || '—'}</td>
                <td className="py-2 pr-3">{n.type.replaceAll('_', ' ')}</td>
                <td className="py-2 pr-3">{n.recipient}</td>
                <td className="py-2 pr-3">
                  <Chip tone={tone[n.status]}>{n.status}</Chip>
                  {n.last_error && <div className="mt-1 max-w-xs text-xs text-alarm">{n.last_error}</div>}
                </td>
                <td className="py-2 pr-3">
                  {n.attempts}/{n.max_attempts}
                </td>
                <td className="py-2 pr-3 text-bone/50">
                  {n.provider || '—'}
                  {n.provider_status ? ` · ${n.provider_status}` : ''}
                </td>
                <td className="py-2">
                  {n.status === 'FAILED' && can('approver') && (
                    <Btn tone="ghost" onClick={() => call(`/notifications/${n.id}/retry`, { method: 'POST' }).then(load).catch(setErr)}>
                      RETRY
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AuditLog() {
  const [rows, setRows] = useState(null)
  const [page, setPage] = useState(1)
  const [err, setErr] = useState(null)
  useEffect(() => {
    call(`/audit?page=${page}`).then(setRows).catch(setErr)
  }, [page])
  return (
    <div className="space-y-5">
      <h1 className="display text-4xl md:text-5xl">AUDIT LOG</h1>
      <ErrorLine error={err} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-[10px] text-bone/40">
            <tr>
              {['WHEN', 'WHO', 'ACTION', 'BOOKING', 'CHANGE', 'DETAILS'].map((h) => (
                <th key={h} className="pb-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows?.map((a, i) => (
              <tr key={i} className="border-b border-bone/10 align-top">
                <td className="py-2 pr-3 text-bone/60">{when(a.created_at)}</td>
                <td className="py-2 pr-3">{a.actor}</td>
                <td className="py-2 pr-3">{a.action.replaceAll('_', ' ')}</td>
                <td className="py-2 pr-3 font-mono">{a.booking_code || '—'}</td>
                <td className="py-2 pr-3 text-bone/60">{a.from_status ? `${a.from_status} → ${a.to_status}` : a.to_status || ''}</td>
                <td className="max-w-sm break-words py-2 text-xs text-bone/50">
                  {a.details?.reason || a.details?.reference || a.details?.passCode || a.details?.key || ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        {page > 1 && (
          <Btn tone="ghost" onClick={() => setPage(page - 1)}>
            ← NEWER
          </Btn>
        )}
        {rows?.length === 100 && (
          <Btn tone="ghost" onClick={() => setPage(page + 1)}>
            OLDER →
          </Btn>
        )}
      </div>
    </div>
  )
}

// Entry desk: paste a scanned pass link (or open the pass QR on a device
// that's signed in to the admin — the verification page offers CHECK IN).
export function CheckIn({ can }) {
  const [token, setToken] = useState('')
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState(null)
  const lookup = async (e) => {
    e?.preventDefault()
    setErr(null)
    try {
      setInfo(await call('/checkin/lookup', { method: 'POST', body: { token } }))
    } catch (x) {
      setErr(x)
    }
  }
  const redeem = async () => {
    setErr(null)
    try {
      setInfo(await call('/checkin/redeem', { method: 'POST', body: { token } }))
    } catch (x) {
      setErr(x)
      lookup()
    }
  }
  const color = info?.state === 'VALID' ? (info.checkedInAt && !info.checkedInNow ? 'warn' : 'ok') : 'bad'
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="display text-4xl md:text-5xl">CHECK-IN</h1>
      <p className="text-sm text-bone/60">
        Scan a pass QR with this device's camera — the verification page shows a CHECK IN button while you're signed in here. Or paste the scanned link below.
      </p>
      <form onSubmit={lookup} className="flex flex-wrap items-end gap-3">
        <Input label="PASS LINK OR TOKEN" value={token} onChange={(e) => setToken(e.target.value)} className="min-w-0 flex-1" />
        <Btn type="submit">LOOK UP</Btn>
      </form>
      <ErrorLine error={err} />
      {info && (
        <Card>
          <Chip tone={color}>{info.state === 'VALID' && info.checkedInAt ? (info.checkedInNow ? 'CHECKED IN NOW' : 'ALREADY CHECKED IN') : info.state}</Chip>
          {info.holderName && (
            <>
              <p className="display mt-3 text-4xl">{info.holderName}</p>
              <p className="mt-1 text-sm text-bone/60">
                {info.pass} · {info.passCode} · {info.bookingCode}
              </p>
              {info.checkedInAt && <p className="mt-2 text-sm text-amber-200">Checked in {when(info.checkedInAt)} by {info.checkedInBy}</p>}
              {info.state === 'VALID' && !info.checkedInAt && can('approver') && (
                <Btn tone="confirm" className="mt-4" onClick={redeem}>
                  CHECK IN
                </Btn>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
