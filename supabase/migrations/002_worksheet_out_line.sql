-- worksheet_out_line: barang keluar harian (trashbag, takeaway, dll.)

CREATE TABLE worksheet_out_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  quantity        NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  note            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worksheet_out_line_session_ingredient_unique UNIQUE (session_id, ingredient_id)
);

CREATE INDEX worksheet_out_line_session_idx ON worksheet_out_line (session_id);

CREATE TRIGGER worksheet_out_line_set_updated_at
  BEFORE UPDATE ON worksheet_out_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION assert_worksheet_out_line_department_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_department department_type;
  v_ingredient_department department_type;
BEGIN
  SELECT ws.department, i.department
  INTO v_session_department, v_ingredient_department
  FROM worksheet_session ws
  JOIN ingredient i ON i.id = NEW.ingredient_id
  WHERE ws.id = NEW.session_id;

  IF v_session_department IS DISTINCT FROM v_ingredient_department THEN
    RAISE EXCEPTION 'ingredient department (%) does not match worksheet session department (%)',
      v_ingredient_department, v_session_department;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER worksheet_out_line_department_match
  BEFORE INSERT OR UPDATE ON worksheet_out_line
  FOR EACH ROW EXECUTE FUNCTION assert_worksheet_out_line_department_match();

COMMENT ON TABLE worksheet_out_line IS 'Barang keluar operasional harian per session (bukan sisa opname).';
