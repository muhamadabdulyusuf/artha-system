-- Per-staff sales menu entries. worksheet_sold_line remains the aggregate used by closing/reporting.

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

CREATE TABLE IF NOT EXISTS worksheet_sold_entry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  menu_item_id    UUID NOT NULL REFERENCES menu_item (id) ON DELETE RESTRICT,
  staff_id        UUID REFERENCES staff (id) ON DELETE SET NULL,
  quantity_sold   NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worksheet_sold_entry_session_menu_staff_unique UNIQUE (session_id, menu_item_id, staff_id)
);

CREATE INDEX IF NOT EXISTS worksheet_sold_entry_session_idx
  ON worksheet_sold_entry (session_id);

CREATE INDEX IF NOT EXISTS worksheet_sold_entry_staff_idx
  ON worksheet_sold_entry (staff_id)
  WHERE staff_id IS NOT NULL;

DROP TRIGGER IF EXISTS worksheet_sold_entry_set_updated_at ON worksheet_sold_entry;

CREATE TRIGGER worksheet_sold_entry_set_updated_at
  BEFORE UPDATE ON worksheet_sold_entry FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS worksheet_sold_entry_department_match ON worksheet_sold_entry;

CREATE TRIGGER worksheet_sold_entry_department_match
  BEFORE INSERT OR UPDATE ON worksheet_sold_entry
  FOR EACH ROW EXECUTE FUNCTION assert_worksheet_sold_line_department_match();

INSERT INTO worksheet_sold_entry (session_id, menu_item_id, staff_id, quantity_sold, created_at, updated_at)
SELECT
  wsl.session_id,
  wsl.menu_item_id,
  ws.submitted_by_staff_id,
  wsl.quantity_sold,
  wsl.created_at,
  wsl.updated_at
FROM worksheet_sold_line wsl
JOIN worksheet_session ws ON ws.id = wsl.session_id
WHERE wsl.quantity_sold > 0
ON CONFLICT (session_id, menu_item_id, staff_id)
DO UPDATE SET
  quantity_sold = EXCLUDED.quantity_sold,
  updated_at = NOW();

COMMENT ON TABLE worksheet_sold_entry IS
  'Per-staff menu sales entries. Staff can edit their own entry while worksheet_sold_line stores the aggregate total.';
