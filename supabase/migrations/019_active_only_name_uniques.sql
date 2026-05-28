-- Allow reusing ingredient/menu names after old rows are deactivated.

ALTER TABLE ingredient
  DROP CONSTRAINT IF EXISTS ingredient_name_department_unique;

ALTER TABLE menu_item
  DROP CONSTRAINT IF EXISTS menu_item_name_department_unique;

WITH ranked_ingredients AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY name, department
      ORDER BY updated_at DESC, created_at DESC, id
    ) AS rn
  FROM ingredient
  WHERE is_active = TRUE
)
UPDATE ingredient
SET is_active = FALSE
WHERE id IN (
  SELECT id
  FROM ranked_ingredients
  WHERE rn > 1
);

WITH ranked_menus AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY menu_name, department
      ORDER BY updated_at DESC, created_at DESC, id
    ) AS rn
  FROM menu_item
  WHERE is_active = TRUE
)
UPDATE menu_item
SET is_active = FALSE
WHERE id IN (
  SELECT id
  FROM ranked_menus
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ingredient_name_department_active_unique
  ON ingredient (name, department)
  WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_name_department_active_unique
  ON menu_item (menu_name, department)
  WHERE is_active = TRUE;
