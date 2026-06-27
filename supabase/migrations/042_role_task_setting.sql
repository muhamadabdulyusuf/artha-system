
-- Master Admin controlled task switches per role.

CREATE TABLE IF NOT EXISTS role_task_setting (
  role staff_role NOT NULL,
  task_id text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_task_setting_pk PRIMARY KEY (role, task_id),
  CONSTRAINT role_task_setting_task_check CHECK (
    task_id IN (
      'dashboard',
      'purchase_order',
      'admin_worksheet',
      'master_ingredients',
      'menu_recipe',
      'suppliers',
      'role_settings',
      'worksheet_receive',
      'worksheet_outstock',
      'worksheet_opname',
      'worksheet_premix',
      'worksheet_issue',
      'worksheet_sold'
    )
  )
);

DROP TRIGGER IF EXISTS role_task_setting_set_updated_at ON role_task_setting;

CREATE TRIGGER role_task_setting_set_updated_at
  BEFORE UPDATE ON role_task_setting
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO role_task_setting (role, task_id, is_enabled)
VALUES
  ('admin', 'dashboard', true),
  ('admin', 'purchase_order', true),
  ('admin', 'admin_worksheet', true),
  ('admin', 'master_ingredients', true),
  ('admin', 'menu_recipe', true),
  ('admin', 'suppliers', true),
  ('admin', 'role_settings', true),
  ('admin', 'worksheet_receive', true),
  ('admin', 'worksheet_outstock', true),
  ('admin', 'worksheet_opname', true),
  ('admin', 'worksheet_premix', true),
  ('admin', 'worksheet_issue', true),
  ('admin', 'worksheet_sold', true),
  ('op_manager', 'dashboard', true),
  ('op_manager', 'purchase_order', true),
  ('op_manager', 'admin_worksheet', true),
  ('op_manager', 'master_ingredients', true),
  ('op_manager', 'menu_recipe', true),
  ('op_manager', 'suppliers', true),
  ('op_manager', 'worksheet_receive', true),
  ('op_manager', 'worksheet_outstock', true),
  ('op_manager', 'worksheet_opname', true),
  ('op_manager', 'worksheet_premix', true),
  ('op_manager', 'worksheet_issue', true),
  ('op_manager', 'worksheet_sold', true),
  ('viewer', 'dashboard', true),
  ('viewer', 'purchase_order', false),
  ('viewer', 'admin_worksheet', false),
  ('viewer', 'master_ingredients', false),
  ('viewer', 'menu_recipe', false),
  ('viewer', 'suppliers', false),
  ('bar_staff', 'worksheet_receive', true),
  ('bar_staff', 'worksheet_outstock', true),
  ('bar_staff', 'worksheet_opname', true),
  ('bar_staff', 'worksheet_premix', true),
  ('bar_staff', 'worksheet_issue', true),
  ('bar_staff', 'worksheet_sold', true),
  ('kitchen_staff', 'worksheet_receive', true),
  ('kitchen_staff', 'worksheet_outstock', true),
  ('kitchen_staff', 'worksheet_opname', true),
  ('kitchen_staff', 'worksheet_premix', true),
  ('kitchen_staff', 'worksheet_issue', true),
  ('kitchen_staff', 'worksheet_sold', true)
ON CONFLICT (role, task_id) DO NOTHING;

COMMENT ON TABLE role_task_setting IS
  'Master Admin switches that control active tasks per staff role.';
