import { useEffect, useMemo, useRef, useState } from 'react'
import { api, uuid } from '../../lib/api'
import { PASSES, rupees } from '../../data/passes'
import { Button, Field, Notice, PriceSummary, inputClass } from './ui'

const NAME = /^[\p{L}][\p{L}\p{M} .'-]*$/u
const phoneOk = (raw) => {
  let d = String(raw).replace(/[\s\-().]/g, '')
  if (d.startsWith('+91')) d = d.slice(3)
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d)
}

// Same rules the server applies (the server is still the authority).
function validate(v, minAge) {
  const e = {}
  const name = v.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2) e.name = 'Enter your full name'
  else if (!NAME.test(name)) e.name = 'Use letters only'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'Enter a valid email address'
  if (!phoneOk(v.phone)) e.phone = 'Enter a valid 10-digit Indian mobile number'
  const age = Number(v.age)
  if (!v.age || !Number.isInteger(age) || age < 1 || age > 120) e.age = 'Enter your age'
  else if (age < minAge) e.age = `You must be at least ${minAge} to book`
  if (!v.gender) e.gender = 'Choose male or female'
  if (v.category === 'male' && v.gender === 'FEMALE') e.category = 'The Male / Stag pass is for male guests'
  if (v.category === 'female' && v.gender === 'MALE') e.category = 'The Girls pass is for female guests'
  return e
}

const REFERRAL_MSG = {
  applied: (c) => `Referral code ${c} applied.`,
  invalid: () => "That referral code isn't valid — you'll be charged the original price.",
  expired: () => "That referral code has expired — you'll be charged the original price.",
  exhausted: () => "That referral code has been fully used — you'll be charged the original price.",
}

export default function DetailsForm({ config, category, setCategory, onCreated, initial }) {
  const minAge = config?.minAge ?? 18
  const [v, setV] = useState(() => ({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    age: initial?.age ?? '',
    gender: initial?.gender ?? (category === 'female' ? 'FEMALE' : category === 'male' ? 'MALE' : ''),
    category,
    referralCode: initial?.referralCode ?? '',
  }))
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [q, setQ] = useState(null) // server quote
  const idem = useRef(uuid())

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))
  useEffect(() => setCategory(v.category), [v.category, setCategory])

  // Live price from the server whenever the pass or the code changes.
  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await api('/api/public/quote', { method: 'POST', body: { category: v.category, referralCode: v.referralCode } })
        if (alive) setQ(r)
      } catch {
        if (alive) setQ(null)
      }
    }, v.referralCode ? 450 : 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [v.category, v.referralCode])

  const local = useMemo(() => validate(v, minAge), [v, minAge])
  const shown = (k) => (touched[k] || touched._all) && (errors[k] || local[k])
  const fallback = config?.pricing?.[v.category] ?? PASSES.find((p) => p.id === v.category).pricePaise

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ _all: true })
    setFormError(null)
    if (Object.keys(local).length) {
      setErrors({})
      document.querySelector('[aria-invalid="true"]')?.focus()
      return
    }
    setBusy(true)
    try {
      const out = await api('/api/public/bookings', {
        method: 'POST',
        headers: { 'Idempotency-Key': idem.current },
        body: { name: v.name, email: v.email, phone: v.phone, age: Number(v.age), gender: v.gender, category: v.category, referralCode: v.referralCode },
      })
      onCreated(out, v)
    } catch (err) {
      if (err.fields) setErrors(err.fields)
      else if (err.field) setErrors({ [err.field]: err.message })
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const refMsg = q?.referral?.status && q.referral.status !== 'none' ? REFERRAL_MSG[q.referral.status]?.(q.referral.code) : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-10 md:grid-cols-12 md:gap-8" data-details-form>
      <div className="space-y-7 md:col-span-7">
        <Field id="f-name" label="FULL NAME" error={shown('name')}>
          <input id="f-name" autoComplete="name" value={v.name} onChange={set('name')} onBlur={() => setTouched((t) => ({ ...t, name: 1 }))} className={inputClass(shown('name'))} aria-invalid={Boolean(shown('name'))} maxLength={80} />
        </Field>
        <div className="grid gap-7 sm:grid-cols-2">
          <Field id="f-email" label="EMAIL" error={shown('email')} hint="We'll send a verification code here.">
            <input id="f-email" type="email" autoComplete="email" inputMode="email" value={v.email} onChange={set('email')} onBlur={() => setTouched((t) => ({ ...t, email: 1 }))} className={inputClass(shown('email'))} aria-invalid={Boolean(shown('email'))} maxLength={254} />
          </Field>
          <Field id="f-phone" label="MOBILE (INDIA)" error={shown('phone')}>
            <input id="f-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="98765 43210" value={v.phone} onChange={set('phone')} onBlur={() => setTouched((t) => ({ ...t, phone: 1 }))} className={inputClass(shown('phone'))} aria-invalid={Boolean(shown('phone'))} maxLength={16} />
          </Field>
        </div>
        <div className="grid gap-7 sm:grid-cols-2">
          <Field id="f-age" label="AGE" error={shown('age')} hint={`${minAge}+ only`}>
            <input id="f-age" type="number" inputMode="numeric" min={1} max={120} value={v.age} onChange={set('age')} onBlur={() => setTouched((t) => ({ ...t, age: 1 }))} className={inputClass(shown('age'))} aria-invalid={Boolean(shown('age'))} />
          </Field>
          <Field id="f-gender" label="GENDER" error={shown('gender')}>
            <div id="f-gender" role="radiogroup" className="flex gap-3 pt-1" aria-invalid={Boolean(shown('gender'))}>
              {['MALE', 'FEMALE'].map((g) => (
                <button
                  type="button"
                  key={g}
                  role="radio"
                  aria-checked={v.gender === g}
                  data-gender={g}
                  onClick={() => {
                    set('gender')(g)
                    if (g === 'FEMALE' && v.category === 'male') set('category')('female')
                    if (g === 'MALE' && v.category === 'female') set('category')('male')
                  }}
                  className={`eyebrow min-h-12 flex-1 border px-4 transition-colors ${v.gender === g ? 'border-bone bg-bone text-ink' : 'border-bone/20 text-bone/70 hover:border-bone/60'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field id="f-category" label="PASS" error={shown('category')}>
          <div id="f-category" role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {PASSES.map((p) => (
              <button
                type="button"
                key={p.id}
                role="radio"
                aria-checked={v.category === p.id}
                data-category={p.id}
                onClick={() => set('category')(p.id)}
                className={`flex min-h-14 items-center justify-between border px-4 py-3 text-left transition-colors ${v.category === p.id ? 'border-blood bg-blood/15 text-bone' : 'border-bone/15 text-bone/60 hover:border-bone/40'}`}
              >
                <span className="display text-lg tracking-[0.02em]">{p.name}</span>
                <span className="text-sm">{rupees(config?.pricing?.[p.id] ?? p.pricePaise)}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field id="f-ref" label="REFERRAL CODE (OPTIONAL)" error={errors.referralCode} hint="Contact coordinators for referral code.">
          <input id="f-ref" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={v.referralCode} onChange={(e) => set('referralCode')(e.target.value.toUpperCase())} className={`${inputClass(false)} uppercase tracking-[0.15em]`} maxLength={32} />
        </Field>
        {refMsg && (
          <Notice tone={q.referral.status === 'applied' ? 'ok' : 'warn'}>
            <span data-referral-status={q.referral.status}>{refMsg}</span>
          </Notice>
        )}
        {formError && <Notice tone="error">{formError}</Notice>}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <Button type="submit" busy={busy} className="hidden w-full md:flex" data-submit>
          CONTINUE TO EMAIL VERIFICATION <span>→</span>
        </Button>
      </div>

      <aside className="md:col-span-4 md:col-start-9">
        <div className="md:sticky md:top-24">
          <PriceSummary
            label={PASSES.find((p) => p.id === v.category).name}
            originalPaise={q?.originalPaise ?? fallback}
            discountPaise={q?.discountPaise ?? 0}
            finalPaise={q?.finalPaise ?? fallback}
            code={q?.referral?.status === 'applied' ? q.referral.code : null}
            status="Calculated by FERAL's server — this is the amount you'll pay."
          />
        </div>
      </aside>

      {/* mobile: the final price and the button stay in reach */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-bone/10 bg-ink/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="eyebrow text-bone/55">FINAL PAYABLE</span>
          <span className="display text-3xl" data-mobile-final>{rupees(q?.finalPaise ?? fallback)}</span>
        </div>
        <Button type="submit" busy={busy} className="w-full" data-submit-mobile>
          CONTINUE <span>→</span>
        </Button>
      </div>
    </form>
  )
}
