-- Sprint: Message templates + Message sends tables
-- Used for outbound messaging (WhatsApp / SMS) with daily quota tracking

-- ── message_templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  message     TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_user ON message_templates(user_id);

-- ── message_sends ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  template_id   UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_sends_user_created ON message_sends(user_id, created_at);

-- ── RLS policies ───────────────────────────────────────────────────────────────
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own templates" ON message_templates;
CREATE POLICY "Users can manage own templates" ON message_templates
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE message_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own sends" ON message_sends;
CREATE POLICY "Users can manage own sends" ON message_sends
  FOR ALL USING (auth.uid() = user_id);

-- ── Helper function: increment_template_usage ──────────────────────────────────
CREATE OR REPLACE FUNCTION increment_template_usage(p_template_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE message_templates
  SET usage_count = usage_count + 1, updated_at = now()
  WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Add message_sends_count to usage_tracking ─────────────────────────────────
ALTER TABLE usage_tracking ADD COLUMN IF NOT EXISTS message_sends_count INTEGER NOT NULL DEFAULT 0;
