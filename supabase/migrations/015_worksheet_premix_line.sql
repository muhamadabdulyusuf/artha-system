-- Worksheet premix production lines.
-- Staff input daily premix output inside the closing worksheet; final ledger is written
-- on Submit Report Closing together with receive/outstock/opname/menu.

CREATE TABLE worksheet_premix_line (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  output_ingredient_id  UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  recipe_id             UUID NOT NULL REFERENCES recipes (id) ON DELETE RESTRICT,
  batch_quantity        NUMERIC(14, 4) NOT NULL CHECK (batch_quantity > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worksheet_premix_line_session_output_unique UNIQUE (session_id, output_ingredient_id)
);

CREATE INDEX worksheet_premix_line_session_idx ON worksheet_premix_line (session_id);
CREATE INDEX worksheet_premix_line_output_idx ON worksheet_premix_line (output_ingredient_id);

CREATE TRIGGER worksheet_premix_line_set_updated_at
  BEFORE UPDATE ON worksheet_premix_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION assert_worksheet_premix_line_valid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_department department_type;
  v_output_department department_type;
  v_output_kind ingredient_kind;
  v_recipe_output UUID;
BEGIN
  SELECT ws.department, i.department, i.kind, r.output_ingredient_id
  INTO v_session_department, v_output_department, v_output_kind, v_recipe_output
  FROM worksheet_session ws
  JOIN ingredient i ON i.id = NEW.output_ingredient_id
  JOIN recipes r ON r.id = NEW.recipe_id
  WHERE ws.id = NEW.session_id;

  IF v_output_kind IS DISTINCT FROM 'premix' THEN
    RAISE EXCEPTION 'worksheet premix output must be kind=premix';
  END IF;

  IF v_recipe_output IS DISTINCT FROM NEW.output_ingredient_id THEN
    RAISE EXCEPTION 'worksheet premix recipe does not match output ingredient';
  END IF;

  IF v_session_department IS DISTINCT FROM v_output_department THEN
    RAISE EXCEPTION 'premix department (%) does not match worksheet session department (%)',
      v_output_department, v_session_department;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER worksheet_premix_line_valid
  BEFORE INSERT OR UPDATE ON worksheet_premix_line
  FOR EACH ROW EXECUTE FUNCTION assert_worksheet_premix_line_valid();

COMMENT ON TABLE worksheet_premix_line IS
  'Daily premix production draft entered by staff inside worksheet closing.';
