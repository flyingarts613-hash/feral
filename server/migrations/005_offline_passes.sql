-- Offline pass issuance: bookings created by an admin for payments received in
-- person (cash / UPI / other), with one or more passes per booking.
-- Additive only; every existing online booking, payment and pass stays as it is.

-- bookings: where they came from, how many passes, admin notes, price override
ALTER TABLE bookings ADD COLUMN source text NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'offline'));
ALTER TABLE bookings ADD COLUMN quantity int NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10);
ALTER TABLE bookings ADD COLUMN notes text;
ALTER TABLE bookings ADD COLUMN price_override boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN price_override_reason text;
ALTER TABLE bookings ADD COLUMN issued_by text;
-- the offline form does not collect age / gender; online bookings still must have them
ALTER TABLE bookings ALTER COLUMN age DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN gender DROP NOT NULL;
ALTER TABLE bookings ADD CONSTRAINT bookings_online_person CHECK (source = 'offline' OR (age IS NOT NULL AND gender IS NOT NULL));
ALTER TABLE bookings ADD CONSTRAINT bookings_online_single CHECK (source = 'offline' OR quantity = 1);
ALTER TABLE customers ALTER COLUMN age DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN gender DROP NOT NULL;
CREATE INDEX bookings_source ON bookings (source, created_at DESC);

-- payments: offline methods
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('upi_static', 'razorpay', 'offline_cash', 'offline_upi', 'offline_other'));

-- passes: several per booking (seq 1..quantity); online bookings keep exactly one (seq 1)
ALTER TABLE passes DROP CONSTRAINT IF EXISTS passes_booking_id_key;
ALTER TABLE passes ADD COLUMN seq int NOT NULL DEFAULT 1 CHECK (seq BETWEEN 1 AND 10);
ALTER TABLE passes ADD COLUMN holder_name text; -- attendee on this pass; NULL = the booking holder
ALTER TABLE passes ADD CONSTRAINT passes_booking_seq_key UNIQUE (booking_id, seq);

