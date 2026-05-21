-- Verifikasi PIN staf prototype.
-- Saat ini staff.pin_code masih dibatasi 6 digit, jadi hash PIN belum dipakai di schema ini.

CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_pin text)
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
    BTRIM(s.pin_code) = BTRIM(p_pin)
    AND s.is_active = true;
$$;

COMMENT ON FUNCTION public.verify_staff_pin(text) IS
  'Login PIN staf prototype; production hardening harus migrasi ke pin_hash/JWT.';

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text) TO authenticated;
