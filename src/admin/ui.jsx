import { useEffect, useRef } from 'react'

export function Btn({ children, busy, tone = 'solid', className = '', ...rest }) {
  const look = {
    solid: 'bg-bone text-ink hover:bg-blood hover:text-bone',
    confirm: 'bg-emerald-600 text-white hover:bg-emerald-500',
    danger: 'bg-blood text-bone hover:bg-alarm',
    ghost: 'border border-bone/25 text-bone hover:border-bone',
  }[tone]
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={`eyebrow inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${look} ${className}`}
    >
      {busy ? 'WORKING…' : children}
    </button>
  )
}

export function Input({ label, hint, className = '', ...rest }) {
  return (
    <label className={`block ${className}`}>
      <span className="eyebrow mb-1.5 block text-[10px] text-bone/50">{label}</span>
      <input {...rest} className="w-full border border-bone/15 bg-ink px-3 py-2.5 text-sm text-bone outline-none focus:border-bone/60" />
      {hint && <span className="mt-1 block text-xs text-bone/40">{hint}</span>}
    </label>
  )
}

export function Select({ label, children, className = '', ...rest }) {
  return (
    <label className={`block ${className}`}>
      <span className="eyebrow mb-1.5 block text-[10px] text-bone/50">{label}</span>
      <select {...rest} className="w-full border border-bone/15 bg-ink px-3 py-2.5 text-sm text-bone outline-none focus:border-bone/60">
        {children}
      </select>
    </label>
  )
}

const TONE = {
  ok: 'border-emerald-500/50 text-emerald-300',
  warn: 'border-amber-400/50 text-amber-300',
  bad: 'border-alarm/60 text-alarm',
  info: 'border-dusk text-[#c7b4dc]',
  dim: 'border-bone/15 text-bone/50',
}
export const Chip = ({ tone = 'dim', children, ...rest }) => (
  <span {...rest} className={`eyebrow inline-block border px-2 py-0.5 text-[10px] ${TONE[tone]}`}>
    {children}
  </span>
)

export function Dialog({ title, children, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    ref.current?.querySelector('input,textarea,button')?.focus()
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('keydown', k)
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-bone/15 bg-coal p-6">
        <p className="display text-3xl">{title}</p>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}

export const Card = ({ title, children, className = '' }) => (
  <section className={`border border-bone/10 bg-coal/70 p-5 ${className}`}>
    {title && <p className="eyebrow mb-4 text-[11px] text-bone/50">{title}</p>}
    {children}
  </section>
)

export const ErrorLine = ({ error }) => (error ? <p className="mt-3 text-sm text-alarm" role="alert">{error.message || String(error)}</p> : null)
