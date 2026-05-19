-- =============================================================================
-- Artha System — DEV STAFF & PIN (testing login)
-- Jalankan SEKALI di Supabase → SQL Editor
-- =============================================================================

-- Pastikan anon bisa baca staff untuk PIN gate (jika belum ada policy)
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_staff_pin_login" ON staff;
CREATE POLICY "anon_select_staff_pin_login"
  ON staff FOR SELECT
  TO anon, authenticated
  USING (true);

-- Hapus seed lama (aman di-run ulang)
DELETE FROM staff
WHERE pin_code IN ('100001', '100002', '200001', '300001', '400001');

INSERT INTO staff (name, pin_code, role, department) VALUES
  ('Admin Bos',     '100001', 'admin',          NULL),
  ('Ops Manager',   '100002', 'op_manager',     NULL),
  ('Staff Bar',     '200001', 'bar_staff',      'bar'),
  ('Staff Kitchen', '300001', 'kitchen_staff',  'kitchen'),
  ('Viewer Demo',   '400001', 'viewer',         NULL);
