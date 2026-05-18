-- Nomor WhatsApp supplier untuk redirect PO via wa.me

ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS phone_number TEXT NOT NULL DEFAULT '62';

COMMENT ON COLUMN supplier.phone_number IS 'Nomor WhatsApp supplier (62xxxxxxxxxx); default 62 = belum dikonfigurasi.';
