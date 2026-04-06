-- Sprint 6: User profile system
-- No "users" table exists — we use Supabase Auth. Store profiles separately.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  full_name TEXT,
  company_name TEXT,
  role TEXT,
  services TEXT[] DEFAULT '{}',
  custom_services TEXT[] DEFAULT '{}',
  usp TEXT,
  tone TEXT DEFAULT 'professional',
  signoff_style TEXT DEFAULT 'Best regards',
  cta_preference TEXT DEFAULT 'reply to this email',
  target_geography TEXT,
  target_categories TEXT[] DEFAULT '{}',
  working_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  working_hours_start TIME DEFAULT '09:00',
  working_hours_end TIME DEFAULT '18:00',
  sales_cycle_days INTEGER DEFAULT 14,
  onboarding_step INTEGER DEFAULT 0,
  profile_complete BOOLEAN DEFAULT FALSE,
  average_deal_value INTEGER,
  calendly_link TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, user_email, onboarding_step)
  VALUES (NEW.id, NEW.email, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on Supabase auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill existing users
INSERT INTO profiles (id, user_email, onboarding_step)
SELECT id, email, 0
FROM auth.users
ON CONFLICT (id) DO NOTHING;
