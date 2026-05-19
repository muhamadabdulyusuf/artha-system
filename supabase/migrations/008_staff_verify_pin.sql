-- Verifikasi PIN staf: TRIM mengatasi perbandingan gagal pada kolom CHAR(6) (blank-padding).

CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_pin text)
RETURNS TABLE (
  id uuid,
  name text,
  role staff_role,
  department department
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.role, s.department
  FROM public.staff s
  WHERE trim(s.pin_code) = trim(p_pin)
    AND s.is_active = true;
$$;

COMMENT ON FUNCTION public.verify_staff_pin(text) IS
  'Login PIN staf; trim(pin_code) agar CHAR(6) cocok dengan input 6 digit dari klien.';

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text) TO authenticated;
