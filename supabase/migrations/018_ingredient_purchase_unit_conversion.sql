-- Receive unit conversion.
-- Example: Cengkeh Sunrise stock is tracked in pcs, but supplier sends pack.
-- purchase_unit = 'pack', purchase_to_stock_factor = 50 means 1 pack received adds 50 pcs to stock.

ALTER TABLE ingredient
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT,
  ADD COLUMN IF NOT EXISTS purchase_to_stock_factor NUMERIC(14, 4) NOT NULL DEFAULT 1;

ALTER TABLE ingredient
  DROP CONSTRAINT IF EXISTS ingredient_purchase_to_stock_factor_positive;

ALTER TABLE ingredient
  ADD CONSTRAINT ingredient_purchase_to_stock_factor_positive
  CHECK (purchase_to_stock_factor > 0);

COMMENT ON COLUMN ingredient.unit IS
  'Base stock unit used by recipes, opname, outstock, stock_ledger, and current_stock.';

COMMENT ON COLUMN ingredient.purchase_unit IS
  'Optional receive/purchasing unit. When set, staff input receive in this unit.';

COMMENT ON COLUMN ingredient.purchase_to_stock_factor IS
  'How many base stock units are added by 1 purchase_unit. Example: 1 pack = 50 pcs.';
