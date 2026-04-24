# Pipeline Health & Bulk Operations PRD
## v3.4 — Revised

**Date:** 2026-04-24
**Depends on:** pipeline-board-prd.md (v1 ✅), pipeline-board-v2-prd.md (v2 — in progress)
**Status:** Ready to build

***

## 1. Revision History

| Version | Key Change |
|---|---|
| v3.0 | Initial draft — bulk move greenfield, schema drift unacknowledged, duplicate health endpoint |
| v3.1 | Structural fixes — bulk move reframed, schema drift as Day 0, loss reason unified, supabaseAdmin declared |
| v3.2 | `is_stale`/`stale_snoozed_until` added to schema sync, `last_status_change_at` in bulk side effects, stale source of truth decided, activity logging clarified, `won_this_month` backward compat, proposals index, filter state shape, Migration 027 index defect |
| v3.3 | `is_stale` background job does not exist — Option A invalidated, switched to Option B (computed `updated_at`). Stale filter changed from server-side fetch to client-side memo. `is_stale`/`stale_snoozed_until` removed from schema.ts sync list. Snooze endpoint handling specified. |
| v3.4 | **Fixes:** (1) `updatedAt` added to fetchPipelineLeads select — stale filter needs it. (2) Stale queries use `COALESCE(pipeline_stage, engagement_status, status, 'new')` to handle pre-v2 leads. (3) Bulk move atomicity claim removed — no transaction framework exists; rephrased as sequential with early abort. (4) `converted_at` backfill sources from `lead_activities` not `updated_at`. (5) Loss reason CHECK constraint — verify in live DB before migrating. (6) `reply_events` and `sequence_enrollments` acknowledged as out-of-scope drift. (7) `deal_value` unit verified before formatting. (8) Migration script naming aligned to project convention (no formal migration numbers). |

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
| `converted_at` column | ❌ Not in schema | Migration script |
| Schema.ts sync for drifted columns | ❌ Drifted | Day 0 prerequisite |
| `POST /leads/bulk-move` single endpoint | ❌ Not built | Build in this sprint |

***

## 3. Pre-Build Prerequisites (Day 0)

These are not features. They are existing defects that will break new code if unresolved. Nothing in Days 1–6 begins until all are complete.

### 3.1 Schema.ts Sync

The following columns exist in the SQLite database but are absent from `schema.ts`. All must be added before any new backend code references them:

**From prior sprints:**
- `follow_up_date`
- `follow_up_source`
- `deal_value`
- `loss_reason`

**From this sprint:**
- `converted_at`
- `last_status_change_at`

**Explicitly excluded:** `is_stale` and `stale_snoozed_until` are dead columns — `is_stale` is never set to `true` anywhere in the codebase (no background job exists to populate it), and `stale_snoozed_until` is written by a snooze endpoint that is itself a no-op as a result. These columns are not added to `schema.ts`. They are deprecated in place.

**Acknowledged out-of-scope drift:** `reply_events` and `sequence_enrollments` tables are also absent from `schema.ts`. They are used by existing routes (`analytics.ts`, `replies.ts`, `inbound-reply.ts`) via `supabaseAdmin` raw queries and do not block this sprint because all new backend code follows the same raw-query pattern. They are left for a future schema audit.

### 3.2 `updatedAt` in Fetch Query

The `fetchPipelineLeads` GraphQL select in `usePipelineBoard.ts` (line 279) currently selects: `id`, `businessName`, `email`, `category`, `city`, `country`, `hotScore`, `status`, `engagementStatus`, `pipelineStage`, `followUpDate`, `dealValue`. It does **not** select `updatedAt`. The stale client-side predicate (`updated_at < now() - STALE_DAYS`) will always evaluate to `false` because `updated_at` is `undefined`. `updatedAt` must be added to the select list as a Day 0 prerequisite.

### 3.3 Loss Reason Enum

Application code in `leads.ts` and `LossReasonModal.tsx` uses: `no_response`, `wrong_timing`, `too_expensive`, `competitor`, `not_a_fit`, `other`.

**Before writing a corrective migration, verify in the live DB whether a CHECK constraint actually exists.** The project uses Drizzle `schema.ts` for type generation, but SQLite CHECK constraints are not necessarily declared there. If the live DB has no CHECK constraint on `loss_reason`, no migration is needed — the app code is already the source of truth. If a CHECK constraint exists with different values, drop it and re-add matching the app values above.

### 3.4 `deal_value` Unit Verification

Before formatting GBP values in the health strip, verify whether `deal_value` is stored in **pence** or **pounds** in the live DB. Check a few existing rows. The formatting logic must divide by 100 only if the unit is pence.

### 3.5 Stale Source of Truth

The `is_stale` boolean column was added in migrations 004/005 but is never populated. A codebase-wide search finds zero writes of `is_stale = true`. No background job framework exists in the project. The only write to `is_stale` is the snooze endpoint, which sets it to `false` — but since nothing ever sets it to `true`, snooze is a no-op. The existing `/analytics/pipeline-health` endpoint queries `is_stale = true` and has returned `stale_count: 0` for every user since it shipped.

**Decision: Computed `updated_at` threshold (Option B)**

A lead is stale if its effective stage is NOT `'converted'` or `'lost'`, AND `updated_at < now() - STALE_DAYS days`.

`STALE_DAYS = 14`, exported from `packages/shared/src/constants/pipeline.ts` alongside `PIPELINE_COLUMNS`. Both the backend query and the client-side filter predicate import this constant — they cannot drift apart.

**Pre-v2 lead handling:** Leads created before the v2 dual-write have `pipeline_stage = null` and `engagement_status = null`. The existing `getLeadColumn()` function falls back through `pipelineStage → engagementStatus → status → 'new'`. Both the backend stale query and the client-side predicate must replicate this exact fallback chain using `COALESCE(pipeline_stage, engagement_status, status, 'new')` or an equivalent expression. Without this, pre-v2 leads will undercount or disappear from the stale filter.

**Known limitation:** `updated_at` advances on any field edit including note changes. A lead edited but not progressed will be excluded from stale count even if genuinely inactive. This is accepted as a known proxy limitation for v3. `last_status_change_at` (added in this sprint) is the correct long-term fix — a future sprint can switch stale detection to that column with a one-line query change once the column is populated.

**Consequence for analytics.ts:** The stale query in `analytics.ts` line 153 changes from `.eq('is_stale', true)` to an `updated_at < staleThreshold` filter against leads whose effective stage is not `'converted'` or `'lost'`.

**Consequence for snooze endpoint:** `leads.ts` line 1132 currently updates `is_stale` and `stale_snoozed_until`. With the computed threshold approach, snooze is re-expressed as advancing `updated_at`. When a user snoozes a lead for N days, set `updated_at = now() + N days` — pushing the lead outside the stale window for the snooze duration. If the snooze feature is not user-facing yet, the endpoint can be left in place with a deprecation comment and addressed in a future sprint.

**Consequence for the stale filter:** The stale filter is a pure client-side predicate in the `filteredLeadsByColumn` memo in `usePipelineBoard.ts`, using the same `updated_at` threshold. No server round-trip. No new query key. Drag-and-drop works normally during stale filter mode.

### 3.6 Backend Style Declaration

All new backend code in this sprint uses `supabaseAdmin` raw queries to match existing routes in `analytics.ts`, `leads.ts`. Drizzle ORM is not used for any route touching the new v2+v3 columns until schema.ts drift is fully resolved and integration-tested.

***

## 4. Migration Script: `apply-migration-health-bulk.ts`

The project does not use formal numbered migration files. Add the following as a new ad-hoc script in `apps/api/scripts/apply-migration-health-bulk.ts`, following the pattern of `apply-migration-025.ts`.

### 4.1 New Columns

```sql
ALTER TABLE leads ADD COLUMN converted_at TEXT;
ALTER TABLE leads ADD COLUMN last_status_change_at TEXT;
```

Both nullable. `converted_at` is set exclusively when `pipeline_stage` changes to `'converted'`. `last_status_change_at` is set whenever `pipeline_stage` or `engagement_status` changes on any write path.

### 4.2 Indexes

```sql
-- Proposals out: count + sum of deal_value for proposal_sent leads
CREATE INDEX IF NOT EXISTS idx_leads_proposals ON leads(user_id, pipeline_stage) WHERE pipeline_stage = 'proposal_sent';

-- Converted leads: won_this_month queries
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(user_id, converted_at) WHERE converted_at IS NOT NULL;
```

### 4.3 Migration 027 Index Correction

Drop and rebuild the follow-up index with the correct condition:

```sql
DROP INDEX IF EXISTS idx_leads_user_follow_up;
CREATE INDEX idx_leads_user_follow_up ON leads(user_id, follow_up_date) WHERE follow_up_date IS NOT NULL AND pipeline_stage NOT IN ('converted', 'lost');
```

The original used `lifecycle_state NOT IN ('won', 'lost')` — `lifecycle_state` values are `'active'`, `'closed'`, `'archived'`, not `'won'` or `'lost'`. The condition was dead code.

### 4.4 Loss Reason CHECK Constraint (conditional)

Only execute this block if verification (Section 3.3) confirms a CHECK constraint exists with the wrong values:

```sql
-- SQLite: recreate table or use PRAGMA to drop constraint if present
-- If no CHECK exists, skip entirely
```

If the live DB has no CHECK constraint (the most likely case given Drizzle usage), this step is a no-op.

### 4.5 `converted_at` Backfill

```sql
-- Best-effort: pull from lead_activities where status changed to converted
UPDATE leads
SET converted_at = (
  SELECT MAX(timestamp)
  FROM lead_activities
  WHERE lead_activities.lead_id = leads.id
    AND lead_activities.type = 'status_changed'
    AND (
      lead_activities.metadata LIKE '%"to":"converted"%'
      OR lead_activities.metadata LIKE '%"to": "converted"%'
    )
)
WHERE pipeline_stage = 'converted' AND converted_at IS NULL;
```

If no matching `lead_activities` row exists, `converted_at` remains `null`. The health strip counts only leads with non-null `converted_at` for `won_this_month` to avoid showing fabricated data. Inaccuracies self-correct as new conversions write accurate timestamps.

***

## 5. Pipeline Health Summary Strip

### 5.1 The Strip

```
Stale leads: 8    Proposals out: 5 (£4,200)    Replies this week: 4    Won this month: 2 (£1,800)
```

Rendered above the board columns, below the page header. Always visible on the pipeline page. Hides entirely on API failure — the board is never blocked.

### 5.2 Metric Definitions

**Stale leads**
Count of leads whose effective stage is NOT `'converted'` or `'lost'`, AND `updated_at < now() - 14 days`. Effective stage = `COALESCE(pipeline_stage, engagement_status, status, 'new')` to match the board's `getLeadColumn()` fallback. Computed query — no `is_stale` column. Amber when greater than zero, muted grey when zero. Clicking activates the stale board filter (see Section 5.5). `STALE_DAYS = 14` is exported from `packages/shared/src/constants/pipeline.ts`.

**Proposals out**
Count of leads where `pipeline_stage = 'proposal_sent'`, plus the sum of `deal_value` for those leads. Formatted as GBP. The value figure only renders if at least one lead in that column has a non-null `deal_value`. The unit (pence vs pounds) is verified in Day 0 (Section 3.4) before formatting logic is written. Always neutral colour.

**Replies this week**
Count of `reply_events` rows where `created_at` is within the last 7 rolling days, joined to `leads` on `user_id`. Presented as a raw count, not a percentage. The denominator (total outbound sends) is unreliable because manual `mailto:` sends are untracked — a percentage would be misleading.

**Won this month**
Count of leads where `pipeline_stage = 'converted'` and `converted_at` is within the current calendar month, plus the sum of their `deal_value`. Uses `converted_at` exclusively — not `updated_at`, not `status = 'won'`. Only counts leads with non-null `converted_at` (backfilled or newly set). `pipeline_stage = 'converted'` is the board's source of truth. Green when greater than zero, muted grey when zero.

### 5.3 Extending `/analytics/pipeline-health`

The existing endpoint is modified with the following changes only. No existing field is renamed or removed.

**Fix:** `stale_count` calculation changes from `.eq('is_stale', true)` to `updated_at < staleThreshold AND effectiveStage NOT IN ('converted', 'lost')`, where `effectiveStage` uses the `COALESCE` fallback chain.

**Fix:** `won_this_month` calculation changes from `status = 'won'` + `updated_at >= monthStart` to `pipeline_stage = 'converted'` + `converted_at >= monthStart` + `converted_at IS NOT NULL`.

**Add:** Three new fields to the response:
- `proposals_out_count` — integer
- `proposals_out_value` — integer (same unit as stored `deal_value`)
- `won_this_month_value` — integer (same unit as stored `deal_value`)

**Backward compatibility:** The existing `won_this_month` field is retained as a count-only integer for the dashboard consumer at `api.ts` line 632. It is not removed or renamed. The health strip reads `won_this_month` for count and the new `won_this_month_value` for the GBP figure. `won_this_month` is marked as deprecated in a code comment — removal is a future sprint after the dashboard consumer is updated.

**No change to:** `health_score`, `uncontacted_count`, `active_sequences`, `conversion_rate`, `insights[]`

### 5.4 Data Freshness

Automatic refresh every 5 minutes. Immediate invalidation and refetch after any lead move, status change, or bulk move success. Single retry on failure, then silently hides.

### 5.5 Stale Filter Integration

The existing filter state in `usePipelineBoard.ts` is a single boolean `dueTodayFilter`. This is replaced with a filter enum to support multiple filter modes without N booleans.

**Specified shape:** Replace `dueTodayFilter: boolean` with `boardFilter: 'due-today' | 'stale' | null`. The `filteredLeadsByColumn` memo (lines 234–249) branches on this enum. Only one filter mode is active at a time — activating stale while due-today is active replaces it, and vice versa.

**Stale filter predicate (client-side):**
A lead is included when `boardFilter === 'stale'` if its effective stage (matching `getLeadColumn()` fallback: `pipelineStage || engagementStatus || status || 'new'`) is not `'converted'` or `'lost'`, AND its `updated_at` is older than `now() - STALE_DAYS` days. This matches the backend query definition exactly using the same shared constant. No server round-trip. No new query key. Drag-and-drop works normally during stale filter mode — all leads are still in the client cache, the memo simply filters the visible set.

**Filter pill UI:** The existing due-today filter pill gains a sibling stale pill. One pill active at a time. Active pill shows filled state; inactive shows outline. Clicking an active pill deactivates it (sets `boardFilter = null`).

### 5.6 Loading and Error States

- **Loading:** Fixed-height skeleton placeholders. Zero layout shift when data arrives
- **Error:** Strip disappears entirely. No user-visible error message. Board unaffected
- **All zeros:** Strip renders with all numbers as 0 in muted grey. Meaningful for new users — confirms the product is working, pipeline is just empty

***

## 6. Bulk Move Backend Consolidation

### 6.1 The Problem

The existing `bulkMoveMutation` fires N parallel `PATCH /leads/:id` calls. Any individual call can fail silently while others succeed, leaving leads split across columns with no consistent state. The frontend bulk move UI, selection logic, drag overlay, and loss reason modal are all complete and unchanged. Only the API transport changes.

### 6.2 `POST /leads/bulk-move` — Seven Required Side Effects

All seven must execute. The endpoint performs them **sequentially with early abort** — if any step fails, the endpoint returns an error and the previously executed steps are **not rolled back**. The project has no transaction framework (no Drizzle transactions, no raw `BEGIN/COMMIT` in Supabase). Partial success is possible on network or DB errors. This is an accepted limitation documented here.

1. **Status update** — set `pipeline_stage` or `engagement_status` and `status` for all lead IDs. Clear the opposing field as the existing PATCH handler does

2. **Follow-up date** — set `follow_up_date` and `follow_up_source = 'column_default'` from `defaultFollowUpDays` on the target column imported from `packages/shared`. Do not override leads where `follow_up_source = 'manual'`

3. **Board position cleanup** — delete `lead_board_positions` rows for all moved leads where `column_id` does not match the target column

4. **`converted_at` setting** — if target column is `converted`, set `converted_at = now()`. Reset if a lead re-enters `converted` after previously leaving it

5. **`last_status_change_at` setting** — set `last_status_change_at = now()` for all leads whose `pipeline_stage` or `engagement_status` changes

6. **Loss reason write** — if target column is `lost` and a loss reason is provided, write it using the unified enum values. If skipped, write null explicitly

7. **Activity logging** — insert one `status_changed` activity row per lead with `metadata: { from: previousColumn, to: targetColumn, bulk: true }`. The generic `type = 'updated'` activity that PATCH inserts per lead is intentionally omitted for bulk moves — inserting both rows across N leads creates excessive activity log noise. This is a conscious divergence from PATCH, documented here so the timeline display can handle `bulk: true` entries distinctly if needed in future

**Security:** WHERE clause always filters by `userId`. A user can only move their own leads regardless of submitted IDs.

**Selection cap:** Maximum 100 lead IDs accepted at the backend. Frontend caps at 50 — the backend enforces 100 as an absolute ceiling.

### 6.3 Frontend Change

`bulkMoveMutation` is updated to call `POST /leads/bulk-move` instead of looping `api.leads.update(id, patch)`. The loop is removed. Optimistic update logic, rollback on error, toast feedback, selection clearing, and health strip invalidation on success are all unchanged.

***

## 7. Implementation Sequence

| Day | Work |
|---|---|
| 0 | Schema.ts sync: add `follow_up_date`, `follow_up_source`, `deal_value`, `loss_reason`, `converted_at`, `last_status_change_at`. Verify loss reason CHECK constraint in live DB. Verify `deal_value` unit. Add `updatedAt` to `fetchPipelineLeads` select. Add `STALE_DAYS = 14` export to `packages/shared/src/constants/pipeline.ts` |
| 1 | Run migration script: `converted_at`, `last_status_change_at`, indexes, Migration 027 index correction, conditional loss reason fix, `converted_at` backfill from `lead_activities`. Wire `converted_at` and `last_status_change_at` writes in existing `PATCH /leads/:id` handler |
| 2 | Extend `/analytics/pipeline-health`: fix `stale_count` to use `updated_at` computed threshold with `COALESCE` fallback. Fix `won_this_month` to use `converted_at` + `pipeline_stage = 'converted'` + `IS NOT NULL`. Add `proposals_out_count`, `proposals_out_value`, `won_this_month_value`. Retain all existing fields |
| 3 | `PipelineHealthStrip` component. `usePipelineHealth` hook. Loading skeleton, error hide. Replace `dueTodayFilter: boolean` with `boardFilter` enum in `usePipelineBoard.ts`. Wire stale filter as client-side predicate in `filteredLeadsByColumn` memo — predicate must match backend `COALESCE` fallback. Strip ships independently |
| 4 | `POST /leads/bulk-move` backend endpoint with all seven side effects (sequential, early abort) |
| 5 | Update `bulkMoveMutation` to call new endpoint. Remove N-call loop. Verify optimistic update and rollback behaviour unchanged |
| 6 | Full cycle test: select 10 leads → drag → drop → toast → health strip refreshes → verify all seven side effects in DB. Separate: activate stale filter → verify client-side predicate matches strip count, including pre-v2 leads with null `pipeline_stage` |

***

## 8. Acceptance Criteria

### 8.1 Prerequisites (Day 0 — blocks all other work)

- [ ] Schema.ts contains `follow_up_date`, `follow_up_source`, `deal_value`, `loss_reason`, `converted_at`, `last_status_change_at`
- [ ] `is_stale` and `stale_snoozed_until` are NOT added to schema.ts — deprecated in place
- [ ] `STALE_DAYS = 14` exported from `packages/shared/src/constants/pipeline.ts`
- [ ] `updatedAt` added to `fetchPipelineLeads` GraphQL select in `usePipelineBoard.ts`
- [ ] Loss reason CHECK constraint in live DB verified — corrective migration only if constraint exists with wrong values
- [ ] `deal_value` unit verified in live DB (pence vs pounds) before formatting logic written
- [ ] No new `/board/health` route created — strip reads from extended analytics endpoint
- [ ] All new backend code uses supabaseAdmin raw queries
- [ ] `reply_events` and `sequence_enrollments` acknowledged as out-of-scope drift in code comments

### 8.2 Health Summary Strip

- [ ] Strip renders above board columns, below page header on every pipeline page load
- [ ] Loading state shows fixed-height skeleton — zero layout shift
- [ ] Strip hides entirely on API failure — board unaffected
- [ ] Stale count uses `updated_at < now() - 14 days` AND effective stage NOT IN ('converted', 'lost') — not `is_stale = true`
- [ ] Stale count handles pre-v2 leads with null `pipeline_stage` via `COALESCE(pipeline_stage, engagement_status, status, 'new')` fallback
- [ ] Stale count is amber when > 0, muted when 0
- [ ] Clicking stale count sets `boardFilter = 'stale'` — client-side predicate activates in memo
- [ ] Stale filter predicate matches backend definition exactly using shared `STALE_DAYS` constant and same `COALESCE` fallback
- [ ] Due-today filter still works — activating one deactivates the other
- [ ] Drag-and-drop works normally while stale filter is active
- [ ] Proposals out value only renders when at least one proposal-stage lead has `deal_value` set
- [ ] Replies this week counts `reply_events` rows in last 7 rolling days joined by `user_id`
- [ ] Won this month uses `converted_at` and `pipeline_stage = 'converted'` — not `updated_at`, not `status = 'won'`
- [ ] Won this month only counts leads with non-null `converted_at` (post-backfill or new)
- [ ] Won this month is green when > 0, muted when 0
- [ ] Existing `won_this_month` count field retained in endpoint response — dashboard consumer unbroken
- [ ] Strip invalidates and refetches after any lead move, status change, or bulk move success

### 8.3 Bulk Move Consolidation

- [ ] `bulkMoveMutation` makes one API call regardless of selection size
- [ ] On failure: endpoint returns error, previously executed steps are NOT rolled back (documented limitation)
- [ ] On failure: frontend rolls back optimistic update and shows error toast
- [ ] Status update clears opposing field (`pipeline_stage` vs `engagement_status`)
- [ ] Follow-up dates set from column default for moved leads — manual overrides respected
- [ ] Board positions cleaned up for all moved leads
- [ ] `converted_at` set when target column is `converted`
- [ ] `last_status_change_at` set for all moved leads
- [ ] Loss reason written when provided, null when skipped
- [ ] One `status_changed` activity per lead with `bulk: true` metadata
- [ ] No generic `updated` activity logged for bulk moves
- [ ] If target is Lost, bulk loss reason modal fires before move executes
- [ ] Toast shows "Moved N leads to [Column Name]"
- [ ] Health strip refreshes on success
- [ ] Frontend selection cap of 50 enforced; backend rejects > 100

***

## 9. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Schema.ts drift causes compile/runtime errors | 🔴 High | Day 0 prerequisite — all six columns added before feature work starts |
| Loss reason constraint rejects valid values | 🔴 High | Day 0 — verify in live DB before migrating. Most likely no CHECK exists |
| Dashboard breaks if `won_this_month` removed | 🔴 High | Field retained as legacy — strip reads new `won_this_month_value` |
| `updated_at` stale proxy hides edited-but-inactive leads | 🟡 Medium | Known limitation documented. `last_status_change_at` added in migration for future use |
| `POST /leads/bulk-move` partial success on network error | 🟡 Medium | Documented limitation — no transaction framework. Sequential with early abort. Frontend rollback covers UX |
| Stale strip count and board filter count diverge | 🟡 Low | Both use same `STALE_DAYS` constant and same `COALESCE` fallback chain from shared package |
| `converted_at` backfill inaccurate for edited Won leads | 🟠 Low | Backfill from `lead_activities` not `updated_at`. Null fallback prevents false counts. Self-corrects as new events write accurate timestamps |
| `deal_value` unit misidentified (pence vs pounds) | 🟠 Low | Day 0 verification in live DB before any formatting code is written |

***

## 10. Effort Estimate

| Phase | Days | Risk |
|---|---|---|
| Day 0: Prerequisites | 1 | Low |
| Health summary strip | 2 | Low |
| Bulk move consolidation | 3 | Medium |
| **Total** | **6 days** | — |

Health summary ships independently after Day 3. Bulk consolidation follows Days 4–6. The two features share only health strip invalidation on bulk move success — no other coupling. Day 0 prerequisites are a shared dependency for both.
