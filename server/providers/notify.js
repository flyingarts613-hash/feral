// Organizer phone alerts. send({ to, body, params }) → { provider, messageId, status }
//   to:     E.164 phone (+91…)
//   body:   full text (SMS, Twilio WhatsApp free-form)
//   params: ordered values for an approved WhatsApp template (see docs/BOOKINGS.md)
// A plain WhatsApp number cannot send automated messages — these use the Twilio
// API or Meta's WhatsApp Business Cloud API with an approved sender.

export function createNotifyProvider(cfg, { capture } = {}) {
  const n = cfg.notify
  const tw = n.twilio
  const twilioSend = async (form) => {
    if (!tw.accountSid || !tw.authToken) throw new Error('Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)')
    if (tw.statusCallback && /^https:\/\//.test(cfg.apiUrl)) form.StatusCallback = `${cfg.apiUrl}/api/webhooks/twilio/status`
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${tw.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${tw.accountSid}:${tw.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(20000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.sid) throw new Error(`Twilio ${res.status}: ${body.message || 'request failed'} (code ${body.code ?? '-'})`)
    if (['failed', 'undelivered'].includes(body.status)) throw new Error(`Twilio status ${body.status}`)
    return { messageId: body.sid, status: body.status }
  }

  switch (n.provider) {
    case 'twilio_sms':
      return {
        name: 'twilio_sms',
        channel: 'sms',
        async send({ to, body }) {
          const form = { To: to, Body: body }
          if (tw.messagingServiceSid) form.MessagingServiceSid = tw.messagingServiceSid
          else if (tw.smsFrom) form.From = tw.smsFrom
          else throw new Error('Set TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID')
          return { provider: 'twilio_sms', ...(await twilioSend(form)) }
        },
      }
    case 'twilio_whatsapp':
      return {
        name: 'twilio_whatsapp',
        channel: 'whatsapp',
        async send({ to, kind, body, params }) {
          if (!tw.whatsappFrom) throw new Error('Set TWILIO_WHATSAPP_FROM (e.g. whatsapp:+1415…)')
          const form = { To: `whatsapp:${to}`, From: tw.whatsappFrom.startsWith('whatsapp:') ? tw.whatsappFrom : `whatsapp:${tw.whatsappFrom}` }
          const contentSid = tw.whatsappContentSid[kind]
          if (contentSid) {
            form.ContentSid = contentSid
            form.ContentVariables = JSON.stringify(Object.fromEntries(params.map((v, i) => [String(i + 1), String(v)])))
          } else form.Body = body
          return { provider: 'twilio_whatsapp', ...(await twilioSend(form)) }
        },
      }
    case 'whatsapp_cloud': {
      const w = n.whatsappCloud
      return {
        name: 'whatsapp_cloud',
        channel: 'whatsapp',
        async send({ to, kind, body, params }) {
          if (!w.token || !w.phoneNumberId) throw new Error('WhatsApp Cloud API is not configured (WHATSAPP_CLOUD_TOKEN / WHATSAPP_CLOUD_PHONE_NUMBER_ID)')
          // Business-initiated messages need an approved template; free text only
          // works inside a 24-hour customer-service window.
          const template = w.template[kind]
          const msg = template
            ? {
                type: 'template',
                template: {
                  name: template,
                  language: { code: w.templateLang },
                  components: [{ type: 'body', parameters: params.map((v) => ({ type: 'text', text: String(v).slice(0, 1000) })) }],
                },
              }
            : { type: 'text', text: { body } }
          const res = await fetch(`https://graph.facebook.com/${w.apiVersion}/${w.phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), ...msg }),
            signal: AbortSignal.timeout(20000),
          })
          const out = await res.json().catch(() => ({}))
          const id = out.messages?.[0]?.id
          if (!res.ok || !id) throw new Error(`WhatsApp Cloud ${res.status}: ${out.error?.message || 'request failed'}`)
          return { provider: 'whatsapp_cloud', messageId: id, status: out.messages?.[0]?.message_status || 'accepted' }
        },
      }
    }
    case 'test':
      return {
        name: 'test',
        channel: 'sms',
        async send(m) {
          if (capture.failNotify?.(m)) throw new Error('test notify failure')
          capture.notifications.push(m)
          return { provider: 'test', messageId: `test-n-${capture.notifications.length}`, status: 'queued' }
        },
      }
    default:
      return {
        name: 'none',
        channel: 'sms',
        async send() {
          throw new Error('No organizer notification provider configured (set NOTIFY_PROVIDER)')
        },
      }
  }
}
