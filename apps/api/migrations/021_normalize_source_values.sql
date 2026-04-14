-- Phase 4: Normalize source values to match TS LeadSource union
-- ('serpapi' | 'outscraper' | 'csv' | 'apollo' | 'manual')
--
-- Context: Before the Outscraper migration (Phase 2), leads were saved
-- with source='search' (Outscraper leads) and source='google-maps'
-- (legacy search page label). Neither value is in the current TS type
-- union. This migration aligns DB data with code expectations.
--
-- Rationale:
--   'search' → 'outscraper': 77 leads with ChIJ place_ids, no data_id.
--     These are Outscraper leads saved before Phase 2 field-forwarding.
--   'google-maps' → 'outscraper': 13 leads with both place_id and data_id.
--     These came from the /search/google-maps page, which used Outscraper.
--   'test' → 'manual': 2 test/seed leads. 'manual' is the closest valid value.
--
-- Source is display/audit only — no code gates on it. Zero runtime risk.

BEGIN;

-- 'search' → 'outscraper' (expected: 77 rows)
UPDATE leads
SET source = 'outscraper', updated_at = NOW()
WHERE source = 'search';

-- 'google-maps' → 'outscraper' (expected: 13 rows)
UPDATE leads
SET source = 'outscraper', updated_at = NOW()
WHERE source = 'google-maps';

-- 'test' → 'manual' (expected: 2 rows)
UPDATE leads
SET source = 'manual', updated_at = NOW()
WHERE source = 'test';

COMMIT;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────
-- To reverse this migration, run the following (only if no new leads
-- have been created with source='outscraper' since this migration):
--
-- BEGIN;
-- -- Recover 'search' leads: Outscraper leads with place_id but no data_id
-- UPDATE leads SET source = 'search', updated_at = NOW()
-- WHERE source = 'outscraper' AND place_id IS NOT NULL AND data_id IS NULL;
-- -- Recover 'google-maps' leads: Outscraper leads with both identifiers
-- UPDATE leads SET source = 'google-maps', updated_at = NOW()
-- WHERE source = 'outscraper' AND place_id IS NOT NULL AND data_id IS NOT NULL;
-- -- Recover 'test' leads: manual leads created before this migration
-- UPDATE leads SET source = 'test', updated_at = NOW()
-- WHERE id IN ('<insert-test-lead-ids>');
-- COMMIT;
