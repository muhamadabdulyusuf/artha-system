-- Receive entries: staff add receive transactions; worksheet_in_line stores the aggregate.

CREATE TABLE IF NOT EXISTS worksheet_receive_entry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  staff_id        UUID REFERENCES staff (id) ON DELETE SET NULL,
  quantity        NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS worksheet_receive_entry_session_idx
  ON worksheet_receive_entry (session_id);

CREATE INDEX IF NOT EXISTS worksheet_receive_entry_ingredient_idx
  ON worksheet_receive_entry (ingredient_id);

CREATE INDEX IF NOT EXISTS worksheet_receive_entry_staff_idx
  ON worksheet_receive_entry (staff_id)
  WHERE staff_id IS NOT NULL;

CREATE OR REPLACE FUNCTION assert_worksheet_receive_entry_department_match()
RETURNS TRIGGER AS $$
DECLARE
  v_session_department department_type;
  v_ingredient_department department_type;
BEGIN
  SELECT department INTO v_session_department
  FROM worksheet_session
  WHERE id = NEW.session_id;

  SELECT department INTO v_ingredient_department
  FROM ingredient
  WHERE id = NEW.ingredient_id;

  IF v_session_department IS NULL OR v_ingredient_department IS NULL THEN
    RAISE EXCEPTION 'worksheet receive entry session/ingredient not found';
  END IF;

  IF v_session_department <> v_ingredient_department THEN
    RAISE EXCEPTION 'ingredient department (%) does not match worksheet session department (%)',
      v_ingredient_department,
      v_session_department;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS worksheet_receive_entry_department_match ON worksheet_receive_entry;

CREATE TRIGGER worksheet_receive_entry_department_match
  BEFORE INSERT OR UPDATE ON worksheet_receive_entry
  FOR EACH ROW EXECUTE FUNCTION assert_worksheet_receive_entry_department_match();

INSERT INTO worksheet_receive_entry (session_id, ingredient_id, staff_id, quantity, created_at)
SELECT session_id, ingredient_id, NULL, quantity, created_at
FROM worksheet_in_line wil
WHERE quantity > 0
  AND NOT EXISTS (
    SELECT 1
    FROM worksheet_receive_entry wre
    WHERE wre.session_id = wil.session_id
      AND wre.ingredient_id = wil.ingredient_id
  );

COMMENT ON TABLE worksheet_receive_entry IS
  'Append-only receive transactions entered by staff. worksheet_in_line remains the aggregate used by closing.';
