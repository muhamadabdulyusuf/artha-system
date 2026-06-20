-- Persistent business memory for Artha AI.
-- Stores operational notes supplied by staff so the assistant becomes more contextual over time.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS ai_business_memory (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL DEFAULT '',
  content               TEXT NOT NULL,
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  department            department_type,
  importance            INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  source                TEXT NOT NULL DEFAULT 'assistant',
  created_by_staff_id   UUID REFERENCES staff (id) ON DELETE SET NULL,
  archived_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_business_memory_content_check CHECK (length(trim(content)) >= 3)
);

CREATE INDEX IF NOT EXISTS ai_business_memory_active_created_idx
  ON ai_business_memory (archived_at, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_business_memory_department_idx
  ON ai_business_memory (department)
  WHERE department IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS ai_business_memory_tags_idx
  ON ai_business_memory USING GIN (tags);

DROP TRIGGER IF EXISTS ai_business_memory_set_updated_at ON ai_business_memory;

CREATE TRIGGER ai_business_memory_set_updated_at
  BEFORE UPDATE ON ai_business_memory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE ai_business_memory IS
  'Persistent notes for Artha AI. Staff can teach business context such as supplier habits, menu caveats, reorder rules, and operational preferences.';
