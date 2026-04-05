-- ==========================================
-- Add user_id to all tables for auth scoping
-- ==========================================

-- Add user_id to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to lead_activities
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to sequences
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to sequence_steps
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ==========================================
-- Enable Row Level Security
-- ==========================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS Policies — users can only access their own data
-- ==========================================

-- leads policies
CREATE POLICY "Users can view their own leads"
  ON leads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own leads"
  ON leads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own leads"
  ON leads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own leads"
  ON leads FOR DELETE
  USING (user_id = auth.uid());

-- lead_activities policies
CREATE POLICY "Users can view their own lead activities"
  ON lead_activities FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own lead activities"
  ON lead_activities FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- sequences policies
CREATE POLICY "Users can view their own sequences"
  ON sequences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own sequences"
  ON sequences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sequences"
  ON sequences FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own sequences"
  ON sequences FOR DELETE
  USING (user_id = auth.uid());

-- sequence_steps policies
CREATE POLICY "Users can view their own sequence steps"
  ON sequence_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own sequence steps"
  ON sequence_steps FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sequences s
      WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()
    )
  );

-- ==========================================
-- Index for user_id lookups
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_user_id ON lead_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_sequences_user_id ON sequences(user_id);

-- ==========================================
-- Google OAuth: ensure service role key is set for server-side auth
-- This needs to be done in Supabase Dashboard > Settings > API > service_role key
-- For local dev with Google OAuth, configure in Supabase Dashboard > Auth > Providers > Google
-- ==========================================
