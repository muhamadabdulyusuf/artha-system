-- Track demand events imported from external calendars, such as Indonesia public holidays.

ALTER TABLE demand_event
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS demand_event_source_external_id_unique
  ON demand_event (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS demand_event_source_idx
  ON demand_event (source);
