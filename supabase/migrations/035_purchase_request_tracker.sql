-- Purchase request / PO tracker for operational buying.
-- When a row is marked Arrived and linked to an ingredient, stock is applied once.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE supplier
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pic_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS link_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS purchase_request_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ingredient_id UUID REFERENCES ingredient (id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'general'
    CHECK (department IN ('bar', 'kitchen', 'general')),
  qty NUMERIC(14, 4) NOT NULL CHECK (qty > 0),
  unit TEXT NOT NULL,
  supplier_id UUID REFERENCES supplier (id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL DEFAULT '',
  supplier_contact TEXT NOT NULL DEFAULT '',
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  purchase_method TEXT NOT NULL DEFAULT 'Offline'
    CHECK (purchase_method IN ('Online', 'Offline')),
  purchase_link TEXT NOT NULL DEFAULT '',
  pic_request_staff_id UUID REFERENCES staff (id) ON DELETE SET NULL,
  pic_request_name TEXT NOT NULL DEFAULT '',
  approved_by_staff_id UUID REFERENCES staff (id) ON DELETE SET NULL,
  approved_by_name TEXT NOT NULL DEFAULT '',
  po_status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (po_status IN ('Pending', 'Approved', 'Rejected')),
  purchase_status TEXT NOT NULL DEFAULT 'Belum Dibeli'
    CHECK (purchase_status IN ('Belum Dibeli', 'On Progress', 'Purchased', 'Shipped', 'Arrived', 'Cancelled')),
  estimated_arrival_date DATE,
  arrival_date DATE,
  arrival_day_diff INTEGER,
  note TEXT NOT NULL DEFAULT '',
  stock_applied_at TIMESTAMPTZ,
  stock_applied_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
  stock_log_id UUID REFERENCES stock_log (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE purchase_request_tracker
  ADD COLUMN IF NOT EXISTS arrival_day_diff INTEGER,
  ADD COLUMN IF NOT EXISTS stock_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_applied_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_log_id UUID REFERENCES stock_log (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_request_tracker_request_date_idx
  ON purchase_request_tracker (request_date DESC);

CREATE INDEX IF NOT EXISTS purchase_request_tracker_status_idx
  ON purchase_request_tracker (purchase_status, po_status);

CREATE INDEX IF NOT EXISTS purchase_request_tracker_ingredient_idx
  ON purchase_request_tracker (ingredient_id)
  WHERE ingredient_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_purchase_request_tracker_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.total_price := ROUND(COALESCE(NEW.qty, 0) * COALESCE(NEW.unit_price, 0), 2);
  NEW.arrival_day_diff := CASE
    WHEN NEW.arrival_date IS NULL THEN NULL
    ELSE NEW.arrival_date - NEW.request_date
  END;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_request_tracker_totals ON purchase_request_tracker;

CREATE TRIGGER purchase_request_tracker_totals
  BEFORE INSERT OR UPDATE ON purchase_request_tracker
  FOR EACH ROW
  EXECUTE FUNCTION public.set_purchase_request_tracker_totals();

CREATE OR REPLACE FUNCTION public.apply_purchase_request_arrival_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_before NUMERIC(14, 4);
  v_after NUMERIC(14, 4);
  v_factor NUMERIC(14, 4);
  v_stock_qty NUMERIC(14, 4);
  v_business_date DATE;
  v_stock_log_id UUID;
BEGIN
  IF NEW.purchase_status <> 'Arrived' THEN
    RETURN NEW;
  END IF;

  IF NEW.stock_applied_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.ingredient_id IS NULL THEN
    RAISE EXCEPTION 'Bahan persediaan wajib dipilih sebelum status Arrived.';
  END IF;

  IF NEW.arrival_date IS NULL THEN
    NEW.arrival_date := CURRENT_DATE;
  END IF;

  SELECT current_stock
       , COALESCE(NULLIF(purchase_to_stock_factor, 0), 1)
  INTO v_before
     , v_factor
  FROM ingredient
  WHERE id = NEW.ingredient_id
  FOR UPDATE;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Ingredient tidak ditemukan untuk purchase request %. ', NEW.id;
  END IF;

  v_stock_qty := NEW.qty * v_factor;
  v_after := v_before + v_stock_qty;
  v_business_date := NEW.arrival_date;

  UPDATE ingredient
  SET current_stock = v_after
  WHERE id = NEW.ingredient_id;

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
    NEW.ingredient_id,
    v_business_date,
    'RECEIVE',
    v_before,
    v_after,
    'purchase request arrived',
    'PO Tracker arrived ' || NEW.item_name || ': ' || v_before || ' -> ' || v_after,
    NEW.pic_request_staff_id
  )
  RETURNING id INTO v_stock_log_id;

  NEW.stock_applied_at := NOW();
  NEW.stock_applied_qty := v_stock_qty;
  NEW.stock_log_id := v_stock_log_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_request_tracker_apply_arrival ON purchase_request_tracker;

CREATE TRIGGER purchase_request_tracker_apply_arrival
  BEFORE INSERT OR UPDATE OF purchase_status, arrival_date, ingredient_id, qty
  ON purchase_request_tracker
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_purchase_request_arrival_to_stock();

COMMENT ON TABLE purchase_request_tracker IS
  'Operational purchase request tracker. Rows marked Arrived apply stock once when linked to an ingredient.';

COMMENT ON COLUMN purchase_request_tracker.stock_applied_at IS
  'Set once when Arrived status has been applied into ingredient.current_stock.';
