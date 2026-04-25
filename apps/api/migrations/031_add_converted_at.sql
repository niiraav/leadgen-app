-- Migration 031: Add converted_at timestamp for accurate win tracking
-- Separated from deal value so existing converted leads can be backfilled if needed.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- Index for fast monthly win queries
CREATE INDEX IF NOT EXISTS idx_leads_converted_at ON leads(user_id, converted_at) WHERE converted_at IS NOT NULL;
