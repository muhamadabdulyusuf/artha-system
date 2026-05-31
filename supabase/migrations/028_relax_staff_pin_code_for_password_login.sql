-- Password login no longer needs the legacy pin_code to be exactly 6 numeric digits.
-- It is still used as the initial password seed when password_hash is empty.

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_pin_code_numeric;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_pin_code_not_blank CHECK (LENGTH(BTRIM(pin_code)) >= 4);
