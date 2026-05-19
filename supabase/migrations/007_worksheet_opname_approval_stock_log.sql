-- Worksheet opname approval, stock audit log, extended closing status

ALTER TYPE closing_status ADD VALUE 'PENDING_APPROVAL_ADMIN';

CREATE TYPE stock_log_event_type AS ENUM (
  'RECEIVE',
  'OUTSTOCK',
  'OPNAME',
  'CLOSING',
  'ADJUSTMENT'
);

CREATE TYPE opname_pending_status AS ENUM (
  'PENDING_APPROVAL_ADMIN',
  'APPROVED',
  'REJECTED'
);

-- Immutable audit trail for stock changes (append-only semantics in app layer)
CREATE TABLE stock_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id       UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  business_date       DATE,
  event_type          stock_log_event_type NOT NULL,
  qty_before          NUMERIC(14, 4) NOT NULL,
  qty_after           NUMERIC(14, 4) NOT NULL,
  reason              TEXT,
  message             TEXT NOT NULL,
  worksheet_session_id UUID REFERENCES worksheet_session (id) ON DELETE SET NULL,
  created_by_staff_id UUID REFERENCES staff (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stock_log_ingredient_idx ON stock_log (ingredient_id);
CREATE INDEX stock_log_business_date_idx ON stock_log (business_date);
CREATE INDEX stock_log_event_type_idx ON stock_log (event_type);
CREATE INDEX stock_log_created_at_idx ON stock_log (created_at DESC);

-- Opname lines held for admin review when variance exceeds threshold
CREATE TABLE worksheet_opname_pending (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  business_date       DATE NOT NULL REFERENCES business_day (business_date) ON DELETE RESTRICT,
  ingredient_id       UUID NOT NULL REFERENCES ingredient (id) ON DELETE RESTRICT,
  system_stock        NUMERIC(14, 4) NOT NULL,
  physical_stock      NUMERIC(14, 4) NOT NULL,
  variance_qty        NUMERIC(14, 4) NOT NULL,
  variance_pct        NUMERIC(8, 4) NOT NULL,
  status              opname_pending_status NOT NULL DEFAULT 'PENDING_APPROVAL_ADMIN',
  submitted_by_staff_id UUID REFERENCES staff (id) ON DELETE SET NULL,
  reviewed_by_staff_id  UUID REFERENCES staff (id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  review_note         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worksheet_opname_pending_session_ingredient_unique
    UNIQUE (session_id, ingredient_id)
);

CREATE INDEX worksheet_opname_pending_status_idx ON worksheet_opname_pending (status);
CREATE INDEX worksheet_opname_pending_business_date_idx ON worksheet_opname_pending (business_date);

CREATE TRIGGER worksheet_opname_pending_set_updated_at
  BEFORE UPDATE ON worksheet_opname_pending
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Izinkan PENDING_APPROVAL_ADMIN dengan timestamp & staff penanggung jawab
ALTER TABLE worksheet_session
  DROP CONSTRAINT IF EXISTS worksheet_session_submitted_requires_staff;

ALTER TABLE worksheet_session
  ADD CONSTRAINT worksheet_session_submitted_requires_staff CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL AND submitted_by_staff_id IS NULL)
    OR (
      status IN ('SUBMITTED', 'ADJUSTED', 'LOCKED', 'PENDING_APPROVAL_ADMIN')
      AND submitted_at IS NOT NULL
      AND submitted_by_staff_id IS NOT NULL
    )
  );
