# Leads Page Bug Fixes & UX Overhaul Plan

## Current State Summary

After full code audit of `apps/web/src/pages/leads/[id].tsx` (1792 lines) and backend routes:

- **3 enrichment containers** exist: Contact Enrichment, AI Insights, Profile & Enrichment
- **6 CTA buttons** related to enrichment (Enrich contact, Get AI Insights, Smart/AI Suggest, Auto-find owner, Extract owner from reviews, Verify email)
- **Review data IS persisted** to DB (`review_summary` JSONB + `reviews_fetched_at` columns via migration 022)
- **Pipeline status is read-only** Badge — no dropdown to change manually
- **2 verify buttons** exist (inline + with confirmation)
- **No star/favorite feature** exists yet
- **Contact info overflows** — no truncation on email rows, packed layout
- **Activity container** renders timeline of 11 activity types

---

## Phase 1: Review & Personalisation Fixes

### 1A. Investigate review data disappearing on refresh
**Symptom:** Review details show temporarily, disappear on page refresh.
**Hypothesis:** The `review_summary` JSONB is being saved to DB but the GET lead endpoint may not be returning it, OR the frontend fetches fresh lead data on mount that overwrites the cached review_summary.

**Investigation steps:**
1. Check `GET /leads/:id` API response — does it include `review_summary` and `reviews_fetched_at`?
2. Check `apps/api/src/routes/leads.ts` — does the select query include `review_summary`?
3. Check `apps/api/src/db.ts` — `getLeadById()` — does it select `review_summary`?
4. Check frontend `useQuery` for `["lead", leadId]` — what data does it receive?
5. Verify migration 022 actually ran: query Supabase REST API for a lead with review data
6. Check if the `Lead` TypeScript type in `packages/shared/src/types.ts` has `review_summary` and if the frontend code references it correctly

**Fix direction:** Ensure the DB column exists, the API selects it, the type includes it, and the frontend reads it from the query cache.

### 1B. Fix email personalisation not using review data
**Current state:** Backend (`ai-email.ts` lines 149-163) DOES use review_summary fields (owner_name, themes, usp_candidates, pain_points). Frontend DOES pass `review_summary` to the API (lines 335-394 in `[id].tsx`).

**Investigation steps:**
1. Test actual AI email generation with a lead that has review_summary — does the email reference review insights?
2. Check if `review_summary` JSON parse on backend matches expected shape
3. Check if `owner_first_name` fallback works when `review_summary.owner_name` exists but `lead.owner_first_name` is null
4. Verify the system prompt actually conditions on review context being present

**Fix direction:** Likely a data flow issue — review_summary may not be reaching the AI email endpoint due to the same refresh/disappearing issue from 1A. Fix that first, then test.

### 1C. Remove Owner Name field from CTA scan
**Current:** "Auto-find owner name" button (line 1745) + "Extract owner from reviews" (line 1778) — both in Profile & Enrichment card. This will be consolidated into the new deep enrichment flow (see Phase 2).

**Action:** Remove both buttons from Profile & Enrichment card. Owner name extraction will be part of "Deep Enrichment" only.

---

## Phase 2: Enrichment UX Consolidation

### 2A. Merge 3 enrichment containers → 2 dedicated containers
**Target layout:**

**Container 1: Contact Information**
- Primary info: Email (with status), Phone, Full Name, Website, LinkedIn
- "+ Enrich contact" button (basic enrichment — Outscraper contact data)
- Remove verify button from here

**Container 2: Business Intelligence**
- Owner name (from deep enrichment)
- Staff names, themes, USPs, pain points (from reviews)
- Social links (Facebook, Instagram, Twitter/X)
- Rating + review count
- "Deep Enrichment — 2 credits" button (combines current Get AI Insights + owner extraction)
  - Tooltip/expandable: "Scans customer reviews to extract: owner name, business insights for deep personalisation, staff names, competitive advantages"

**Remove entirely:**
- Profile & Enrichment card (third container) — its useful content moves into the 2 containers above
- All duplicate CTA buttons

### 2B. Deep Enrichment flow
**New button:** "Deep Enrich — 2 credits" (replaces Get AI Insights + Auto-find owner + Extract owner from reviews)

**Flow:**
1. User clicks "Deep Enrich"
2. Confirmation dialog shows what they'll get:
   - Owner name & confidence
   - Business themes from reviews
   - Unique selling points
   - Pain points customers mention
   - Staff names mentioned in reviews
3. Charges 2 enrichment credits
4. Calls Outscraper reviews + LLM extraction (existing `fetchReviews` + enrichment logic combined)
5. Results populate Business Intelligence container
6. Owner name auto-fills into Contact Information

**Implementation:**
- New backend route: `POST /leads/:id/deep-enrich` (or extend existing `fetchReviews`)
- Combine: Outscraper reviews fetch + enrichment owner extraction in one call
- Return combined result, persist all to DB

### 2C. Post-enrichment nudge → AI email
**After deep enrichment completes:**
- Show toast: "Deep enrichment complete! Use Smart Suggest to write a personalised email"
- Change "AI Suggest" button label to "Smart Suggest" (already does this when review_summary exists)
- Optionally: subtle pulse/highlight animation on Smart Suggest button for 5 seconds

**After basic contact enrichment:**
- Show toast: "Contact enriched! Try AI Suggest to draft your outreach email"
- No forced flow — just nudge

### 2D. Remove redundant CTAs
**Buttons to remove:**
- "Auto-find owner name" (line 1745) — absorbed by Deep Enrich
- "Extract owner from reviews" (line 1778) — absorbed by Deep Enrich
- "Verify email" inline button (lines 873-881) — removing entirely per spec
- "Verify email — 1 credit" in Contact Enrichment card (lines 1031-1052) — removing entirely per spec

**Buttons to keep (renamed/condensed):**
- "Enrich contact" → stays in Container 1 (renamed from "Enrich contact — 1 credit")
- "Deep Enrich" → new button in Container 2 (replaces "Get AI Insights" + owner extraction)
- "Smart Suggest" / "AI Suggest" → stays in email composer

---

## Phase 3: Contact Info Container Fix

### 3A. Fix content spilling out of container
**Issue:** Email row + status badge + verify button in a single flex row with no truncation. Long emails overflow.

**Fix:**
- Add `truncate` + `min-w-0` to email/address text spans
- Remove verify button (per spec) — frees space
- Ensure Contact Enrichment email row (line 953) also gets `truncate` + `min-w-0`
- Add `overflow-hidden` to the card container
- Test with long email addresses and company names

### 3B. Restructure Contact Information layout
**New layout:**
```
┌─ Contact Information ────────────────────┐
│ Email    john@verylongemail.com    ✓     │
│ Phone    +44 7700 900123                 │
│ Name     John Smith                      │
│ Website  example.com              ↗      │
│ LinkedIn linkedin.com/in/john     ↗      │
│                                          │
│ [+ Enrich contact]                       │
└──────────────────────────────────────────┘
```
- Each field on its own line with label + value
- Values with `truncate` class
- External links get ↗ icon
- No inline buttons next to values (except status badge for email)

---

## Phase 4: Remove Verify Function

### 4A. Remove verify button beside email address
**Location 1:** Lines 873-881 in Contact Info card — inline "Verify" link
**Location 2:** Lines 1031-1052 in Contact Enrichment card — "Verify email — 1 credit" button + confirmation dialog

**Actions:**
1. Remove inline verify button from Contact Info card
2. Remove verify button + `confirmVerify` state + dialog from Contact Enrichment card
3. Keep the email status display (Valid/Invalid/Catch-all badge) — that's useful info, just remove the action
4. Remove `verifyEmail` handler function (lines 308-332)
5. Consider removing `POST /leads/:id/verify-email` route or just leave it (no UI trigger)

---

## Phase 5: Remove Activity Container

### 5A. Remove ActivityLog from lead detail page
**Current:** Two places show activity:
1. `ActivityLog` component in main content area (line 1233-1239)
2. History tab in right column (lines 1496-1518)

**Actions:**
1. Remove `ActivityLog` component import and usage from [id].tsx
2. Decide: keep History tab or remove it too? (It shows same data with absolute timestamps)
3. Recommendation: Remove both. Pipeline status changes (Phase 6) give enough context. Activity data stays in DB for analytics later.

---

## Phase 6: Pipeline Status Dropdown

### 6A. Replace read-only Badge with editable dropdown
**Current:** `<Badge className="capitalize">{lead.status}</Badge>` (line 700)

**New:** Pipeline status dropdown/select component:
```
[new ▾] → new | contacted | replied | interested | closed | not_interested | archived
```

**Implementation:**
- Use a Select component (or simple dropdown)
- Display current status with color coding
- On change: call `api.pipeline.updateStatus(leadId, newStatus, notes)`
- Optimistic update via `queryClient.setQueryData`

### 6B. Auto-transition on email send
**Current:** Already changes `new → contacted` when email sent (lines 405-431)

**Enhancement:** Also transition if status is `archived` or `not_interested` — sending an email suggests they're back in play, so move to `contacted`. But don't downgrade from `replied` or `interested` (those are further along).

**Logic:**
```ts
const canAutoTransition = ['new', 'archived', 'not_interested'].includes(lead.status);
if (canAutoTransition) {
  await api.pipeline.updateStatus(leadId, 'contacted', `Email sent: ${subject}`);
}
```

---

## Phase 7: Star/Favorite Lead (Decision Required)

### 7A. What would starring achieve?
- **Bring to top:** Starred leads sort first in the leads table (with `is_starred` column)
- **Filter:** Quick filter to show only starred leads
- **Priority queue:** Starred leads get prioritised in pipeline views

### 7B. If implemented:
**Backend:**
1. Migration: `ALTER TABLE leads ADD COLUMN is_starred BOOLEAN DEFAULT FALSE`
2. Update `Lead` type in `packages/shared/src/types.ts` with `is_starred`
3. API: Add `PATCH /leads/:id` support for `is_starred` toggle
4. Update leads list query to support `?starred=true` filter + sort by `is_starred DESC`

**Frontend:**
1. Star icon toggle in lead detail header (next to pipeline status)
2. Star column in leads table (`leads/index.tsx`)
3. "Starred" filter in leads table toolbar

**Estimate:** ~1 hour if doing full stack

---

## Phase 8: Implementation Order & Risk Assessment

### Recommended execution order:

| Step | Phase | Risk | Depends On |
|------|-------|------|------------|
| 1 | 1A: Fix review data disappearing | LOW | None — bug fix |
| 2 | 1B: Verify email personalisation works | LOW | Step 1 |
| 3 | 4A: Remove verify buttons | LOW | None — pure removal |
| 4 | 5A: Remove activity container | LOW | None — pure removal |
| 5 | 3A: Fix contact info overflow | LOW | None — CSS fix |
| 6 | 6A: Pipeline status dropdown | MED | None — new component |
| 7 | 2A-D: Enrichment consolidation | HIGH | Steps 1,3 — major refactor |
| 8 | 1C: Remove owner name CTA | LOW | Step 7 — button already absorbed |
| 9 | 7A-B: Star feature (if approved) | MED | Step 6 — sort interaction |

### Testing checkpoints:
- After Step 1: Refresh lead with reviews — data persists?
- After Step 2: Generate AI email on lead with reviews — mentions themes/owner?
- After Step 5: Check long email addresses — no overflow?
- After Step 6: Send email → status auto-changes? Manual change works?
- After Step 7: Deep enrichment button → charges 2 credits → fills both containers → nudge to Smart Suggest?
- After all: Full smoke test with smoke-2026@leadgenapp.com

### Open questions for user:
1. **Star feature:** Implement now or defer? What should it achieve beyond sorting to top?
2. **Activity removal:** Remove both ActivityLog + History tab, or keep History tab as a collapsible?
3. **Deep enrichment price:** 2 credits total (reviews + owner extraction combined), or keep as separate 1+1 credit actions?
4. **Pipeline auto-transition:** Should sending an email also transition `archived`/`not_interested` leads to `contacted`?
5. **Review cache:** Current 7-day cache on review data. Is this right or should it be longer/shorter?
