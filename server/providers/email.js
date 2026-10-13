import fs from 'node:fs/promises'
import path from 'node:path'
import nodemailer from 'nodemailer'

// send({ to, subject, html, text, attachments: [{ filename, content: Buffer, contentType }], idempotencyKey })
//   → { provider, messageId }   (throws on failure)
// A returned messageId means the provider ACCEPTED the message — not that it
// was delivered. Delivery is only recorded when the provider reports it.

export function createEmailProvider(cfg, { capture } = {}) {
  const e = cfg.email
  switch (e.provider) {
    case 'resend':
      return {
        name: 'resend',
        async send(m) {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${e.resendApiKey}`,
              'Content-Type': 'application/json',
              ...(m.idempotencyKey ? { 'Idempotency-Key': m.idempotencyKey.slice(0, 256) } : {}),
            },
            body: JSON.stringify({
              from: e.from,
              to: [m.to],
              subject: m.subject,
              html: m.html,
              text: m.text,
              ...(e.replyTo ? { reply_to: e.replyTo } : {}),
              attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: a.content.toString('base64'), ...(a.cid ? { content_id: a.cid } : {}) })),
            }),
            signal: AbortSignal.timeout(20000),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message || body.name || 'request failed'}`)
          return { provider: 'resend', messageId: body.id }
        },
      }
    case 'smtp': {
      const t = nodemailer.createTransport({
        host: e.smtp.host,
        port: e.smtp.port,
        secure: e.smtp.secure,
        auth: e.smtp.user ? { user: e.smtp.user, pass: e.smtp.pass } : undefined,
      })
      return {
        name: 'smtp',
        async send(m) {
          const info = await t.sendMail({
            from: e.from,
            to: m.to,
            replyTo: e.replyTo || undefined,
            subject: m.subject,
            html: m.html,
            text: m.text,
            attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, ...(a.cid ? { cid: a.cid } : {}) })),
          })
          if (!info.accepted?.length) throw new Error(`SMTP rejected: ${info.response || 'no recipients accepted'}`)
          return { provider: 'smtp', messageId: info.messageId }
        },
      }
    }
    case 'dev_outbox':
      // Development only (refused in production): writes each email to a local
      // folder so the flow can be exercised without an email account. Nothing is sent.
      return {
        name: 'dev_outbox',
        async send(m) {
          await fs.mkdir(e.devOutboxDir, { recursive: true })
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          await fs.writeFile(path.join(e.devOutboxDir, `${id}.html`), `<!-- to: ${m.to} | ${m.subject} -->\n${m.html}`)
          for (const a of m.attachments || []) await fs.writeFile(path.join(e.devOutboxDir, `${id}-${a.filename}`), a.content)
          return { provider: 'dev_outbox', messageId: id }
        },
      }
    case 'test':
      return {
        name: 'test',
        async send(m) {
          if (capture.failEmail?.(m)) throw new Error('test email failure')
          capture.emails.push(m)
          return { provider: 'test', messageId: `test-${capture.emails.length}` }
        },
      }
    default:
      return {
        name: 'none',
        async send() {
          throw new Error('No email provider configured (set EMAIL_PROVIDER)')
        },
      }
  }
}
