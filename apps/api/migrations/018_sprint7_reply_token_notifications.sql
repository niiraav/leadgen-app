-- Sprint 7: Reply tokens + Notifications

-- ============================================================
-- 1. Add reply_token column to leads
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reply_token TEXT UNIQUE;

-- Generate reply_token for all existing leads that don't have one
UPDATE leads SET reply_token = encode(gen_random_bytes(12), 'hex')
WHERE reply_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_reply_token ON leads(reply_token);

-- ============================================================
-- 2. Notifications table
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  type       TEXT NOT NULL,   -- reply_received | reply_classified | lead_moved
  title      TEXT NOT NULL,
  body       TEXT,
  lead_id    UUID REFERENCES leads(id) ON DELETE SET NULL,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read)
  WHERE read = FALSE;

-- ============================================================
-- 3. RLS for notifications
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own notifications"
  ON notifications FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());
