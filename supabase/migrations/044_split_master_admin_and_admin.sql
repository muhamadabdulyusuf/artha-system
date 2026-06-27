-- Split the old admin role into Master Admin + Admin.
-- Run after 043_staff_role_master_admin.sql.

ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_department_role_check;

ALTER TABLE staff ADD CONSTRAINT staff_department_role_check CHECK (
  (role IN ('master_admin', 'admin', 'op_manager', 'viewer') AND department IS NULL)
  OR (role = 'bar_staff' AND department = 'bar')
  OR (role = 'kitchen_staff' AND department = 'kitchen')
);

-- Existing admin accounts were the top-level accounts before this split.
UPDATE staff
SET role = 'master_admin'::staff_role,
    department = NULL,
    updated_at = now()
WHERE role = 'admin'::staff_role
  AND NOT EXISTS (
    SELECT 1
    FROM staff existing_master
    WHERE existing_master.role = 'master_admin'::staff_role
  );

DO $$
BEGIN
  IF to_regclass('public.role_task_setting') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO role_task_setting (role, task_id, is_enabled)
  SELECT 'master_admin'::staff_role, task_id, is_enabled
  FROM role_task_setting
  WHERE role = 'admin'::staff_role
  ON CONFLICT (role, task_id) DO NOTHING;

  INSERT INTO role_task_setting (role, task_id, is_enabled)
  VALUES
    ('master_admin', 'dashboard', true),
    ('master_admin', 'purchase_order', true),
    ('master_admin', 'admin_worksheet', true),
    ('master_admin', 'master_ingredients', true),
    ('master_admin', 'menu_recipe', true),
    ('master_admin', 'suppliers', true),
    ('master_admin', 'role_settings', true),
    ('master_admin', 'worksheet_receive', true),
    ('master_admin', 'worksheet_outstock', true),
    ('master_admin', 'worksheet_opname', true),
    ('master_admin', 'worksheet_premix', true),
    ('master_admin', 'worksheet_issue', true),
    ('master_admin', 'worksheet_sold', true),
    ('admin', 'dashboard', true),
    ('admin', 'purchase_order', true),
    ('admin', 'admin_worksheet', true),
    ('admin', 'master_ingredients', true),
    ('admin', 'menu_recipe', true),
    ('admin', 'suppliers', true),
    ('admin', 'role_settings', false),
    ('admin', 'worksheet_receive', true),
    ('admin', 'worksheet_outstock', true),
    ('admin', 'worksheet_opname', true),
    ('admin', 'worksheet_premix', true),
    ('admin', 'worksheet_issue', true),
    ('admin', 'worksheet_sold', true)
  ON CONFLICT (role, task_id) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled,
      updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.produce_premix(
  p_ingredient_id uuid,
  p_quantity numeric,
  p_department department_type,
  p_staff_id uuid,
  p_business_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_date date;
  v_staff staff%ROWTYPE;
  v_output ingredient%ROWTYPE;
  v_recipe recipes%ROWTYPE;
  v_component record;
  v_required numeric(14, 4);
  v_output_qty numeric(14, 4);
  v_jwt_role text;
  v_caller_staff uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'batch quantity must be positive';
  END IF;

  v_business_date := COALESCE(p_business_date, CURRENT_DATE);
  v_jwt_role := public.jwt_staff_role();
  v_caller_staff := public.auth_staff_id();

  IF v_jwt_role <> '' AND p_staff_id IS DISTINCT FROM v_caller_staff AND v_caller_staff IS NOT NULL THEN
    RAISE EXCEPTION 'staff_id does not match authenticated session';
  END IF;

  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff not found or inactive';
  END IF;

  IF v_staff.role IN ('bar_staff', 'kitchen_staff') THEN
    IF v_staff.department IS DISTINCT FROM p_department THEN
      RAISE EXCEPTION 'staff department does not match production department';
    END IF;
    IF v_staff.role = 'bar_staff' AND p_department <> 'bar' THEN
      RAISE EXCEPTION 'bar_staff cannot produce for kitchen';
    END IF;
    IF v_staff.role = 'kitchen_staff' AND p_department <> 'kitchen' THEN
      RAISE EXCEPTION 'kitchen_staff cannot produce for bar';
    END IF;
  ELSIF v_staff.role NOT IN ('master_admin', 'admin', 'op_manager') THEN
    RAISE EXCEPTION 'role % is not allowed to run production', v_staff.role;
  END IF;

  IF v_jwt_role = 'viewer' THEN
    RAISE EXCEPTION 'viewer cannot run production';
  END IF;

  SELECT * INTO v_output
  FROM ingredient
  WHERE id = p_ingredient_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'output ingredient not found';
  END IF;

  IF v_output.kind <> 'premix' THEN
    RAISE EXCEPTION 'ingredient is not a premix (WIP) item';
  END IF;

  IF v_output.department IS DISTINCT FROM p_department THEN
    RAISE EXCEPTION 'premix department (%) does not match request (%)',
      v_output.department, p_department;
  END IF;

  SELECT * INTO v_recipe
  FROM recipes
  WHERE output_ingredient_id = p_ingredient_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active recipe for this premix';
  END IF;

  v_output_qty := p_quantity * COALESCE(v_recipe.yield_quantity, 1);

  FOR v_component IN
    SELECT
      rc.ingredient_id,
      rc.qty_per_batch,
      i.name AS component_name,
      i.current_stock,
      COALESCE(i.is_stock_tracked, TRUE) AS is_stock_tracked
    FROM recipe_component rc
    JOIN ingredient i ON i.id = rc.ingredient_id
    WHERE rc.recipe_id = v_recipe.id
  LOOP
    IF v_component.is_stock_tracked = FALSE THEN
      CONTINUE;
    END IF;

    v_required := v_component.qty_per_batch * p_quantity;

    IF v_component.current_stock < v_required THEN
      RAISE EXCEPTION 'insufficient stock for %: need %, have %',
        v_component.component_name, v_required, v_component.current_stock;
    END IF;
  END LOOP;

  FOR v_component IN
    SELECT
      rc.ingredient_id,
      rc.qty_per_batch,
      i.name AS component_name,
      i.current_stock,
      COALESCE(i.is_stock_tracked, TRUE) AS is_stock_tracked
    FROM recipe_component rc
    JOIN ingredient i ON i.id = rc.ingredient_id
    WHERE rc.recipe_id = v_recipe.id
  LOOP
    IF v_component.is_stock_tracked = FALSE THEN
      CONTINUE;
    END IF;

    v_required := v_component.qty_per_batch * p_quantity;

    UPDATE ingredient
    SET current_stock = current_stock - v_required
    WHERE id = v_component.ingredient_id;

    PERFORM public.apply_stock_ledger_delta(
      v_business_date,
      v_component.ingredient_id,
      0,
      v_required
    );

    INSERT INTO stock_log (
      ingredient_id,
      business_date,
      event_type,
      qty_before,
      qty_after,
      reason,
      message,
      created_by_staff_id
    )
    VALUES (
      v_component.ingredient_id,
      v_business_date,
      'PRODUCTION',
      v_component.current_stock,
      v_component.current_stock - v_required,
      'premix consumption',
      format('Produksi premix: konsumsi %s untuk batch %s', v_component.component_name, p_quantity),
      p_staff_id
    );
  END LOOP;

  UPDATE ingredient
  SET current_stock = current_stock + v_output_qty
  WHERE id = p_ingredient_id;

  PERFORM public.apply_stock_ledger_delta(
    v_business_date,
    p_ingredient_id,
    v_output_qty,
    0
  );

  INSERT INTO stock_log (
    ingredient_id,
    business_date,
    event_type,
    qty_before,
    qty_after,
    reason,
    message,
    created_by_staff_id
  )
  VALUES (
    p_ingredient_id,
    v_business_date,
    'PRODUCTION',
    v_output.current_stock,
    v_output.current_stock + v_output_qty,
    'premix output',
    format('Produksi premix %s: %s batch menghasilkan %s %s', v_output.name, p_quantity, v_output_qty, v_output.unit),
    p_staff_id
  );

  INSERT INTO production_logs (
    business_date,
    department,
    output_ingredient_id,
    recipe_id,
    batch_quantity,
    produced_by_staff_id
  )
  VALUES (
    v_business_date,
    p_department,
    p_ingredient_id,
    v_recipe.id,
    p_quantity,
    p_staff_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'output_ingredient_id', p_ingredient_id,
    'batch_quantity', p_quantity,
    'output_quantity', v_output_qty,
    'business_date', v_business_date
  );
END;
$$;

COMMENT ON FUNCTION public.produce_premix IS
  'Atomic premix batch: consume tracked materials, add WIP output from recipe yield, ledger + production_logs.';
