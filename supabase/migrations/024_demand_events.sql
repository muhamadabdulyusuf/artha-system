-- Demand event calendar: promo/KOL/holiday/event planning and post-event effectiveness review.

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

CREATE TABLE IF NOT EXISTS demand_event (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  event_type            TEXT NOT NULL DEFAULT 'promo',
  department            department_type,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  expected_uplift_pct   NUMERIC(8, 2) NOT NULL DEFAULT 0,
  notes                 TEXT NOT NULL DEFAULT '',
  created_by_staff_id   UUID REFERENCES staff (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT demand_event_date_order_check CHECK (end_date >= start_date),
  CONSTRAINT demand_event_expected_uplift_check CHECK (expected_uplift_pct >= -100)
);

CREATE INDEX IF NOT EXISTS demand_event_date_idx
  ON demand_event (start_date, end_date);

CREATE INDEX IF NOT EXISTS demand_event_department_idx
  ON demand_event (department)
  WHERE department IS NOT NULL;

DROP TRIGGER IF EXISTS demand_event_set_updated_at ON demand_event;

CREATE TRIGGER demand_event_set_updated_at
  BEFORE UPDATE ON demand_event FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE demand_event IS
  'Manual demand events such as promo, KOL, holiday, or private event. Monitoring compares expected uplift vs actual sales uplift.';
