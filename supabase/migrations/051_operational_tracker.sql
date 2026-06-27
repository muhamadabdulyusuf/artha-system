-- Operational Staff & Overtime Tracker.

CREATE TABLE IF NOT EXISTS operational_tracker_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('overtime', 'daily_worker')),
  staff_id uuid REFERENCES staff (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  date date NOT NULL,
  hourly_rate numeric(12, 2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  total_hours numeric(8, 2) NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
  daily_rate numeric(12, 2) NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  work_days numeric(8, 2) NOT NULL DEFAULT 0 CHECK (work_days >= 0),
  total_daily_wage numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_daily_wage >= 0),
  activity_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_pay numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_pay >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paid')),
  created_by uuid REFERENCES staff (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_tracker_activity_log_array CHECK (jsonb_typeof(activity_log) = 'array'),
  CONSTRAINT operational_tracker_overtime_staff_check CHECK (
    record_type <> 'overtime' OR staff_id IS NOT NULL
  )
);

DROP TRIGGER IF EXISTS operational_tracker_record_set_updated_at ON operational_tracker_record;

CREATE TRIGGER operational_tracker_record_set_updated_at
  BEFORE UPDATE ON operational_tracker_record
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS operational_tracker_record_date_idx
  ON operational_tracker_record (date DESC);

CREATE INDEX IF NOT EXISTS operational_tracker_record_type_status_idx
  ON operational_tracker_record (record_type, status);

CREATE INDEX IF NOT EXISTS operational_tracker_record_staff_idx
  ON operational_tracker_record (staff_id);

COMMENT ON TABLE operational_tracker_record IS
  'Operational manager ledger for staff overtime and daily worker payments with transparent activity logs.';

COMMENT ON COLUMN operational_tracker_record.activity_log IS
  'Chronological activity notes stored as JSON array: [{ id, timestamp, note }].';
