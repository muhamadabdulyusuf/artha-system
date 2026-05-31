-- Auto-fill staff.password_hash for rows inserted from Supabase table editor.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_staff_password_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.password_hash IS NULL OR BTRIM(NEW.password_hash) = '' THEN
    NEW.password_hash := extensions.crypt(BTRIM(NEW.pin_code), extensions.gen_salt('bf'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_set_password_hash ON public.staff;

CREATE TRIGGER staff_set_password_hash
  BEFORE INSERT OR UPDATE OF pin_code, password_hash ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.set_staff_password_hash();

UPDATE public.staff
SET password_hash = extensions.crypt(BTRIM(pin_code), extensions.gen_salt('bf'))
WHERE password_hash IS NULL OR BTRIM(password_hash) = '';

ALTER TABLE public.staff
  ALTER COLUMN password_hash SET NOT NULL;

COMMENT ON FUNCTION public.set_staff_password_hash() IS
  'Auto-hashes pin_code into password_hash when staff rows are inserted/updated without an explicit password hash.';
