-- Add configurable tax percentage to service revenue setting.

ALTER TABLE service_charge_setting
  ADD COLUMN IF NOT EXISTS tax_percent numeric(5, 2) NOT NULL DEFAULT 0
  CHECK (tax_percent >= 0 AND tax_percent <= 100);

COMMENT ON COLUMN service_charge_setting.tax_percent IS
  'Tax percentage applied to subtotal after service charge.';
