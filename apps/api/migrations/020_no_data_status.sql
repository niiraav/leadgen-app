-- Sprint 11: Add 'no_data' enrichment status
-- Distinguishes "provider returned zero contacts" from genuine technical failures.
-- The contact_enrichment_status column is TEXT (no CHECK constraint), so 'no_data'
-- is already valid. This migration backfills existing rows.

-- Backfill: leads marked 'failed' with "No contacts found" error → 'no_data'
UPDATE leads
SET contact_enrichment_status = 'no_data',
    contact_enrichment_error = 'No public contacts found for this lead'
WHERE contact_enrichment_status = 'failed'
  AND contact_enrichment_error IS NOT NULL
  AND contact_enrichment_error LIKE '%No contact%found%';
