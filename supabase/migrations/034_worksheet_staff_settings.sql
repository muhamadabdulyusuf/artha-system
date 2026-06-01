-- Admin-controlled switches for staff worksheet rooms.

CREATE TABLE IF NOT EXISTS worksheet_staff_setting (
  department department_type NOT NULL,
  tab_id text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worksheet_staff_setting_pk PRIMARY KEY (department, tab_id),
  CONSTRAINT worksheet_staff_setting_tab_check CHECK (
    tab_id IN ('receive', 'outstock', 'opname', 'premix', 'issue', 'sold')
  )
);

DROP TRIGGER IF EXISTS worksheet_staff_setting_set_updated_at ON worksheet_staff_setting;

CREATE TRIGGER worksheet_staff_setting_set_updated_at
  BEFORE UPDATE ON worksheet_staff_setting
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO worksheet_staff_setting (department, tab_id, is_enabled)
SELECT department, tab_id, true
FROM (
  VALUES ('bar'::department_type), ('kitchen'::department_type)
) AS departments(department)
CROSS JOIN (
  VALUES
    ('receive'),
    ('outstock'),
    ('opname'),
    ('premix'),
    ('issue'),
    ('sold')
) AS tabs(tab_id)
ON CONFLICT (department, tab_id) DO NOTHING;

COMMENT ON TABLE worksheet_staff_setting IS
  'Admin switches that control which worksheet rooms are visible to staff by department.';
