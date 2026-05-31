-- Preserve worksheet audit history: staff who submitted/locked a worksheet should be deactivated, not deleted.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name
    INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
   AND tc.table_name = kcu.table_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'worksheet_session'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'submitted_by_staff_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.worksheet_session DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.worksheet_session
    ADD CONSTRAINT worksheet_session_submitted_by_staff_id_fkey
    FOREIGN KEY (submitted_by_staff_id)
    REFERENCES public.staff (id)
    ON DELETE RESTRICT;
END $$;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name
    INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
   AND tc.table_name = kcu.table_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'worksheet_session'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'locked_by_staff_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.worksheet_session DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.worksheet_session
    ADD CONSTRAINT worksheet_session_locked_by_staff_id_fkey
    FOREIGN KEY (locked_by_staff_id)
    REFERENCES public.staff (id)
    ON DELETE RESTRICT;
END $$;

COMMENT ON CONSTRAINT worksheet_session_submitted_by_staff_id_fkey ON public.worksheet_session IS
  'Restricts deletion of staff referenced by submitted worksheet sessions; use staff.is_active=false instead.';

COMMENT ON CONSTRAINT worksheet_session_locked_by_staff_id_fkey ON public.worksheet_session IS
  'Restricts deletion of staff referenced by locked worksheet sessions; use staff.is_active=false instead.';
