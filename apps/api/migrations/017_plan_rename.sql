-- Sprint 8: Rename legacy plan values (starter → outreach, pro → growth)
-- Run AFTER all code changes are deployed (code no longer references starter/pro)

-- ── profiles.plan ────────────────────────────────────────────────────────
UPDATE profiles
SET plan = 'outreach'
WHERE plan = 'starter';

UPDATE profiles
SET plan = 'growth'
WHERE plan = 'pro';

-- ── subscriptions.plan ───────────────────────────────────────────────────
UPDATE subscriptions
SET plan = 'outreach'
WHERE plan = 'starter';

UPDATE subscriptions
SET plan = 'growth'
WHERE plan = 'pro';

-- ── Verify no legacy values remain ───────────────────────────────────────
-- (These will return 0 if migration succeeded)
-- SELECT count(*) FROM profiles WHERE plan IN ('starter', 'pro');
-- SELECT count(*) FROM subscriptions WHERE plan IN ('starter', 'pro');
