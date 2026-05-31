-- Staff login hardening: move from PIN-only login to name + hashed password.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

UPDATE staff
SET password_hash = extensions.crypt(BTRIM(pin_code), extensions.gen_salt('bf'))
WHERE password_hash IS NULL;

ALTER TABLE staff
  ALTER COLUMN password_hash SET NOT NULL;

CREATE OR REPLACE FUNCTION public.list_active_login_staff()
RETURNS TABLE (
  id uuid,
  name text,
  role staff_role,
  department department_type
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.role, s.department
  FROM public.staff s
  WHERE s.is_active = true
  ORDER BY s.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.verify_staff_password(p_name text, p_password text)
RETURNS TABLE (
  id uuid,
  name text,
  role staff_role,
  department department_type
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.role, s.department
  FROM public.staff s
  WHERE
    LOWER(BTRIM(s.name)) = LOWER(BTRIM(p_name))
    AND s.password_hash = extensions.crypt(p_password, s.password_hash)
    AND s.is_active = true
  LIMIT 1;
$$;

COMMENT ON COLUMN staff.password_hash IS
  'Hashed staff login password. Initial migration hashes the old 6-digit pin_code as the first password.';

COMMENT ON FUNCTION public.list_active_login_staff() IS
  'Returns active staff names for name + password login.';

COMMENT ON FUNCTION public.verify_staff_password(text, text) IS
  'Verifies staff login using selected staff name and hashed password.';

GRANT EXECUTE ON FUNCTION public.list_active_login_staff() TO anon;
GRANT EXECUTE ON FUNCTION public.list_active_login_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_password(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_password(text, text) TO authenticated;
