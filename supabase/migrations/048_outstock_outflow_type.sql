-- Mark whether an out-stock line is operational usage or spoil/loss.

ALTER TABLE worksheet_out_line
  ADD COLUMN IF NOT EXISTS outflow_type text NOT NULL DEFAULT 'operational';

-- Keep explicit responsibility rows from the previous migration as spoil/loss.
UPDATE worksheet_out_line
SET outflow_type = 'spoil'
WHERE loss_responsibility_scope IN ('staff', 'general')
  OR responsible_staff_id IS NOT NULL;

ALTER TABLE worksheet_out_line
  DROP CONSTRAINT IF EXISTS worksheet_out_line_outflow_type_check;

ALTER TABLE worksheet_out_line
  ADD CONSTRAINT worksheet_out_line_outflow_type_check CHECK (
    outflow_type IN ('operational', 'spoil')
  );

ALTER TABLE worksheet_out_line
  DROP CONSTRAINT IF EXISTS worksheet_out_line_operational_responsibility_check;

ALTER TABLE worksheet_out_line
  ADD CONSTRAINT worksheet_out_line_operational_responsibility_check CHECK (
    outflow_type = 'spoil'
    OR
    (
      outflow_type = 'operational'
      AND loss_responsibility_scope = 'unknown'
      AND responsible_staff_id IS NULL
    )
  );

COMMENT ON COLUMN worksheet_out_line.outflow_type IS
  'operational = legitimate usage, spoil = loss that can deduct service.';
