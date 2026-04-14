-- Sprint 8: Subscriptions table + Credit transactions table
-- Required by the billing webhook handler

-- ── subscriptions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT UNIQUE NOT NULL,
  stripe_customer_id      TEXT,
  plan                    TEXT NOT NULL DEFAULT 'free',
  status                  TEXT NOT NULL DEFAULT 'none',
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  trial_starts_at         TIMESTAMPTZ,
  trial_ends_at           TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN DEFAULT FALSE,
  grace_period_ends_at    TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- ── credit_transactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  amount      INTEGER DEFAULT 0,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id, created_at DESC);
