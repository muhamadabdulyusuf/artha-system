-- Stock tracking switch for consumables that should exist in recipes/master data
-- but should not appear in daily inventory workflows (example: tap water).

ALTER TABLE ingredient
  ADD COLUMN IF NOT EXISTS is_stock_tracked BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS ingredient_stock_tracked_idx
  ON ingredient (department, is_stock_tracked)
  WHERE is_active = TRUE;

COMMENT ON COLUMN ingredient.is_stock_tracked IS
  'FALSE for unlimited/non-inventory items; skipped from worksheet, stock ledger, low stock, and stock adjustment.';
