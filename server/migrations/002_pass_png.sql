-- Pass artwork is also stored as a PNG (attached to the pass email next to the PDF).
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_kind_check;
ALTER TABLE files ADD CONSTRAINT files_kind_check
  CHECK (kind IN ('payment_screenshot', 'pass_pdf', 'pass_png', 'receipt_pdf', 'payment_qr', 'pass_template'));
ALTER TABLE passes ADD COLUMN IF NOT EXISTS png_file_id bigint REFERENCES files(id);
