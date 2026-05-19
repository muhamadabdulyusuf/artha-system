-- Role penonton (read-only) untuk Artha System

DO $$
BEGIN
  ALTER TYPE staff_role ADD VALUE 'viewer';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_department_role_check;

ALTER TABLE staff ADD CONSTRAINT staff_department_role_check CHECK (
  (role IN ('admin', 'op_manager', 'viewer') AND department IS NULL)
  OR (role = 'bar_staff' AND department = 'bar')
  OR (role = 'kitchen_staff' AND department = 'kitchen')
);
