-- Phase 1: Add status to sequence_step_executions + backfill + partial unique index

-- 1a. Add status column
ALTER TABLE sequence_step_executions
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'));

-- 1b. Backfill from historical events (mailgun_events + webhook_events)
UPDATE sequence_step_executions sse
SET status = 'sent'
WHERE EXISTS (
  SELECT 1 FROM mailgun_events me
  WHERE me.enrollment_id = sse.enrollment_id
    AND me.step_order = sse.step_order
    AND me.event IN ('accepted', 'delivered')
);

UPDATE sequence_step_executions sse
SET status = 'delivered'
WHERE status = 'sent'
  AND EXISTS (
    SELECT 1 FROM webhook_events we
    WHERE we.enrollment_id = sse.enrollment_id
      AND we.step_order = sse.step_order
      AND we.event_type = 'delivered'
  );

UPDATE sequence_step_executions sse
SET status = 'failed'
WHERE status = 'pending'
  AND EXISTS (
    SELECT 1 FROM mailgun_events me
    WHERE me.enrollment_id = sse.enrollment_id
      AND me.step_order = sse.step_order
      AND me.event IN ('failed', 'rejected', 'bounce')
  );

-- 1c. Partial unique index to prevent duplicate active executions
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_execution
  ON sequence_step_executions (enrollment_id, step_order)
  WHERE status IN ('pending', 'sent');
