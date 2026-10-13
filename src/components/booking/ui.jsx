import { rupees } from '../../data/passes'

export const STEPS = ['DETAILS', 'EMAIL VERIFICATION', 'PAYMENT', 'CONFIRMATION']
const INDEX = { details: 0, otp: 1, payment: 2, status: 3 }

export function Steps({ stage }) {
  const at = INDEX[stage] ?? -1
  if (at < 0) return null
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Booking progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === at ? 'step' : undefined}>
          <span
            className={`eyebrow flex items-center gap-2 text-[10px] md:text-[11px] ${i === at ? 'text-bone' : i < at ? 'text-bone/55' : 'text-bone/25'}`}
          >
            <span className={`grid h-5 w-5 place-items-center border text-[9px] ${i === at ? 'border-blood bg-blood text-bone' : i < at ? 'border-bone/40' : 'border-bone/15'}`}>
              {i < at ? '✓' : i + 1}
            </span>
            {s}
          </span>
          {i < STEPS.length - 1 && <span className="text-bone/20" aria-hidden="true">→</span>}
        </li>
      ))}
    </ol>
  )
}

export function Field({ label, error, hint, children, id }) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-2 block text-bone/55">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-sm text-alarm" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-xs text-bone/40">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputClass = (err) =>
  `w-full border-0 border-b bg-transparent px-0 py-3 text-lg text-bone outline-none transition-colors placeholder:text-bone/25 focus:border-bone ${err ? 'border-alarm' : 'border-bone/20'}`

export function Button({ children, busy, className = '', variant = 'solid', ...rest }) {
  const look =
    variant === 'solid'
      ? 'bg-bone text-ink hover:bg-blood hover:text-bone disabled:hover:bg-bone disabled:hover:text-ink'
      : 'border border-bone/25 text-bone hover:border-bone'
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={`display flex min-h-14 items-center justify-between gap-4 px-6 py-4 text-xl tracking-[0.03em] transition-colors duration-500 disabled:cursor-not-allowed disabled:opacity-50 md:text-2xl ${look} ${className}`}
    >
      {busy ? <span className="flex items-center gap-3">PLEASE WAIT<Dots /></span> : children}
    </button>
  )
}

const Dots = () => (
  <span className="inline-flex gap-1" aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <span key={i} className="h-1 w-1 animate-pulse bg-current" style={{ animationDelay: `${i * 150}ms` }} />
    ))}
  </span>
)

export function Notice({ tone = 'info', title, children }) {
  const c = { info: 'border-dusk/70 bg-dusk/10', error: 'border-alarm/60 bg-alarm/10', ok: 'border-emerald-500/50 bg-emerald-500/10', warn: 'border-amber-400/50 bg-amber-400/10' }[tone]
  return (
    <div className={`border px-4 py-3 text-sm leading-relaxed ${c}`} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <p className="eyebrow mb-1 text-bone">{title}</p>}
      <div className="text-bone/80">{children}</div>
    </div>
  )
}

// Original → discount → final. Amounts are whatever the server last quoted.
export function PriceSummary({ label, originalPaise, discountPaise, finalPaise, code, status, compact }) {
  return (
    <div className={compact ? '' : 'border border-bone/10 bg-coal/60 p-5 md:p-6'}>
      {!compact && <p className="eyebrow mb-4 text-bone/50">PRICE SUMMARY</p>}
      {label && <p className="display mb-4 text-2xl tracking-[0.02em]">{label}</p>}
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-bone/55">Original price</dt>
          <dd data-price="original">{rupees(originalPaise)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-bone/55">Referral discount{code ? ` (${code})` : ''}</dt>
          <dd data-price="discount" className={discountPaise ? 'text-bone' : 'text-bone/40'}>
            {discountPaise ? `−${rupees(discountPaise)}` : rupees(0)}
          </dd>
        </div>
        <div className="flex items-end justify-between gap-4 border-t border-bone/10 pt-3">
          <dt className="eyebrow text-bone/60">Final payable amount</dt>
          <dd data-price="final" className="display text-4xl leading-none" aria-live="polite">
            {rupees(finalPaise)}
          </dd>
        </div>
      </dl>
      {status && <p className="mt-3 text-xs text-bone/45">{status}</p>}
    </div>
  )
}

export const STATUS_LABEL = {
  EMAIL_VERIFICATION_PENDING: 'Verifying email',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAYMENT_PENDING_VERIFICATION: 'Awaiting organizer approval',
  PAID: 'Payment approved — generating pass',
  PASS_ISSUED: 'Pass issued',
  PAYMENT_REJECTED: 'Payment rejected',
  CANCELLED: 'Cancelled',
}
