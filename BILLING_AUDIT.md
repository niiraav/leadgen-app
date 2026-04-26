# LeadGen Billing / Stripe Integration — Full E2E Audit

Date: 2026-04-26
Scope: Backend routes, webhook handlers, frontend pages, database schema, usage enforcement, plan gating, downgrade logic

---

## 1. EXECUTIVE SUMMARY

The Stripe integration is **functionally complete for the core checkout → subscription → webhook → downgrade flow** and covers Free, Outreach, and Growth tiers end-to-end. The frontend billing page is polished, usage bars work, and plan enforcement is wired into most action routes.

**BUT** there are several critical schema/ORM drift issues, enforcement gaps, and webhook robustness problems that will cause bugs in production as soon as Stripe events start arriving at scale.

**Risk level: MEDIUM-HIGH** — core flow works, but schema drift and missing idempotency will create data inconsistency.

---

## 2. WHAT'S IMPLEMENTED WELL

### A. Tier Configuration (shared source of truth)
- `packages/shared/src/tiers.ts` and `apps/api/src/lib/billing/tiers.ts` both mirror the same 3-tier model (Free / Outreach / Growth).
- Prices, limits, and feature gates are declared in one place.
- `canonicalPlan()` normalises legacy plan names — good defensive pattern.

### B. Feature Gate & Credit Enforcement (`enforce.ts`)
- `enforceCredits()` checks subscription status (active/trialing vs past_due/hard-deny states) before checking limits.
- `enforceFeatureGate()` gates features by minimum tier (sequences=Growth, email_verifications=Outreach, etc.).
- Hard-deny vs soft-deny distinction is correct.
- Returns structured `EnforcementError` with `upgradeRequired` flag — frontend can react.

### C. Webhook Coverage
The `POST /billing/webhook` handles:
- `checkout.session.completed` → creates subscription row, updates profiles
- `invoice.payment_succeeded` → resets monthly usage counters, marks active
- `invoice.payment_failed` → sets `past_due`, starts 7-day grace period, schedules BullMQ downgrade job
- `customer.subscription.trial_will_end` → logs warning, updates trial_ends_at
- `customer.subscription.updated` → syncs status, period end, cancel_at_period_end
- `customer.subscription.deleted` / `.canceled` → runs `runDowngrade()`, cleans up jobs

### D. Grace Period & Downgrade Job
- `lib/billing/downgrade.ts` has a full `runDowngrade()` function that:
  - Sets profile plan back to `free`
  - Resets AI email and sequence locks
  - Cancels scheduled sequences
  - Logs a credit transaction
  - Sets `subscription_status = 'ended'`
- BullMQ job is scheduled with `jobId = grace-${uid}-${subId}` and removed on cancellation — good.

### E. Top-up Credits
- Top-up checkout sessions use `mode: 'payment'` (not subscription).
- Webhook has a separate `session.mode === 'payment'` branch that records a `credit_transactions` row.

### F. Frontend Billing Page (`/billing/index.tsx`)
- Displays current plan, status badge, trial countdown, cancel notice.
- Usage progress bars: Leads, Searches, Email Verifications, AI Emails.
- Monthly/Annual toggle with savings callout.
- "Switch to X" vs "Upgrade to X" button logic based on current plan.
- Top-up buttons (+100 / +500 credits).
- Links to Stripe Customer Portal for management.

### G. Stripe Customer Portal
- `POST /billing/portal` creates a Stripe Billing Portal session.
- Returns `{ url }` — frontend opens it.

### H. Routes Using Enforcement
- `search.ts` — search credit check
- `leads.ts` — lead credit check + email verification feature gate
- `import.ts` — lead credit check
- `enrichment.ts` — enrichment credit check
- `ai-email.ts` — AI email credit check
- `sequences.ts` — sequences feature gate + sequence contact credit check
- `reviews.ts` — enrichment credit check

---

## 3. WHAT'S MISSING / CRITICAL GAPS

### A. SCHEMA DRIFT — `profiles` table missing from Drizzle schema
**Severity: CRITICAL**

The `profiles` table is referenced in 30+ places across the API (billing.ts, enforce.ts, downgrade.ts, message-picker.ts, profile.ts, etc.) but **does NOT exist in `apps/api/src/db/schema.ts`**.

**Impact:**
- Drizzle migrations, type generation, and any ORM-based query will break or produce wrong types.
- The codebase relies entirely on raw `supabaseAdmin` queries for profiles, which works but defeats the purpose of having Drizzle as the schema source of truth.
- This is a ticking time bomb — the next developer who tries to add a Drizzle migration for profiles will either duplicate the table or conflict with the existing Supabase Auth/Postgres `profiles` table.

**Fix:** Add the `profiles` table to `schema.ts` with all columns referenced in the codebase:
- `id`, `email`, `full_name`, `avatar_url`, `plan`, `subscription_status`, `subscription_ends_at`, `stripe_customer_id`, `stripe_subscription_id`, `company_name`, `created_at`, `updated_at`, etc.

---

### B. SCHEMA DRIFT — `usage_tracking` Drizzle schema is WRONG
**Severity: CRITICAL**

Migration `015_subscriptions_and_credits.sql` creates `usage_tracking` with these columns:
```sql
searches_count, email_verifications_count, ai_emails_count, leads_count, enrichment_count
```

But `schema.ts` defines:
```ts
searchCount, creditsUsed, enrichmentCount, messageSendsCount
```

**Impact:**
- Any Drizzle query on `usage_tracking` will reference the wrong column names.
- The raw Supabase queries in `usage.ts` and `billing.ts` use the correct SQL names, so the app "works" — but the ORM layer is completely disconnected from reality.
- `usage.ts` functions (`incrementSearches`, `incrementLeads`, etc.) use Supabase directly, bypassing Drizzle.

**Fix:** Align `schema.ts` with the actual SQL table. Remove or rename `creditsUsed`, `messageSendsCount`, `searchCount` and add the real columns.

---

### C. `credit_transactions` table is defined but NEVER used
**Severity: MEDIUM**

The `credit_transactions` table exists in the Drizzle schema and SQL migration. It has a rich schema (`action`, `credit_type`, `amount`, `balance_after`, `metadata`).

**Where it IS used:**
- Webhook `invoice.payment_failed` logs a row with action `payment_failed_grace_period`.
- Webhook `invoice.payment_succeeded` does NOT log a row.
- `downgrade.ts` logs a row with action `grace_period_downgrade`.

**Where it is NOT used:**
- No API endpoint returns credit transaction history.
- No frontend page shows a "Credit History" ledger.
- `enforceCredits()` does not read from it — it reads from `usage_tracking`.
- Top-up webhook handler inserts into it, but the `balanceAfter` value is just the top-up amount (not a true running balance).

**Impact:** The table is half-implemented. Users can't see where their credits went. Debugging billing disputes is impossible.

**Fix:** Add `GET /billing/transactions` endpoint and a "Credit History" section on the billing page.

---

### D. `subscriptions` table credit limit columns are orphaned
**Severity: MEDIUM**

The `subscriptions` table defines per-column credit limits:
- `leadCreditsLimit`, `searchCreditsLimit`, `emailVerificationCreditsLimit`, `aiEmailCreditsLimit`, `sequenceContactCreditsLimit`

These are populated in the webhook handler when a subscription is created, but **never read by `enforceCredits()`**.

`enforceCredits()` always calls `getTier(plan)` and reads limits from the hardcoded tier config.

**Impact:** If you ever want per-user custom limits (e.g. a negotiated enterprise deal), the infrastructure is there but the enforcement code ignores it.

**Fix:** Either drop these columns (YAGNI) or update `enforceCredits()` to read from `subscriptions` as an override.

---

### E. Message Picker does NOT use shared enforcement
**Severity: MEDIUM**

`apps/api/src/routes/message-picker.ts` has its own `getUserPlan()` helper and its own `DAILY_MESSAGE_LIMITS` / `CUSTOM_TEMPLATE_LIMITS` maps.

It does NOT call `enforceCredits()` or `enforceFeatureGate()`.

**Impact:**
- Two sources of truth for plan limits.
- If tier prices/limits change, message-picker limits must be updated separately.
- The daily message limit is tracked in `message_sends` table, not `usage_tracking`.

**Fix:** Refactor message-picker to use `enforceCredits('message_send')` and `enforceFeatureGate('custom_templates')`.

---

### F. Webhook idempotency is missing
**Severity: HIGH**

The `checkout.session.completed` handler does not check if the subscription row already exists before inserting.

If Stripe retries the webhook (network timeout, 5xx response), the code will:
1. Insert a duplicate `subscriptions` row (UUID primary key avoids exact dup, but it will create a new row with the same `stripe_subscription_id`).
2. Upsert `usage_tracking` (safe).
3. Update `profiles` (safe, but noisy).

The `customer.subscription.updated` and `.deleted` handlers are idempotent by nature (UPDATE by subscription ID), but `checkout.session.completed` is an INSERT.

**Fix:** Wrap the checkout handler in an `INSERT ... ON CONFLICT (stripe_subscription_id) DO UPDATE` or check for existing row first.

---

### G. No `checkout.session.expired` handler
**Severity: LOW**

If a user abandons checkout, Stripe fires `checkout.session.expired`. The webhook currently ignores it.

No dangling data is created, but analytics/metrics won't know about abandoned carts.

**Fix:** Optional — log to an analytics table or fire an event.

---

### H. `profiles.stripe_subscription_id` is set but never indexed in webhook lookup
**Severity: LOW**

The `lookupUserIdBySubscriptionId()` helper first checks `profiles.stripe_subscription_id`, then falls back to `subscriptions` table.

The `profiles` column is convenient but redundant now that `subscriptions` table exists. The webhook handler updates both.

**Impact:** Minimal, but keeping dual state increases risk of drift.

**Fix:** Phase out `profiles.stripe_subscription_id` in favor of the `subscriptions` table as the single source of truth.

---

### I. Top-up webhook does not actually add credits to `usage_tracking`
**Severity: HIGH**

Looking at the `checkout.session.completed` handler for `mode === 'payment'` (top-ups):

```ts
await supabaseAdmin.from('usage_tracking').upsert({
  user_id: uid,
  month,
  searches_count: 0,
  email_verifications_count: 0,
  ai_emails_count: 0,
  leads_count: 0,
  enrichment_count: 0,
});
```

It **resets all counters to 0** instead of adding the purchased credits to any field!

Top-up purchases currently do nothing useful — they create a `credit_transactions` row but do not increase any usable quota.

**Fix:** Decide what "credits" mean. If top-ups are meant to be email verification credits, increment `email_verifications_count` by negative amount (i.e. grant extra credits), or add a `credits_used`/`credits_balance` field to `usage_tracking`.

---

### J. `runDowngrade()` is called on `customer.subscription.deleted` but may not cancel scheduled sequences properly
**Severity: MEDIUM**

`downgrade.ts` calls `sequenceScheduler.cancelScheduledEmailsForUser(uid)`.

If the sequence scheduler throws an error, the downgrade continues but sequences may still be queued.

**Impact:** User is downgraded to Free but scheduled emails might still send.

**Fix:** Wrap downgrade in a transaction or ensure sequence cancellation is verified before completing.

---

## 4. WHAT'S NOT WORKING / BROKEN

### A. `usage_tracking` reset on `invoice.payment_succeeded` uses wrong month logic
The webhook resets usage for the CURRENT month. But if the invoice is for the NEXT period (which is normal for Stripe subscriptions), the reset should apply to the NEXT month, not the current one.

Example: On April 25, the May invoice is paid. The webhook resets `month = '2026-04'` instead of `'2026-05'`.

**Fix:** Use `sub.current_period_end` to compute the reset month, or wait until the period actually starts.

### B. `subscription.status === 'cancelled'` in frontend uses British spelling, but Stripe uses American `'canceled'`
The backend webhook stores `'cancelled'` (British) in the database. The frontend checks for `'cancelled'`.

Stripe's native status is `'canceled'` (American). If the backend ever stores the raw Stripe status without translation, the frontend won't recognise it.

**Fix:** Normalise all statuses through `canonicalPlan()` / `canonicalStatus()` helpers.

### C. `billing.ts` checkout handler allows re-subscribing with an existing active subscription
If a user already has an active Growth subscription and hits the checkout endpoint again, Stripe may create a second subscription.

The code checks `existingSubs.length > 0` but does not block — it shows the user existing subscriptions and then proceeds to create a new checkout session anyway.

**Fix:** Return 409 Conflict if an active subscription already exists for the same or higher tier.

### D. `billing.ts` line 241: `updated_at: new Date()` is a Date object, not ISO string
```ts
await supabaseAdmin.from('profiles').update({
  plan,
  subscription_status: 'active',
  stripe_subscription_id: subscription.id,
  subscription_ends_at: periodEnd,
  updated_at: new Date(),   // ← Date object
}).eq('id', userId);
```

Supabase accepts Date objects, but this is inconsistent with the rest of the codebase which uses `.toISOString()`.

---

## 5. SECURITY RISKS

### A. Webhook endpoint is unauthenticated (correct) but has no IP allowlist
Stripe webhooks should ideally be verified by IP range or at least logged suspicious origins.

### B. `STRIPE_WEBHOOK_SECRET` is exposed in `.env`
The `.env` file contains `whsec_...4635`. If this repo is ever made public or if `.env` is leaked, attackers can forge webhook events.

**Mitigation:** The webhook signature verification (`stripe.webhooks.constructEvent`) prevents forgery without the secret. But the secret must rotate if leaked.

### C. No rate limiting on checkout creation
A malicious user could spam `POST /billing/checkout` and create hundreds of Stripe checkout sessions.

**Fix:** Add a per-user rate limit (e.g. 5 checkouts per minute).

### D. `cancel` endpoint does not verify ownership of the subscription
```ts
const { data: profile } = await supabaseAdmin.from('profiles')
  .select('stripe_customer_id, stripe_subscription_id')
  .eq('id', userId)
  .maybeSingle();
```

It cancels the subscription stored in the user's profile. If `stripe_subscription_id` is somehow wrong (race condition, drift), it could cancel someone else's subscription.

**Fix:** Double-check the subscription belongs to the user via Stripe API before cancelling.

---

## 6. FRONTEND ANALYSIS

### What's Good
- Clean design with progress bars, status badges, trial countdown.
- Monthly/annual toggle with savings math.
- Top-up section only shown to subscribed users.
- "Manage" button links to `/billing/manage` which opens the Stripe Customer Portal.
- `withAuth()` HOC protects all billing pages.

### What's Missing
- **No inline upgrade modal.** When the user hits a 402/403 on search, leads, etc., they get a JSON error. The API returns `{ upgradeRequired: true }` but the frontend does not show a modal or redirect to billing.
- **No credit transaction history.** Users can't see "where did my 50 searches go?"
- **No invoice history.** Users can't view past Stripe invoices inside the app.
- **No plan downgrade preview.** When clicking "Switch to Outreach" from Growth, there's no "you will lose X features" warning.
- **No handling of `past_due` state in the UI.** If a payment fails, the user sees no banner or warning until the grace period ends.

---

## 7. ENVIRONMENT / CONFIG ISSUES

### A. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is in API `.env`
The publishable key is public by definition, but it lives in the backend `.env`. The frontend might need its own `.env.local` with this key if it ever does client-side Stripe Elements.

Currently the frontend only redirects to Stripe Checkout URLs (server-generated), so the publishable key is not needed on the frontend. But if you add Stripe Elements later, you'll need to duplicate it.

### B. Missing `STRIPE_PRICE_OUTREACH_MONTHLY` etc. in frontend `.env.example`
All price IDs are backend-only. Frontend never references price IDs directly — good.

### C. `.env` contains test keys (`pk_test_...`)
Production deployment must use live keys (`pk_live_...`, `sk_live_...`).

---

## 8. RECOMMENDATIONS (Prioritised)

### P0 — Fix Before Production
1. **Fix `usage_tracking` Drizzle schema drift.** Align `schema.ts` with the real SQL table.
2. **Add `profiles` table to Drizzle schema.** Or document clearly that it is managed by Supabase Auth and should not be in Drizzle.
3. **Fix top-up webhook.** Top-ups must actually grant credits (increment a balance, not reset all counters).
4. **Add webhook idempotency.** Use `ON CONFLICT` or pre-check for existing `stripe_subscription_id`.
5. **Fix `invoice.payment_succeeded` month logic.** Reset usage for the NEXT billing period, not the current month.

### P1 — High Value
6. **Add `GET /billing/transactions` endpoint** and show credit history on the billing page.
7. **Refactor message-picker to use shared `enforceCredits`/`enforceFeatureGate`.**
8. **Add rate limiting on checkout creation.**
9. **Add frontend 402/403 interceptors.** When API returns `upgrade_required: true`, show an inline upgrade modal or redirect to billing.
10. **Add a `past_due` banner** on the frontend when `subscription_status === 'past_due'`.

### P2 — Polish
11. **Add invoice history** via `GET /billing/invoices` (proxy Stripe API).
12. **Add downgrade preview modal.** Warn users what features they'll lose before confirming a switch.
13. **Remove redundant `profiles.stripe_subscription_id`** in favour of the `subscriptions` table.
14. **Decide on `subscriptions` credit limit columns** — either use them or drop them.
15. **Add `checkout.session.expired` logging** for analytics.

---

## 9. FILES AUDITED

| File | Lines | Assessment |
|------|-------|------------|
| `apps/api/src/routes/billing.ts` | 1013 | Complex but comprehensive. Needs idempotency and top-up fix. |
| `apps/api/src/lib/billing/enforce.ts` | 238 | Well-structured. Correct hard/soft deny logic. |
| `apps/api/src/lib/billing/downgrade.ts` | ~160 | Good cleanup logic. Risky if sequence scheduler fails. |
| `apps/api/src/lib/billing/tiers.ts` | ~120 | Clean, shared config. |
| `apps/api/src/lib/usage.ts` | 80 | Simple, works. Bypasses Drizzle. |
| `apps/api/src/db/schema.ts` | 415 | **Critical drift** on `usage_tracking` and missing `profiles`. |
| `apps/api/migrations/008_billing.sql` | ~50 | Correct SQL for profiles billing columns. |
| `apps/api/migrations/015_subscriptions_and_credits.sql` | ~80 | Correct SQL for subscriptions, usage_tracking, credit_transactions. |
| `apps/web/src/pages/billing/index.tsx` | 594 | Polished UI. Missing upgrade modals and history. |
| `apps/web/src/pages/billing/upgrade.tsx` | ~400 | Functional. |
| `apps/web/src/pages/billing/manage.tsx` | ~450 | Functional. |
| `apps/web/src/pages/billing/success.tsx` | ~120 | Simple redirect. |
| `apps/web/src/lib/tiers.ts` | ~30 | Mirrors shared config. Good. |
| `apps/api/src/routes/search.ts` | 242 | Correctly calls `enforceCredits('search')`. |
| `apps/api/src/routes/leads.ts` | ~1300 | Correctly calls `enforceCredits('lead')` and `enforceFeatureGate('email_verifications')`. |
| `apps/api/src/routes/sequences.ts` | ~400 | Correctly calls `enforceFeatureGate('sequences')` and `enforceCredits('sequence_contact')`. |
| `apps/api/src/routes/message-picker.ts` | 435 | **Does not use shared enforcement.** Own limit maps. |

---

*End of audit.*
