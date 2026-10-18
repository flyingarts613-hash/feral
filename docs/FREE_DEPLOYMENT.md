# FERAL — free 10-day deployment (Render + Supabase)

The goal: run the whole booking system for the event period (about 100
registrations, 10 days) for ₹0 hosting, without losing any record.

```
Browser ──► Render free web service (one Node 22 process)
              ├─ the website (dist/) + /admin/
              ├─ booking / admin / webhook API
              └─ delivery worker (emails + organizer alerts, retried from the database)
                     │
                     ▼
            Supabase free PostgreSQL (all data, including passes, receipts,
            screenshots and the payment QR — nothing is kept on Render's disk)
```

**One web service is enough.** The background worker runs inside the same
process (`server/index.js` → `startWorker`), so no paid Render "Background
Worker" is needed. Every job lives in the `notifications` table, so it survives
restarts and redeploys; a send that was cut off is picked up again after its
2-minute claim expires, and each message has a dedupe key so it exists once.

## What is free and what is not

Checked October 2026. Plans change, so check each provider's pricing page before you rely on it.

| Piece | Free? | Limits that matter here |
|---|---|---|
| Render web service (free) | Yes | 512 MB RAM, shared CPU; **sleeps after 15 min without traffic** (about 1 min to wake up); 750 free instance-hours a month (10 days = 240 h); no shell; **outbound SMTP ports 25/465/587 are blocked** |
| Supabase (free) | Yes | 500 MB database; the project **pauses after 7 days with no activity**; the direct connection is IPv6-only, so use the **Session pooler** |
| Uptime ping (UptimeRobot / cron-job.org) | Yes | Keeps Render awake so emails go out promptly |
| Email: Resend | Free tier | About 100 emails a day / 3,000 a month; **you must verify a sending domain** by adding DNS records |
| Email: Brevo SMTP on port 2525 | Free tier | About 300 emails a day; verify a sender address; port 2525 is not on Render's blocked list (test it) |
| Organizer alert by email (`ORGANIZER_EMAIL`) | Free | Uses the same email provider |
| WhatsApp Cloud API / Twilio | **Not free** | Per-message charges and a business/payment setup; optional |
| Static UPI QR payments | Free | Payments go straight to the organiser's UPI; verified by hand in the admin |
| Razorpay | Per-transaction fee | Optional |

**Emails per booking:** about 4 (OTP, payment instructions, pass, plus one
organizer alert), so about 400–500 for 100 bookings. On a busy day that can pass
Resend's daily limit. Brevo's is higher. Messages that hit a provider limit
are retried and then shown as FAILED with a RETRY button. They are never lost.

**Storage:** each confirmed pass is about 1.9 MB (PNG ≈ 1.1 MB, PDF ≈ 0.55 MB,
receipt ≈ 0.27 MB), so 100 passes take about 190 MB of Supabase's 500 MB.

---

## 1. Create the Supabase project

1. <https://supabase.com> → **New project**. Name it `feral`. Region:
   **Southeast Asia (Singapore)**, the same region as the Render service below
   (Mumbai also works, with a little more delay).
2. Set a strong **database password** and store it in a password manager.
3. When the project is ready, click **Connect** (top bar) → **Session pooler**
   and copy the URI. It looks like this (copy yours exactly; the host may be
   `aws-0-…` or `aws-1-…`):

   ```
   postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
   ```

   - Use the **Session pooler on port 5432**, not the "Direct connection".
     The direct connection is IPv6-only and Render connects over IPv4.
   - If the password contains `@ : / ? # [ ] %` or spaces, URL-encode it
     (for example `@` → `%40`), or choose a password without them.
4. Turn off the Data API: Project Settings → **Data API** → disable it. This
   app never uses it. As a second safeguard, migration `003` turns on
   row-level security, with no policies, on every table, so nothing is reachable
   through the API even if it stays on.

You don't need to create tables. The server creates them on its first start.

## 2. Create the Render web service

1. <https://render.com> → **New → Blueprint** → connect the GitHub repository
   `flyingarts613-hash/feral`. Render reads `render.yaml`, which creates **one
   free web service** named `feral` on branch `claude/feral-halloween-website-12cikq`.
   (Or **New → Web Service** and enter the settings below by hand.)
2. Settings (already in `render.yaml`):

   | Setting | Value |
   |---|---|
   | Runtime | Node (version 22, from `NODE_VERSION=22` / `.node-version`) |
   | Plan | Free |
   | Build command | `npm ci --include=dev && npm run build` |
   | Start command | `npm start` |
   | Health check path | `/api/health` |
   | Auto-deploy | Off (deploy by hand while the event runs) |

   `--include=dev` matters. With `NODE_ENV=production`, plain `npm ci` skips
   Vite and the website can't be built.
3. Fill in the environment variables when Render asks (next section), then
   **Apply / Create**.

The `Dockerfile` also works (Render → Docker runtime), but the native Node
runtime builds faster and needs nothing else.

## 3. Environment variables

Enter these in Render → your service → **Environment**. Never commit them.

### Required

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (preset) |
| `NODE_VERSION` | `22` (preset) |
| `APP_URL` | `https://<your-service>.onrender.com` at first (later `https://www.getferal.in`, see §10) |
| `DATABASE_URL` | the Supabase **Session pooler** URI from §1 |
| `DATABASE_SSL` | `true` (preset) |
| `DATABASE_POOL_MAX` | `5` (preset; the Supabase free session pooler allows about 15 connections) |
| `APP_SECRET` | generated by Render (preset). **Keep it unchanged for the whole event.** Changing it signs everyone out and breaks emailed links |
| `TRUST_PROXY` | `true` (preset) |
| `EMAIL_PROVIDER` | `resend` or `smtp` (see §7) |
| `EMAIL_FROM` | for example `FERAL <tickets@getferal.in>` (must be a sender your provider has verified) |

`PORT` is set by Render automatically. The server listens on it, on all
interfaces (`0.0.0.0`).

### For the first admin (§6)

| `ADMIN_SETUP_TOKEN` | generated by Render (preset): 32+ random characters |

### Email (one of)

| Resend | `RESEND_API_KEY` (+ optional `RESEND_WEBHOOK_SECRET`) |
|---|---|
| Brevo SMTP | `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=2525`, `SMTP_SECURE=false`, `SMTP_USER`, `SMTP_PASS` (Brevo SMTP key) |

### Organizer alerts (one or both)

| Free, by email | `ORGANIZER_EMAIL` = one or more addresses, comma-separated |
|---|---|
| Phone (paid) | `NOTIFY_PROVIDER`, `ORGANIZER_PHONE` + the provider keys in `.env.example` |

If you use email only, leave `NOTIFY_PROVIDER` empty.

### Leave at defaults

`PAYMENT_MODE=static_upi` (preset). The payment QR is built in. Every other
variable in `.env.example` is optional.

## 4. Migrations

There is nothing to run by hand. `npm start` applies `server/migrations/*.sql`
in order on every start, inside one transaction holding a Postgres advisory
lock (`pg_advisory_xact_lock`). That means:

- a fresh Supabase database is fully set up on the first start;
- if two instances start at once (Render briefly runs old and new during a
  deploy), one waits and the other applies each migration once (tested);
- migrations already applied are skipped (`schema_migrations` table).

You should see in the Render logs:
`migration applied: 001_init.sql`, `002_pass_png.sql`, `003_row_level_security.sql`.

## 5. Check the deployment

- `https://<your-service>.onrender.com/api/health` → `{"ok":true}` (it also
  checks the database). Render uses this as the health check.
- `https://<your-service>.onrender.com/` → the site.
- Render logs: no `Invalid configuration` lines. Warnings list anything not yet configured.

### Keep it awake (recommended)

On the free plan Render stops the service after 15 minutes without traffic.
While it's asleep the worker isn't running, so a retry waits until the next
visit, and the first visitor waits about a minute. Create a free monitor at
<https://uptimerobot.com> (or <https://cron-job.org>): an HTTP(S) check of
`https://<your-service>.onrender.com/api/health` every **5 minutes**. Running
24 hours a day for 10 days uses about 240 of the 750 free hours. It also keeps
Supabase active, so it won't pause.

## 6. Create the first admin (owner)

**Recommended — the primary admin from environment variables.** In Render →
Environment add:

| Variable | Value |
|---|---|
| `ADMIN_LOGIN_ID` | the login ID (letters, digits, `@ . _ + -`; e.g. a phone number or email) |
| `ADMIN_PASSWORD_HASH` | output of `npm run admin:hash` on your computer (type the password when asked) |
| — or `ADMIN_PASSWORD` | the password itself (12+ characters), if you can't run Node locally |

Mark them as secret. Save → redeploy. On start the server creates (or updates)
that **owner** account; the logs show `primary admin from environment: created`.
Only the scrypt hash is stored in the database. Change the password later by
changing the variable — the old one stops working and that admin is signed out
everywhere. Removing the variables disables the account. Sign in at
`/admin/login` (or `/admin/`) with the login ID and password. After 5 wrong
passwords for the same login ID in 15 minutes, that ID is locked for 15 minutes
(`ADMIN_LOGIN_MAX_FAILURES`), on top of the per-IP limit.

**Alternative — one-time setup form** (when no admin exists at all):

1. Open `https://<your-service>.onrender.com/admin/`. While **no admin exists**
   and `ADMIN_SETUP_TOKEN` is set, it shows **FIRST-TIME SETUP**.
2. In Render → Environment, reveal `ADMIN_SETUP_TOKEN`, copy it into the form,
   then enter your name, email and a password of 12+ characters.
3. After **CREATE OWNER** the setup closes for good (the server refuses it
   once any admin exists, even with the token). Sign in.
4. Optional: delete `ADMIN_SETUP_TOKEN` from Render afterwards.

The setup is rate-limited, compares the token in constant time, and records
every attempt in the audit log.

**Alternative (from your own computer, Node 22):**

```bash
git clone https://github.com/flyingarts613-hash/feral && cd feral && npm ci
DATABASE_URL='<session pooler URI>' DATABASE_SSL=true APP_SECRET='<the same APP_SECRET as Render>' \
  npm run admin:create -- --email you@example.com --name "Your Name" --role owner
```

Use this to add more admins at any time, with roles `approver` (confirm and
reject payments, check people in) or `viewer`. Running it again for an
existing email resets that admin's password.

## 7. Email and organizer alerts

### Email (OTP codes, payment instructions, passes, rejections)

Render's free plan **blocks SMTP on ports 25, 465 and 587**, so Gmail or
Outlook SMTP won't work there. Choose one:

**A. Resend (HTTPS API)**
1. <https://resend.com> → Domains → add `getferal.in` (or a subdomain such as
   `mail.getferal.in`) and add the DNS records it lists at your domain
   registrar. These are extra records for email; they don't touch the website's records.
2. Wait for **Verified**, then create an API key.
3. Render: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…`, `EMAIL_FROM=FERAL <tickets@getferal.in>`.
4. Optional delivery tracking: Resend → Webhooks → `https://<service>/api/webhooks/resend`
   (events `email.delivered`, `email.bounced`, `email.complained`) → `RESEND_WEBHOOK_SECRET`.

Without a verified domain, Resend only delivers to your own account address,
which isn't enough for customers.

**B. Brevo SMTP on port 2525 (no DNS changes needed to start)**
1. <https://www.brevo.com> → verify a sender email address (Senders & IP).
2. SMTP & API → SMTP → note the login and create an SMTP key.
3. Render: `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp-relay.brevo.com`,
   `SMTP_PORT=2525`, `SMTP_SECURE=false`, `SMTP_USER=<login>`, `SMTP_PASS=<SMTP key>`,
   `EMAIL_FROM=FERAL <the verified sender>`.
4. Send yourself a test (§9). If it times out, the port is blocked; switch to Resend.
   Mail from a free-mail sender without your own domain is more likely to land in spam.

### Organizer alerts ("payment approval required")

- **Free:** `ORGANIZER_EMAIL=you@example.com` (comma-separate several). It is the
  same message as the phone alert, with no links that approve anything and no tokens.
- **Phone (paid):** WhatsApp Cloud API or Twilio. Templates and variables are in
  `docs/BOOKINGS.md` → "Organizer phone alerts".
- Either way, pending payments always appear in Admin → **PAYMENT APPROVALS**,
  with a live count.

### Payment mode

Keep **static UPI QR** (`PAYMENT_MODE=static_upi`). The customer pays the
organiser's UPI directly and submits the UPI reference. You check your bank or
UPI app, then **CONFIRM** or **REJECT** in the admin. Nothing is ever marked
paid without that. A reference can't be reused across bookings.
Razorpay is optional (`PAYMENT_MODE=razorpay` + keys + webhook; see
`docs/BOOKINGS.md`). It charges fees per transaction.

## 8. The payment QR

The organiser's Kotak811 QR (KHUSHAL AGARWAL, `9818241332@kotakbank`) is
included at `server/assets/payment-qr.png`. It is copied into the database on
the first start, so there's nothing to upload. To replace it, go to Admin →
**SETTINGS → PAYMENT QR → REPLACE QR IMAGE** (owner role). The UPI ID and payee
name shown under the QR are in the same card.

## 9. Test a complete booking (before announcing)

1. Admin → **SETTINGS**: check prices (₹1,999 / ₹1,699 / ₹3,499), the event
   details and the QR. Check **OVERVIEW** for warnings.
2. In a private window, open the site → **GET YOUR PASS** → BUY PASS → use your
   own email → enter the OTP from the email.
3. Optional: try a referral code (for example `ETHAN`) and confirm the price changes.
4. Pay a small real amount only if you are willing to, or use a made-up
   reference to test the flow and then **REJECT** it.
5. Submit the UPI reference. You should get the organizer alert (email/phone).
6. Admin → **PAYMENT APPROVALS** → open it → tick "I have checked my records" →
   **CONFIRM**. Pass generation can take several seconds on the free CPU; wait for the result.
7. The customer page changes to **PASS ISSUED** once the email has gone out.
   Check the inbox for "Your Official FERAL 2026 Pass" with the PNG, PDF and receipt.
8. Admin → **CHECK-IN** → type the pass ID → **CHECK IN**. A second try shows ALREADY CHECKED IN.
   An owner can reset it in the same screen.
9. Admin → **NOTIFICATIONS**: everything should be SENT.

## 10. Custom domain (www.getferal.in)

You choose between two set-ups; this repository makes no DNS changes.

**Option 1: keep the website where it is now (no DNS change)**
The current host keeps serving www.getferal.in. Only the booking server runs on Render.
1. On the current website host, set the build variable
   `VITE_API_URL=https://<your-service>.onrender.com` and redeploy the site.
2. Render: `APP_URL=https://www.getferal.in`,
   `PUBLIC_API_URL=https://<your-service>.onrender.com`,
   `CORS_ORIGINS=https://www.getferal.in,https://getferal.in`.
3. The admin is at `https://<your-service>.onrender.com/admin/`.
   Email links open the site, while pass downloads and the QR load from Render.

**Option 2: serve everything from Render**
1. Render → service → **Settings → Custom Domains** → add `www.getferal.in`
   (and `getferal.in`). Render shows the DNS records to create.
2. You (or whoever manages the domain) change those records at the registrar.
   This moves the website to Render.
3. When Render shows the certificate as issued, set `APP_URL=https://www.getferal.in`
   and redeploy. The admin is at `https://www.getferal.in/admin/`.

If the booking server can't be reached, the site's pass sheet falls back by
itself to the old registration form + WhatsApp flow, never to a fake booking.

## 11. Export everything before the 10 days end

Do this after the event, and keep copies:

1. **Bookings and payments (CSV):** Admin → **ALL BOOKINGS** → **EXPORT CSV**
   (any signed-in admin). It contains every booking, price, referral, payment status
   and reference, pass ID and check-in time. The export is recorded in the audit log.
2. **Full database backup (includes passes, receipts, screenshots and the audit log)**,
   from your computer with PostgreSQL 16+ client tools:

   ```bash
   pg_dump '<session pooler URI>' --no-owner --no-privileges -Fc -f feral-2026-backup.dump
   # check it:
   pg_restore --list feral-2026-backup.dump | head
   ```
3. Optional: Supabase → Table editor → export `bookings`, `payments`, `passes`
   and `audit_logs` as CSV.

## 12. Shut down without losing records

1. Finish §11 first and confirm the files open.
2. Render → service → **Suspend** (or Delete). Website traffic then needs the
   site to be served elsewhere (Option 1 already is; with Option 2, point the
   domain back to your previous host).
3. Remove the uptime monitor.
4. Supabase: keep the project. It pauses after a week without activity and the
   data stays. Or **delete** it once you're sure the backup is complete. A
   restore later: create a new database and run
   `pg_restore --no-owner -d '<new database URI>' feral-2026-backup.dump`.
5. Revoke API keys you no longer need (Resend/Brevo, Meta/Twilio).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Deploy fails at `vite: not found` | Build command must be `npm ci --include=dev && npm run build` |
| `Invalid configuration` in logs | The message lists the missing or invalid variables |
| `ENETUNREACH` / `getaddrinfo` to `db.<ref>.supabase.co` | You used the direct connection; use the Session pooler URI |
| `password authentication failed` | Pooler username must be `postgres.<project-ref>`; URL-encode special characters in the password |
| Emails time out | Render free blocks SMTP 25/465/587; use Resend or Brevo on 2525 |
| Emails FAILED after retries | Admin → NOTIFICATIONS shows the provider error; fix, then **RETRY** |
| First page load takes a minute | The service was asleep; add the uptime monitor (§5) |
| `remaining connection slots` | Lower `DATABASE_POOL_MAX` |
