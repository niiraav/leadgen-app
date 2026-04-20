-- Sprint 3: Add missing columns to lead_activities for lastActivity resolution
-- Adds: label (human-readable), timestamp (activity event time), 
--       reply_intent (nullable, for replied/reply_classified), triggered_by (source trigger)

ALTER TABLE lead_activities
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS reply_intent TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by TEXT;

-- Backfill label from description for existing rows where label is null
UPDATE lead_activities
SET label = COALESCE(description, type)
WHERE label IS NULL;

-- Backfill timestamp from created_at for existing rows where timestamp is null
UPDATE lead_activities
SET timestamp = created_at
WHERE timestamp IS NULL;

-- Add index on timestamp for sorting in resolveLastActivity
CREATE INDEX IF NOT EXISTS idx_lead_activities_timestamp ON lead_activities(timestamp DESC);
