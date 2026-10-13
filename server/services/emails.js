import { CATEGORY_LABEL, escapeHtml as h, rupees, rupeesPlain } from '../lib/format.js'

// Branded transactional emails. Subjects and intro lines come from the
// emailTemplates setting (editable in the admin) and may use {{name}} and
// {{bookingId}}; every inserted value is HTML-escaped.

const fill = (tpl, vars) => String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '')

function layout({ preheader, title, body }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"><title>${h(title)}</title></head>
<body style="margin:0;padding:0;background:#050505;color:#f2f0ec;font-family:Inter,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${h(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #2a2626;background:#0b0a0a">
<tr><td style="height:4px;background:#9e0f18;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 8px">
  <div style="font-family:Anton,Impact,'Arial Narrow',sans-serif;font-size:44px;letter-spacing:1px;line-height:1;color:#f2f0ec">FERAL</div>
  <div style="margin-top:8px;font-size:11px;letter-spacing:3px;color:#c4202d">HALLOWEEN HOUSE PARTY 2026</div>
</td></tr>
<tr><td style="padding:16px 32px 32px;font-size:15px;line-height:1.6;color:#d9d6d1">${body}</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #2a2626;font-size:11px;line-height:1.6;color:#7b7672">
FERAL never asks for your UPI PIN, bank password, card PIN or bank OTP. If anyone does, it isn't us.</td></tr>
</table></td></tr></table></body></html>`
}

const row = (k, v, strong = false) =>
  `<tr><td style="padding:6px 0;color:#8d8884;font-size:13px">${h(k)}</td><td align="right" style="padding:6px 0;font-size:${strong ? 17 : 14}px;color:${strong ? '#f2f0ec' : '#d9d6d1'};font-weight:${strong ? 600 : 400}">${h(v)}</td></tr>`
const table = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-top:1px solid #2a2626;border-bottom:1px solid #2a2626">${rows.join('')}</table>`
const button = (href, label) =>
  `<p style="margin:24px 0"><a href="${h(href)}" style="display:inline-block;background:#f2f0ec;color:#050505;text-decoration:none;font-weight:700;letter-spacing:1px;padding:14px 22px">${h(label)}</a></p>`

const priceRows = (b, paidLabel = 'Final payable amount') => [
  row('Original price', rupees(b.original_paise)),
  row(`Referral discount${b.referral_code ? ` (${b.referral_code})` : ''}`, b.discount_paise ? `−${rupees(b.discount_paise)}` : rupees(0)),
  row(paidLabel, rupees(b.final_paise), true),
]

export function otpEmail({ settings, booking, otp, ttlMinutes }) {
  const t = settings.emailTemplates.otp
  const vars = { name: booking.holder_name, bookingId: booking.booking_code }
  const subject = fill(t.subject, vars)
  const body = `<p>Hi ${h(booking.holder_name)},</p><p>${h(fill(t.intro, vars))}</p>
<div style="margin:24px 0;padding:18px;border:1px solid #3a2a4a;background:#120d16;text-align:center">
  <div style="font-size:11px;letter-spacing:3px;color:#8d8884">YOUR CODE</div>
  <div style="font-family:'Courier New',monospace;font-size:34px;letter-spacing:10px;color:#f2f0ec;margin-top:6px">${h(otp)}</div>
</div>
<p style="font-size:13px;color:#8d8884">The code expires in ${ttlMinutes} minutes. Never share it with anyone — FERAL staff will never ask for it. If you didn't start a FERAL booking, ignore this email.</p>`
  const text = `Hi ${booking.holder_name},\n\n${fill(t.intro, vars)}\n\nYour code: ${otp}\n\nIt expires in ${ttlMinutes} minutes. Never share it with anyone. If you didn't start a FERAL booking, ignore this email.`
  return { subject, html: layout({ preheader: `Your code expires in ${ttlMinutes} minutes`, title: subject, body }), text }
}

export function bookingEmail({ settings, booking, bookingUrl, qrUrl, upi }) {
  const t = settings.emailTemplates.booking
  const vars = { name: booking.holder_name, bookingId: booking.booking_code }
  const subject = fill(t.subject, vars)
  const body = `<p>Hi ${h(booking.holder_name)},</p><p>${h(fill(t.intro, vars))}</p>
${table([row('Booking ID', booking.booking_code), row('Pass', CATEGORY_LABEL[booking.category]), ...priceRows(booking), row('Status', 'Awaiting payment')])}
<p><strong style="color:#f2f0ec">How to pay:</strong> scan the payment QR and pay the exact amount above${upi?.vpa ? ` (UPI ID: ${h(upi.vpa)})` : ''}. Then open your booking and submit your UPI transaction / reference ID.</p>
${qrUrl ? `<p style="text-align:center;margin:20px 0"><img src="${h(qrUrl)}" alt="FERAL payment QR" width="220" style="width:220px;max-width:100%;background:#fff;padding:8px"></p>` : ''}
${button(bookingUrl, 'OPEN MY BOOKING')}
<p style="font-size:13px;color:#c4202d;letter-spacing:1px">PAYMENT PENDING — NOT A CONFIRMED PASS</p>
<p style="font-size:13px;color:#8d8884">Your pass is emailed only after the organisers verify your payment. A booking receipt is attached.</p>`
  const text = `Hi ${booking.holder_name},\n\n${fill(t.intro, vars)}\n\nBooking ID: ${booking.booking_code}\nPass: ${CATEGORY_LABEL[booking.category]}\nOriginal price: ${rupeesPlain(booking.original_paise)}\nReferral discount: ${rupeesPlain(booking.discount_paise)}\nFinal payable amount: ${rupeesPlain(booking.final_paise)}\nStatus: Awaiting payment\n\nPay the exact amount using the payment QR${upi?.vpa ? ` (UPI ID: ${upi.vpa})` : ''}, then submit your UPI reference ID here:\n${bookingUrl}\n\nPAYMENT PENDING — NOT A CONFIRMED PASS.`
  return { subject, html: layout({ preheader: `Pay ${rupeesPlain(booking.final_paise)} to complete booking ${booking.booking_code}`, title: subject, body }), text }
}

export function confirmedEmail({ settings, booking, payment, pass, downloadUrl }) {
  const t = settings.emailTemplates.confirmed
  const ev = settings.event
  const vars = { name: booking.holder_name, bookingId: booking.booking_code }
  const subject = fill(t.subject, vars)
  const body = `<p>Hi ${h(booking.holder_name)},</p><p>${h(fill(t.intro, vars))}</p>
${table([
  row('Booking ID', booking.booking_code),
  row('Pass ID', pass.pass_code),
  row('Pass', CATEGORY_LABEL[booking.category]),
  ...priceRows(booking, 'Amount paid'),
  row('Payment', 'Confirmed'),
  ...(payment.transaction_reference ? [row('Payment reference', payment.transaction_reference)] : []),
])}
${table([row('Date', ev.dateLabel), row('Time', ev.timeLabel), row('Venue', ev.venue)])}
<p style="text-align:center;margin:20px 0"><img src="cid:feral-pass-qr" alt="Your FERAL entry QR" width="200" style="width:200px;background:#fff;padding:8px"></p>
<p><strong style="color:#f2f0ec">Entry:</strong> ${h(ev.entryInstructions)}</p>
${button(downloadUrl, 'DOWNLOAD MY PASS')}
<p style="font-size:13px;color:#8d8884">Your pass (PDF) and payment receipt (PDF) are attached. Don't share your pass QR — it can only be used for entry once.</p>`
  const text = `Hi ${booking.holder_name},\n\n${fill(t.intro, vars)}\n\nBooking ID: ${booking.booking_code}\nPass ID: ${pass.pass_code}\nPass: ${CATEGORY_LABEL[booking.category]}\nAmount paid: ${rupeesPlain(booking.final_paise)}\nReferral discount: ${rupeesPlain(booking.discount_paise)}\nPayment: Confirmed${payment.transaction_reference ? `\nPayment reference: ${payment.transaction_reference}` : ''}\n\n${ev.dateLabel}, ${ev.timeLabel}\n${ev.venue}\n\nEntry: ${ev.entryInstructions}\n\nDownload your pass: ${downloadUrl}\n\nYour pass and receipt are attached as PDFs.`
  return { subject, html: layout({ preheader: `Your FERAL pass ${pass.pass_code} is ready`, title: subject, body }), text }
}

export function rejectedEmail({ settings, booking, reason, bookingUrl }) {
  const t = settings.emailTemplates.rejected
  const vars = { name: booking.holder_name, bookingId: booking.booking_code }
  const subject = fill(t.subject, vars)
  const contact = settings.event.coordinatorContact
  const body = `<p>Hi ${h(booking.holder_name)},</p><p>${h(fill(t.intro, vars))}</p>
${table([row('Booking ID', booking.booking_code), row('Amount due', rupees(booking.final_paise), true)])}
${reason ? `<p><strong style="color:#f2f0ec">Reason:</strong> ${h(reason)}</p>` : ''}
<p>Your booking is still open. If you've paid, check that the UPI reference ID you submitted is correct and submit it again. If you haven't paid yet, pay the exact amount shown, then submit the reference ID.</p>
${button(bookingUrl, 'REVIEW MY BOOKING')}
<p style="font-size:13px;color:#8d8884">Questions? Contact the coordinators${contact ? ` on ${h(contact)}` : ''}. No pass has been issued for this booking yet.</p>`
  const text = `Hi ${booking.holder_name},\n\n${fill(t.intro, vars)}\n\nBooking ID: ${booking.booking_code}\nAmount due: ${rupeesPlain(booking.final_paise)}${reason ? `\nReason: ${reason}` : ''}\n\nYour booking is still open — check your UPI reference ID and submit it again, or pay the exact amount and submit the reference ID:\n${bookingUrl}\n\nQuestions? Contact the coordinators${contact ? ` on ${contact}` : ''}.`
  return { subject, html: layout({ preheader: `Booking ${booking.booking_code} needs attention`, title: subject, body }), text }
}

// Organizer phone alert. Only what is needed to check the payment — no links
// that approve anything, no tokens.
export function organizerPendingMessage({ booking, payment }) {
  const params = [
    booking.holder_name,
    booking.phone,
    booking.email,
    CATEGORY_LABEL[booking.category],
    booking.referral_code || 'None',
    rupeesPlain(booking.original_paise),
    rupeesPlain(booking.discount_paise),
    rupeesPlain(booking.final_paise),
    booking.booking_code,
    payment.transaction_reference || payment.gateway_payment_id || '—',
  ]
  const body = [
    'FERAL — PAYMENT APPROVAL REQUIRED',
    '',
    `Customer: ${params[0]}`,
    `Phone: ${params[1]}`,
    `Email: ${params[2]}`,
    `Pass: ${params[3]}`,
    `Referral: ${params[4]}`,
    `Original Price: ${params[5]}`,
    `Discount: ${params[6]}`,
    `Final Amount: ${params[7]}`,
    `Booking ID: ${params[8]}`,
    `UPI Reference: ${params[9]}`,
    '',
    'Status: PAYMENT PENDING VERIFICATION',
    '',
    'Review this booking in the FERAL admin dashboard.',
  ].join('\n')
  return { body, params }
}

export function organizerRejectedMessage({ booking, reason }) {
  const params = [booking.booking_code, booking.holder_name, reason || 'No reason given']
  return {
    body: `FERAL — PAYMENT REJECTED\n\nBooking ID: ${params[0]}\nCustomer: ${params[1]}\nReason: ${params[2]}\n\nThe rejection is recorded and the customer has been emailed.`,
    params,
  }
}
