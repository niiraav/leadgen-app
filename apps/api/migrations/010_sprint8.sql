-- ──────────────────────────────────────────────────────────────────────
-- Sprint 8  –  Migration #010
-- New columns on leads, new tables for lists/filters/history
-- ──────────────────────────────────────────────────────────────────────

-- ── NEW COLUMNS on leads ────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS full_address        TEXT,
  ADD COLUMN IF NOT EXISTS street              TEXT,
  ADD COLUMN IF NOT EXISTS city                TEXT,
  ADD COLUMN IF NOT EXISTS postal_code         TEXT,
  ADD COLUMN IF NOT EXISTS phone               TEXT,
  ADD COLUMN IF NOT EXISTS site                TEXT,
  ADD COLUMN IF NOT EXISTS category            TEXT,
  ADD COLUMN IF NOT EXISTS subtypes            TEXT[],
  ADD COLUMN IF NOT EXISTS description         TEXT,
  ADD COLUMN IF NOT EXISTS business_status     TEXT,
  ADD COLUMN IF NOT EXISTS verified            BOOLEAN,
  ADD COLUMN IF NOT EXISTS price_range         TEXT,
  ADD COLUMN IF NOT EXISTS working_hours       JSONB,
  ADD COLUMN IF NOT EXISTS photo_count         INT,
  ADD COLUMN IF NOT EXISTS latitude            NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude           NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS list_id             UUID,
  ADD COLUMN IF NOT EXISTS contact_full_name   TEXT,
  ADD COLUMN IF NOT EXISTS contact_title       TEXT,
  ADD COLUMN IF NOT EXISTS contact_email       TEXT,
  ADD COLUMN IF NOT EXISTS contact_email_type  TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone       TEXT,
  ADD COLUMN IF NOT EXISTS contact_linkedin    TEXT,
  ADD COLUMN IF NOT EXISTS company_linkedin    TEXT,
  ADD COLUMN IF NOT EXISTS domain              TEXT,
  ADD COLUMN IF NOT EXISTS company_size        TEXT,
  ADD COLUMN IF NOT EXISTS technologies        TEXT[],
  ADD COLUMN IF NOT EXISTS contact_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_enrichment_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_status        TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_bio              TEXT,
  ADD COLUMN IF NOT EXISTS ai_bio_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS source              TEXT DEFAULT 'search';

-- ── NEW TABLE: lead_lists ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#6366f1',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_lists_user ON lead_lists(user_id);

-- ── NEW TABLE: saved_filters ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_filters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  filters     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON saved_filters(user_id);

-- ── NEW TABLE: search_history ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  query         TEXT NOT NULL,
  location      TEXT NOT NULL,
  limit_count   INT DEFAULT 25,
  result_count  INT,
  params        JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id, created_at DESC);

-- ── NEW COLUMN on usage_tracking ────────────────────────────────────
ALTER TABLE usage_tracking
  ADD COLUMN IF NOT EXISTS enrichment_count INT DEFAULT 0;
