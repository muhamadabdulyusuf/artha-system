-- Ambang batas stok minimum per bahan (Low Stock Indicator di Dashboard Monitoring)
ALTER TABLE ingredient
  ADD COLUMN IF NOT EXISTS minimum_stock NUMERIC(14, 4) NOT NULL DEFAULT 0;

ALTER TABLE ingredient
  DROP CONSTRAINT IF EXISTS ingredient_minimum_stock_non_negative;

ALTER TABLE ingredient
  ADD CONSTRAINT ingredient_minimum_stock_non_negative CHECK (minimum_stock >= 0);

COMMENT ON COLUMN ingredient.minimum_stock IS 'Ambang peringatan stok rendah; 0 = tidak dipantau.';
