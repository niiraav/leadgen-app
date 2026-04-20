-- Phase 3: Add `field` column to lead_activities
-- Tracks which domain changed when type = 'status_changed'.
-- Allowed values: 'engagement_status', 'pipeline_stage', 'lifecycle_state', 'do_not_contact'
-- Nullable — existing rows without a field value continue to render as legacy "Status changed".
-- Do NOT backfill old rows.

ALTER TABLE lead_activities
  ADD COLUMN IF NOT EXISTS field text;

-- CHECK constraint: only valid domain names (or null) are allowed.
ALTER TABLE lead_activities ADD CONSTRAINT lead_activities_field_check
  CHECK (field IS NULL OR field IN (
    'engagement_status', 'pipeline_stage', 'lifecycle_state', 'do_not_contact'
  ));
