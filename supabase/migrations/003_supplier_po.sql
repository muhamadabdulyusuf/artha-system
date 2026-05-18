-- Supplier master, harga bahan (COGS), dan purchase order untuk OPS Manager

CREATE TABLE supplier (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  min_order_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX supplier_name_active_unique ON supplier (name) WHERE is_active = TRUE;

CREATE TABLE supplier_ingredient_price (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES supplier (id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  unit_price      NUMERIC(14, 4) NOT NULL CHECK (unit_price >= 0),
  valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT supplier_ingredient_price_unique UNIQUE (supplier_id, ingredient_id, valid_from)
);

CREATE INDEX supplier_ingredient_price_ingredient_idx ON supplier_ingredient_price (ingredient_id, valid_from DESC);

CREATE TABLE purchase_order (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       UUID NOT NULL REFERENCES supplier (id) ON DELETE RESTRICT,
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'CANCELLED')),
  total_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by_staff_id UUID REFERENCES staff (id) ON DELETE SET NULL,
  submitted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_order (id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  quantity        NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(14, 4) NOT NULL CHECK (unit_price >= 0),
  line_total      NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT purchase_order_line_po_ingredient_unique UNIQUE (purchase_order_id, ingredient_id)
);

CREATE TRIGGER supplier_set_updated_at
  BEFORE UPDATE ON supplier FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER supplier_ingredient_price_set_updated_at
  BEFORE UPDATE ON supplier_ingredient_price FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER purchase_order_set_updated_at
  BEFORE UPDATE ON purchase_order FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER purchase_order_line_set_updated_at
  BEFORE UPDATE ON purchase_order_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE supplier IS 'Master supplier; min_order_amount untuk validasi PO OPS Manager.';
COMMENT ON TABLE supplier_ingredient_price IS 'Riwayat harga bahan per supplier — dipakai Live COGS Monitor.';
COMMENT ON TABLE purchase_order IS 'Purchase order ke supplier; status SUBMITTED setelah kirim.';
