-- Phase 2: Status Model Refactor
-- Adds domain-specific columns to split the monolithic `status` text field
-- into three orthogonal dimensions plus a compliance boolean.
--
-- All new columns are nullable (except do_not_contact which defaults false).
-- The old `status` column remains the source of truth until Phase 4 dual-write
-- is complete and Phase 6 backfill confirms completeness.
-- Do NOT drop `status` until then.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS engagement_status text,
  ADD COLUMN IF NOT EXISTS pipeline_stage text,
  ADD COLUMN IF NOT EXISTS lifecycle_state text,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false;

-- CHECK constraints enforce valid enum values at the DB level.
-- These are defensive — Zod validates at the API layer, but the DB
-- should never accept invalid values even from direct SQL.

ALTER TABLE leads ADD CONSTRAINT leads_engagement_status_check
  CHECK (engagement_status IS NULL OR engagement_status IN (
    'new', 'contacted', 'replied', 'interested', 'not_interested', 'out_of_office'
  ));

ALTER TABLE leads ADD CONSTRAINT leads_pipeline_stage_check
  CHECK (pipeline_stage IS NULL OR pipeline_stage IN (
    'qualified', 'proposal_sent', 'converted', 'lost'
  ));

ALTER TABLE leads ADD CONSTRAINT leads_lifecycle_state_check
  CHECK (lifecycle_state IS NULL OR lifecycle_state IN (
    'active', 'closed', 'archived'
  ));
