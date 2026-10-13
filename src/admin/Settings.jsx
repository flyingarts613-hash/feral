import { useEffect, useState } from 'react'
import { call, rupees } from './api'
import { Btn, Card, ErrorLine, Input, Select } from './ui'

const toPaise = (r) => Math.round(Number(r) * 100)
const toRupees = (p) => (p === null || p === undefined ? '' : String(p / 100))

function SaveRow({ onSave, can }) {
  const [state, setState] = useState(null)
  return (
    <div className="mt-5 flex items-center gap-3">
      <Btn
        disabled={!can('owner')}
        busy={state === 'busy'}
        onClick={async () => {
          setState('busy')
          try {
            await onSave()
            setState('saved')
          } catch (e) {
            setState(e)
          }
        }}
      >
        SAVE
      </Btn>
      {state === 'saved' && <span className="text-sm text-emerald-300">Saved.</span>}
      {state instanceof Error && <ErrorLine error={state} />}
      {!can('owner') && <span className="text-xs text-bone/40">Only owners can change settings.</span>}
    </div>
  )
}

export function Settings({ can }) {
  const [s, setS] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => call('/settings').then(setS).catch(setErr)
  useEffect(() => {
    load()
  }, [])
  if (!s) return <ErrorLine error={err} />
  const put = (key, value) => call(`/settings/${key}`, { method: 'PUT', body: { value } })
  return (
    <div className="space-y-6">
      <h1 className="display text-4xl md:text-5xl">SETTINGS</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pricing s={s} put={put} can={can} />
        <Payment s={s} put={put} can={can} reload={load} />
        <EventInfo s={s} put={put} can={can} />
        <Templates s={s} put={put} can={can} />
        <Card title="PASS TEMPLATE">
          <p className="text-sm text-bone/70">
            Every confirmed booking gets the FERAL 2026 Official Pass: a horizontal 16:9 ticket (gothic editorial design) with the attendee name, pass type, unique
            ID (FERAL-2026-XXXXXX), date, venue and timing. It is emailed as a PNG and a PDF with the payment receipt. Passes carry no QR code — entry staff check
            the pass ID in CHECK-IN. The artwork lives in <code className="text-bone">server/services/passArt.js</code>.
          </p>
        </Card>
      </div>
    </div>
  )
}

function Pricing({ s, put, can }) {
  const [p, setP] = useState({ male: toRupees(s.pricing.male), female: toRupees(s.pricing.female), couple: toRupees(s.pricing.couple), referralDiscount: toRupees(s.pricing.referralDiscount) })
  const [age, setAge] = useState(String(s.minAge))
  return (
    <Card title="PRICES & AGE">
      <div className="grid grid-cols-2 gap-3">
        <Input label="MALE / STAG (₹)" type="number" value={p.male} onChange={(e) => setP({ ...p, male: e.target.value })} />
        <Input label="GIRLS (₹)" type="number" value={p.female} onChange={(e) => setP({ ...p, female: e.target.value })} />
        <Input label="COUPLE (₹)" type="number" value={p.couple} onChange={(e) => setP({ ...p, couple: e.target.value })} />
        <Input label="REFERRAL DISCOUNT (₹)" type="number" value={p.referralDiscount} onChange={(e) => setP({ ...p, referralDiscount: e.target.value })} hint="Flat discount for any valid code without its own price" />
        <Input label="MINIMUM AGE" type="number" value={age} onChange={(e) => setAge(e.target.value)} />
      </div>
      <SaveRow
        can={can}
        onSave={async () => {
          await put('pricing', { male: toPaise(p.male), female: toPaise(p.female), couple: toPaise(p.couple), referralDiscount: toPaise(p.referralDiscount) })
          await put('minAge', Number(age))
        }}
      />
    </Card>
  )
}

function Payment({ s, put, can, reload }) {
  const [mode, setMode] = useState(s.paymentMode || '')
  const [phones, setPhones] = useState((s.organizerPhones || []).join(', '))
  const [upi, setUpi] = useState(s.upi)
  const [qrErr, setQrErr] = useState(null)
  const [qrBusy, setQrBusy] = useState(false)
  return (
    <Card title="PAYMENT & ORGANIZER ALERTS">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="PAYMENT MODE" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">Default from server ({s.effective.paymentMode})</option>
          <option value="static_upi">Static UPI QR (manual verification)</option>
          <option value="razorpay">Razorpay gateway</option>
        </Select>
        <Input
          label="ORGANIZER PHONE(S)"
          value={phones}
          onChange={(e) => setPhones(e.target.value)}
          placeholder="+91 98765 43210"
          hint={`Comma-separated. Empty uses the server default (${s.effective.organizerPhones.join(', ') || 'none set'}).`}
        />
        <Input label="UPI ID (SHOWN UNDER THE QR)" value={upi.vpa} onChange={(e) => setUpi({ ...upi, vpa: e.target.value })} placeholder="name@bank" />
        <Input label="PAYEE NAME" value={upi.payeeName} onChange={(e) => setUpi({ ...upi, payeeName: e.target.value })} />
      </div>
      <SaveRow
        can={can}
        onSave={async () => {
          await put('paymentMode', mode || null)
          await put('organizerPhones', phones.split(',').map((x) => x.trim()).filter(Boolean))
          await put('upi', upi)
        }}
      />
      <div className="mt-6 border-t border-bone/10 pt-5">
        <p className="eyebrow mb-3 text-[10px] text-bone/50">PAYMENT QR</p>
        <div className="flex flex-wrap items-start gap-4">
          {s.paymentQrFileId ? (
            <img src={`/api/public/payment-qr?v=${s.paymentQrFileId}`} alt="Current payment QR" className="w-36 rounded-lg border border-bone/15" />
          ) : (
            <p className="text-sm text-alarm">No QR uploaded — customers can't pay yet.</p>
          )}
          <label className="eyebrow cursor-pointer border border-bone/25 px-4 py-2.5 text-[11px] hover:border-bone">
            {qrBusy ? 'UPLOADING…' : s.paymentQrFileId ? 'REPLACE QR IMAGE' : 'UPLOAD QR IMAGE'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={!can('owner') || qrBusy}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setQrBusy(true)
                setQrErr(null)
                try {
                  const form = new FormData()
                  form.append('file', f)
                  await call('/settings/payment-qr', { method: 'POST', form })
                  reload()
                } catch (e2) {
                  setQrErr(e2)
                } finally {
                  setQrBusy(false)
                }
              }}
            />
          </label>
        </div>
        <ErrorLine error={qrErr} />
      </div>
    </Card>
  )
}

function EventInfo({ s, put, can }) {
  const [e, setE] = useState(s.event)
  const f = (k, label, hint) => <Input label={label} value={e[k]} onChange={(x) => setE({ ...e, [k]: x.target.value })} hint={hint} />
  return (
    <Card title="EVENT INFORMATION (EMAILS, PASSES, RECEIPTS)">
      <div className="grid gap-3 sm:grid-cols-2">
        {f('name', 'EVENT NAME')}
        {f('shortName', 'SHORT NAME')}
        {f('dateLabel', 'DATE (AS SHOWN)')}
        {f('timeLabel', 'TIME (AS SHOWN)')}
        {f('venue', 'VENUE')}
        {f('coordinatorContact', 'COORDINATOR CONTACT')}
        {f('startsAt', 'STARTS AT (ISO)', 'e.g. 2026-10-26T17:30:00+05:30')}
        {f('endsAt', 'ENDS AT (ISO)')}
      </div>
      <label className="mt-3 block">
        <span className="eyebrow mb-1.5 block text-[10px] text-bone/50">ENTRY INSTRUCTIONS</span>
        <textarea value={e.entryInstructions} onChange={(x) => setE({ ...e, entryInstructions: x.target.value })} rows={3} className="w-full border border-bone/15 bg-ink p-3 text-sm outline-none focus:border-bone/60" />
      </label>
      <SaveRow can={can} onSave={() => put('event', e)} />
    </Card>
  )
}

function Templates({ s, put, can }) {
  const [t, setT] = useState(s.emailTemplates)
  const names = { otp: 'A — EMAIL VERIFICATION', booking: 'B — PAYMENT REQUIRED', confirmed: 'C — PASS READY', rejected: 'D — PAYMENT REJECTED' }
  return (
    <Card title="EMAIL TEMPLATES">
      <p className="mb-4 text-xs text-bone/45">Subject and opening line of each email. Use {'{{name}}'} and {'{{bookingId}}'}. The layout, amounts and links are filled in automatically.</p>
      <div className="space-y-5">
        {Object.entries(names).map(([k, label]) => (
          <div key={k}>
            <p className="eyebrow mb-2 text-[10px] text-bone/60">{label}</p>
            <Input label="SUBJECT" value={t[k].subject} onChange={(e) => setT({ ...t, [k]: { ...t[k], subject: e.target.value } })} />
            <label className="mt-2 block">
              <span className="eyebrow mb-1.5 block text-[10px] text-bone/50">OPENING LINE</span>
              <textarea value={t[k].intro} onChange={(e) => setT({ ...t, [k]: { ...t[k], intro: e.target.value } })} rows={2} className="w-full border border-bone/15 bg-ink p-3 text-sm outline-none focus:border-bone/60" />
            </label>
          </div>
        ))}
      </div>
      <SaveRow can={can} onSave={() => put('emailTemplates', t)} />
    </Card>
  )
}

export function ReferralCodes({ can }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const blank = { code: '', kind: 'flat_discount', discount: '', male: '', female: '', couple: '', maxUses: '', expiresAt: '', note: '' }
  const [n, setN] = useState(blank)
  const load = () => call('/referral-codes').then(setRows).catch(setErr)
  useEffect(() => {
    load()
  }, [])
  const num = (v) => (v === '' ? null : toPaise(v))
  const create = async () => {
    setErr(null)
    try {
      await call('/referral-codes', {
        method: 'POST',
        body: {
          code: n.code,
          kind: n.kind,
          discountPaise: num(n.discount),
          malePricePaise: n.kind === 'fixed_price' ? num(n.male) : null,
          femalePricePaise: n.kind === 'fixed_price' ? num(n.female) : null,
          couplePricePaise: n.kind === 'fixed_price' ? num(n.couple) : null,
          maxUses: n.maxUses ? Number(n.maxUses) : null,
          expiresAt: n.expiresAt ? new Date(n.expiresAt).toISOString() : null,
          note: n.note,
        },
      })
      setN(blank)
      load()
    } catch (e) {
      setErr(e)
    }
  }
  const patch = async (code, body) => {
    setErr(null)
    try {
      await call(`/referral-codes/${code}`, { method: 'PATCH', body })
      load()
    } catch (e) {
      setErr(e)
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="display text-4xl md:text-5xl">REFERRAL CODES</h1>
      <p className="max-w-3xl text-sm text-bone/60">
        Codes are case-insensitive and validated on the server. A <b>fixed price</b> code replaces the original price (ETHAN); a pass type without its own price gets
        the flat discount. A <b>flat discount</b> code takes its discount (or the default referral discount) off the original price. Codes never stack.
      </p>
      <ErrorLine error={err} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-[10px] text-bone/40">
            <tr>
              {['CODE', 'TYPE', 'MALE', 'GIRLS', 'COUPLE', 'USES', 'EXPIRES', 'ACTIVE'].map((h) => (
                <th key={h} className="pb-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => {
              const price = (k) => (r.kind === 'fixed_price' && r[`${k}_price_paise`] !== null ? rupees(r[`${k}_price_paise`]) : `−${r.discount_paise !== null ? rupees(r.discount_paise) : 'default'}`)
              return (
                <tr key={r.id} className="border-b border-bone/10">
                  <td className="py-2 font-mono">{r.code}</td>
                  <td className="py-2">{r.kind === 'fixed_price' ? 'Fixed price' : 'Flat discount'}</td>
                  <td className="py-2">{price('male')}</td>
                  <td className="py-2">{price('female')}</td>
                  <td className="py-2">
                    {price('couple')}
                    {r.kind === 'fixed_price' && can('owner') && (
                      <button
                        className="ml-2 text-xs text-bone/50 underline"
                        onClick={() => {
                          const v = prompt(`Special couple price for ${r.code} in ₹ (empty = normal referral discount)`, r.couple_price_paise !== null ? r.couple_price_paise / 100 : '')
                          if (v !== null) patch(r.code, { couplePricePaise: v === '' ? null : toPaise(v) })
                        }}
                      >
                        edit
                      </button>
                    )}
                  </td>
                  <td className="py-2">
                    {r.uses}
                    {r.max_uses ? ` / ${r.max_uses}` : ''}
                  </td>
                  <td className="py-2">{r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="py-2">
                    <input type="checkbox" checked={r.active} disabled={!can('owner')} onChange={(e) => patch(r.code, { active: e.target.checked })} aria-label={`${r.code} active`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {can('owner') && (
        <Card title="NEW CODE">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Input label="CODE" value={n.code} onChange={(e) => setN({ ...n, code: e.target.value.toUpperCase() })} />
            <Select label="TYPE" value={n.kind} onChange={(e) => setN({ ...n, kind: e.target.value })}>
              <option value="flat_discount">Flat discount</option>
              <option value="fixed_price">Fixed price</option>
            </Select>
            <Input label="DISCOUNT (₹)" type="number" value={n.discount} onChange={(e) => setN({ ...n, discount: e.target.value })} hint="Empty = default discount" />
            {n.kind === 'fixed_price' && (
              <>
                <Input label="MALE PRICE (₹)" type="number" value={n.male} onChange={(e) => setN({ ...n, male: e.target.value })} />
                <Input label="GIRLS PRICE (₹)" type="number" value={n.female} onChange={(e) => setN({ ...n, female: e.target.value })} />
                <Input label="COUPLE PRICE (₹)" type="number" value={n.couple} onChange={(e) => setN({ ...n, couple: e.target.value })} />
              </>
            )}
            <Input label="MAX USES" type="number" value={n.maxUses} onChange={(e) => setN({ ...n, maxUses: e.target.value })} hint="Empty = unlimited" />
            <Input label="EXPIRES" type="datetime-local" value={n.expiresAt} onChange={(e) => setN({ ...n, expiresAt: e.target.value })} />
            <Input label="NOTE" value={n.note} onChange={(e) => setN({ ...n, note: e.target.value })} />
          </div>
          <Btn className="mt-5" onClick={create} disabled={!n.code}>
            CREATE CODE
          </Btn>
        </Card>
      )}
    </div>
  )
}
