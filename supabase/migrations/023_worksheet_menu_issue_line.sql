-- Menu issue / remake: menu-level operational loss converted to ingredients on closing.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS worksheet_menu_issue_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  menu_item_id    UUID NOT NULL REFERENCES menu_item (id) ON DELETE RESTRICT,
  quantity        NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reason          TEXT NOT NULL DEFAULT 'other',
  note            TEXT NOT NULL DEFAULT '',
  photo_url       TEXT,
  photo_public_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worksheet_menu_issue_line_session_menu_reason_unique
    UNIQUE (session_id, menu_item_id, reason)
);

ALTER TABLE worksheet_menu_issue_line
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_public_id TEXT;

CREATE INDEX IF NOT EXISTS worksheet_menu_issue_line_session_idx
  ON worksheet_menu_issue_line (session_id);

DROP TRIGGER IF EXISTS worksheet_menu_issue_line_set_updated_at ON worksheet_menu_issue_line;

CREATE TRIGGER worksheet_menu_issue_line_set_updated_at
  BEFORE UPDATE ON worksheet_menu_issue_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION assert_worksheet_menu_issue_line_department_match()
RETURNS TRIGGER AS $$
DECLARE
  v_session_department department_type;
  v_menu_department department_type;
BEGIN
  SELECT department INTO v_session_department
  FROM worksheet_session
  WHERE id = NEW.session_id;

  SELECT department INTO v_menu_department
  FROM menu_item
  WHERE id = NEW.menu_item_id;

  IF v_session_department IS NULL OR v_menu_department IS NULL THEN
    RAISE EXCEPTION 'worksheet menu issue session/menu not found';
  END IF;

  IF v_session_department <> v_menu_department THEN
    RAISE EXCEPTION 'menu department (%) does not match worksheet session department (%)',
      v_menu_department,
      v_session_department;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS worksheet_menu_issue_line_department_match ON worksheet_menu_issue_line;

CREATE TRIGGER worksheet_menu_issue_line_department_match
  BEFORE INSERT OR UPDATE ON worksheet_menu_issue_line
  FOR EACH ROW EXECUTE FUNCTION assert_worksheet_menu_issue_line_department_match();

COMMENT ON TABLE worksheet_menu_issue_line IS
  'Menu-level remake/complaint/cooked-waste lines. Closing converts menu qty to ingredient theoretical usage.';
