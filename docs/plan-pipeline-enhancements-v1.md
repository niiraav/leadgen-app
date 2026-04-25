# Pipeline Enhancements V1 — Implementation Plan

**Persona:** Solo Consultant or Small Agency Owner running outbound lead gen for local UK businesses. 20–150 active leads. Price sensitive (£29–£49/mo). Needs speed over depth, action over analysis.

**Features:**
1. Follow-Up Due Dates (Pain 1 + 2)
2. Loss Reason Capture (Pain 5)
3. Pipeline Health Summary (Pain 3)
4. Deal Value Capture (enables £ values in health strip)

**Total est. effort:** 5 days (2 + 1 + 1 + 1)
**DB changes:** 3 columns total — no new tables

---

## 1. Follow-Up Due Dates

### Problem
The board shows status, not urgency. A lead in "Contacted" for 14 days looks identical to one contacted yesterday. Once a proposal is sent, there's no system reminding them to follow up. Deals die from forgetting.

### Solution
When a card is dropped onto a commitment stage (e.g. "Proposal Sent"), show a tiny modal: "When should you follow up?" Defaults to 5 days. The card shows a red / amber / green dot based on that date. A "Due Today" filter pill surfaces leads needing attention now.

### DB Schema
```sql
-- NEW COLUMN (greenfield)
ALTER TABLE leads ADD COLUMN follow_up_date DATE;
```
- `DATE` type, nullable, indexed.
- No time component — daily granularity only.

> **Loss reason already exists.** Migration 027 added `loss_reason` to the PostgreSQL `leads` table. It may have a `CHECK` constraint whose values conflict with the app code, or Drizzle may have omitted the constraint entirely. Do **not** add the column again. Before building, verify the live Supabase DB: if a CHECK constraint exists with wrong values, apply a corrective migration to align it to the five canonical values: `no_response`, `wrong_timing`, `too_expensive`, `went_with_competitor`, `not_a_fit`. `loss_reason_notes` must also be confirmed as existing or added if missing.

### Backend
- **Migration:** Add via Supabase Dashboard SQL Editor. Regenerate TS types.
- **PATCH /leads/:id** — accept `follow_up_date` (ISO-8601 date or `null` to clear).
- **GET /leads** — include `follow_up_date` in the response (used by client-side filter predicates).

Server-side health colour — computed from a **shared pure function** in `packages/shared/src/utils/followUp.ts`:
```ts
export function followUpHealth(followUpDate: string | null): "red" | "amber" | "green" | null {
  if (!followUpDate) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);      // Critical: BST-safe
  const due = new Date(followUpDate);
  due.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0)  return "red";    // overdue
  if (diffDays === 0) return "amber"; // due today
  return "green";                       // upcoming
}
```
- API imports it to include `follow_up_health` in the response.
- `PipelineCard.tsx` imports the same function to recompute locally if the date crosses midnight while the board is open — no stale colours between fetches.
- Add to `packages/shared` alongside the existing `STALE_DAYS` constant in `packages/shared/src/constants/pipeline.ts`.

### Frontend
- **Modal on drop:** Triggered by stage config `requiresFollowUp: true`. Title "Follow up by...", date input, default today+5, buttons "Set date" / "Skip".
- **Card indicator:** 🔴 overdue / 🟠 due today / 🟢 upcoming / no dot if unset. Top-right of card, always visible.
- **Filter pills:** "All" / "Due Today" / "Overdue" / "This Week" above the board. Reflect in URL query (`?filter=due_today`).
- **Detail page:** Show date, editable inline, save on blur.

---

## 2. Loss Reason Capture

### Problem
When a lead goes cold, there's no structured record of why. The operator repeats the same mistakes with no feedback loop.

### Solution
When a card is dragged to "Lost", show a lightweight modal with 5 radio options + optional text. One enum column. Over time, a simple report shows patterns.

### DB Schema
No new column. `loss_reason` already exists from Migration 027 (with a conflicting CHECK constraint) and `loss_reason_notes` may already exist. Apply the **v3.4 corrective migration** to align the constraint values to:
- `no_response`
- `wrong_timing`
- `too_expensive`
- `went_with_competitor`
- `not_a_fit`

If `loss_reason_notes` is missing, add it:
```sql
ALTER TABLE leads ADD COLUMN loss_reason_notes TEXT;
```

### Backend
- **PATCH /leads/:id** — accept `loss_reason` + `loss_reason_notes`. Reject if `status !== 'lost'`.
- **GET /analytics/loss-reasons** — aggregation: `SELECT loss_reason, COUNT(*) ... GROUP BY loss_reason`.

### Frontend
- **Modal on drop to Lost:** "Why did this lead go cold?" — 5 radios + optional text area. Buttons "Save" / "Skip for now".
- **Card badge:** Muted grey badge with human-readable label (e.g. "No response") on Lost cards only.
- **Detail page:** Editable reason + notes inline.
- **Report (future):** Bar chart of loss reasons — deferred, single aggregation query.

---

## 3. Pipeline Health Summary

### Problem
Zero visibility on whether outreach converts. Operator makes decisions on gut feel.

### Solution
Four stat cards above the board, always visible. No charts, no tabs, no date pickers. Repurposes the Gray-UI `StatCard` card-within-card visual pattern (`components/stats/stat-card.tsx`) but adapts the footer from trend rows to monetary values.

**Gray-UI reference:** `components/stats/stat-card.tsx` + `components/tickets/ticket-stats.tsx`
- Outer card: `bg-muted/40` shell with `rounded-2xl`
- Inner card: `bg-card` content area with `rounded-[calc(var(--radius-2xl)-6px)]`
- Header: icon + label (uppercase, muted, tracking-wide)
- Body: `text-3xl` value
- Footer: free slot (Gray-UI uses trend arrows + delta + %; we repurpose for GBP value)

**Our adaptation:** We already have `KPICard` in `apps/web/src/components/ui/card.tsx` (lines 88–134) with a similar structure: title, value, optional change row, icon. Rather than introduce a duplicate component, extend `KPICard` with a `secondaryValue` prop for the GBP figure.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ ⚡ Stale     │  │ 📋 Proposals│  │ 💬 Replies  │  │ 🏆 Won this │
│    leads     │  │    out       │  │  this week   │  │   month     │
│ ┌─────────┐  │  │ ┌─────────┐  │  │ ┌─────────┐  │  │ ┌─────────┐  │
│ │ 8       │  │  │ │ 5       │  │  │ │ 4       │  │  │ │ 2       │  │
│ │ (£0)    │  │  │ │ (£4,200)│  │  │ │         │  │  │ │ (£1,800)│  │
│ └─────────┘  │  │ └─────────┘  │  │ └─────────┘  │  │ └─────────┘  │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

### Metric Definitions

**Stale leads**
Count of leads whose effective stage is NOT `'converted'` or `'lost'`, AND `updated_at < now() - 14 days`. Effective stage = `COALESCE(pipeline_stage, engagement_status, status, 'new')` to match the board's `getLeadColumn()` fallback. Computed query — no `is_stale` column. Clicking the card activates the stale board filter (see Section 3.5). `STALE_DAYS = 14` is exported from `packages/shared/src/constants/pipeline.ts`.

**Proposals out**
Count of leads where `pipeline_stage = 'proposal_sent'`, plus the sum of `deal_value` for those leads. Formatted as GBP. The value figure renders in the card footer as the secondary value. The unit (pence vs pounds) is verified in Day 0 (Section 3.4 of v3.4 PRD) before formatting logic is written.

**Replies this week**
Count of `reply_events` rows where `created_at` is within the last 7 rolling days, joined to `leads` on `user_id`. Presented as a raw count, not a percentage. No secondary value.

**Won this month**
Count of leads where `pipeline_stage = 'converted'` and `converted_at` is within the current calendar month, plus the sum of their `deal_value`. Uses `converted_at` exclusively — not `updated_at`, not `status = 'won'`. Only counts leads with non-null `converted_at` (backfilled or newly set). GBP value in footer.

### Backend
- **Consume the existing v3.4 `/analytics/pipeline-health` endpoint.** This plan does not define a new endpoint — the v3.4 PRD already extends it with `stale_count`, `proposals_out`, `won_this_month_value`, and other fields. This feature is the **frontend consumer** of that endpoint.
- **Reconcile the response shape** with v3.4 before either ships. The v3.4 shape uses flat fields; this plan originally nested objects. Agree on one flat shape now to avoid type conflicts on day one.
- **Replies this week** uses a raw count from `reply_events` joined to `leads` on `user_id`, scoped to the last 7 rolling days — not a percentage. A percentage metric is unreliable because manual `mailto:` sends are not tracked as distinct events.
- Guard against division by zero on any computed ratios. All counts scoped to current `client_id`.

### Frontend

**Stats strip:** Above the board, below filter pills. Grid layout: `grid gap-4 sm:grid-cols-2 xl:grid-cols-4` (matches Gray-UI `TicketStats` grid). Uses extended `KPICard` with `secondaryValue` prop.

**Card interaction:** Stale leads card is clickable — sets `boardFilter = 'stale'`. Other cards are informational only.

**Data mapping to KPICard props:**
| Metric | title | value | secondaryValue (footer) | icon | changeType |
|---|---|---|---|---|---|
| Stale leads | "Stale leads" | stale_count | `null` | AlertCircle or Clock | — |
| Proposals out | "Proposals out" | proposals_out_count | `£${proposals_out_value}` | FileText or Send | — |
| Replies this week | "Replies this week" | replies_this_week | `null` | MessageSquare | — |
| Won this month | "Won this month" | won_this_month | `£${won_this_month_value}` | Trophy or CheckCircle | — |

**Auto-refresh:** Fetch on page load + re-fetch after any card move. No polling. Strip hides on API failure so board is never blocked.

**Mobile:** Horizontally scrollable or 2×2 grid on very narrow screens.

**Loading:** Fixed-height skeleton placeholders. Zero layout shift when data arrives.

**Error:** Strip disappears entirely. No user-visible error message. Board unaffected.

**All zeros:** Strip renders with all numbers as 0 in muted grey. Meaningful for new users — confirms the product is working, pipeline is just empty.

---

## 4. Deal Value Capture

### Problem
The health strip shows "Proposals out: 5 (£4,200)" but there is no way to enter that £4,200. The number is either backfilled from enrichment or null. The operator cannot record what a deal is worth, so pipeline financial visibility is fake or missing.

### Solution
Add deal value as a single editable field inside the merged lead/reply detail drawer. Not on the card, not on drop, not in a modal. The drawer is the editing surface; the card is the scanning surface.

### DB Schema
No new column. `deal_value` already exists as schema drift from prior work (Section 3.1 of v3.4 PRD). Verify in live DB whether it stores pence or pounds before writing formatting logic.

### Backend
- **PATCH /leads/:id** — accept `deal_value` as integer. Store whatever unit the DB already uses (pence or pounds). Do not transform at the API layer; transform only at display time.
- **GET /leads** — include `deal_value` in the response.

### Frontend

**Drawer (primary surface):**
- Editable number field, prominent placement near the top for Proposal Sent / Converted leads.
- Explicit **Save** button. Not save-on-blur.
- Visible status: idle → "Saving..." → "Saved" → idle.
- GBP prefix (£), comma-formatted on display. Raw integer sent to API.
- Single value only — no min/max range. The persona records one estimated deal value, not a spread.

**Card (read-only signal):**
- Show formatted deal value as plain text if set. No placeholder, no £— when null. Null = blank space.
- Compact formatting: "£4.2k" for values ≥ 10,000 to prevent width overflow.

**Drop behaviour:**
- No modal, no chip, no prompt on drop to Proposal Sent. The user drops the card, then opens the drawer to enter the value when ready. Zero friction on drag-and-drop.

---

## Cross-Cutting Rules

| Rule | Rationale |
|---|---|
| **All date comparisons use `setUTCHours(0,0,0,0)`** | BST off-by-one prevention. |
| **Health colours from shared pure function** | Export `followUpHealth()` in `packages/shared`. API and client import the same function — no duplicate logic, no stale colours. |
| **Modal must have a Skip / Cancel** | Never block the user's flow. Admin is secondary to action. |
| **All counts scoped to `client_id`** | Multi-client operator must never see cross-client data. |
| **Currency always GBP, comma-formatted** | UK market, solo operator thinks in £. |
| **No new tables** | Additive columns only. Minimum blast radius. |
| **Filter state in URL + client-side `boardFilter`** | URL param (`?filter=due_today`) enables deep-linking, but the actual filter predicate runs client-side via the existing `boardFilter` enum in `usePipelineBoard`. No new backend query params — avoids breaking the shared data model between board and list view. |

---

## DB Changes Summary

| Column | Type | Nullable | Status |
|---|---|---|---|
| `follow_up_date` | `DATE` | Yes | **New** — add via migration |
| `loss_reason` | `TEXT` (CHECK constraint) | Yes | **Already exists** — apply v3.4 corrective migration to fix enum values |
| `loss_reason_notes` | `TEXT` | Yes | **Confirm exists** — add only if missing |
| `deal_value` | `INTEGER` | Yes | **Already exists** — verify unit (pence vs pounds) in live DB before formatting |

No new tables. No schema rewrites. All additive.

---

## Build Order

1. **Follow-Up Due Dates** (2 days) — highest pain impact, sets visual indicator pattern.
2. **Pipeline Health Summary** (1 day) — builds on same board layout, no DB changes.
3. **Loss Reason Capture** (1 day) — modal pattern already established by feature 1.
4. **Deal Value Capture** (1 day) — drawer edit surface, no new DB column, no drop friction.

---

## Acceptance Criteria

### Follow-Up Due Dates
- [ ] `follow_up_date` column exists, `DATE`, nullable, indexed.
- [ ] `followUpHealth()` exported from `packages/shared` and imported in both API and `PipelineCard.tsx`.
- [ ] Dropping onto "Proposal Sent" opens follow-up modal; defaults to 5 days.
- [ ] "Set date" persists; "Skip" closes without persisting.
- [ ] Card shows red (overdue) / amber (due today) / green (upcoming) dot.
- [ ] "Due Today" / "Overdue" filter pills apply client-side via `boardFilter` (read from URL `?filter=due_today` on mount).
- [ ] Detail page shows editable follow-up date.

### Loss Reason Capture
- [ ] v3.4 corrective migration applied so `loss_reason` CHECK constraint allows: `no_response`, `wrong_timing`, `too_expensive`, `went_with_competitor`, `not_a_fit`.
- [ ] `loss_reason_notes` column exists (added if missing).
- [ ] Dropping onto "Lost" opens reason modal; 5 radio options + optional text.
- [ ] "Save" persists; "Skip for now" closes without persisting.
- [ ] API rejects `loss_reason` on non-Lost leads (400).
- [ ] Lost cards show muted grey badge with human-readable label.

### Pipeline Health Summary
- [ ] Stats strip consumes the v3.4 `/analytics/pipeline-health` endpoint (not a new endpoint).
- [ ] Response shape reconciled with v3.4 before shipping (flat fields, not nested objects).
- [ ] Strip shows "Replies this week" as a raw count (not a percentage) — manual outbound sends are untracked, so a denominator is unreliable.
- [ ] Strip uses repurposed Gray-UI card pattern: outer `bg-muted/40` shell + inner `bg-card` content area (or extends existing `KPICard` with `secondaryValue` prop).
- [ ] Proposals out and Won this month cards show GBP value in footer/slot below the count.
- [ ] Stale leads card is clickable — activates `boardFilter = 'stale'` client-side filter.
- [ ] Strip visible above board; updates after card moves.
- [ ] GBP values comma-formatted.
- [ ] Empty pipeline → all zeros, no NaN.
- [ ] Mobile: strip scrolls or stacks gracefully (sm:grid-cols-2 xl:grid-cols-4).

### Deal Value Capture
- [ ] `deal_value` unit verified in live DB (pence vs pounds) before any formatting code is written.
- [ ] Drawer shows editable deal value field with GBP (£) prefix, comma-formatted display.
- [ ] Explicit Save button — not save-on-blur.
- [ ] Visible save status: idle → "Saving..." → "Saved" → idle.
- [ ] Single value only — no range min/max inputs.
- [ ] PATCH `/leads/:id` accepts `deal_value` as raw integer; no unit transformation at API layer.
- [ ] Card shows read-only formatted value if set; null renders as blank (no placeholder).
- [ ] Compact card formatting: "£4.2k" for values ≥ 10,000.
- [ ] No modal, chip, or prompt on drop to Proposal Sent.
- [ ] Health strip "Proposals out" value updates after deal value is saved.

---

## Testing Plan

### Unit Tests
1. `followUpHealth()` — correct colours for past/today/future/null.
2. `followUpHealth()` imported from `packages/shared` in both API and web builds — no duplicate implementation.
3. BST boundary — 23:00 UTC on 24 Apr still treated as 24 Apr.
4. Loss reason enum — accepts 5 corrected values, rejects legacy values (`no_budget`, `went_silent`, etc.).

### API Smoke Tests
1. PATCH `follow_up_date` → verify `follow_up_health` in GET response matches local recomputation.
2. PATCH `loss_reason` on Lost lead → 200; on Contacted lead → 400.
3. `GET /analytics/pipeline-health` (v3.4 endpoint) matches expected counts after seeding leads; "Replies this week" counts `reply_events` in last 7 days.
4. Verify `loss_reason` CHECK constraint rejects legacy enum values after corrective migration.

### E2E Tests
1. Drag card to "Proposal Sent" → modal → set date → green dot appears.
2. Advance system date → green becomes red → "Overdue" client-side filter shows card (no backend refetch needed for filter).
3. Drag card to "Lost" → modal → select "Wrong timing" → grey badge appears.
4. Move card to "Won" → stats strip increments "Won this month", decrements "Active leads" (via v3.4 endpoint re-fetch).
5. Mobile: filter pills scroll; stats strip does not overflow.
6. Open lead drawer → enter deal value → Save → "Saved" appears → card shows £ value → strip updates.
7. Clear deal value → Save → card shows blank → strip excludes value from sum.
8. Click "Stale leads" stat card → board filter activates → only stale leads visible → drag-and-drop works normally.

### Regression Tests
1. Cards without `follow_up_date` / `loss_reason` / `deal_value` display identically to before.
2. Search + enrichment pipeline unaffected.
3. Client switcher scopes all stats + filters correctly.
4. `KPICard` component still works on dashboard page (no `secondaryValue` prop regression).

---

## Persona Fit Check

| Feature | Pain | Persona Fit |
|---|---|---|
| Follow-Up Due Dates | 1 + 2 | One date field, not a CRM task system. Visual dot is glanceable. "Due Today" filter answers "who do I contact now?" |
| Loss Reason Capture | 5 | 5 radios + skip. Compounding value via aggregation. Muted badge — lost leads don't steal attention. |
| Pipeline Health Summary | 3 | 4 numbers, 3 seconds. No charts. £ values make it tangible. Always visible, never buried in a tab. |
| Deal Value Capture | 3 (financial visibility) | Single number in the drawer where they already work. No range complexity. Card shows it only when set — no pressure to guess. |
