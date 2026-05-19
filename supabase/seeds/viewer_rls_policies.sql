-- =============================================================================
-- RLS: role 'viewer' — SELECT saja (baca), tanpa INSERT/UPDATE/DELETE
-- Jalankan di Supabase SQL Editor setelah auth JWT memuat staff_role, mis.:
--   app_metadata.staff_role = 'viewer' | 'admin' | ...
-- Saat ini login PIN memakai cookie klien; kebijakan ini mengunci tulis
-- untuk JWT yang menyatakan viewer. Role lain mengikuti policy tulis Anda.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.jwt_staff_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'staff_role',
    auth.jwt() ->> 'staff_role',
    current_setting('request.jwt.claims', true)::jsonb ->> 'staff_role',
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.jwt_is_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.jwt_staff_role() = 'viewer';
$$;

CREATE OR REPLACE FUNCTION public.jwt_can_write()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NOT public.jwt_is_viewer();
$$;

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
    'supplier_catalog',
    'purchase_order',
    'purchase_order_line',
    'business_day',
    'worksheet_session',
    'worksheet_in_line',
    'worksheet_out_line',
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

    EXECUTE format('DROP POLICY IF EXISTS viewer_select_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY viewer_select_%I ON public.%I FOR SELECT TO authenticated, anon USING (true)',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS viewer_insert_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY viewer_insert_%I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.jwt_can_write())',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS viewer_update_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY viewer_update_%I ON public.%I FOR UPDATE TO authenticated USING (public.jwt_can_write()) WITH CHECK (public.jwt_can_write())',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS viewer_delete_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY viewer_delete_%I ON public.%I FOR DELETE TO authenticated USING (public.jwt_can_write())',
      tbl, tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS anon_select_staff_pin_login ON staff;
CREATE POLICY anon_select_staff_pin_login
  ON staff FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON FUNCTION public.jwt_is_viewer() IS
  'True jika JWT memuat staff_role=viewer; dipakai policy tulis read-only.';
