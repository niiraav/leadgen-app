-- Sprint P2 Migration: Follow-up dates, deal values, and loss reasons

-- 1. Add follow_up_date (ISO timestamp)
ALTER TABLE leads ADD COLUMN follow_up_date TEXT DEFAULT NULL;

-- 2. Add follow_up_source enum (NULL, 'manual', 'auto_reply', 'auto_pipeline')
ALTER TABLE leads ADD COLUMN follow_up_source TEXT DEFAULT NULL;

-- 3. Add deal_value (GBP, stored as pence integer to avoid floating-point)
ALTER TABLE leads ADD COLUMN deal_value INTEGER DEFAULT NULL;

-- 4. Add loss_reason enum (NULL, 'no_budget', 'went_silent', 'chose_competitor', 'unqualified', 'other')
ALTER TABLE leads ADD COLUMN loss_reason TEXT DEFAULT NULL;

-- 5. Index for the "Due Today" filter
CREATE INDEX idx_leads_user_follow_up ON leads(user_id, follow_up_date)
WHERE follow_up_date IS NOT NULL AND lifecycle_state NOT IN ('won', 'lost');

-- 6. Index for loss_reason (for analytics)
CREATE INDEX idx_leads_loss_reason ON leads(loss_reason)
WHERE loss_reason IS NOT NULL;

-- 7. Backfill activities with legacy type names (Day 2 backfill)
UPDATE lead_activities SET type = 'emailed'
  WHERE type IN ('email_sent', 'email_drafted_sent');
UPDATE lead_activities SET type = 'updated'
  WHERE type = 'lead_updated';
UPDATE lead_activities SET type = 'created'
  WHERE type = 'lead_created';
UPDATE lead_activities SET type = 'enriched'
  WHERE type = 'lead_enriched';
UPDATE lead_activities SET type = 'status_changed'
  WHERE type = 'status_change';
