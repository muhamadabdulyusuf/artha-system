-- Default ingredient purchase price and actual receive-line price.

ALTER TABLE ingredient
  ADD COLUMN IF NOT EXISTS default_unit_price NUMERIC(14, 4) NOT NULL DEFAULT 0;

ALTER TABLE ingredient
  DROP CONSTRAINT IF EXISTS ingredient_default_unit_price_non_negative;

ALTER TABLE ingredient
  ADD CONSTRAINT ingredient_default_unit_price_non_negative
  CHECK (default_unit_price >= 0);

ALTER TABLE worksheet_in_line
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE worksheet_in_line
  DROP CONSTRAINT IF EXISTS worksheet_in_line_unit_price_non_negative,
  DROP CONSTRAINT IF EXISTS worksheet_in_line_line_total_non_negative;

ALTER TABLE worksheet_in_line
  ADD CONSTRAINT worksheet_in_line_unit_price_non_negative
  CHECK (unit_price >= 0),
  ADD CONSTRAINT worksheet_in_line_line_total_non_negative
  CHECK (line_total >= 0);

COMMENT ON COLUMN ingredient.default_unit_price IS
  'Default purchase price per receive unit. Staff can override per worksheet receive line.';

COMMENT ON COLUMN worksheet_in_line.unit_price IS
  'Actual purchase price per receive unit for this receive line.';

COMMENT ON COLUMN worksheet_in_line.line_total IS
  'quantity * unit_price, stored for receive cost reporting.';
