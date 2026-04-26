-- Phase 7: Duplicate enrollment guard — partial unique index
-- Prevents duplicate active/paused enrollments for the same lead+sequence
-- Note: sequence_enrollments uses status column (active|paused|completed|replied|failed)
-- instead of is_failed/is_paused booleans.

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_enrollment
  ON sequence_enrollments (lead_id, sequence_id)
  WHERE status IN ('active', 'paused');
