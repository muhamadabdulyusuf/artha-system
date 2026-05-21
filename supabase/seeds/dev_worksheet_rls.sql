-- DEV ONLY: permissive RLS for the current prototype.
-- The app still uses the public anon Supabase client plus client-side PIN session,
-- so every table used by the UI needs anon write access while we are rebuilding.
-- Do not run this for production.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'staff',
    'ingredient',
    'menu_item',
    'menu_recipe_version',
    'recipe_line',
    'supplier',
    'supplier_ingredient_price',
    'purchase_order',
    'purchase_order_line',
    'business_day',
    'worksheet_session',
    'worksheet_in_line',
    'worksheet_out_line',
    'worksheet_opname_line',
    'worksheet_premix_line',
    'worksheet_sold_line',
    'stock_ledger',
    'stock_log',
    'worksheet_opname_pending',
    'recipes',
    'recipe_component',
    'production_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS anon_all_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY anon_all_%I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      tbl,
      tbl
    );
  END LOOP;
END $$;
