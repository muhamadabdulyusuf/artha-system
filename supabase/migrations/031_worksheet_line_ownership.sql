-- Track who entered each worksheet operational line.

ALTER TABLE worksheet_out_line
  ADD COLUMN IF NOT EXISTS staff_id UUID;

ALTER TABLE worksheet_opname_line
  ADD COLUMN IF NOT EXISTS staff_id UUID;

ALTER TABLE worksheet_premix_line
  ADD COLUMN IF NOT EXISTS staff_id UUID;

ALTER TABLE worksheet_menu_issue_line
  ADD COLUMN IF NOT EXISTS staff_id UUID;

ALTER TABLE worksheet_out_line
  DROP CONSTRAINT IF EXISTS worksheet_out_line_staff_id_fkey,
  ADD CONSTRAINT worksheet_out_line_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE RESTRICT;

ALTER TABLE worksheet_opname_line
  DROP CONSTRAINT IF EXISTS worksheet_opname_line_staff_id_fkey,
  ADD CONSTRAINT worksheet_opname_line_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE RESTRICT;

ALTER TABLE worksheet_premix_line
  DROP CONSTRAINT IF EXISTS worksheet_premix_line_staff_id_fkey,
  ADD CONSTRAINT worksheet_premix_line_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE RESTRICT;

ALTER TABLE worksheet_menu_issue_line
  DROP CONSTRAINT IF EXISTS worksheet_menu_issue_line_staff_id_fkey,
  ADD CONSTRAINT worksheet_menu_issue_line_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS worksheet_out_line_staff_idx
  ON worksheet_out_line (staff_id)
  WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS worksheet_opname_line_staff_idx
  ON worksheet_opname_line (staff_id)
  WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS worksheet_premix_line_staff_idx
  ON worksheet_premix_line (staff_id)
  WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS worksheet_menu_issue_line_staff_idx
  ON worksheet_menu_issue_line (staff_id)
  WHERE staff_id IS NOT NULL;

COMMENT ON COLUMN worksheet_out_line.staff_id IS
  'Staff who owns this out stock line. Other staff should not edit it from worksheet UI.';

COMMENT ON COLUMN worksheet_opname_line.staff_id IS
  'Staff who owns this opname line. Other staff should not edit it from worksheet UI.';

COMMENT ON COLUMN worksheet_premix_line.staff_id IS
  'Staff who owns this premix draft line. Other staff should not edit it from worksheet UI.';

COMMENT ON COLUMN worksheet_menu_issue_line.staff_id IS
  'Staff who owns this remake/complaint line. Other staff should not edit it from worksheet UI.';
