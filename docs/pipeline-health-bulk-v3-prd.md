# Pipeline Health & Bulk Operations PRD
## v3.2 — Final (Revised)

**Date:** 2026-04-24
**Depends on:** pipeline-board-prd.md (v1 ✅), pipeline-board-v2-prd.md (v2 — in progress)
**Status:** Ready to build

***

## 1. Revision History

| Version | Key Change |
|---|---|
| v3.0 | Initial draft — bulk move incorrectly treated as greenfield, schema drift unacknowledged, duplicate health endpoint |
| v3.1 | Structural fixes — bulk move reframed, schema drift added as Day 0, loss reason enum unified, supabaseAdmin declared |
| v3.2 | Final — `is_stale`/`stale_snoozed_until` removed from schema sync (dead columns), stale source of truth switched to computed `updated_at` threshold, stale filter made client-side, `last_status_change_at` added to bulk side effects, activity logging clarified, `won_this_month` backward compat explicit, proposals index added, Migration 027 index defect documented |

***

## 2. Problem Statement

### 2.1 What v2 Leaves Unsolved

After v2 ships the board answers "what do I do today?" via urgency indicators and follow-up dates. It does not answer:

- **"Is my pipeline healthy?"** — leads stagnate across columns with no visible signal
- **"What's in flight financially?"** — no revenue summary above the board
- **"Are people responding?"** — reply volume is invisible
- **"Moving 15 leads is unreliable"** — bulk move UI exists but fires N parallel PATCH calls; any one can fail silently while others succeed

### 2.2 What Is and Isn't Being Built

| Item | Status | This PRD |
|---|---|---|
| Multi-select UI (Cmd/Ctrl+click, Shift+range) | ✅ Built | No change |
| SelectionToolbar with bulk move dropdown | ✅ Built | No change |
| Drag overlay with count badge | ✅ Built | No change |
| LossReasonModal (single + bulk) | ✅ Built | No change |
| handleDragEnd routing + loss interception | ✅ Built | No change |
| Escape clears selection | ✅ Built | No change |
| Bulk move mutation — N parallel PATCHes | ✅ Built, unreliable | Replace with single endpoint call |
| Health summary strip UI | ❌ Not built | Build in this sprint |
| Strip metrics on `/analytics/pipeline-health` | ❌ Incomplete / buggy | Extend existing endpoint |
| `converted_at` column | ❌ Not in schema | Migration 028 |
| Schema.ts sync for all drifted columns | ❌ Drifted | Day 0 prerequisite |
| `POST /leads/bulk-move` single endpoint | ❌ Not built | Build in this sprint |

***

## 3. Pre-Build Prerequisites (Day 0)

These are not features. They are existing defects that will break new code if unresolved. Nothing in Days 1–6 begins until all four are complete.

### 3.1 Schema.ts Sync

The following columns exist in the SQLite database but are absent from `schema.ts`. All must be added before any new backend code references them:

**From Migration 027 (v2 sprint):**
- `follow_up_date`
- `follow_up_source`
- `deal_value`
- `loss_reason`

**From Migration 028 (this sprint):**
- `converted_at`
- `last_status_change_at`

**Excluded from sync (dead columns):**
- `is_stale` — boolean, added in migrations 004/005 but never populated (no background job exists in the project)
- `stale_snoozed_until` — timestamptz, paired with `is_stale`

These two columns remain in the DB but are not added to `schema.ts` and are not referenced by new code. They may be dropped in a future cleanup migration.

### 3.2 Loss Reason Enum Unification

Migration 027 defines a CHECK constraint with values: `no_budget`, `went_silent`, `chose_competitor`, `unqualified`, `other`

Application code in `leads.ts` and `LossReasonModal.tsx` uses: `no_response`, `wrong_timing`, `too_expensive`, `competitor`, `not_a_fit`, `other`

These do not match. Any write of `wrong_timing` or `too_expensive` is rejected by SQLite with a constraint error. The corrective migration drops the old CHECK constraint and adds the correct one matching app code values. The DB is changed to match the user-facing application code — not the other way around.

### 3.3 Stale Source of Truth

**Finding:** The `is_stale` boolean column (migrations 004/005) is never populated. No background job, cron, or scheduled task exists in the project to set it to `true`. The analytics endpoint queries `is_stale = true` and has returned `stale_count: 0` for every user since it shipped.

**Decision:** Stale detection uses a computed `updated_at` threshold.

```ts
// packages/shared/src/constants/pipeline.ts
export const STALE_DAYS = 14;

// A lead is stale if:
// 1. pipeline_stage NOT IN ('converted', 'lost')
// 2. updated_at < now() - STALE_DAYS days
```

**Known limitation:** `updated_at` advances on any field edit, including note changes. A lead edited but not progressed will be excluded from stale count even if genuinely inactive. This is accepted as a known proxy limitation for v3. `last_status_change_at` (added in Migration 028) is the correct long-term fix — a future sprint can switch stale detection to that column with a one-line query change.

**Consequence for the stale filter:** The stale filter is a client-side predicate in `usePipelineBoard.ts` `filteredLeadsByColumn` memo, using the exact same definition as the backend. No server round-trip. No change to the board data flow.

### 3.4 Backend Style Declaration

All new backend code in this sprint uses `supabaseAdmin` raw queries to match existing routes in `analytics.ts`, `leads.ts`, and `board.ts`. Drizzle ORM is not used for any route touching the new v2+v3 columns until schema.ts drift is fully resolved and integration-tested.

***

## 4. Migration 027 Index Defect (Document and Fix)

Migration 027 line 17 creates an index with condition:
`WHERE follow_up_date IS NOT NULL AND lifecycle_state NOT IN ('won', 'lost')`

`lifecycle_state` values are `'active'`, `'closed'`, `'archived'` — not `'won'` or `'lost'`. Those are `pipeline_stage` values. The `NOT IN` clause is always true and is dead code.

**Fix in Migration 028:** Drop and rebuild the index with the correct condition:
`WHERE follow_up_date IS NOT NULL AND pipeline_stage NOT IN ('converted', 'lost')`

This is a corrective fix, not a feature change. The index behaviour is unchanged in practice — only the dead condition is corrected.

***

## 5. Pipeline Health Summary Strip

### 5.1 The Strip

```
Stale leads: 8    Proposals out: 5 (£4,200)    Replies this week: 4    Won this month: 2 (£1,800)
```

Rendered above the board columns, below the page header. Always visible on the pipeline page. Hides entirely on API failure — the board is never blocked.

### 5.2 Metric Definitions

**Stale leads**
Count of leads where `pipeline_stage NOT IN ('converted', 'lost')` AND `updated_at < now() - STALE_DAYS`. Uses the `updated_at` computed threshold — not the dead `is_stale` boolean. Amber when greater than zero, muted grey when zero. Clicking it activates the stale board filter (see Section 5.5).

**Proposals out**
Count of leads where `pipeline_stage = 'proposal_sent'`, plus the sum of `deal_value` for those leads in pence, formatted as GBP. The value figure only renders if at least one lead in that column has a non-null `deal_value`. Always neutral colour — informational, not an alert.

**Replies this week**
Count of `lead_activities` rows where `type = 'replied'` and `created_at` is within the last 7 rolling days, joined to `leads` on `user_id`. Presented as a raw count, not a percentage. The denominator (total outbound sends) is unreliable because manual `mailto:` sends are untracked — a percentage would be misleading.

**Won this month**
Count of leads where `pipeline_stage = 'converted'` and `converted_at` is within the current calendar month, plus the sum of their `deal_value`. Uses `converted_at` exclusively — not `updated_at`, not `status = 'won'`. `pipeline_stage = 'converted'` is the board's source of truth; the legacy `status` column is not queried here. Green when greater than zero, muted grey when zero.

### 5.3 Extending `/analytics/pipeline-health`

The existing endpoint is modified with the following changes only. No existing field is renamed or removed.

**Fix:** `stale_count` calculation changes from `.eq('is_stale', true)` to:
```ts
.not('pipeline_stage', 'in', "('converted','lost')")
.lt('updated_at', staleThreshold.toISOString())
```

**Fix:** `won_this_month` calculation changes from `status = 'won'` + `updated_at >= monthStart` to `pipeline_stage = 'converted'` + `converted_at >= monthStart`

**Add:** Three new fields to the response:
- `proposals_out_count` — integer
- `proposals_out_value` — integer (pence)
- `won_this_month_value` — integer (pence)

**Backward compatibility:** The existing `won_this_month` field is retained as a count-only integer for the dashboard consumer at `api.ts` line 632. It is not removed. The health strip reads `won_this_month` for count and the new `won_this_month_value` for the GBP figure. `won_this_month` is marked as deprecated in a code comment — removal is a future sprint after the dashboard consumer is updated.

**No change to:** `health_score`, `uncontacted_count`, `active_sequences`, `conversion_rate`, `insights[]`

### 5.4 Data Freshness

Automatic refresh every 5 minutes. Immediate invalidation and refetch after any lead move, status change, or bulk move success. Single retry on failure, then silently hides.

### 5.5 Stale Filter Integration

The existing filter state in `usePipelineBoard.ts` is a single boolean `dueTodayFilter`. Adding a second filter mode means this must change.

**Specified shape:** Replace `dueTodayFilter: boolean` with `boardFilter: 'due-today' | 'stale' | null`. The `filteredLeadsByColumn` memo (lines 234–249) is updated to branch on this enum. Only one filter mode is active at a time — activating stale while due-today is active replaces it, and vice versa. The existing filter pill UI gains a second pill for stale.

**Stale filter predicate (client-side):**
```ts
const isStale = (lead: Lead) => {
  const stage = lead.pipeline_stage;
  if (stage === 'converted' || stage === 'lost') return false;
  const updatedAt = new Date(lead.updated_at);
  const threshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  return updatedAt < threshold;
};
```

This matches the backend definition exactly. No server round-trip. Drag-and-drop works normally during stale-filter mode because all leads are still loaded in the client cache.

### 5.6 Loading and Error States

- **Loading:** Fixed-height skeleton placeholders. Zero layout shift when data arrives
- **Error:** Strip disappears entirely. No user-visible error message. Board unaffected
- **All zeros:** Strip renders with all numbers as 0 in muted grey. Meaningful for new users — confirms the product is working, pipeline is just empty

***

## 6. Bulk Move Backend Consolidation

### 6.1 The Problem

The existing `bulkMoveMutation` fires N parallel `PATCH /leads/:id` calls. Any individual call can fail silently while others succeed, leaving leads split across columns with no consistent state. The frontend bulk move UI, selection logic, drag overlay, and loss reason modal are all complete and unchanged. Only the API transport changes.

### 6.2 `POST /leads/bulk-move` — Seven Required Side Effects

All seven must execute or none execute. Partial success is not acceptable.

1. **Status update** — set `pipeline_stage` or `engagement_status` and `status` for all lead IDs. Clear the opposing field as the existing PATCH handler does

2. **Follow-up date** — set `follow_up_date` and `follow_up_source = 'column_default'` from `defaultFollowUpDays` on the target column (from `packages/shared`). Do not override leads where `follow_up_source = 'manual'`

3. **Board position cleanup** — delete `lead_board_positions` rows for all moved leads where `column_id` does not match the target column

4. **`converted_at` setting** — if target column is `converted`, set `converted_at = now()`. Reset if a lead re-enters `converted` after previously leaving it

5. **`last_status_change_at` setting** — set `last_status_change_at = now()` for all leads whose `pipeline_stage` or `engagement_status` changes. This matches the PATCH handler behaviour added in Day 1

6. **Loss reason write** — if target column is `lost` and a loss reason is provided, write it using the unified enum values. If skipped (null), write null explicitly

7. **Activity logging** — insert one activity row per lead with `type = 'status_changed'` and `metadata: { from: previousColumn, to: targetColumn, bulk: true }`. The generic `type = 'updated'` activity that PATCH inserts is intentionally omitted for bulk moves — inserting both rows for each of N leads would create excessive activity log noise for large selections. This is a conscious divergence from PATCH, documented here so the timeline display can handle `bulk: true` activities distinctly if needed in future

**Security:** WHERE clause always filters by `userId`. A user can only move their own leads regardless of submitted IDs.

**Selection cap:** Maximum 100 lead IDs accepted at the backend. The frontend caps at 50 — the backend enforces 100 as an absolute ceiling.

### 6.3 Frontend Change

`bulkMoveMutation` is updated to call `POST /leads/bulk-move` instead of looping `api.leads.update(id, patch)`. Optimistic update logic, rollback on error, toast feedback, selection clearing, and health strip invalidation on success are all unchanged. The only change is the API call shape and the removal of the loop.

***

## 7. Migration 028

**`converted_at`** — nullable timestamp. Set when `pipeline_stage` changes to `converted`. Reset if a lead re-enters `converted` after leaving. Never modified by any other operation. Index: `(user_id, converted_at) WHERE converted_at IS NOT NULL`.

**`last_status_change_at`** — nullable timestamp. Set whenever `pipeline_stage` or `engagement_status` changes on any write path — PATCH `/leads/:id` and `POST /leads/bulk-move`. Added now without being used in stale detection yet. A future sprint can switch stale detection to this column with a one-line query change.

**Loss reason constraint correction** — drop existing CHECK constraint on `loss_reason`. Add corrected CHECK constraint: `loss_reason IN ('no_response', 'wrong_timing', 'too_expensive', 'competitor', 'not_a_fit', 'other')`.

**Proposals out index** — add `idx_leads_proposals ON leads(user_id, pipeline_stage) WHERE pipeline_stage = 'proposal_sent'`. Prevents full table scan on the proposals count and sum query.

**Migration 027 index correction** — drop `idx_leads_user_follow_up`. Rebuild as `WHERE follow_up_date IS NOT NULL AND pipeline_stage NOT IN ('converted', 'lost')`. Corrects the dead `lifecycle_state` condition.

**Backfill** — for existing leads where `pipeline_stage = 'converted'`, backfill `converted_at` from `updated_at` as best-effort. Inaccurate for leads edited after conversion but prevents "Won this month" showing zero for all historical data on day one. Documented as known inaccuracy for the first month — self-corrects as new Won events write accurate timestamps.

***

## 8. Implementation Sequence

| Day | Work |
|---|---|
| 0 | Schema.ts sync: add `follow_up_date`, `follow_up_source`, `deal_value`, `loss_reason`, `converted_at`, `last_status_change_at`. Loss reason corrective migration. Update `analytics.ts` stale query from `is_stale` to `updated_at` threshold |
| 1 | Migration 028: `converted_at`, `last_status_change_at`, loss reason constraint fix, proposals index, Migration 027 index correction, backfill script. Wire `converted_at` and `last_status_change_at` writes in existing PATCH `/leads/:id` handler |
| 2 | Extend `/analytics/pipeline-health`: fix `stale_count` and `won_this_month` to use new columns, add `proposals_out_count`, `proposals_out_value`, `won_this_month_value`. Retain all existing fields |
| 3 | `PipelineHealthStrip` component. `usePipelineHealth` hook. Loading skeleton, error hide. Replace `dueTodayFilter: boolean` with `boardFilter` enum in `usePipelineBoard.ts`. Wire stale filter as client-side predicate. Strip ships independently |
| 4 | `POST /leads/bulk-move` backend endpoint with all seven side effects |
| 5 | Update `bulkMoveMutation` to call new endpoint. Remove N-call loop. Verify optimistic update and rollback behaviour unchanged |
| 6 | Full cycle test: select 10 leads → drag → drop → toast → health strip refreshes → verify all seven side effects in DB. Separate test: stale filter activates, board collapses to stale leads only |

***

## 9. Acceptance Criteria

### 9.1 Prerequisites (Day 0 — blocks all other work)

- [ ] Schema.ts contains `follow_up_date`, `follow_up_source`, `deal_value`, `loss_reason`, `converted_at`, `last_status_change_at`
- [ ] `is_stale` and `stale_snoozed_until` are NOT added to schema.ts (dead columns)
- [ ] Loss reason CHECK constraint in DB matches: `no_response`, `wrong_timing`, `too_expensive`, `competitor`, `not_a_fit`, `other`
- [ ] `analytics.ts` stale query uses `updated_at` threshold, not `is_stale = true`
- [ ] No new `/board/health` route created — strip reads from existing analytics endpoint
- [ ] All new backend code uses supabaseAdmin raw queries

### 9.2 Health Summary Strip

- [ ] Strip renders above board columns, below page header on every pipeline page load
- [ ] Loading state shows fixed-height skeleton — zero layout shift
- [ ] Strip hides entirely on API failure — board unaffected
- [ ] Stale count reads from `updated_at` computed threshold — not the dead `is_stale` boolean
- [ ] Stale count is amber when > 0, muted when 0
- [ ] Clicking stale count sets `boardFilter = 'stale'` — client-side predicate, no server round-trip
- [ ] Due-today filter pill still works — activating one filter deactivates the other
- [ ] Proposals out value only renders when at least one proposal-stage lead has `deal_value` set
- [ ] Replies this week counts `type = 'replied'` activities in last 7 rolling days only
- [ ] Won this month uses `converted_at` and `pipeline_stage = 'converted'` — not `updated_at`, not `status = 'won'`
- [ ] Won this month is green when > 0, muted when 0
- [ ] Existing `won_this_month` count field retained in endpoint response — dashboard consumer unbroken
- [ ] Strip invalidates and refetches after any lead move, status change, or bulk move success

### 9.3 Bulk Move Consolidation

- [ ] `bulkMoveMutation` makes one API call regardless of selection size
- [ ] All selected leads move atomically — no partial success states
- [ ] On failure, all leads return to original columns and error toast shown
- [ ] Status update clears opposing field (`pipeline_stage` vs `engagement_status`)
- [ ] Follow-up dates set from column default for moved leads — manual overrides respected
- [ ] Board positions cleaned up for all moved leads
- [ ] `converted_at` set when target column is `converted`
- [ ] `last_status_change_at` set for all moved leads
- [ ] Loss reason written when provided; null when skipped
- [ ] One `status_changed` activity logged per lead with `bulk: true` in metadata
- [ ] No generic `updated` activity logged for bulk moves (intentional divergence from PATCH)
- [ ] If target is Lost, bulk loss reason modal fires before move executes
- [ ] Toast shows "Moved N leads to [Column Name]"
- [ ] Health strip refreshes on success
- [ ] Frontend selection cap of 50 enforced; backend rejects > 100

***

## 10. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Schema.ts drift causes compile/runtime errors | 🔴 High | Day 0 prerequisite — all six columns added before feature work starts |
| Loss reason constraint rejects valid values | 🔴 High | Day 0 corrective migration |
| Dashboard breaks if `won_this_month` removed | 🔴 High | Field retained as legacy — strip reads new `won_this_month_value` field |
| `POST /leads/bulk-move` misses a side effect | 🟡 Medium | Seven effects explicitly listed in Section 6.2 — Day 6 cycle test verifies each |
| `updated_at` stale proxy hides edited-but-inactive leads | 🟡 Medium | Known limitation documented. `last_status_change_at` added in Migration 028 for future use |
| `converted_at` backfill inaccurate for edited Won leads | 🟠 Low | Documented — self-corrects as new events write accurate timestamps |
| Migration 027 index correction causes brief index rebuild on deploy | 🟠 Low | At SQLite scale with < 10k leads, rebuild is sub-second |

***

## 11. Effort Estimate

| Phase | Days | Risk |
|---|---|---|
| Day 0: Prerequisites | 1 | Low |
| Health summary strip | 2 | Low |
| Bulk move consolidation | 3 | Medium |
| **Total** | **6 days** | — |

Health summary ships independently after Day 3. Bulk consolidation follows Days 4–6. The two features share only health strip invalidation on bulk move success — no other coupling. Day 0 prerequisites are a shared dependency for both.
