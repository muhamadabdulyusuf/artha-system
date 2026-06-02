-- Restore explicit LOCKED state for worksheet sessions that were already submitted.
-- SUBMITTED was already treated as locked in the app, but the operational flow expects
-- the persisted state to be LOCKED after final submit.

UPDATE worksheet_session
SET
  status = 'LOCKED',
  locked_at = COALESCE(locked_at, submitted_at, updated_at, NOW()),
  locked_by_staff_id = COALESCE(locked_by_staff_id, submitted_by_staff_id)
WHERE status = 'SUBMITTED'
  AND submitted_at IS NOT NULL
  AND submitted_by_staff_id IS NOT NULL;

UPDATE business_day bd
SET status = 'PENDING_APPROVAL_ADMIN'
WHERE EXISTS (
  SELECT 1
  FROM worksheet_session ws
  WHERE ws.business_date = bd.business_date
    AND ws.status = 'PENDING_APPROVAL_ADMIN'
);

UPDATE business_day bd
SET status = 'LOCKED'
WHERE NOT EXISTS (
  SELECT 1
  FROM worksheet_session ws
  WHERE ws.business_date = bd.business_date
    AND ws.status IN ('DRAFT', 'PENDING_APPROVAL_ADMIN')
)
AND EXISTS (
  SELECT 1
  FROM worksheet_session ws
  WHERE ws.business_date = bd.business_date
    AND ws.status = 'LOCKED'
);
