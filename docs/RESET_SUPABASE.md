# Reset Supabase From Zero

Use this only when the current Supabase data may be deleted.

## SQL Editor Flow

1. Run `supabase/reset_public_schema.sql`.
2. Run migrations in numeric order:
   - `001_initial_schema.sql`
   - `002_worksheet_out_line.sql`
   - `003_supplier_po.sql`
   - `004_supplier_phone_number.sql`
   - `005_ingredient_minimum_stock.sql`
   - `006_worksheet_out_line_validation.sql`
   - `007_worksheet_opname_approval_stock_log.sql`
   - `008_staff_verify_pin.sql`
   - `009_staff_role_viewer.sql`
   - `010_premix_production.sql`
   - `011_worksheet_opname_line.sql`
   - `012_ingredient_stock_tracking.sql`
   - `013_outstock_photo_optional_note.sql`
   - `014_ingredient_primary_supplier.sql`
   - `015_worksheet_premix_line.sql`
   - `016_premix_recipe_yield.sql`
   - `017_bar_indogrosir_ingredients.sql`
3. For current prototype app access, run:
   - `supabase/seeds/dev_worksheet_rls.sql`
   - `supabase/seeds/dev_staff.sql`
4. Do not run `viewer_rls_policies.sql` yet. It is for the later JWT-backed production auth phase, not the current anon-client prototype.

## psql Flow

If you have a Postgres connection string:

```bash
psql "$DATABASE_URL" -f supabase/rebuild_from_zero.psql
```

## Important

`dev_worksheet_rls.sql` is intentionally permissive because the current app still uses the public anon Supabase client and a client-side PIN session. Before production, replace it with JWT-backed role and department policies.

`viewer_rls_policies.sql` is intentionally excluded from the prototype reset order. Running it now can block anon writes used by the current admin and worksheet UI.

The clean stock direction after this reset:

- `worksheet_*_line` tables store draft staff input.
- `worksheet_opname_line` stores physical closing stock drafts.
- `stock_ledger` is written on final closing submit only.
- `ingredient.current_stock` is a cache updated from final closing/premix/admin adjustment.
