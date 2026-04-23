# Pipeline P2 — Temporal Urgency System

> PRD for implementing follow-up urgency, loss reasons, deal value, and Σ column headers across the LeadGen monorepo.
> **Status:** Ready for implementation (v1.3 — all pre-implementation issues resolved). **Scope:** 7-day sprint. **Gated feature:** Deal value UI.

---

## 1. Executive Summary

The drag-and-drop pipeline board is live and API-connected. What's missing is **time awareness**: users cannot see which leads need attention today, which replies have gone stale, or what revenue sits in each column. This PRD adds:

- `follow_up_date` + `follow_up_source` per lead
- Column-default follow-up intervals
- "Due Today / Overdue" board filter
- Auto-urgency on inbound reply
- Activity-type normalization (critical bugfix — existing data already broken)
- Loss reason capture on "Lost" column drop
- Deal value schema (Day 1) + gated UI (Day 7)
- Σ column headers

**One hard constraint:** the `mailto:` email flow is invisible to the system. We ship a stopgap "Log email sent" button with a technical-debt marker. A Mailgun-based composer replacement is **not in this sprint** — it is tracked as follow-up work.

---

## 2. Critical Pre-Existing Bug: Activity Type Mismatch

**Severity:** High. The urgency system cannot resolve "last meaningful activity" correctly until this is fixed.

### 2.1 Problem

Two activity creators use strings unrecognized by `resolveLastActivity`:

| Source file | Uses | Resolver expects |
|---|---|---|
| `apps/api/src/services/sequence-scheduler.ts:154` | `type: 'email_sent'` | `'emailed'` |
| `apps/api/src/routes/message-picker.ts:284` | `type: 'message_sent'` | `'whatsapp_sent'` |

Both types fall to `indexOf === -1` → lowest priority. Sequence emails and WhatsApp sends appear as raw strings instead of "Email sent" / "WhatsApp sent". If production rows exist with these strings, renaming the source is destructive.

### 2.2 Fix: Normalization Alias Map (NOT a mass rename)

Add an alias map to **both** copies of the resolver (they must stay in sync):

- `apps/api/src/lib/resolve-last-activity.ts`
- `packages/shared/src/utils/resolveLastActivity.ts`

```ts
const ACTIVITY_TYPE_ALIASES: Record<string, string> = {
  'email_sent': 'emailed',
  'message_sent': 'whatsapp_sent',
};

// In resolveLastActivity(), before priority lookup:
const normalisedType = ACTIVITY_TYPE_ALIASES[activity.type] ?? activity.type;
```

Replace every `a.type` reference in the sort comparator, the exclusion check, the label lookup, and the intent-carrying check with `normalisedType`. The shared test file must include cases for aliased types.

### 2.3 Backfill Migration

Migration 027 (or a separate 028) must backfill existing rows:

```sql
UPDATE lead_activities SET type = 'emailed' WHERE type = 'email_sent';
UPDATE lead_activities SET type = 'whatsapp_sent' WHERE type = 'message_sent';
```

This is safe because the alias map already handles both old and new strings at read time. The backfill is for data hygiene and future analytics, not correctness.

### 2.4 Source String Cleanup (post-sprint)

After the alias map is live and tested, update `sequence-scheduler.ts` and `message-picker.ts` to emit the canonical strings. This is a follow-up PR — do **not** do it during the sprint to avoid a split-brain window.

---

## 3. Schema Changes (Migration 027)

Single migration, additive only.

```sql
-- leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS follow_up_date   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS follow_up_source TEXT,  -- 'column_default' | 'reply_received' | 'manual'
  ADD COLUMN IF NOT EXISTS deal_value       INTEGER,
  ADD COLUMN IF NOT EXISTS loss_reason      TEXT;   -- 'no_response' | 'wrong_timing' | 'too_expensive' | 'competitor' | 'not_a_fit'

-- Backfill is in Section 2.3 (runs after ALTER TABLE in same migration if creating 028,
-- or included here if extending 027 before it has been applied).
```

**Note:** `follow_up_source` has no DB-level CHECK constraint. Enforcement is application-layer only (Section 5). This avoids deployment-time schema lock issues on Render.

---

## 4. Shared Constants (`PIPELINE_COLUMNS`)

Add `defaultFollowUpDays` to each column definition in `packages/shared/src/constants/pipeline.ts`:

```ts
export interface PipelineColumn {
  id: string;
  label: string;
  title: string;
  value: string;
  field: 'engagement_status' | 'pipeline_stage';
  status: string[];
  color: string;
  defaultFollowUpDays: number | null;  // NEW
}
```

| Column | `defaultFollowUpDays` |
|---|---|
| `new` | `null` |
| `contacted` | `3` |
| `replied` | `2` |
| `interested` | `2` |
| `not_interested` | `null` |
| `proposal_sent` | `5` |
| `converted` | `null` |
| `lost` | `null` |

`null` means "no automatic follow-up required." Columns with a number get `follow_up_date = today + N` when a lead is moved into them.

The shared package must be rebuilt (`npm run build -w packages/shared`) before any consuming workspace will see the new field.

---

## 5. Application-Layer Invariant: `setFollowUp()`

**Rule:** `follow_up_date IS NOT NULL` iff `follow_up_source IS NOT NULL`. Never one without the other.

Create a single utility in `apps/api/src/lib/follow-up.ts`:

```ts
export type FollowUpSource = 'column_default' | 'reply_received' | 'manual';

import { supabaseAdmin } from '../../db';

/**
 * Returns UTC midnight N days from now. All follow-up dates are stored as
 * start-of-day so that "overdue" checks at any time during the day are
 * consistent (filter uses `follow_up_date <= startOfToday()`).
 */
export function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * Returns UTC midnight today. Same boundary used by the filter pill and
 * the urgency indicator. Equivalent to `daysFromNow(0)`.
 */
export const startOfToday = () => daysFromNow(0);

export async function setFollowUp(
  leadId: string,
  date: Date | null,
  source: FollowUpSource | null,
  supabase: SupabaseClient = supabaseAdmin  // default to module-level client
): Promise<void> {
  if ((date === null) !== (source === null)) {
    throw new Error('follow_up_date and follow_up_source must be set atomically');
  }
  const { error } = await supabase
    .from('leads')
    .update({
      follow_up_date: date?.toISOString() ?? null,
      follow_up_source: source,
    })
    .eq('id', leadId);
  if (error) {
    throw new Error(`setFollowUp failed: ${error.message}`);
  }
}
```

**All** follow-up mutations — `moveLead`, reply handler, manual clear, "Log email sent" — must call this utility. No direct `.update({ follow_up_date: ... })` anywhere.

**Note:** `daysFromNow()` must be used at every `setFollowUp` callsite. Raw `new Date()` is not acceptable — it stores the current instant, not start-of-day, causing inconsistent "overdue" boundaries.

---

## 6. Implementation Timeline

### Day 1 — Schema + Constants + Migration

1. Write `apps/api/migrations/027_follow_up_and_deal_value.sql` (Section 3).
2. Run migration locally: `npx tsx scripts/run-migration.ts 027`.
3. Add `defaultFollowUpDays` to `PipelineColumn` interface and all `PIPELINE_COLUMNS` entries (Section 4).
4. Rebuild shared: `npm run build -w packages/shared`.
5. Verify `apps/api` and `apps/web` compile.

**Do NOT** surface `deal_value` in UI yet. Schema only.

### Day 2 — Activity Type Normalization

1. Add `ACTIVITY_TYPE_ALIASES` map to:
   - `apps/api/src/lib/resolve-last-activity.ts`
   - `packages/shared/src/utils/resolveLastActivity.ts`
2. Update all `a.type` references in both files to use `normalisedType`.
3. Add test cases in `packages/shared/src/utils/resolveLastActivity.test.ts` for aliased types.
4. Run tests: `npm test -w packages/shared`.
5. Add backfill SQL to Migration 027 (or create 028 if 027 already ran).
6. Verify production activity rows: query `lead_activities` for `type IN ('email_sent', 'message_sent')` and confirm backfill plan.

### Day 3 — `moveLead` Follow-Up + Board Filter

1. In `usePipelineBoard.ts` (or the API route it calls), when `moveMutation` succeeds:
   - Read `targetColumn.defaultFollowUpDays`
   - If not null, call `setFollowUp(leadId, daysFromNow(targetColumn.defaultFollowUpDays), 'column_default')`
   - If null, call `setFollowUp(leadId, null, null)`
2. Add filter pill to `PipelineBoard` component: "Due Today / Overdue".
   - Filter logic: `follow_up_date <= startOfToday()` (UTC midnight). Start-of-day comparison ensures a lead due today is shown all day, not just at the instant it was created.
   - Show count badge on the pill.
3. When filter is active, dim/hide leads whose `follow_up_date` is in the future or null.

### Day 4 — Auto-Advance on Inbound Reply

1. Locate the inbound reply handler: `apps/api/src/lib/inngest/functions/handleInboundReply.ts`. The handler already fetches the lead record at step 2 (`lead` variable containing `user_id`, `business_name`, etc.).
2. After updating lead status to `replied` / `interested` (depending on AI classification), call:
   ```ts
   setFollowUp(d.leadId, daysFromNow(1), 'reply_received')
   ```
3. **Also insert an activity record** (the handler currently updates the lead but never creates a `lead_activities` row for the reply). Add a new step after step 10 ("Update lead record"):
   ```ts
   // Step 10a — create reply activity (lead fetched in step 2)
   await step.run('create-reply-activity', async () => {
     await createActivity(lead.user_id, {
       lead_id: d.leadId,
       type: 'replied',
       description: 'Inbound reply received',
       timestamp: d.receivedAt,
       reply_intent: classification.intent,
       triggered_by: 'inbound_reply',
     });
   });
   ```
   This ensures `resolveLastActivity` sees the reply and correctly surfaces it as the most recent meaningful activity.
4. This gives the user 24 hours to respond before the card flags as overdue.
5. Verify the reply handler also updates the lead activity resolution — `resolveLastActivity` should now see `type: 'replied'` and rank it highest.

### Day 5 — "Log Email Sent" Stopgap + Urgency Clear

**Scope:** Add a "Log as sent" button next to the mailto trigger in both email composers:

- `apps/web/src/pages/leads/index.tsx` — `ComposeEmailModal` (~line 690, next to the `<a>` that opens the mailto link). Note: this is a modal opened from the table row action, not an inline row component.
- `apps/web/src/pages/leads/[id].tsx` — inline email composer section (~line 264, next to the "Send" button that calls `handleSend` and opens mailto).

Do not add to `MessagePickerModal` — WhatsApp/SMS sends via API and is already tracked.

**UI:** After the user clicks "Send" (which opens mailto client), show a secondary button: **"Log as sent"**. On click:

```ts
// STOPGAP: Manual log button. Replace when composer moves to Mailgun send.
// Tracking: https://github.com/niiraav/leadgen-app/issues/TODO
// Canonical string — alias map in resolve-last-activity.ts handles legacy 'email_sent' rows
await api.leads.createActivity(leadId, {
  type: 'emailed',
  description: 'Manually logged email send',
});
```

Then clear reply urgency via the API (do NOT import `setFollowUp` from the server-side `follow-up.ts` — it holds `supabaseAdmin` and will not resolve in the frontend):
```ts
// Frontend: use the existing leads.update endpoint (follow_up_date + follow_up_source are in the patch schema)
const column = getColumnDef(getLeadColumn(lead));
if (column && column.defaultFollowUpDays != null) {
  await api.leads.update(leadId, {
    follow_up_date: daysFromNow(column.defaultFollowUpDays).toISOString(),
    follow_up_source: 'column_default',
  });
} else {
  await api.leads.update(leadId, {
    follow_up_date: null,
    follow_up_source: null,
  });
}
```

**Note:** The frontend computes the date independently using `daysFromNow()` (duplicate the one-liner in `apps/web/src/lib/utils.ts` or inline it). The server-side `setFollowUp()` invariant enforcement still runs inside the API route handler after receiving the patch — it will throw if date/source mismatch reaches it.

**Visual marker:** Add a small amber dot or "Needs follow-up" chip on the pipeline card when `follow_up_date <= today && follow_up_source === 'reply_received'`. This is the reply-urgency indicator.

### Day 6 — Loss Reason Modal

1. **Single card:** When a user drags a card to the `lost` column, intercept the drop in `handleDragEnd` (before calling `moveMutation`).
   - Open a small modal: "Why was this lead lost?"
   - Options: `no_response`, `wrong_timing`, `too_expensive`, `competitor`, `not_a_fit`
   - Buttons: **Save** | **Skip**
   - If Skip: proceed with move, `loss_reason = null`.
   - If Save: include `loss_reason` in the `moveMutation` patch.

2. **Bulk card:** When multi-selected cards are dragged to `lost`, open the same modal but with a note: "This reason will apply to all {N} selected leads."

3. API: `api.leads.update` must accept `loss_reason` in its patch schema (add to `leadUpdateSchema` in `packages/shared/src/schemas.ts`).

### Day 7 — Full Cycle Test + Deal Value Gate

**Test script (run against local stack):**

| Step | Action | Expected |
|---|---|---|
| 1 | Move lead to "Contacted" | `follow_up_date = startOfToday() + 3 days`, `source = 'column_default'` |
| 2 | Simulate inbound reply | `follow_up_date = startOfToday() + 1 day`, `source = 'reply_received'`, amber chip visible |
| 3 | Click "Log as sent" | Activity `type: 'emailed'` created, `follow_up_date` resets to column default |
| 4 | Advance DB `follow_up_date` to yesterday (hack or wait) | Card shows red dot (overdue), filter pill count increments |
| 5 | Move to "Lost", select reason | `loss_reason` saved, card moves |
| 6 | Filter "Due Today / Overdue" | Only overdue leads shown, boundary uses `startOfToday()` not current instant |

**Gate decision:**
- Run the test script twice against a clean local DB.
- If **both runs pass all 6 steps**: merge deal value UI (card display + Σ headers) in the same PR.
- If **either run fails**: open a blocking issue, merge only the urgency system (Days 1–6), and create a follow-up PR for deal value UI tagged to the next sprint. The schema is already in the DB — it's harmless to leave dormant.
- The 6-step pass/fail criteria are in the test table above. "No false positives/negatives" means each step's observable state (DB value, UI element, filter result) must match the expected outcome exactly.

---

## 7. API Changes

### `api.leads.update` patch schema

Add to `leadUpdateSchema` in `packages/shared/src/schemas.ts`:

```ts
follow_up_date: z.string().datetime().optional().nullable(),
follow_up_source: z.enum(['column_default', 'reply_received', 'manual']).optional().nullable(),
deal_value: z.number().int().min(0).optional().nullable(),
loss_reason: z.enum(['no_response', 'wrong_timing', 'too_expensive', 'competitor', 'not_a_fit']).optional().nullable(),
```

### New endpoint: `POST /api/leads/:id/activities`

If it doesn't exist, add a lightweight activity creation endpoint (or reuse an existing internal helper). The frontend "Log as sent" button needs a way to create an `emailed` activity.

Current architecture: `createActivity()` is an internal helper in the API. Expose it:

```ts
// apps/api/src/routes/leads.ts
router.post('/:id/activities', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await c.req.json();
  // validate body.type against LeadActivity['type']
  await createActivity(user.id, { lead_id: leadId, ...body });
  return c.json({ success: true });
});
```

---

## 8. Frontend UI Specs

### 8.1 Pipeline Card — Urgency Indicator

| Condition | Indicator | Tooltip |
|---|---|---|
| `follow_up_source === 'reply_received'` and `follow_up_date > today` | Amber dot (8px, top-right) | "Reply received — follow up due {relative date}" |
| `follow_up_source === 'reply_received'` and `follow_up_date <= startOfToday()` | Red dot | "Overdue — reply needs response" |
| `follow_up_source === 'column_default'` and `follow_up_date <= startOfToday()` | Red dot | "Follow-up overdue" |
| `follow_up_source === 'manual'` and `follow_up_date <= startOfToday()` | Red dot | "Follow-up overdue" |
| `follow_up_date` in future (any source) | No indicator | — |

**Icon distinction (optional but recommended):** use a speech-bubble icon for `reply_received` amber/red state, and a clock icon for `column_default`/`manual` overdue state. This differentiates "someone is waiting on you" from "you should reach out".

**Note:** `startOfToday()` is UTC midnight (all users UK-based for now). The filter pill in 8.4 uses the same boundary.

### 8.2 Pipeline Card — Deal Value (gated)

When deal value UI is shipped (Day 7 gate pass):

- Show `deal_value` as "£{value}" in the card footer, right-aligned, muted text.
- Format: `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })`

### 8.3 Column Header — Σ (gated)

When deal value UI is shipped:

- Each column header shows: `{label} ({count}) · Σ £{sum}`
- Sum is computed client-side from visible leads in that column.
- If no leads have `deal_value`, hide the Σ (don't show "Σ £0").

### 8.4 Filter Pill

- Position: above the board, left of the existing filter bar (if any) or inline with the "Add Lead" button row.
- Label: "Due Today / Overdue"
- Active state: filled pill. Inactive: outline pill.
- Count badge: number of leads matching the filter.

### 8.5 Loss Reason Modal

- Width: 360px max.
- Title: "Why was this lead lost?"
- Options as radio buttons (or selectable chips):
  - No response
  - Wrong timing
  - Too expensive
  - Competitor won
  - Not a fit
- Footer: **Skip** (ghost button) | **Save** (primary button)
- On Skip: modal closes, move proceeds without `loss_reason`.

---

## 9. Testing Plan

### Unit Tests

- `resolveLastActivity.test.ts`: add cases for `email_sent` → resolves as `emailed`, `message_sent` → resolves as `whatsapp_sent`.
- `follow-up.ts`: test `setFollowUp` throws when date/source mismatch.

### Integration Tests (local stack)

Run the Day 7 test script (Section 6) manually. Automate if time permits:

```ts
// Pseudo-test for the full cycle (imports daysFromNow from follow-up.ts)
import { daysFromNow } from '../../../apps/api/src/lib/follow-up';

test('reply urgency → log sent → clears → resets to default', async () => {
  const lead = await createTestLead({ pipeline_stage: 'contacted' });
  await simulateReply(lead.id);
  const afterReply = await getLead(lead.id);
  expect(afterReply.follow_up_source).toBe('reply_received');

  await api.leads.logActivity(lead.id, { type: 'emailed' });
  const afterLog = await getLead(lead.id);
  expect(afterLog.follow_up_source).toBe('column_default');
  expect(new Date(afterLog.follow_up_date).getTime())
    .toBe(daysFromNow(3).getTime());
});
```

### Regression Checks

- Pipeline drag-and-drop still works (no new render-blocking logic).
- `moveMutation` optimistic update still works.
- Board reorder still works.
- Existing leads without `follow_up_date` display normally (no null errors).

---

## 10. Rollback Plan

If Migration 027 causes issues:

```sql
ALTER TABLE leads
  DROP COLUMN IF EXISTS follow_up_date,
  DROP COLUMN IF EXISTS follow_up_source,
  DROP COLUMN IF EXISTS deal_value,
  DROP COLUMN IF EXISTS loss_reason;
```

The alias map in `resolveLastActivity` is safe to keep — it is additive and backward-compatible.

---

## 11. Open Questions (Pre-Implementation)

1. **Resolved.** Two mailto-based email composers exist and both need the "Log as sent" button. `MessagePickerModal` (WhatsApp/SMS) sends via API and is already tracked — no changes needed there.
2. **Inbound reply handler location:** `apps/api/src/lib/inngest/functions/handleInboundReply.ts` — Inngest function, triggered by `reply/received` event. The webhook receiver at `apps/api/src/routes/webhooks/inbound-reply.ts` fires the event. Day 4 modifications go in the Inngest function.
3. **User timezone:** All users UK-based. UTC midnight for "today" boundary is acceptable for now. If users expand to other timezones, switch to `user_profile.timezone`.
4. **Deal value input:** Where does the user set `deal_value`? This PRD assumes it is set on the lead detail page (not in scope for Day 7 gate — just display). If you want an input field, scope it separately.

---

## 12. Post-Sprint Debt

| Item | Tracking | Effort |
|---|---|---|
| Replace `mailto:` with Mailgun one-off send | GitHub issue | ~1 week |
| Rename source strings `email_sent` → `emailed` | Create GitHub issue before Day 2 ends. Close after 7 days of stable production with alias map live. | 30 min |
| Timezone-aware "today" boundary | If non-UK users | 2 hrs |
| Deal value input field | Lead detail page edit | 3 hrs |

---

*PRD version 1.3 — all pre-implementation issues resolved. Ready for implementation.*
