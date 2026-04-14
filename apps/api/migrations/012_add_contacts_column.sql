-- Add contacts JSONB column to leads for caching enriched contacts
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacts JSONB;
