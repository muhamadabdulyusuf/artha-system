-- =============================================================================
-- Artha System — Initial Schema (PostgreSQL / Supabase)
-- Abdul Company | Blueprint v1.0
-- Jalankan seluruh blok ini di SQL Editor Supabase (Run once).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- ENUM types
-- -----------------------------------------------------------------------------

CREATE TYPE staff_role AS ENUM (
  'admin',
  'op_manager',
  'bar_staff',
  'kitchen_staff',
  'viewer'
);

CREATE TYPE department_type AS ENUM (
  'bar',
  'kitchen'
);

CREATE TYPE closing_status AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'ADJUSTED',
  'LOCKED',
  'PENDING_APPROVAL_ADMIN'
);

-- -----------------------------------------------------------------------------
-- 1. staff
-- -----------------------------------------------------------------------------

CREATE TABLE staff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  pin_code      TEXT NOT NULL,
  role          staff_role NOT NULL,
  department    department_type,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT staff_pin_code_numeric CHECK (pin_code ~ '^[0-9]{6}$'),
  CONSTRAINT staff_department_role_check CHECK (
    (role IN ('admin', 'op_manager', 'viewer') AND department IS NULL)
    OR
    (role = 'bar_staff' AND department = 'bar')
    OR
    (role = 'kitchen_staff' AND department = 'kitchen')
  )
);

CREATE UNIQUE INDEX staff_pin_code_active_unique
  ON staff (pin_code)
  WHERE is_active = TRUE;

CREATE INDEX staff_role_idx ON staff (role);
CREATE INDEX staff_department_idx ON staff (department) WHERE department IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. ingredient
-- -----------------------------------------------------------------------------

CREATE TABLE ingredient (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  department                  department_type NOT NULL,
  unit                        TEXT NOT NULL,
  default_unit_price          NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (default_unit_price >= 0),
  current_stock               NUMERIC(14, 4) NOT NULL DEFAULT 0,
  slow_moving_threshold_days  INTEGER NOT NULL DEFAULT 30
    CHECK (slow_moving_threshold_days >= 0),
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ingredient_current_stock_non_negative CHECK (current_stock >= 0)
);

CREATE UNIQUE INDEX ingredient_name_department_active_unique
  ON ingredient (name, department)
  WHERE is_active = TRUE;

CREATE INDEX ingredient_department_idx ON ingredient (department);
CREATE INDEX ingredient_active_idx ON ingredient (department, is_active) WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- 3. menu_item
-- -----------------------------------------------------------------------------

CREATE TABLE menu_item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_name     TEXT NOT NULL,
  department    department_type NOT NULL,
  price         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

CREATE UNIQUE INDEX menu_item_name_department_active_unique
  ON menu_item (menu_name, department)
  WHERE is_active = TRUE;

CREATE INDEX menu_item_department_idx ON menu_item (department);
CREATE INDEX menu_item_active_idx ON menu_item (department, is_active) WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- 4. menu_recipe_version
-- -----------------------------------------------------------------------------

CREATE TABLE menu_recipe_version (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  UUID NOT NULL REFERENCES menu_item (id) ON DELETE RESTRICT,
  version       INTEGER NOT NULL CHECK (version > 0),
  valid_from    DATE NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT menu_recipe_version_menu_version_unique UNIQUE (menu_item_id, version)
);

-- Satu versi aktif per menu (cegah race / double-active resep)
CREATE UNIQUE INDEX menu_recipe_version_one_active_per_menu
  ON menu_recipe_version (menu_item_id)
  WHERE is_active = TRUE;

CREATE INDEX menu_recipe_version_menu_valid_from_idx
  ON menu_recipe_version (menu_item_id, valid_from DESC);

-- -----------------------------------------------------------------------------
-- 5. recipe_line
-- -----------------------------------------------------------------------------

CREATE TABLE recipe_line (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id       UUID NOT NULL REFERENCES menu_recipe_version (id) ON DELETE CASCADE,
  ingredient_id           UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  quantity_per_serving    NUMERIC(14, 4) NOT NULL CHECK (quantity_per_serving > 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recipe_line_version_ingredient_unique UNIQUE (recipe_version_id, ingredient_id)
);

CREATE INDEX recipe_line_ingredient_idx ON recipe_line (ingredient_id);

-- -----------------------------------------------------------------------------
-- 6. business_day
-- -----------------------------------------------------------------------------

CREATE TABLE business_day (
  business_date   DATE PRIMARY KEY,
  status          closing_status NOT NULL DEFAULT 'DRAFT',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX business_day_status_idx ON business_day (status);

-- -----------------------------------------------------------------------------
-- 7. stock_ledger
-- -----------------------------------------------------------------------------

CREATE TABLE stock_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date       DATE NOT NULL REFERENCES business_day (business_date) ON DELETE RESTRICT,
  ingredient_id       UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  opening_stock       NUMERIC(14, 4) NOT NULL DEFAULT 0,
  in_qty              NUMERIC(14, 4) NOT NULL DEFAULT 0,
  theoretical_usage   NUMERIC(14, 4) NOT NULL DEFAULT 0,
  adjustment_qty      NUMERIC(14, 4) NOT NULL DEFAULT 0,
  closing_stock       NUMERIC(14, 4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT stock_ledger_business_ingredient_unique UNIQUE (business_date, ingredient_id),
  CONSTRAINT stock_ledger_opening_non_negative CHECK (opening_stock >= 0),
  CONSTRAINT stock_ledger_in_non_negative CHECK (in_qty >= 0),
  CONSTRAINT stock_ledger_theoretical_non_negative CHECK (theoretical_usage >= 0),
  CONSTRAINT stock_ledger_closing_formula CHECK (
    closing_stock = opening_stock + in_qty - theoretical_usage + adjustment_qty
  )
);

CREATE INDEX stock_ledger_business_date_idx ON stock_ledger (business_date);
CREATE INDEX stock_ledger_ingredient_idx ON stock_ledger (ingredient_id);

-- -----------------------------------------------------------------------------
-- 8. worksheet_session
-- -----------------------------------------------------------------------------

CREATE TABLE worksheet_session (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date           DATE NOT NULL REFERENCES business_day (business_date) ON DELETE RESTRICT,
  department              department_type NOT NULL,
  status                  closing_status NOT NULL DEFAULT 'DRAFT',
  submitted_at            TIMESTAMPTZ,
  submitted_by_staff_id   UUID REFERENCES staff (id) ON DELETE SET NULL,
  locked_at               TIMESTAMPTZ,
  locked_by_staff_id      UUID REFERENCES staff (id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Satu session per departemen per hari pembukuan (anti race duplicate session)
  CONSTRAINT worksheet_session_business_department_unique UNIQUE (business_date, department),

  CONSTRAINT worksheet_session_submitted_requires_staff CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL AND submitted_by_staff_id IS NULL)
    OR (status IN ('SUBMITTED', 'ADJUSTED', 'LOCKED') AND submitted_at IS NOT NULL AND submitted_by_staff_id IS NOT NULL)
  ),

  CONSTRAINT worksheet_session_locked_requires_timestamp CHECK (
    (status <> 'LOCKED' AND locked_at IS NULL AND locked_by_staff_id IS NULL)
    OR (status = 'LOCKED' AND locked_at IS NOT NULL AND locked_by_staff_id IS NOT NULL)
  )
);

CREATE INDEX worksheet_session_status_idx ON worksheet_session (business_date, status);
CREATE INDEX worksheet_session_department_idx ON worksheet_session (department);

-- -----------------------------------------------------------------------------
-- 9. worksheet_in_line
-- -----------------------------------------------------------------------------

CREATE TABLE worksheet_in_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  quantity        NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_price      NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total      NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worksheet_in_line_session_ingredient_unique UNIQUE (session_id, ingredient_id)
);

CREATE INDEX worksheet_in_line_session_idx ON worksheet_in_line (session_id);

-- -----------------------------------------------------------------------------
-- 10. worksheet_sold_line
-- -----------------------------------------------------------------------------

CREATE TABLE worksheet_sold_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  menu_item_id    UUID NOT NULL REFERENCES menu_item (id) ON DELETE RESTRICT,
  quantity_sold   NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worksheet_sold_line_session_menu_unique UNIQUE (session_id, menu_item_id)
);

CREATE INDEX worksheet_sold_line_session_idx ON worksheet_sold_line (session_id);

-- -----------------------------------------------------------------------------
-- updated_at trigger (konsisten di semua tabel)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_set_updated_at
  BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ingredient_set_updated_at
  BEFORE UPDATE ON ingredient FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER menu_item_set_updated_at
  BEFORE UPDATE ON menu_item FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER menu_recipe_version_set_updated_at
  BEFORE UPDATE ON menu_recipe_version FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER recipe_line_set_updated_at
  BEFORE UPDATE ON recipe_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER business_day_set_updated_at
  BEFORE UPDATE ON business_day FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER stock_ledger_set_updated_at
  BEFORE UPDATE ON stock_ledger FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER worksheet_session_set_updated_at
  BEFORE UPDATE ON worksheet_session FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER worksheet_in_line_set_updated_at
  BEFORE UPDATE ON worksheet_in_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER worksheet_sold_line_set_updated_at
  BEFORE UPDATE ON worksheet_sold_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Validasi: bahan & menu harus satu departemen dengan worksheet session
-- (mencegah input cross-department di level database)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assert_worksheet_in_line_department_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_department department_type;
  v_ingredient_department department_type;
BEGIN
  SELECT ws.department, i.department
  INTO v_session_department, v_ingredient_department
  FROM worksheet_session ws
  JOIN ingredient i ON i.id = NEW.ingredient_id
  WHERE ws.id = NEW.session_id;

  IF v_session_department IS DISTINCT FROM v_ingredient_department THEN
    RAISE EXCEPTION 'ingredient department (%) does not match worksheet session department (%)',
      v_ingredient_department, v_session_department;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER worksheet_in_line_department_match
  BEFORE INSERT OR UPDATE ON worksheet_in_line
  FOR EACH ROW EXECUTE FUNCTION assert_worksheet_in_line_department_match();

CREATE OR REPLACE FUNCTION assert_worksheet_sold_line_department_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_department department_type;
  v_menu_department department_type;
BEGIN
  SELECT ws.department, m.department
  INTO v_session_department, v_menu_department
  FROM worksheet_session ws
  JOIN menu_item m ON m.id = NEW.menu_item_id
  WHERE ws.id = NEW.session_id;

  IF v_session_department IS DISTINCT FROM v_menu_department THEN
    RAISE EXCEPTION 'menu_item department (%) does not match worksheet session department (%)',
      v_menu_department, v_session_department;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER worksheet_sold_line_department_match
  BEFORE INSERT OR UPDATE ON worksheet_sold_line
  FOR EACH ROW EXECUTE FUNCTION assert_worksheet_sold_line_department_match();

-- -----------------------------------------------------------------------------
-- Comments (dokumentasi operasional)
-- -----------------------------------------------------------------------------

COMMENT ON TABLE staff IS 'Staf outlet; pin_code 6 digit — hash di aplikasi sebelum production hardening.';
COMMENT ON TABLE business_day IS 'Hari pembukuan; business_date dari resolveBusinessDate() (cutoff 05:00).';
COMMENT ON TABLE worksheet_session IS 'State machine closing per departemen per business_date.';
COMMENT ON TABLE stock_ledger IS 'Ledger harian per bahan; closing_stock = opening + in - theoretical + adjustment.';
COMMENT ON COLUMN ingredient.current_stock IS 'Cache operasional; kebenaran harian ada di stock_ledger.';
