-- Sprint 10: Enrichment status tracking
-- Adds status, provider, and error fields for reliable enrichment persistence

ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_enrichment_status TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_enrichment_provider TEXT DEFAULT 'outscraper';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_enrichment_error TEXT;

-- Backfill existing enriched leads: any lead with contact_enriched_at is a past success
UPDATE leads
SET contact_enrichment_status = 'success'
WHERE contact_enriched_at IS NOT NULL AND contact_enrichment_status IS NULL;

-- Backfill attempted-but-no-data leads
UPDATE leads
SET contact_enrichment_status = 'failed'
WHERE contact_enrichment_attempted_at IS NOT NULL
  AND contact_enriched_at IS NULL
  AND contact_enrichment_status IS NULL;
