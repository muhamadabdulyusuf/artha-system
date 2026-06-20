# Reset Supabase From Zero

Use this only when the current Supabase data may be deleted.

## SQL Editor Flow

1. Run `supabase/reset_public_schema.sql`.
2. Run every file in `supabase/migrations` in numeric order.
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
