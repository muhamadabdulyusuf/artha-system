-- Staff service share point configuration.

CREATE TABLE IF NOT EXISTS service_share_point (
  staff_id uuid PRIMARY KEY REFERENCES staff (id) ON DELETE CASCADE,
  point numeric(8, 2) NOT NULL DEFAULT 1 CHECK (point >= 0),
  is_eligible boolean NOT NULL DEFAULT true,
  updated_by_staff_id uuid REFERENCES staff (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS service_share_point_set_updated_at ON service_share_point;

CREATE TRIGGER service_share_point_set_updated_at
  BEFORE UPDATE ON service_share_point
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE service_share_point IS
  'Master Admin service share point per staff. Used to split monthly service pool by department.';

COMMENT ON COLUMN service_share_point.point IS
  'Relative point/share used when dividing department service pool.';
