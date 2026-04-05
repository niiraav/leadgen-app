-- ==========================================
-- Email Sequence Scheduling Engine
-- ==========================================

-- Ensure sequences table has all needed columns
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- sequence_steps table
CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delay_days INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- sequence_enrollments table
CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  user_id UUID,
  current_step INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  next_step_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- ==========================================
-- Row Level Security
-- ==========================================

ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- sequence_steps policies
CREATE POLICY "Users manage their sequence steps" ON sequence_steps FOR ALL
  USING (
    EXISTS (SELECT 1 FROM sequences s WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM sequences s WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid())
  );

-- sequence_enrollments policies
CREATE POLICY "Users view their enrollments" ON sequence_enrollments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users manage their enrollments" ON sequence_enrollments FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sequences_user_id ON sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence_id ON sequence_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_lead_id ON sequence_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_sequence_id ON sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_user_id ON sequence_enrollments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_next_step ON sequence_enrollments(next_step_at)
  WHERE status = 'active';
