# Revised Billing Consolidation PRD

**Product:** LeadGen App
**Scope:** Single-plan billing (Free + LeadGen Pro) with Stripe integration
**Date:** April 2026
**Status:** Pre-consolidation P0 fixes required before plan consolidation PR

---

## 1. Executive Summary

Consolidate LeadGen billing to a single paid plan: **LeadGen Pro** (£29/mo or £290/year). Remove the Growth tier entirely. Free tier becomes a limited teaser.

**This PRD is built on top of three P0 bug fixes that must land first.** The existing billing system has live false-advertising bugs and a silent checkout crash. Those fixes are extracted into a standalone pre-requisite PR.

---

## 2. Pre-Requisite PR: P0 Bug Fixes (Ship First)

This PR fixes critical issues already live in production AND does the full `tiers.ts` restructure. `tiers.ts` is touched exactly once here — Phase 2 never edits it again.

### 2.1 Fix 1: Full tiers.ts Rewrite + Correct Limits

**Problem:** The frontend billing page promises 1,000 leads / 200 verifications for Outreach. The backend enforces 500 leads / 100 verifications via `tiers.ts`. Users are sold limits the system will block them at. Additionally, Growth still exists in `tiers.ts` despite being removed from the product.

**Decision:** Single source of truth with two tiers only:
```
Free:     25 leads, 5 searches, 5 verifications, 5 AI emails, 1 sequence
Pro:      1,000 leads, 200 searches, 200 verifications, 100 AI emails, 50 sequences
```
Searches are capped below leads — a user can search, add up to 25 leads, and still have search headroom. This is a coherent teaser.

**Files:**
- `packages/shared/src/tiers.ts` — full restructure (remove Growth, rename to TIERS object, add getPlanLimits)
- `apps/web/src/pages/billing/index.tsx` — import limits from tiers.ts
- `apps/web/src/pages/billing/upgrade.tsx` — import limits from tiers.ts

**Implementation:**
1. Remove `GROWTH_TIER` entirely. Remove `OUTREACH_TIER` constant shape.
2. Create unified `TIERS` object with `free` and `pro` (planId: 'outreach') entries.
3. Export `getPlanLimits(planId: 'free' | 'outreach')` helper.
4. Export `PlanId` type.
5. Update `checkSubscriptionAccess()` in `enforce.ts` to use the new structure (verify no breakage).
6. Frontend billing pages import `TIERS` and `getPlanLimits` — all limit numbers rendered dynamically. No hardcoded arrays remain.

### 2.2 Fix 2: Checkout Handler Returns `{upgraded: true}` Without URL

**Problem:** When an existing subscriber changes plan, `billing.ts` returns `{upgraded: true}` with no `url` field. The frontend does `window.location.href = url` where `url` is `undefined` — silent runtime crash.

**Files:**
- `apps/api/src/routes/billing.ts` (checkout handler)
- `apps/web/src/lib/api.ts` (checkout client)

**Implementation:**
1. Backend: when returning `{upgraded: true}`, also return `url: '/billing?upgraded=1'`.
2. Frontend: update `api.billing.checkout()` to handle both shapes:
   ```ts
   if (res.upgraded) {
     window.location.href = res.url || '/billing?upgraded=1';
   } else {
     window.location.href = res.url;
   }
   ```

### 2.3 Fix 3: Invoice Payment Succeeded Resets Wrong Month

**Problem:** The webhook handler resets usage credits on `invoice.payment_succeeded` using `new Date()` (the current calendar month), not the subscription's upcoming billing period. A user billed on the 15th gets reset for the remaining half-month instead of the next 30 days.

**File:** `apps/api/src/routes/billing.ts` (webhook handler)

**Implementation:**
```ts
// BEFORE (broken)
const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

// AFTER (correct)
const periodEnd = new Date(sub.currentPeriodEnd || sub.current_period_end);
const month = `${periodEnd.getUTCFullYear()}-${String(periodEnd.getUTCMonth()+1).padStart(2,'0')}`;
```

Also ensure the reset writes to the CORRECT month in `usage_tracking`.

### 2.4 Fix 4: Schema Drift in usage_tracking

**Problem:** `schema.ts` declares columns `searchCount`, `creditsUsed`, `enrichmentCount`, `messageSendsCount`. The actual Supabase table has `searches_count`, `email_verifications_count`, `ai_emails_count`, `leads_count`, `enrichment_count`. Drizzle ORM reads will fail; type safety is broken.

**File:** `apps/api/src/db/schema.ts`

**Implementation:**
Align `schema.ts` to the actual Supabase columns:
```ts
export const usageTracking = pgTable('usage_tracking', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  month: text('month').notNull(),
  searches_count: integer('searches_count').default(0),
  email_verifications_count: integer('email_verifications_count').default(0),
  ai_emails_count: integer('ai_emails_count').default(0),
  leads_count: integer('leads_count').default(0),
  enrichment_count: integer('enrichment_count').default(0),
  message_sends_count: integer('message_sends_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```
Update all Drizzle ORM references and the Drizzle-kit types.

### 2.5 P0 PR Deliverables

- [ ] `packages/shared/src/tiers.ts` — full restructure (Free/Pro only, correct limits, getPlanLimits)
- [ ] `apps/web/src/pages/billing/index.tsx` — imports limits dynamically from tiers.ts
- [ ] `apps/web/src/pages/billing/upgrade.tsx` — imports limits dynamically from tiers.ts
- [ ] `apps/api/src/routes/billing.ts` — checkout returns url for upgrades; webhook uses current_period_end
- [ ] `apps/web/src/lib/api.ts` — checkout client handles upgraded flag
- [ ] `apps/api/src/db/schema.ts` — usage_tracking columns aligned
- [ ] `apps/api/src/lib/billing/enforce.ts` — verified compatible with new tiers.ts shape
- [ ] **Migration: add `trial_used` (boolean, default false) and `trial_started_at` (timestamp, nullable) to `profiles` table**
- [ ] Smoke test: sign up → hit 25 lead limit → upgrade → verify 1,000 lead cap works

---

## 3. Consolidation PR: Single Plan (Free + LeadGen Pro)

Once the P0 PR is merged, proceed with consolidation.

### 3.1 Product Spec

| Tier | Price | Leads | Searches | Verifications | AI Emails | Sequences |
|------|-------|-------|----------|---------------|-----------|-----------|
| Free | £0 | 25 | 5 | 5 | 5 | 1 |
| Pro Monthly | £29/mo | 1,000 | 200 | 200 | 100 | 50 |
| Pro Annual | £290/yr (£24.17/mo equiv) | 1,000 | 200 | 200 | 100 | 50 |

Annual discount: 17% (2 months free).

**Free tier rationale:** 25 leads / 5 searches / 5 verifications / 5 AI emails / 1 sequence. Search wall comes before lead wall (5 vs 25), which is correct for a teaser. 1 sequence is intentionally stingy — users can build a flow but can't run a meaningful campaign without upgrading. 5 AI emails gives them enough output to judge quality before hitting the wall.

### 3.2 Stripe Price IDs

Only two IDs required:
```
STRIPE_PRICE_MONTHLY=price_xxx  (for LeadGen Pro monthly)
STRIPE_PRICE_YEARLY=price_yyy   (for LeadGen Pro annual)
```

Remove: `STRIPE_PRICE_GROWTH`, any Growth-tier references.

### 3.3 Backend Changes

#### 3.3.1 `packages/shared/src/tiers.ts`

**Already completed in Phase 1.** The file now contains:
- Only Free + Pro tiers (Growth removed)
- Correct limits (25 leads / 5 searches for Free)
- `getPlanLimits()` helper and `PlanId` type

Phase 2 makes no further changes to this file.

#### 3.3.2 `apps/api/src/routes/billing.ts`

Changes:
1. Remove Growth plan references entirely.
2. Simplify `checkout()` to handle only Free → Pro or Pro period switch.
3. Remove credit-related columns from subscription upsert (they're orphaned).
4. `planOrder` becomes `['free', 'outreach']`.
5. Webhook handler: keep the P0 fix (use `current_period_end` for month reset).

**Trial logic:**
- **Pre-checkout guard:** If `profile.trial_used === true`, return `403` with message `"Trial already used"`. Reject second trial attempts server-side.
- **Trial creation:** When a free user starts checkout, pass `subscription_data.trial_period_days: 14` in the Stripe Checkout Session.
- **checkout.session.completed webhook:** If `subscription.status === 'trialing'`, immediately set `plan = 'outreach'` and `trial_started_at = now()`. Do NOT wait for `invoice.paid` — it won't fire for 14 days.
- **Cancel endpoint:** Use immediate cancellation (`cancel_at_period_end: false`), not end-of-period. The user drops to Free immediately on cancel.

Key checkout flow:
```
POST /billing/checkout
Body: { period: 'monthly' | 'yearly' }

Logic:
- If profile.trial_used === true → return 403 "Trial already used"
- If no existing Stripe sub → create checkout session for Pro (monthly or yearly) with trial_period_days: 14
- If existing Pro monthly and user picks yearly → create checkout for yearly, Stripe handles proration
- If existing Pro and user picks same period → return { alreadyActive: true }
- If free user → create checkout session with trial
```

#### 3.3.3 `apps/api/src/lib/billing/enforce.ts`

Already uses `tiers.ts` as source of truth. After tiers.ts is updated, this file needs no changes. Verify `checkSubscriptionAccess()` still maps correctly.

#### 3.3.4 `apps/api/src/db/schema.ts`

Remove 11 orphaned columns from `subscriptions`:
```
leadCreditsUsed, leadCreditsLimit, searchCreditsUsed, searchCreditsLimit,
emailVerificationCreditsUsed, emailVerificationCreditsLimit,
aiEmailCreditsUsed, aiEmailCreditsLimit,
sequenceContactCreditsUsed, sequenceContactCreditsLimit,
creditsResetAt
```

These are dead weight. Create a Drizzle migration to drop them.

### 3.4 Frontend Changes

#### 3.4.1 `apps/web/src/pages/billing/index.tsx`

Replace the 3-card layout (Free / Outreach / Growth) with a 2-section layout:

**Top section — Current plan status**
- If Free: "You're on the Free plan — X leads used of 25" with single CTA: **"Start Free Trial"** only. No parallel "Upgrade to Pro" path.
- If Pro (paid): "LeadGen Pro — Renews on [date]" with manage billing / cancel links
- If Pro (trialing): Show countdown banner: "Pro trial — 9 days remaining. Add a payment method to keep your data and sequences." At ≤3 days remaining, switch to urgent variant: "Your trial ends in N days — add a payment method to keep your data and sequences." Include "Cancel Trial" button (immediate downgrade, `cancel_at_period_end: false`).

**Bottom section — Plan comparison**
- Free column: limits listed
- Pro column: limits listed, monthly/annual toggle, CTA button
- Remove Growth entirely

All limit numbers rendered via `getPlanLimits()` from `tiers.ts`.

**First-login banner (one-time, dismissible):**
- On first login after signup, show dismissible banner: "You're on Free. Start your 14-day Pro trial — card required, cancel anytime."
- Store `trial_banner_dismissed` in localStorage (not DB — no server round-trip needed).
- Never show again after dismissal.

#### 3.4.2 `apps/web/src/pages/billing/upgrade.tsx`

Simplify to a single-plan checkout page:
- Remove plan selector (no choice needed — only Pro exists)
- Keep monthly/annual toggle
- Show savings for annual (17% / 2 months free)
- CTA: **"Start Free Trial"** only (no parallel "Upgrade to Pro" path)
- Price pulled from `tiers.ts`

#### 3.4.3 `apps/web/src/lib/api.ts`

Remove `plan` parameter from `billing.checkout()`:
```ts
checkout: (period: 'monthly' | 'yearly') =>
  request<{ url?: string; upgraded?: boolean }>('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ period }),
  }),
```

### 3.5 API Enforcement Points

Quota enforcement happens at these API routes via `enforceCredits()`:

| Feature | Route | Enforced Via |
|---------|-------|--------------|
| Lead creation | `POST /leads` | `checkAndIncrement('leads')` |
| Search | `POST /search` | `checkAndIncrement('searches')` |
| Email verify | `POST /leads/:id/verify-email` | `checkAndIncrement('verifications')` |
| AI email | `POST /leads/:id/generate-email` | `checkAndIncrement('aiEmails')` |
| Sequence create | `POST /sequences` | `checkAndIncrement('sequences')` |
| Sequence enroll | `POST /sequences/:id/enroll` | `checkAndIncrement('sequences')` |

All enforcement reads from `tiers.ts`. No changes needed after tiers.ts is updated.

### 3.6 Free Tier Teaser Strategy

When a free user hits a limit:
1. API returns 402 with `UpgradeRequiredError`
2. Frontend shows inline upgrade prompt (not a blocking modal)
3. Prompt: "You've used X of your Y [feature] this month. Start your free 14-day trial for unlimited [feature]."
4. CTA links to `/billing/upgrade?feature=leads` with "Start Free Trial" framing

No hard paywalls — gentle nudges. The copy specifically says "Start your free 14-day trial" not "Upgrade to Pro" — the trial framing is meaningfully less threatening at the moment of frustration.

### 3.7 Migration & Rollback

**No Growth subscriber migration needed** — the validation confirmed there are no real Growth subscribers. The Growth tier was never fully wired in Stripe.

If a Growth subscriber somehow exists in the DB:
- `billing/status` will return `planId: 'growth'`
- `getPlanLimits('growth')` will fall back to Free limits
- They'd see Free limits and be prompted to upgrade → checkout creates a Pro sub
- Acceptable edge-case handling

**Rollback:**
- Revert PRs. Database columns are additive-only in Phase 1; the orphaned column drop happens in Phase 2 with a proper migration.

### 3.8 MessagePicker Backend Route

**Decision:** Create the missing backend routes. The MessagePicker component is actively used in 3 places (leads page, ChannelButtons, PipelineTable) and has quota-adjacent logic. A missing backend route is a live 404 bug.

**Phase 2 task:** Add `GET /message-picker`, `POST /message-picker/send`, `POST /message-picker/templates` to `apps/api/src/routes/` (or an existing route file). Implement daily quota checks against `usage_tracking.message_sends_count` with a rolling 24h window. Return `{templates, dailyQuota: {used, limit}}` from `GET`.

**Alternative (if scope-constrained):** Remove MessagePicker entirely from frontend + api.ts. Only acceptable if you explicitly want to kill the feature. Default is to implement the backend route.

---

## 4. Testing Plan

### 4.1 P0 PR Smoke Tests

| # | Flow | Expected |
|---|------|----------|
| 1 | Free user adds 26th lead | Blocked at 25, shows upgrade prompt |
| 2 | Free user upgrades to Pro via billing page | Checkout session created, Stripe success |
| 3 | Pro user adds 500th lead | Allowed (limit is 1,000) |
| 4 | Pro user changes monthly → annual | Returns redirect URL, not `upgraded: true` with no URL |
| 5 | Webhook invoice paid on 15th | Resets usage for NEXT billing period, not current month |
| 6 | Drizzle query on `usage_tracking` | Returns correct columns, no type errors |

### 4.2 Consolidation PR Smoke Tests

| # | Flow | Expected |
|---|------|----------|
| 1 | Billing page shows only Free + Pro | No Growth card |
| 2 | Limits on billing page match tiers.ts | 1,000 leads, 200 searches, etc. |
| 3 | Free user at 24/25 leads adds 25th | Allowed |
| 4 | Free user at 25/25 leads adds 26th | Blocked, upgrade prompt shown |
| 5 | Pro user at 999/1,000 adds 1,000th | Allowed |
| 6 | Pro user at 1,000/1,000 adds 1,001st | Blocked, "at limit" message |
| 7 | Annual toggle on upgrade page | Price changes £29/mo ↔ £290/yr |
| 8 | Cancel Pro → revert to Free | Can add only 25 leads again |
| 9 | Schema query: `SELECT * FROM subscriptions` | No orphaned credit columns |
| 10 | MessagePicker opens from leads page | Backend route returns templates + quota |
| 11 | MessagePicker send within quota | Opens WhatsApp/SMS with resolved message |
| 12 | MessagePicker send over quota | Returns 402, frontend shows upgrade prompt |
| 13 | User cancels trial on day 8 | Immediately drops to Free, not day 14 |
| 14 | User tries to start second trial | 403 blocked server-side |
| 15 | Day 15 invoice paid | Usage reset for new period, stays Pro |
| 16 | Trial user on day 12 | Banner shows urgent "3 days remaining" variant |
| 17 | First-login banner shown once | Dismissible, stored in localStorage, never repeats |
| 18 | Free user hits search limit | Prompt says "Start your free 14-day trial" not "Upgrade" |

---

## 5. Implementation Order

```
Phase 1: P0 Bug Fix PR (ship independently)
├── 1a. Full tiers.ts restructure: remove Growth, set correct limits, add getPlanLimits()
├── 1b. Update billing/index.tsx + upgrade.tsx to import limits from tiers.ts
├── 1c. Fix checkout handler to return url for upgraded subs
├── 1d. Fix frontend checkout to handle upgraded flag
├── 1e. Fix webhook month reset to use current_period_end
├── 1f. Align usage_tracking schema columns
├── 1g. Verify enforce.ts compatible with new tiers.ts shape
├── 1h. Add trial_used + trial_started_at columns to profiles table (migration)
└── 1i. Smoke test all P0 flows

---

## 5.1 Phase 1 Acceptance Criteria

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | `packages/shared/src/tiers.ts` compiles with zero TS errors | `npm --workspace @leadgen/shared run typecheck` |
| 2 | Only `free` and `outreach` (Pro) tiers exist in `TIERS` object | Search file for `"growth"` → 0 results |
| 3 | `getPlanLimits('free')` returns `{ leads: 25, searches: 5, verifications: 5, aiEmails: 5, sequences: 1 }` | Unit test or console.log |
| 4 | `getPlanLimits('outreach')` returns `{ leads: 1000, searches: 200, verifications: 200, aiEmails: 100, sequences: 50 }` | Unit test or console.log |
| 5 | `billing/index.tsx` renders all limit numbers from `getPlanLimits()` — no hardcoded values | Visual inspection + grep for `1000` / `200` in component |
| 6 | `billing/upgrade.tsx` renders all limit numbers from `getPlanLimits()` — no hardcoded values | Visual inspection + grep |
| 7 | Checkout handler returns `url` field when `upgraded: true` | Stripe test mode: upgrade monthly → annual, verify redirect |
| 8 | Frontend checkout client handles `upgraded` flag without crashing | Stripe test mode: verify no `undefined` URL error in console |
| 9 | Webhook uses `subscription.current_period_end` for month reset, not `new Date()` | Mock webhook with `period_end` in past → verify reset writes to correct month row |
| 10 | `usage_tracking` schema columns match Supabase table exactly | `db:generate` produces zero drift; Drizzle query returns correct shape |
| 11 | `enforce.ts` compiles and `checkSubscriptionAccess()` maps to new `TIERS` shape | Typecheck passes; manual test: free user blocked at 26th lead |
| 12 | `profiles` table has `trial_used` (boolean, default false) and `trial_started_at` (timestamp, nullable) | `SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'` |
| 13 | No `GROWTH_TIER` or `growth` plan references remain in any touched file | `grep -ri "growth" packages/shared/src/tiers.ts apps/web/src/pages/billing/index.tsx apps/web/src/pages/billing/upgrade.tsx` → 0 results |

## 5.2 Phase 1 Smoke Test

**Prerequisites:** Local dev servers running (`npm run dev`), Stripe test mode, fresh test user.

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Sign up as new user | Lands on Free plan, billing page shows "Free" | |
| 2 | Open billing page | Shows Free + Pro only. No Growth. Limits: 25 leads, 5 searches, 5 verifications, 5 AI emails, 1 sequence. | |
| 3 | Add 25 leads manually (or via DB insert) | 25th lead succeeds | |
| 4 | Attempt to add 26th lead | API returns 402. Frontend shows upgrade prompt with "Start Free Trial" CTA. | |
| 5 | Go to `/billing/upgrade`, select monthly, complete Stripe Checkout test card | Redirects to `/billing?upgraded=1`. Plan shows Pro. | |
| 6 | Add 500th lead as Pro user | Succeeds (limit is 1,000). | |
| 7 | As Pro monthly, go to `/billing/upgrade`, select annual, complete checkout | Redirects to billing page. Plan shows Pro Annual. No console errors. | |
| 8 | In Stripe dashboard, backdate subscription `current_period_end` to yesterday, trigger `invoice.payment_succeeded` webhook | `usage_tracking` row for NEXT month created with zero counts. Current month row unchanged. | |
| 9 | Query `usage_tracking` via Drizzle | Returns object with `searches_count`, `email_verifications_count`, `ai_emails_count`, `leads_count`, `enrichment_count`, `message_sends_count`. No `searchCount`, `creditsUsed`, etc. | |
| 10 | Verify `profiles` table for test user | `trial_used` = false, `trial_started_at` = null | |

**Phase 1 is SHIPPED when all 10 smoke test steps pass.**

---

```
Phase 2: Consolidation PR (depends on Phase 1; tiers.ts already done)
├── 2a. Remove Growth from billing.ts backend routes
├── 2b. Add trial logic to billing.ts: pre-checkout guard, trialing webhook branch, immediate cancel
├── 2c. Drop orphaned columns from schema + migration
├── 2d. Rewrite billing/index.tsx (2-section layout + trial banners)
├── 2e. Rewrite billing/upgrade.tsx (single plan + trial CTA)
├── 2f. Simplify api.ts billing.checkout signature
├── 2g. Create /message-picker backend routes
├── 2h. Remove Growth from all frontend components
├── 2i. Add free teaser / upgrade prompt polish ("Start Free Trial" copy on limit hits)
├── 2j. Add first-login dismissible trial banner (localStorage)
└── 2k. Smoke test all consolidation flows
```

---

## 5.3 Phase 2 Acceptance Criteria

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | `billing.ts` has zero references to `growth`, `GROWTH`, or `creditsUsed` | `grep -ri "growth\|creditsused" apps/api/src/routes/billing.ts` → 0 results |
| 2 | Pre-checkout trial guard returns 403 when `trial_used === true` | API test: POST `/billing/checkout` with `trial_used=true` user → 403 "Trial already used" |
| 3 | Checkout session includes `trial_period_days: 14` for new Pro subscriptions | Stripe Checkout payload inspection or Dashboard |
| 4 | `checkout.session.completed` webhook sets Pro immediately when `status === 'trialing'` | Stripe test mode: complete checkout, verify DB `plan = 'outreach'` within seconds (before any invoice) |
| 5 | Cancel endpoint uses `cancel_at_period_end: false` (immediate) | Stripe Dashboard: cancel from UI, verify subscription ends immediately, not at period end |
| 6 | `subscriptions` table has no orphaned credit columns | `SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name LIKE '%credit%'` → 0 rows |
| 7 | Billing page shows exactly 2 sections (Free + Pro), no Growth card | Visual inspection |
| 8 | Free user billing page CTA is "Start Free Trial" only — no "Upgrade to Pro" alternative | Visual inspection |
| 9 | Trial user sees countdown banner with days remaining | Stripe test mode trial user, verify banner shows "X days remaining" |
| 10 | At ≤3 days remaining, banner switches to urgent variant | Backdate `trial_started_at` in DB or wait, verify copy change |
| 11 | First-login banner shows once, dismissible, never repeats | New signup → banner visible → dismiss → reload → banner gone. Verify localStorage key `trial_banner_dismissed` |
| 12 | Limit-hit prompts say "Start your free 14-day trial" not "Upgrade to Pro" | Hit search/lead/sequence limit as free user, inspect prompt copy |
| 13 | `/message-picker` backend routes exist and return `{templates, dailyQuota}` | `curl /message-picker` → 200 with expected shape |
| 14 | All frontend components compile with zero references to `growth` plan | `grep -ri "'growth'\|\"growth\"" apps/web/src/` → 0 results (excluding comments) |
| 15 | Typecheck passes across all workspaces | `npm run typecheck` |

## 5.4 Phase 2 Smoke Test

**Prerequisites:** Phase 1 deployed, local dev servers running, Stripe test mode.

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Open billing page as Free user | Shows Free + Pro only. No Growth. Top section CTA: "Start Free Trial" only. | |
| 2 | Click "Start Free Trial", select monthly, complete Stripe Checkout test card | Redirects to billing. Plan shows "Pro — Trial (13 days remaining)". `profiles.trial_used` = true. | |
| 3 | Add 1,000th lead as trialing user | Allowed (Pro limits active). | |
| 4 | Attempt to start second trial via API (bypassing UI) | POST `/billing/checkout` → 403 "Trial already used". | |
| 5 | Cancel trial from billing page | Immediate downgrade to Free. Can no longer add leads beyond 25. Existing leads retained. | |
| 6 | Restart dev server, sign up as fresh user | First-login banner appears: "You're on Free. Start your 14-day Pro trial — card required, cancel anytime." | |
| 7 | Dismiss first-login banner, reload page | Banner does not reappear. `localStorage.trial_banner_dismissed` = "true". | |
| 8 | Hit 5th search as Free user | Prompt says "You've used 5 of 5 searches. Start your free 14-day trial for unlimited searches." CTA says "Start Free Trial". | |
| 9 | Hit 1st sequence limit as Free user | Prompt says "You've used 1 of 1 sequences. Start your free 14-day trial for unlimited sequences." | |
| 10 | Navigate to `/message-picker` as Pro user | Returns `{templates: [...], dailyQuota: {used: 0, limit: 200}}` | |
| 11 | Send message via `/message-picker/send` within quota | WhatsApp/SMS opens with resolved message text. `dailyQuota.used` increments. | |
| 12 | Query `subscriptions` table | No `leadCreditsUsed`, `searchCreditsUsed`, `creditsResetAt`, or other orphaned credit columns. | |
| 13 | Annual toggle on upgrade page | Shows £29/mo ↔ £290/yr. Savings copy: "17% off — 2 months free". | |
| 14 | Pro user (paid, not trialing) cancels from billing page | Subscription cancels at period end (or immediately if you chose that UX). Reverts to Free at correct time. | |
| 15 | Typecheck all workspaces | `npm run typecheck` passes with zero errors. | |

**Phase 2 is SHIPPED when all 15 smoke test steps pass.**

---

## 6. Open Questions

1. **Stripe price IDs:** Confirm `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` are set in Render env. If not, create the Stripe products first.
2. **Annual discount:** Confirm 17% (2 months free = £29×10 = £290 vs £29×12 = £348). Current code shows £24/mo annual which matches.
3. **Trial length:** Closed — 14 days, card-required, already implemented via `trial_period_days` in the checkout handler. No change.
4. **Trial approach:** Closed — Option A (Free tier first, trial on upgrade). Trial starts when user clicks "Start Free Trial" on billing page or limit-hit prompt. Not on signup.
5. **Downgrade data retention:** Confirm we NEVER delete user data on downgrade (Nirav rule). Free users keep all leads but can't add more.

**Closed questions:**
- MessagePicker backend route — resolved as Phase 2 concrete task (create routes, not deferred).
- Growth migration — confirmed: no real subscribers, no migration needed.
- Trial approach — Option A, card-required, 14 days, immediate downgrade on cancel.

---

## 7. Files Changed Summary

### P0 PR (8 files)
- `packages/shared/src/tiers.ts` — full restructure (Free/Pro, correct limits, getPlanLimits)
- `apps/web/src/pages/billing/index.tsx` — imports limits dynamically
- `apps/web/src/pages/billing/upgrade.tsx` — imports limits dynamically
- `apps/api/src/routes/billing.ts` — checkout url fix + webhook month fix
- `apps/web/src/lib/api.ts` — checkout client handles upgraded flag
- `apps/api/src/db/schema.ts` — usage_tracking columns aligned
- `apps/api/src/lib/billing/enforce.ts` — verified compatible

### Consolidation PR (~14 files)
- `apps/api/src/routes/billing.ts` — remove Growth paths + add trial logic (guard, trialing webhook, immediate cancel)
- `apps/api/src/db/schema.ts` — drop orphaned columns + migration; add trial columns to profiles
- `apps/web/src/pages/billing/index.tsx` — rewrite layout (2-section + trial banners + first-login banner)
- `apps/web/src/pages/billing/upgrade.tsx` — rewrite (single plan + trial CTA)
- `apps/web/src/lib/api.ts` — simplify checkout signature
- `apps/web/src/components/ui/upgrade-prompt.tsx` — polish ("Start Free Trial" copy)
- `apps/api/src/routes/message-picker.ts` — NEW backend routes
- `apps/api/src/lib/billing/enforce.ts` — verify no Growth refs
- `apps/api/src/lib/billing/usage.ts` — verify no Growth refs
- Any component with hardcoded `plan === 'growth'` checks

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Active Growth subscriber exists | Low | High | Fallback to Free limits, prompt upgrade |
| Stripe price ID mismatch | Medium | Critical | Verify env vars before deploy |
| Schema migration fails | Low | High | Test migration on staging first |
| Frontend caches old limits | Medium | Medium | Hard-refresh + cache-bust query keys |
| Webhook month reset still wrong | Low | Critical | Unit test with mocked period_end |
| Orphaned column migration breaks reads | Low | Medium | Additive-only first, drop columns second |
| Trial restart abuse | Low | High | `trial_used` boolean enforced server-side pre-checkout |
| Trial user forgets to add payment method | Medium | Medium | Countdown banner, urgent variant at ≤3 days |
| Immediate trial cancellation UX surprise | Low | Medium | Clear "Cancel Trial = immediate downgrade" copy |

---

**END OF PRD**
