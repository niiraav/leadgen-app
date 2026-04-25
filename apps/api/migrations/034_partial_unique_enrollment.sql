-- Phase 7: Duplicate enrollment guard — partial unique index
-- Prevents duplicate active/paused enrollments for the same lead+sequence

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_enrollment
  ON sequence_enrollments (lead_id, sequence_id)
  WHERE is_failed = false AND is_paused = false;
