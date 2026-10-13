# FERAL bookings, payments & pass delivery

The site is still the same Vite + React app. A small Node server (`server/`)
now runs next to it and serves the site, the booking API, the private admin at
`/admin/`, pass verification at `/verify/…`, and a background worker that
sends every email and phone alert with retries.

```
Customer: GET YOUR PASS → price menu → BUY PASS → details → email OTP
        → payment QR + UPI reference → "awaiting organizer approval"
Server:   saves the payment → queues a phone alert to the organizer
Organizer: /admin → PAYMENT APPROVALS → checks bank/UPI → CONFIRM or REJECT
Confirm:  payment APPROVED → pass + receipt PDFs (unique QR) → emailed → PASS ISSUED
Reject:   payment REJECTED → customer emailed (can resubmit) → organizer told
```

Nothing is ever marked paid, sent or delivered unless it really happened:
a submitted reference is only "awaiting verification", an email is "SENT"
once the provider accepts it and "DELIVERED" only when the provider says so.

## What you need to provide before going live

| Item | Where |
|---|---|
| A PostgreSQL database | `DATABASE_URL` (Neon, Supabase, Railway, Render, RDS… any Postgres 14+) |
| A long random `APP_SECRET` | `.env` (see `.env.example`) |
| An email sender | Resend API key + verified domain (`EMAIL_PROVIDER=resend`) or SMTP |
| Organizer phone alerts | WhatsApp Cloud API or Twilio credentials + `ORGANIZER_PHONE` |
| The payment QR image | Admin → Settings → Payment QR (or `PAYMENT_QR_PATH`) |
| Your UPI ID (optional, shown under the QR) | Admin → Settings |
| The pass template JSON | Send it over — see "Pass template" below |
| A host that runs Node 22 | see "Deploying" |

Until each one is configured the system says so plainly (admin Overview shows
warnings; customers see "Payment QR not available" instead of a fake QR).

## Running it

```bash
cp .env.example .env            # fill it in
npm install
npm run build                   # builds the site + admin into dist/
npm start                       # http://localhost:8787  (migrations run automatically)
npm run admin:create -- --email you@example.com --name "Your Name" --role owner
```

Development: `npm run dev:server` (API on :8787) and `npm run dev` (Vite on
:5173, proxies `/api` and `/verify`). In development you may set
`EMAIL_PROVIDER=dev_outbox`: emails are written to `.dev-outbox/` instead of
being sent (refused in production).

### Admins

There is no default password. `npm run admin:create` asks for one (12+
characters) or, with `--generate`, prints a strong one once. Roles:

- **owner** — everything, including settings, prices, referral codes, check-in resets
- **approver** — confirm/reject payments, retry messages, check people in
- **viewer** — read-only

Re-running the command for an existing email resets its password and signs it out everywhere.

## Deploying

The simplest setup is one Node service serving everything:

1. Create a Postgres database.
2. Deploy this repo as a Node 22 web service (Render, Railway, Fly.io, a VPS…):
   build `npm ci && npm run build`, start `npm start`; or use the `Dockerfile`.
3. Set the environment variables from `.env.example` in the host's dashboard.
4. Point `www.getferal.in` at the service. Keep `APP_URL=https://www.getferal.in`.
5. Create your admin (`npm run admin:create …` in the host's shell), sign in at
   `https://www.getferal.in/admin/`, upload the payment QR, check Overview for warnings.

If the site must stay on a static host, deploy the server on its own domain,
build the site with `VITE_API_URL=https://api.your-domain` and set
`CORS_ORIGINS=https://www.getferal.in` on the server. The admin is then at the
server's domain (`https://api.your-domain/admin/`).

Without a reachable booking server (for example, the site deployed as static
files before the server is live) the pass sheet automatically falls back to the
previous way to book — the registration form, then a WhatsApp DM for payment —
and never shows a fake booking flow.

## Email

- **Resend**: verify the sending domain, set `RESEND_API_KEY`, `EMAIL_FROM`. For
  delivery tracking add a webhook to `APP_URL/api/webhooks/resend` (events
  `email.delivered`, `email.bounced`, `email.complained`) and set `RESEND_WEBHOOK_SECRET`.
- **SMTP**: `SMTP_HOST/PORT/USER/PASS`. SMTP only reports "accepted"; there is no delivery receipt.

Emails: A verify email (OTP), B payment required (+ preliminary receipt marked
"PAYMENT PENDING — NOT A CONFIRMED PASS"), C pass ready (pass PDF, receipt PDF,
inline QR, download link), D payment needs attention. Subjects and opening
lines are editable in Admin → Settings → Email templates.

The OTP is generated with a CSPRNG, stored only as a keyed hash, expires after
5 minutes, allows 5 attempts, has a 60-second resend cooldown and a cap of 5
codes per hour. It is sent directly (never queued) so it is never written to the database.

## Organizer phone alerts

A normal WhatsApp account cannot send automated messages. Use one of:

**WhatsApp Business Cloud API (Meta)** — `NOTIFY_PROVIDER=whatsapp_cloud`.
Business-initiated messages need approved templates. Create two templates in
WhatsApp Manager (category *Utility*, language *English*) with these bodies:

`feral_payment_pending`
```
FERAL — PAYMENT APPROVAL REQUIRED

Customer: {{1}}
Phone: {{2}}
Email: {{3}}
Pass: {{4}}
Referral: {{5}}
Original Price: {{6}}
Discount: {{7}}
Final Amount: {{8}}
Booking ID: {{9}}
UPI Reference: {{10}}

Status: PAYMENT PENDING VERIFICATION

Review this booking in the FERAL admin dashboard.
```

`feral_payment_rejected`
```
FERAL — PAYMENT REJECTED

Booking ID: {{1}}
Customer: {{2}}
Reason: {{3}}

The rejection is recorded and the customer has been emailed.
```

Set `WHATSAPP_CLOUD_TOKEN` (a permanent system-user token),
`WHATSAPP_CLOUD_PHONE_NUMBER_ID`, the two template names, and for delivery
status a webhook to `APP_URL/api/webhooks/whatsapp` with
`WHATSAPP_CLOUD_VERIFY_TOKEN` and `WHATSAPP_CLOUD_APP_SECRET`.

**Twilio** — `NOTIFY_PROVIDER=twilio_whatsapp` (create Content Templates with
the same bodies and set `TWILIO_WHATSAPP_CONTENT_SID` /
`_REJECTED`) or `twilio_sms`. Note: SMS to Indian numbers requires DLT
registration of the sender and template; WhatsApp is usually easier.

Alerts contain only what's needed to check the payment — no links that
approve anything, no tokens. They are queued in the same database transaction
that saves the payment, retried with back-off (6 tries), never duplicated, and
listed in Admin → Notifications. If alerts can't be sent, pending payments
still appear in PAYMENT APPROVALS (with the live count in the tab).

## Payments

**Static UPI QR (default)** — the customer scans your QR, pays, and submits the
UPI reference (screenshot optional, re-encoded and stored privately). You check
your bank/UPI app, then CONFIRM (the dialog requires ticking "I have checked my
records"). The same reference can't be used for two bookings.

**Razorpay** — set `PAYMENT_MODE=razorpay` (or switch in the admin) and the keys.
Orders are created server-side for the booking amount; checkout results and
webhooks are accepted only with valid signatures; webhooks are de-duplicated by
event ID; CONFIRM re-fetches the payment from Razorpay and refuses unless it is
`captured` for the right order and amount. `GATEWAY_AUTO_APPROVE=true` lets a
verified capture approve itself.

No refunds are issued or recorded by the system.

## Prices & referral codes

Defaults: Male/Stag ₹1,999 · Girls ₹1,699 · Couple ₹3,499. All amounts are
integer paise, calculated only on the server; the browser's numbers are ignored.

- **ETHAN** (case-insensitive): fixed ₹1,500 male/stag, ₹1,000 girls; couple gets
  the normal discount unless you set a special couple price (Admin → Referral codes → edit).
- **Any other code** an owner creates: flat ₹400 off (configurable per code or globally).
- Invalid / expired / used-up codes: original price. Codes never stack.

Prices, the default discount and the minimum age (18) are in Admin → Settings.

## Passes

Each approved booking gets exactly one pass (database-enforced): a random pass
ID, a random QR token (its own, never the payment QR) pointing to
`APP_URL/verify/<token>`, a mobile-sized PDF and a receipt PDF. The public
verify page shows only VALID / CANCELLED / INVALID with first name and pass
type. On a phone signed in to the admin (approver or owner) the same page shows
the full name and a **CHECK IN** button; a second scan shows "ALREADY CHECKED
IN" until an owner resets it (Admin → Check-in).

**Pass template**: the passes currently use FERAL's built-in design. The JSON
template you supply will be adapted in `server/services/documents.js`
(`renderPass`) — the data passed to it (name, pass type, IDs, event details,
QR URL) is fixed, so nothing else changes.

If generating or emailing a pass fails, the approval stays; the booking shows
"Payment: APPROVED · Pass: GENERATED · Email: FAILED — RETRY AVAILABLE" with
retry buttons, and retries never create a second pass or email.

## Security & privacy

Server-side validation for everything; parameterised SQL only; HttpOnly,
Secure, SameSite=Strict admin session cookies + CSRF token; scrypt passwords;
role checks on every admin action; rate limits on bookings, OTP, payment and
login endpoints; signed webhooks only; uploads type-checked by content and
re-encoded; screenshots, receipts and passes only reachable by admins or the
booking's own token; tokens are never logged (request logs are scrubbed) and
only hashes are stored; strict security headers on the admin and verify pages;
every approval, rejection, check-in, retry, export and settings change is in
the audit log.

Retention: bookings that never verified their email are deleted after 48 h;
payment screenshots are purged 90 days after the event; audit history is kept.
Customers are never asked for a UPI PIN, bank password or bank OTP — the email
OTP only verifies their email.

## Tests

```bash
# Postgres for tests (any empty database; it is wiped on each run)
export TEST_DATABASE_URL=postgresql://user@localhost:5432/feral_test
npm test                       # API, pricing, OTP, payments, gateway, security
npm run build && npm run test:e2e   # full journey in Chromium, desktop + mobile
```

Tests use in-memory email/SMS providers (only possible under `NODE_ENV=test`)
and mock only Razorpay's HTTP API; signatures are real HMACs.
