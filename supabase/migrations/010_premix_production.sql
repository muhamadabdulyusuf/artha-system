-- Premix (WIP) production: ingredient kind, recipes, production_logs, RPC

CREATE TYPE ingredient_kind AS ENUM ('raw', 'premix');

ALTER TABLE ingredient
  ADD COLUMN kind ingredient_kind NOT NULL DEFAULT 'raw';

CREATE INDEX ingredient_kind_department_idx
  ON ingredient (department, kind)
  WHERE is_active = TRUE;

-- One active recipe per premix output ingredient
CREATE TABLE recipes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_ingredient_id  UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recipes_output_ingredient_unique UNIQUE (output_ingredient_id)
);

CREATE UNIQUE INDEX recipes_one_active_per_output
  ON recipes (output_ingredient_id)
  WHERE is_active = TRUE;

CREATE TABLE recipe_component (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       UUID NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  qty_per_batch   NUMERIC(14, 4) NOT NULL CHECK (qty_per_batch > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recipe_component_recipe_ingredient_unique UNIQUE (recipe_id, ingredient_id)
);

CREATE INDEX recipe_component_ingredient_idx ON recipe_component (ingredient_id);

CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER recipe_component_set_updated_at
  BEFORE UPDATE ON recipe_component FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Department match: components must share department with output premix
CREATE OR REPLACE FUNCTION assert_recipe_component_department_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_output_department department_type;
  v_component_department department_type;
BEGIN
  SELECT o.department, c.department
  INTO v_output_department, v_component_department
  FROM recipes r
  JOIN ingredient o ON o.id = r.output_ingredient_id
  JOIN ingredient c ON c.id = NEW.ingredient_id
  WHERE r.id = NEW.recipe_id;

  IF v_output_department IS DISTINCT FROM v_component_department THEN
    RAISE EXCEPTION 'recipe component department (%) does not match output (%)',
      v_component_department, v_output_department;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER recipe_component_department_match
  BEFORE INSERT OR UPDATE ON recipe_component
  FOR EACH ROW EXECUTE FUNCTION assert_recipe_component_department_match();

CREATE OR REPLACE FUNCTION assert_recipe_output_is_premix()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind ingredient_kind;
BEGIN
  SELECT kind INTO v_kind FROM ingredient WHERE id = NEW.output_ingredient_id;
  IF v_kind IS DISTINCT FROM 'premix' THEN
    RAISE EXCEPTION 'recipe output ingredient must have kind=premix';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER recipes_output_premix_check
  BEFORE INSERT OR UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION assert_recipe_output_is_premix();

CREATE TABLE production_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date         DATE NOT NULL REFERENCES business_day (business_date) ON DELETE RESTRICT,
  department            department_type NOT NULL,
  output_ingredient_id  UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  recipe_id             UUID NOT NULL REFERENCES recipes (id) ON DELETE RESTRICT,
  batch_quantity        NUMERIC(14, 4) NOT NULL CHECK (batch_quantity > 0),
  produced_by_staff_id  UUID NOT NULL REFERENCES staff (id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX production_logs_business_date_idx ON production_logs (business_date DESC);
CREATE INDEX production_logs_department_idx ON production_logs (department);
CREATE INDEX production_logs_output_idx ON production_logs (output_ingredient_id);

ALTER TYPE stock_log_event_type ADD VALUE 'PRODUCTION';

-- Staff id from JWT (app_metadata.staff_id) or auth.uid()
CREATE OR REPLACE FUNCTION public.auth_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'staff_id', '')::uuid,
    NULLIF(auth.jwt() ->> 'staff_id', '')::uuid,
    auth.uid()
  );
$$;

COMMENT ON FUNCTION public.auth_staff_id() IS
  'Staff UUID from JWT claims or Supabase auth.uid(); used with jwt_staff_role() for RLS.';

-- Upsert ledger row: apply delta to in_qty (positive) or theoretical_usage (positive = consumption)
CREATE OR REPLACE FUNCTION public.apply_stock_ledger_delta(
  p_business_date date,
  p_ingredient_id uuid,
  p_in_delta numeric DEFAULT 0,
  p_usage_delta numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_opening numeric(14, 4);
  v_in numeric(14, 4);
  v_usage numeric(14, 4);
  v_adj numeric(14, 4);
  v_closing numeric(14, 4);
BEGIN
  INSERT INTO business_day (business_date)
  VALUES (p_business_date)
  ON CONFLICT (business_date) DO NOTHING;

  SELECT opening_stock, in_qty, theoretical_usage, adjustment_qty, closing_stock
  INTO v_opening, v_in, v_usage, v_adj, v_closing
  FROM stock_ledger
  WHERE business_date = p_business_date AND ingredient_id = p_ingredient_id;

  IF NOT FOUND THEN
    SELECT COALESCE(i.current_stock, 0)
    INTO v_opening
    FROM ingredient i
    WHERE i.id = p_ingredient_id;

    v_in := 0;
    v_usage := 0;
    v_adj := 0;
    v_closing := v_opening;
  END IF;

  v_in := v_in + COALESCE(p_in_delta, 0);
  v_usage := v_usage + COALESCE(p_usage_delta, 0);
  v_closing := v_opening + v_in - v_usage + v_adj;

  IF v_closing < 0 THEN
    RAISE EXCEPTION 'stock_ledger would be negative for ingredient % on %', p_ingredient_id, p_business_date;
  END IF;

  INSERT INTO stock_ledger (
    business_date,
    ingredient_id,
    opening_stock,
    in_qty,
    theoretical_usage,
    adjustment_qty,
    closing_stock
  )
  VALUES (
    p_business_date,
    p_ingredient_id,
    v_opening,
    v_in,
    v_usage,
    v_adj,
    v_closing
  )
  ON CONFLICT (business_date, ingredient_id)
  DO UPDATE SET
    in_qty = EXCLUDED.in_qty,
    theoretical_usage = EXCLUDED.theoretical_usage,
    closing_stock = EXCLUDED.closing_stock,
    updated_at = NOW();
END;
$$;

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
  ELSIF v_staff.role NOT IN ('admin', 'op_manager') THEN
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

  FOR v_component IN
    SELECT rc.ingredient_id, rc.qty_per_batch, i.name AS component_name, i.current_stock
    FROM recipe_component rc
    JOIN ingredient i ON i.id = rc.ingredient_id
    WHERE rc.recipe_id = v_recipe.id
  LOOP
    v_required := v_component.qty_per_batch * p_quantity;

    IF v_component.current_stock < v_required THEN
      RAISE EXCEPTION 'insufficient stock for %: need %, have %',
        v_component.component_name, v_required, v_component.current_stock;
    END IF;
  END LOOP;

  FOR v_component IN
    SELECT rc.ingredient_id, rc.qty_per_batch, i.name AS component_name, i.current_stock
    FROM recipe_component rc
    JOIN ingredient i ON i.id = rc.ingredient_id
    WHERE rc.recipe_id = v_recipe.id
  LOOP
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
  SET current_stock = current_stock + p_quantity
  WHERE id = p_ingredient_id;

  PERFORM public.apply_stock_ledger_delta(
    v_business_date,
    p_ingredient_id,
    p_quantity,
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
    v_output.current_stock + p_quantity,
    'premix output',
    format('Produksi premix %s: +%s batch', v_output.name, p_quantity),
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
    'business_date', v_business_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.produce_premix(uuid, numeric, department_type, uuid, date) TO anon, authenticated;

COMMENT ON FUNCTION public.produce_premix IS
  'Atomic premix batch: consume raw materials, add WIP output, ledger + production_logs.';
