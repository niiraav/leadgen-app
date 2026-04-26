-- Drop orphaned credit columns from subscriptions table (Phase 2 billing consolidation)
-- These columns are superseded by usage_tracking + tiers.ts
-- Apply via Supabase SQL Editor before restarting the API

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS lead_credits_used,
  DROP COLUMN IF EXISTS lead_credits_limit,
  DROP COLUMN IF EXISTS search_credits_used,
  DROP COLUMN IF EXISTS search_credits_limit,
  DROP COLUMN IF EXISTS email_verification_credits_used,
  DROP COLUMN IF EXISTS email_verification_credits_limit,
  DROP COLUMN IF EXISTS ai_email_credits_used,
  DROP COLUMN IF EXISTS ai_email_credits_limit,
  DROP COLUMN IF EXISTS sequence_contact_credits_used,
  DROP COLUMN IF EXISTS sequence_contact_credits_limit,
  DROP COLUMN IF EXISTS credits_reset_at;
