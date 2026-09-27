// Brand glyphs, drawn as outlines so they sit with FERAL's thin type.

export function InstagramIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function WhatsAppIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4.2 19.8l1.1-3.9A8.6 8.6 0 1 1 8.4 19z" />
      <path
        d="M9.1 7.8c.3-.3.8-.3 1 .1l.8 1.6c.1.3.1.6-.1.8l-.5.6c.6 1.2 1.5 2.1 2.7 2.7l.6-.5c.2-.2.5-.2.8-.1l1.6.8c.4.2.4.7.1 1l-.6.7c-.5.5-1.3.6-2 .3-2.3-1-4-2.7-5-5-.3-.7-.2-1.5.3-2z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}
