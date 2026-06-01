-- Allow every staff member to own their own worksheet line for the same item.

ALTER TABLE worksheet_out_line
  DROP CONSTRAINT IF EXISTS worksheet_out_line_session_ingredient_unique;

ALTER TABLE worksheet_out_line
  DROP CONSTRAINT IF EXISTS worksheet_out_line_session_ingredient_staff_unique;

ALTER TABLE worksheet_out_line
  ADD CONSTRAINT worksheet_out_line_session_ingredient_staff_unique
  UNIQUE (session_id, ingredient_id, staff_id);

ALTER TABLE worksheet_opname_line
  DROP CONSTRAINT IF EXISTS worksheet_opname_line_session_ingredient_unique;

ALTER TABLE worksheet_opname_line
  DROP CONSTRAINT IF EXISTS worksheet_opname_line_session_ingredient_staff_unique;

ALTER TABLE worksheet_opname_line
  ADD CONSTRAINT worksheet_opname_line_session_ingredient_staff_unique
  UNIQUE (session_id, ingredient_id, staff_id);

ALTER TABLE worksheet_premix_line
  DROP CONSTRAINT IF EXISTS worksheet_premix_line_session_output_unique;

ALTER TABLE worksheet_premix_line
  DROP CONSTRAINT IF EXISTS worksheet_premix_line_session_output_staff_unique;

ALTER TABLE worksheet_premix_line
  ADD CONSTRAINT worksheet_premix_line_session_output_staff_unique
  UNIQUE (session_id, output_ingredient_id, staff_id);

ALTER TABLE worksheet_menu_issue_line
  DROP CONSTRAINT IF EXISTS worksheet_menu_issue_line_session_menu_reason_unique;

ALTER TABLE worksheet_menu_issue_line
  DROP CONSTRAINT IF EXISTS worksheet_menu_issue_line_session_menu_reason_staff_unique;

ALTER TABLE worksheet_menu_issue_line
  ADD CONSTRAINT worksheet_menu_issue_line_session_menu_reason_staff_unique
  UNIQUE (session_id, menu_item_id, reason, staff_id);

COMMENT ON CONSTRAINT worksheet_out_line_session_ingredient_staff_unique ON worksheet_out_line IS
  'One out-stock line per staff per ingredient per worksheet session.';

COMMENT ON CONSTRAINT worksheet_opname_line_session_ingredient_staff_unique ON worksheet_opname_line IS
  'One opname line per staff per ingredient per worksheet session.';

COMMENT ON CONSTRAINT worksheet_premix_line_session_output_staff_unique ON worksheet_premix_line IS
  'One premix production line per staff per premix item per worksheet session.';

COMMENT ON CONSTRAINT worksheet_menu_issue_line_session_menu_reason_staff_unique ON worksheet_menu_issue_line IS
  'One remake/complaint reason line per staff per menu per worksheet session.';
