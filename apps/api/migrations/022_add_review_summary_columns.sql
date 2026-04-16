-- Reviews enrichment: add review_summary and reviews_fetched_at columns
--
-- Context: AI Insights feature fetches Google Maps reviews via Outscraper,
-- extracts insights (owner name, staff, themes, pain points, USPs) via LLM,
-- and caches the structured summary for 7 days. These columns persist that
-- cached data so repeated views don't re-fetch.

BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS review_summary JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reviews_fetched_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN leads.review_summary IS 'Structured review insights from Outscraper + LLM (owner_name, staff_names, themes, pain_points, usp_candidates, etc.)';
COMMENT ON COLUMN leads.reviews_fetched_at IS 'Timestamp of last review fetch — used for 7-day cache';

COMMIT;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────
-- BEGIN;
-- ALTER TABLE leads DROP COLUMN IF EXISTS review_summary;
-- ALTER TABLE leads DROP COLUMN IF EXISTS reviews_fetched_at;
-- COMMIT;
