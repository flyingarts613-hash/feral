-- FERAL bookings, payments and pass delivery.
-- Money is stored as integer paise. Statuses are constrained in the database so
-- no code path can write an unknown state.

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

CREATE TABLE admins (
  id             serial PRIMARY KEY,
  email          text NOT NULL UNIQUE CHECK (email = lower(email)),
  name           text NOT NULL,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('owner', 'approver', 'viewer')),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

CREATE TABLE admin_sessions (
  id          bigserial PRIMARY KEY,
  admin_id    int NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  csrf_token  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  ip          text,
  user_agent  text
);
CREATE INDEX admin_sessions_expires ON admin_sessions (expires_at);

-- Uploaded and generated documents (payment screenshots, pass + receipt PDFs,
-- the payment QR). Kept in the database so they persist with it and are only
-- reachable through authorised endpoints.
CREATE TABLE files (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('payment_screenshot', 'pass_pdf', 'receipt_pdf', 'payment_qr', 'pass_template')),
  mime        text NOT NULL,
  bytes       bytea,               -- NULL once purged by the retention job
  size        int NOT NULL,
  sha256      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  purged_at   timestamptz
);

CREATE TABLE customers (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL UNIQUE CHECK (email = lower(email)),
  name        text NOT NULL,
  phone       text NOT NULL,
  age         int NOT NULL,
  gender      text NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE referral_codes (
  id                  serial PRIMARY KEY,
  code                text NOT NULL UNIQUE CHECK (code = upper(code) AND code ~ '^[A-Z0-9_-]{2,32}$'),
  -- fixed_price: the special prices below replace the original price (ETHAN);
  --   a category without a special price falls back to the flat discount
--   (discount_paise, or the global referral discount when that is NULL).
  -- flat_discount: discount_paise (or the global referral discount) off the original price.
  kind                text NOT NULL CHECK (kind IN ('fixed_price', 'flat_discount')),
  discount_paise      int CHECK (discount_paise >= 0),
  male_price_paise    int CHECK (male_price_paise >= 0),
  female_price_paise  int CHECK (female_price_paise >= 0),
  couple_price_paise  int CHECK (couple_price_paise >= 0),
  max_uses            int CHECK (max_uses > 0),
  expires_at          timestamptz,
  active              boolean NOT NULL DEFAULT true,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text
);

CREATE TABLE bookings (
  id                  bigserial PRIMARY KEY,
  booking_code        text NOT NULL UNIQUE,
  customer_id         bigint NOT NULL REFERENCES customers(id),
  holder_name         text NOT NULL,
  email               text NOT NULL,
  phone               text NOT NULL,
  age                 int NOT NULL,
  gender              text NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
  category            text NOT NULL CHECK (category IN ('male', 'female', 'couple')),
  referral_code_id    int REFERENCES referral_codes(id),
  referral_code       text,
  original_paise      int NOT NULL CHECK (original_paise >= 0),
  discount_paise      int NOT NULL CHECK (discount_paise >= 0),
  final_paise         int NOT NULL CHECK (final_paise >= 0),
  status              text NOT NULL CHECK (status IN (
                        'EMAIL_VERIFICATION_PENDING', 'AWAITING_PAYMENT', 'PAYMENT_PENDING_VERIFICATION',
                        'PAID', 'PASS_ISSUED', 'PAYMENT_REJECTED', 'CANCELLED')),
  email_verified_at   timestamptz,
  access_token_hash   text NOT NULL UNIQUE,
  idempotency_key     text UNIQUE,
  created_ip          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (final_paise = original_paise - discount_paise)
);
CREATE INDEX bookings_status ON bookings (status);
CREATE INDEX bookings_email ON bookings (email);
CREATE INDEX bookings_phone ON bookings (phone);
CREATE INDEX bookings_created ON bookings (created_at DESC);
CREATE INDEX bookings_referral ON bookings (referral_code_id);

CREATE TABLE otp_codes (
  id            bigserial PRIMARY KEY,
  booking_id    bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  otp_hash      text NOT NULL,
  expires_at    timestamptz NOT NULL,
  attempts      int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL,
  status        text NOT NULL CHECK (status IN ('ACTIVE', 'VERIFIED', 'SUPERSEDED', 'LOCKED', 'SEND_FAILED')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  verified_at   timestamptz
);
CREATE INDEX otp_codes_booking ON otp_codes (booking_id, created_at DESC);
-- at most one live code per booking
CREATE UNIQUE INDEX otp_codes_one_active ON otp_codes (booking_id) WHERE status = 'ACTIVE';

CREATE TABLE payments (
  id                     bigserial PRIMARY KEY,
  booking_id             bigint NOT NULL REFERENCES bookings(id),
  method                 text NOT NULL CHECK (method IN ('upi_static', 'razorpay')),
  transaction_reference  text,
  amount_paise           int NOT NULL CHECK (amount_paise >= 0),
  status                 text NOT NULL CHECK (status IN ('CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  screenshot_file_id     bigint REFERENCES files(id),
  gateway_order_id       text UNIQUE,
  gateway_payment_id     text UNIQUE,
  gateway_verified       boolean NOT NULL DEFAULT false,
  reviewed_by            int REFERENCES admins(id),
  reviewed_by_label      text,
  submitted_at           timestamptz,
  approved_at            timestamptz,
  rejected_at            timestamptz,
  rejection_reason       text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'APPROVED' OR approved_at IS NOT NULL),
  CHECK (status <> 'REJECTED' OR rejected_at IS NOT NULL)
);
CREATE INDEX payments_booking ON payments (booking_id);
CREATE INDEX payments_status ON payments (status);
-- one live (submitted or approved) payment per booking: blocks double submission and double approval
CREATE UNIQUE INDEX payments_one_live ON payments (booking_id) WHERE status IN ('SUBMITTED', 'APPROVED');
-- the same UPI reference cannot be claimed by two live payments
CREATE UNIQUE INDEX payments_unique_reference ON payments (lower(transaction_reference))
  WHERE status IN ('SUBMITTED', 'APPROVED') AND transaction_reference IS NOT NULL;

CREATE TABLE passes (
  id                   bigserial PRIMARY KEY,
  booking_id           bigint NOT NULL UNIQUE REFERENCES bookings(id),   -- one pass per booking, ever
  payment_id           bigint NOT NULL REFERENCES payments(id),
  pass_code            text NOT NULL UNIQUE,
  qr_token_hash        text NOT NULL UNIQUE,   -- lookup when the QR is scanned
  qr_token_enc         text NOT NULL,          -- AES-GCM, so the QR can be re-rendered for email retries
  pdf_file_id          bigint NOT NULL REFERENCES files(id),
  receipt_file_id      bigint NOT NULL REFERENCES files(id),
  status               text NOT NULL CHECK (status IN ('GENERATED', 'ISSUED', 'CANCELLED')),
  generated_at         timestamptz NOT NULL DEFAULT now(),
  issued_at            timestamptz,
  redeemed_at          timestamptz,
  redeemed_by          text,
  cancelled_at         timestamptz
);

-- Every outgoing email / SMS / WhatsApp. Doubles as the retry queue.
-- dedupe_key makes each logical message exist once, so retries never duplicate it.
CREATE TABLE notifications (
  id                   bigserial PRIMARY KEY,
  booking_id           bigint REFERENCES bookings(id) ON DELETE CASCADE,
  channel              text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  type                 text NOT NULL,
  recipient            text NOT NULL,
  dedupe_key           text NOT NULL UNIQUE,
  payload              jsonb NOT NULL DEFAULT '{}',
  status               text NOT NULL CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED')),
  attempts             int NOT NULL DEFAULT 0,
  max_attempts         int NOT NULL DEFAULT 6,
  next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  locked_until         timestamptz,
  provider             text,
  provider_message_id  text,
  provider_status      text,
  last_error           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  delivered_at         timestamptz
);
CREATE INDEX notifications_due ON notifications (next_attempt_at) WHERE status IN ('QUEUED', 'SENDING');
CREATE INDEX notifications_booking ON notifications (booking_id);
CREATE INDEX notifications_provider_id ON notifications (provider, provider_message_id);

CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  admin_id     int REFERENCES admins(id),
  actor        text NOT NULL,
  action       text NOT NULL,
  booking_id   bigint REFERENCES bookings(id) ON DELETE SET NULL,
  booking_code text,
  from_status  text,
  to_status    text,
  details      jsonb NOT NULL DEFAULT '{}',
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_booking ON audit_logs (booking_id);
CREATE INDEX audit_logs_created ON audit_logs (created_at DESC);

-- Single-purpose links sent by email (payment page, pass download). Minted when
-- the email is rendered; only the hash is stored.
CREATE TABLE booking_links (
  id          bigserial PRIMARY KEY,
  booking_id  bigint NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('booking', 'pass_download')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_links_booking ON booking_links (booking_id);

CREATE TABLE webhook_events (
  id           bigserial PRIMARY KEY,
  provider     text NOT NULL,
  event_id     text NOT NULL,
  event_type   text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

-- The special code from the brief: fixed ₹1,500 (male/stag) and ₹1,000 (girls);
-- the couple pass gets the normal flat discount until an admin sets a special price.
INSERT INTO referral_codes (code, kind, discount_paise, male_price_paise, female_price_paise, couple_price_paise, note, created_by)
VALUES ('ETHAN', 'fixed_price', NULL, 150000, 100000, NULL, 'Special referral code', 'migration');
