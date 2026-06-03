-- Harden PO arrival stock application.
-- Marking a PO as Arrived must update ingredient.current_stock exactly once.

CREATE OR REPLACE FUNCTION public.apply_purchase_request_arrival_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF COALESCE(NEW.qty, 0) <= 0 THEN
    RAISE EXCEPTION 'Qty PO harus lebih dari 0 sebelum status Arrived.';
  END IF;

  IF NEW.arrival_date IS NULL THEN
    NEW.arrival_date := CURRENT_DATE;
  END IF;

  SELECT current_stock,
         COALESCE(NULLIF(purchase_to_stock_factor, 0), 1)
    INTO v_before,
         v_factor
  FROM public.ingredient
  WHERE id = NEW.ingredient_id
    AND is_active = TRUE
    AND is_stock_tracked = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bahan persediaan tidak aktif / tidak tracked / tidak ditemukan untuk PO %. ', NEW.id;
  END IF;

  v_stock_qty := ROUND(NEW.qty * v_factor, 4);
  v_after := v_before + v_stock_qty;
  v_business_date := NEW.arrival_date;

  UPDATE public.ingredient
  SET current_stock = v_after
  WHERE id = NEW.ingredient_id;

  INSERT INTO public.stock_log (
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
    'PO diterima ' || NEW.item_name || ': stok master ' || v_before || ' -> ' || v_after,
    COALESCE(NEW.approved_by_staff_id, NEW.pic_request_staff_id)
  )
  RETURNING id INTO v_stock_log_id;

  NEW.stock_applied_at := NOW();
  NEW.stock_applied_qty := v_stock_qty;
  NEW.stock_log_id := v_stock_log_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_request_tracker_apply_arrival ON public.purchase_request_tracker;

CREATE TRIGGER purchase_request_tracker_apply_arrival
  BEFORE INSERT OR UPDATE OF purchase_status, arrival_date, ingredient_id, qty
  ON public.purchase_request_tracker
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_purchase_request_arrival_to_stock();

COMMENT ON FUNCTION public.apply_purchase_request_arrival_to_stock() IS
  'Applies received PO quantity into ingredient.current_stock once, using purchase_to_stock_factor and stock_log audit.';
