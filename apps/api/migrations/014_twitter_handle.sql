-- Add twitter_handle column for storing Twitter/X profile from enrichment
ALTER TABLE leads ADD COLUMN IF NOT EXISTS twitter_handle TEXT;
