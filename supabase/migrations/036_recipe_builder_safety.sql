-- Safety guard for menu recipe edits.
-- Keep one active recipe version per menu before enforcing the active-version index.

WITH ranked_active_versions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY menu_item_id
      ORDER BY updated_at DESC, created_at DESC, version DESC
    ) AS active_rank
  FROM menu_recipe_version
  WHERE is_active = TRUE
)
UPDATE menu_recipe_version
SET is_active = FALSE
WHERE id IN (
  SELECT id
  FROM ranked_active_versions
  WHERE active_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_recipe_version_one_active_per_menu
  ON menu_recipe_version (menu_item_id)
  WHERE is_active = TRUE;
