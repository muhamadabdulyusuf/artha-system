-- Approval flow for editing submitted worksheet sessions.

CREATE TABLE IF NOT EXISTS worksheet_edit_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES worksheet_session (id) ON DELETE CASCADE,
  business_date DATE NOT NULL REFERENCES business_day (business_date) ON DELETE RESTRICT,
  department department_type NOT NULL,
  requested_by_staff_id UUID REFERENCES staff (id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by_staff_id UUID REFERENCES staff (id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worksheet_edit_request_reason_required CHECK (length(trim(reason)) >= 5),
  CONSTRAINT worksheet_edit_request_review_consistency CHECK (
    (status = 'PENDING' AND reviewed_by_staff_id IS NULL AND reviewed_at IS NULL)
    OR (status IN ('APPROVED', 'REJECTED') AND reviewed_by_staff_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS worksheet_edit_request_status_idx
  ON worksheet_edit_request (status, created_at DESC);

CREATE INDEX IF NOT EXISTS worksheet_edit_request_session_idx
  ON worksheet_edit_request (session_id);

CREATE UNIQUE INDEX IF NOT EXISTS worksheet_edit_request_one_pending_per_session_staff_idx
  ON worksheet_edit_request (session_id, requested_by_staff_id)
  WHERE status = 'PENDING';

CREATE TRIGGER worksheet_edit_request_set_updated_at
  BEFORE UPDATE ON worksheet_edit_request
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE worksheet_edit_request IS
  'Staff requests to reopen a submitted worksheet. Admin approval is required before edits.';
