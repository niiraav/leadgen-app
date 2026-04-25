-- Phase 1: Add status column to sequence_step_executions + partial unique index on sequence_enrollments

-- 1. Add status column with default 'sent'
ALTER TABLE sequence_step_executions
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

-- 2. Backfill existing rows
UPDATE sequence_step_executions SET status = 'sent' WHERE status IS NULL;

-- 3. Deduplicate sequence_enrollments before adding partial unique index (keep oldest per lead+sequence)
DELETE FROM sequence_enrollments a USING sequence_enrollments b
WHERE a.id > b.id
  AND a.sequence_id = b.sequence_id
  AND a.lead_id = b.lead_id;

-- 4. Partial unique index to prevent duplicate active/paused enrollments
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_enrollment
  ON sequence_enrollments (sequence_id, lead_id)
  WHERE status IN ('active', 'paused');
