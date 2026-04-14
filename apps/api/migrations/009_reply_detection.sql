-- Sprint 7: Reply detection, intent labelling, and sequence step execution tracking

-- ============================================================
-- 1. sequence_step_executions table
-- ============================================================
CREATE TABLE IF NOT EXISTS sequence_step_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  enrolment_id UUID NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  subject TEXT,
  body_plain TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  mailgun_message_id TEXT,
  sent_via TEXT DEFAULT 'mailgun' CHECK (sent_via IN ('mailgun', 'mailto')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sequence_step_executions_enrolment_id
  ON sequence_step_executions(enrolment_id);
CREATE INDEX IF NOT EXISTS idx_sequence_step_executions_user_id
  ON sequence_step_executions(user_id);

-- ============================================================
-- 2. sequence_enrollments: add paused_reason column
-- ============================================================
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS paused_reason TEXT;

-- ============================================================
-- 3. leads: add reply-detection columns
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS hot_score INT DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_reply_intent TEXT;
  -- expected values: 'interested'|'not_now'|'not_interested'|'question'|'objection'|'referral'|'other'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_note TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS suggested_reply_draft TEXT;

-- ============================================================
-- 4. reply_events table
-- ============================================================
CREATE TABLE IF NOT EXISTS reply_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  enrolment_id UUID REFERENCES sequence_enrollments(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  mailgun_message_id TEXT UNIQUE,
  in_reply_to TEXT,
  subject TEXT,
  body_plain TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL DEFAULT 'reply'
    CHECK (type IN ('reply', 'out_of_office', 'bounce_hard', 'bounce_soft', 'unsubscribe')),
  intent_label TEXT
    -- 'interested'|'not_now'|'not_interested'|'question'|'objection'|'referral'|'other'
    CHECK (intent_label IN (
      'interested', 'not_now', 'not_interested',
      'question', 'objection', 'referral', 'other'
    )),
  sentiment_score INT,
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high')),
  confidence INT,
  suggested_next_action TEXT,
  key_phrase TEXT,
  needs_review BOOLEAN DEFAULT FALSE,
  user_corrected_label TEXT,
  reenrol_at TIMESTAMPTZ,
  hot_score INT DEFAULT 0,
  processed_at TIMESTAMPTZ,
  processing_duration_ms INT,
  inngest_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reply_events_lead_id ON reply_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_reply_events_user_id ON reply_events(user_id);
CREATE INDEX IF NOT EXISTS idx_reply_events_type ON reply_events(type);
CREATE INDEX IF NOT EXISTS idx_reply_events_intent_label ON reply_events(intent_label);
CREATE INDEX IF NOT EXISTS idx_reply_events_needs_review
  ON reply_events(needs_review) WHERE needs_review = TRUE;

-- ============================================================
-- 5. label_corrections table
-- ============================================================
CREATE TABLE IF NOT EXISTS label_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_event_id UUID NOT NULL REFERENCES reply_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_label TEXT NOT NULL,
  corrected_label TEXT NOT NULL,
  body_hash TEXT,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. Row Level Security (RLS)
-- ============================================================

-- sequence_step_executions
ALTER TABLE sequence_step_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sequence step executions"
  ON sequence_step_executions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own sequence step executions"
  ON sequence_step_executions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sequence step executions"
  ON sequence_step_executions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sequence step executions"
  ON sequence_step_executions FOR DELETE
  USING (user_id = auth.uid());

-- reply_events
ALTER TABLE reply_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reply events"
  ON reply_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own reply events"
  ON reply_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own reply events"
  ON reply_events FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own reply events"
  ON reply_events FOR DELETE
  USING (user_id = auth.uid());

-- label_corrections
ALTER TABLE label_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own label corrections"
  ON label_corrections FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own label corrections"
  ON label_corrections FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own label corrections"
  ON label_corrections FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own label corrections"
  ON label_corrections FOR DELETE
  USING (user_id = auth.uid());
