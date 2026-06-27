-- Separate worksheet input owner from loss/service deduction responsibility.

ALTER TABLE worksheet_out_line
  ADD COLUMN IF NOT EXISTS loss_responsibility_scope text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS responsible_staff_id uuid REFERENCES staff (id) ON DELETE SET NULL;

ALTER TABLE worksheet_out_line
  DROP CONSTRAINT IF EXISTS worksheet_out_line_loss_responsibility_scope_check;

ALTER TABLE worksheet_out_line
  ADD CONSTRAINT worksheet_out_line_loss_responsibility_scope_check CHECK (
    loss_responsibility_scope IN ('general', 'unknown', 'staff')
  );

ALTER TABLE worksheet_out_line
  DROP CONSTRAINT IF EXISTS worksheet_out_line_responsible_staff_required_check;

ALTER TABLE worksheet_out_line
  ADD CONSTRAINT worksheet_out_line_responsible_staff_required_check CHECK (
    (loss_responsibility_scope = 'staff' AND responsible_staff_id IS NOT NULL)
    OR
    (loss_responsibility_scope <> 'staff' AND responsible_staff_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS worksheet_out_line_responsible_staff_idx
  ON worksheet_out_line (responsible_staff_id)
  WHERE responsible_staff_id IS NOT NULL;

COMMENT ON COLUMN worksheet_out_line.staff_id IS
  'Staff that inputs/owns the worksheet line; not necessarily responsible for service deduction.';

COMMENT ON COLUMN worksheet_out_line.loss_responsibility_scope IS
  'Service deduction target for the loss: general team, unknown team, or specific staff.';

COMMENT ON COLUMN worksheet_out_line.responsible_staff_id IS
  'Specific staff whose service is deducted when loss_responsibility_scope=staff.';
