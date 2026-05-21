-- Role penonton (read-only) untuk Artha System.
-- staff_role.viewer is defined in 001_initial_schema.sql for clean rebuild safety.

ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_department_role_check;

ALTER TABLE staff ADD CONSTRAINT staff_department_role_check CHECK (
  (role IN ('admin', 'op_manager', 'viewer') AND department IS NULL)
  OR (role = 'bar_staff' AND department = 'bar')
  OR (role = 'kitchen_staff' AND department = 'kitchen')
);
