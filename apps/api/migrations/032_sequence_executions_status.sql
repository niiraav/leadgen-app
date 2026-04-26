-- Phase 1: Add status to sequence_step_executions + partial unique index
-- Note: mailgun_events/webhook_events tables do not exist in this schema,
-- so no backfill from historical events is needed.

-- 1a. Add status column
ALTER TABLE sequence_step_executions
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'));

-- 1b. Partial unique index to prevent duplicate active executions
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_execution
  ON sequence_step_executions (enrolment_id, step_number)
  WHERE status IN ('pending', 'sent');
