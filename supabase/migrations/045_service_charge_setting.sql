-- Master Admin service charge percentage setting.

CREATE TABLE IF NOT EXISTS service_charge_setting (
  id text PRIMARY KEY DEFAULT 'default',
  service_percent numeric(5, 2) NOT NULL DEFAULT 0 CHECK (service_percent >= 0 AND service_percent <= 100),
  tax_percent numeric(5, 2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0 AND tax_percent <= 100),
  updated_by_staff_id uuid REFERENCES staff (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_charge_setting_singleton CHECK (id = 'default')
);

DROP TRIGGER IF EXISTS service_charge_setting_set_updated_at ON service_charge_setting;

CREATE TRIGGER service_charge_setting_set_updated_at
  BEFORE UPDATE ON service_charge_setting
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO service_charge_setting (id, service_percent)
VALUES ('default', 0)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE service_charge_setting IS
  'Singleton Master Admin setting for service charge percentage used in revenue service calculation.';

COMMENT ON COLUMN service_charge_setting.service_percent IS
  'Service charge percentage applied to gross menu revenue.';

COMMENT ON COLUMN service_charge_setting.tax_percent IS
  'Tax percentage applied to subtotal after service charge.';
