-- Primary supplier assignment on ingredient master data.
-- Used by low-stock order grouping for purchasing.

ALTER TABLE ingredient
  ADD COLUMN IF NOT EXISTS primary_supplier_id UUID REFERENCES supplier (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ingredient_primary_supplier_idx
  ON ingredient (primary_supplier_id)
  WHERE primary_supplier_id IS NOT NULL;

COMMENT ON COLUMN ingredient.primary_supplier_id IS
  'Primary/default supplier for purchasing grouping and low-stock order lists.';
