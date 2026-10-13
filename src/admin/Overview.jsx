import { useEffect, useState } from 'react'
import { call, rupees } from './api'
import { Card, ErrorLine } from './ui'

export default function Overview() {
  const [s, setS] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    const load = () => call('/summary').then(setS).catch(setErr)
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])
  if (!s) return <ErrorLine error={err} />
  const t = s.totals
  const stats = [
    ['TOTAL BOOKINGS', t.bookings],
    ['PAID', t.paid],
    ['PENDING APPROVAL', t.pending],
    ['REJECTED', t.rejected],
    ['PASSES ISSUED', t.passesIssued],
    ['VERIFIED REVENUE', rupees(t.revenuePaise)],
    ['AWAITING PAYMENT', t.awaitingPayment],
    ['CHECKED IN', t.checkedIn],
  ]
  return (
    <div className="space-y-6">
      <h1 className="display text-4xl md:text-5xl">OVERVIEW</h1>
      {s.warnings.length > 0 && (
        <div className="space-y-2">
          {s.warnings.map((w) => (
            <p key={w} className="border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              {w}
            </p>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([k, v]) => (
          <Card key={k}>
            <p className="eyebrow text-[10px] text-bone/45">{k}</p>
            <p className="display mt-2 text-3xl md:text-4xl" data-stat={k}>
              {v}
            </p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-bone/40">
        Revenue counts approved payments only. Email: {s.providers.email} · Organizer alerts: {s.providers.notify} · Payment mode: {s.providers.paymentMode}
        {t.failedNotifications ? ` · ${t.failedNotifications} failed message(s) — see Notifications` : ''}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="SALES BY PASS (APPROVED)">
          <table className="w-full text-sm">
            <tbody>
              {s.byCategory.map((r) => (
                <tr key={r.category} className="border-b border-bone/10">
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-right">{r.paid}</td>
                  <td className="py-2 text-right">{rupees(r.revenue)}</td>
                </tr>
              ))}
              {!s.byCategory.length && (
                <tr>
                  <td className="py-2 text-bone/50">No approved payments yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card title="REFERRAL CODE USAGE">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] text-bone/40">
              <tr>
                <th className="pb-2 font-normal">CODE</th>
                <th className="pb-2 text-right font-normal">BOOKINGS</th>
                <th className="pb-2 text-right font-normal">PAID</th>
                <th className="pb-2 text-right font-normal">REVENUE</th>
              </tr>
            </thead>
            <tbody>
              {s.referrals.map((r) => (
                <tr key={r.code} className="border-b border-bone/10">
                  <td className="py-2 font-mono">
                    {r.code} {!r.active && <span className="text-bone/40">(off)</span>}
                  </td>
                  <td className="py-2 text-right">
                    {r.bookings}
                    {r.max_uses ? ` / ${r.max_uses}` : ''}
                  </td>
                  <td className="py-2 text-right">{r.paid}</td>
                  <td className="py-2 text-right">{rupees(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
