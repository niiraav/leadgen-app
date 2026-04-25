# Sequence E2E Completion PRD

## Problem

Users can create email sequences and enroll leads, but the end-to-end journey is broken in 7 critical ways that prevent production use:

1. Templates send raw `{{variables}}` instead of substituted values
2. The reply-detail fallback query references a non-existent `status` column
3. Sequence step edits are silently dropped by the backend
4. Draft sequences can be enrolled without activation
5. Dashboard shows `dead_leads_pending: 0` regardless of reality
6. Resuming a paused sequence blindly re-applies step delays
7. Missing env vars silently disable queues without surfacing errors to users

## Vision

A user creates a sequence, activates it, enrolls leads, and watches personalized emails go out on schedule — with replies automatically pausing sequences, dead-lead prompts surfacing in the dashboard, and full auditability in the reply drawer.

## Strategic Fit

**9/10**. Sequences are the core Growth plan differentiator. Every gap blocks paid user retention.

**Guardrails:**
- No refactoring of the Inngest reply pipeline (it works)
- No changes to Mailgun webhook signature verification
- No UI redesign — only gap fixes and e2e wiring

## Current Implementation

### Backend (Working)
- `POST /sequences` creates sequences with steps (stored as `subject_template`/`body_template`, `delay_days`, `step_order`)
- `POST /sequences/:id/enroll` enrolls leads, creates `sequence_enrollments` row, queues first BullMQ job with `delay: 0`
- BullMQ Worker (`sequence-scheduler.ts`) processes steps: fetches enrollment, skips if not `active`, sends via Mailgun via `sendOutreachEmail()`, logs to `sequence_step_executions`, updates `current_step`/`next_step_at`, queues next step
- Inbound reply webhook (`webhooks/inbound-reply.ts`) verifies Mailgun signature, stores `reply_events`, fires Inngest `reply/received`
- `handleInboundReply` Inngest function classifies intent via LLM, updates lead status, pauses/cancels enrollment via `handleSequenceAction`, emits socket notification
- Pause/resume endpoints exist with scoped job cancellation
- Dead-lead prompt worker fires 24hr after completion

### Frontend (Working)
- `/sequences` list, `/sequences/new` create, `/sequences/[id]` detail with step cards, `/sequences/[id]/enroll` multi-select
- Reply drawer with original email fallback, suggested reply draft generation

### Database
- `sequences`, `sequence_steps`, `sequence_enrollments` tables exist with RLS
- `sequence_step_executions` table exists (created by migration 009)
- `reply_events`, `label_corrections` tables exist

### Env Dependencies
- `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN` for BullMQ
- `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` + `INBOUND_REPLY_DOMAIN` for send + reply routing
- `FIREWORKS_API_KEY` for reply classification + draft generation

## Gaps and Risks

### Gap 1 — No template variable substitution (CRITICAL)
- `sequence-scheduler.ts:140-141` passes `step.subject_template` and `step.body_template` directly to Mailgun
- No `{{business_name}}`, `{{name}}`, `{{city}}`, `{{my_name}}`, `{{my_company}}` replacement exists anywhere
- **Risk**: Every enrolled lead receives literal template syntax. Feature is unusable for real outreach.

### Gap 2 — `sequence_step_executions.status` column missing (CRITICAL)
- `replies.ts:113` queries `.eq('status', 'sent')` on `sequence_step_executions`
- Migration 009 creates the table but does NOT include a `status` column
- `send.ts:42-53` inserts into `sequence_step_executions` with no `status` field
- **Risk**: Reply detail drawer fallback to find "latest sent step" returns nothing, so original email context is missing

### Gap 3 — Sequence step editing broken (HIGH)
- `PATCH /sequences/:id` schema only accepts `{name, status}`. It silently drops `steps` array.
- Frontend `/sequences/[id].tsx:74-78` PATCHes `{steps: updatedSteps}` which the backend ignores
- **Risk**: Users edit a step, see 200 OK, but changes are never persisted. Data loss illusion.
- **Blast radius**: If steps are deleted/re-inserted while active enrollments point to them via `current_step` index, pointers become stale. Must be handled transactionally.

### Gap 4 — No "Activate" flow for draft sequences (HIGH)
- `POST /sequences` sets `status='draft'`. `POST /sequences/:id/enroll` does NOT check sequence status before enrolling.
- **Risk**: Users enroll leads into draft sequences without realizing. No UI to flip draft→active.

### Gap 5 — `dead_leads_pending` hardcoded to 0 (MEDIUM)
- `analytics.ts:94` returns `dead_leads_pending: 0` regardless of actual `dead_lead_prompt` activities
- `/analytics/dead-leads` endpoint exists and queries correctly, but dashboard KPI ignores it
- **Risk**: Dashboard health score is inaccurate. Users miss follow-up opportunities.

### Gap 6 — Resume re-queue delay bug (MEDIUM)
- `POST /sequences/:id/resume` fetches step at `enrollment.current_step` and uses its `delay_days` for re-queue
- `current_step` is the **next unsent step index** (1-based). The worker increments it after each send. On resume, re-applying the full `delay_days` stacks the pause period on top of the intended delay.
- **Risk**: Paused sequences resume with incorrect timing, adding unnecessary delay.

### Gap 7 — Silent env failure (LOW)
- `initQueues()` logs a warning and sets queues to `null` if Redis env is missing
- Enrollment still creates DB rows, but no emails ever send, with no user-facing error
- **Risk**: Silent failure mode impossible to debug without server logs.

### Additional Risk — Column name drift
- Migration 002 uses `subject`/`body`. Current code uses `subject_template`/`body_template`. Schema.sql confirms the latter. The migration was likely partially amended post-run. No action needed unless re-running migrations on fresh DB.

## Known Production Gap (Out of Scope for This PRD)

**Unsubscribe / opt-out handling is missing.** CAN-SPAM and GDPR require an unsubscribe mechanism for cold outreach emails. The `{{unsubscribe_link}}` variable and an unsubscribe endpoint must be added before this feature is marketed to paid users. This PRD does not cover unsubscribe — it is a separate legal-compliance ticket.

## User Stories

1. **As a** user creating a sequence, **I want** to write `Hi {{business_name}}` in a step body, **so that** every enrolled lead receives their actual business name.
2. **As a** user viewing a reply in the drawer, **I want** to see the original email I sent, **so that** I have context for drafting my response.
3. **As a** user editing a sequence step, **I want** clicking Save to actually persist the subject/body/delay changes, **so that** my sequence sends the updated content.
4. **As a** user with a draft sequence, **I want** an explicit "Activate" action before enrolling leads, **so that** I don't accidentally start a half-baked sequence.
5. **As a** user on the dashboard, **I want** the "Dead leads pending" count to reflect actual uncontacted leads post-sequence, **so that** I know who needs manual follow-up.
6. **As a** user resuming a paused sequence, **I want** the next unsent step to fire immediately, **so that** delays don't stack on top of the pause period.
7. **As a** user enrolling leads, **I want** a clear error if the scheduler is down (Redis missing), **so that** I know emails won't send and can contact support.

## Acceptance Criteria

### Story 1 — Template substitution
```gherkin
Given a sequence step with subject "Proposal for {{business_name}}" and body "Hi {{name}}, are you the owner of {{business_name}} in {{city}}? — {{my_name}}, {{my_company}}"
And a lead with business_name="Acme Ltd", contact_full_name="John Smith", city="Manchester"
And a profile with full_name="Jane Doe", company_name="Doe Designs"
When the worker processes the step for this enrollment
Then Mailgun receives subject "Proposal for Acme Ltd" and body containing "Hi John Smith", "Acme Ltd", "Manchester", "Jane Doe", "Doe Designs"
And the sequence_step_executions row stores the substituted subject/body (not the raw template)
And every substituted value has been HTML-entity-escaped before interpolation

Edge: Missing variable → replace with empty string (e.g., "Hi  Smith" if name is null)
Error: If lead has no email, worker skips send and logs email_failed activity
Error: If lead business_name contains "<script>", the rendered email contains "&lt;script&gt;"
```

### Story 2 — Reply detail original email fallback
```gherkin
Given a reply event where original_step_execution_id is null
And at least one sequence_step_executions row exists for this lead's enrollment with status='sent'
When the reply detail API is called
Then the fallback query successfully finds the latest sent step ordered by created_at
And returns it in the original_email field

Edge: No executions exist → original_email is null (graceful)
Error: DB query fails → 500 with error logged
```

### Story 3 — Step editing persistence
```gherkin
Given a sequence with 2 steps and no active enrollments
When the user edits step 1's subject and clicks Save
Then the PATCH request returns 200
And a subsequent GET /sequences/:id returns the updated subject
And the step's delay_days is also persisted if changed
And the step changes are persisted correctly (current_step is an integer step_order index, not a foreign key to sequence_steps.id, so ID stability is not required)

Edge: Reordering steps → step_order values are updated correctly
Edge: Sequence has active enrollments → editing returns 409 with error "Cannot edit steps while sequence has active enrollments. Pause or cancel first."
Error: Invalid step data (empty subject) → 400 with validation error
Error: Delete-then-insert fails mid-transaction → sequence retains old steps; 500 with error "Failed to update steps"
```

### Story 4 — Sequence activation before enroll
```gherkin
Given a sequence with status="draft"
When the user tries to enroll leads
Then the API returns 400 with error "Sequence must be active before enrolling leads"
And no enrollments are created
When the user clicks "Activate" on the sequence detail page
Then the sequence status changes to "active"
And enrollment is now allowed

Edge: Paused sequence → enroll blocked with error "Sequence is paused. Resume first."
Edge: Sequence has zero steps → activation returns 400 with error "Sequence must have at least one step to activate"
Error: Activation of non-existent sequence → 404
```

### Story 5 — Dashboard dead leads count
```gherkin
Given 3 leads have generated dead_lead_prompt activities in the last 7 days
And 2 of those leads still have status "new" or "contacted"
When the dashboard analytics API is called
Then sequence_stats.dead_leads_pending returns 2 (not 0)

Edge: All dead leads already contacted/archived → returns 0
Error: DB failure → 500 with error details
```

### Story 6 — Resume immediate send for unsent steps
```gherkin
Given an enrollment paused at step 2
And step 2 is the next unsent step (current_step = 2)
When the sequence is resumed
Then the worker queues step 2 with delay=0 (not step 2's delay_days)

Edge: No remaining steps (current_step > max step) → marks as completed, queues dead-lead prompt
Error: Resume fails to queue → 500 with error logged
```

### Story 7 — Scheduler health check on enroll
```gherkin
Given Redis env is missing and queues are disabled
When the user tries to enroll leads
Then the API returns 503 with error "Sequence scheduler is temporarily unavailable. Please try again later."
And no enrollment DB rows are created

Edge: Redis is configured but BullMQ fails to connect (TLS error, bad token) → /health returns "scheduler: error"
Edge: Redis comes back online → subsequent enrollments succeed normally
```

## Non-Functional Requirements

- **Performance**: Template substitution must not add >5ms per email. Worker concurrency stays at 10.
- **Security**: All lead and profile variable values MUST be HTML-entity-escaped (e.g., `<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;`, `"` → `&quot;`) before interpolation into the HTML body. Subject line escaping is optional but recommended. No template variable injection (sanitized via escape, not regex blacklist).
- **Scalability**: Template substitution is stateless; no DB writes required beyond existing execution log.
- **Reliability**: Resume delay fix must not break existing active sequences. Feature-gate checks remain on enroll.
- **Monitoring**: Add a real Redis connectivity test to `/health` endpoint via a module-level `schedulerHealthy` flag that is updated by a background `setInterval` ping every 30s. This avoids adding a synchronous Redis round-trip to every user request while still surfacing connectivity issues to deployment tools.
- **Batch safety**: Enrollment requests are capped at 500 lead IDs per request. Exceeding returns 400.

## Phased Implementation Plan

**Deployment order invariant**: The `sequence_step_executions.status` migration (Phase 1) must be deployed and run before the template substitution worker changes (Phase 2). Phase 2 inserts `status: 'sent'` — deploying it against a DB without the column will throw on every send.

> **Note at top of Phase 2**: Requires Phase 1 migration to already be deployed.

---

### Phase 1 — Add `sequence_step_executions.status` column (MUST deploy first)
**Files**: New migration `apps/api/migrations/030_sequence_step_executions_status.sql`, `apps/api/src/lib/email/send.ts`, `apps/api/src/routes/replies.ts`
**Changes**:
1. `ALTER TABLE sequence_step_executions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';`
2. Backfill existing rows: `UPDATE sequence_step_executions SET status = 'sent' WHERE status IS NULL;`
3. Also add `sent_at TIMESTAMPTZ DEFAULT now()` OR change `replies.ts` fallback query to order by `created_at` instead of `sent_at`.
   - **Decision**: Change `replies.ts` fallback query to `.order('created_at', { ascending: false })` to avoid adding a column. This is the least-risk change.
4. Update `sendOutreachEmail()` in `apps/api/src/lib/email/send.ts` to include `status: 'sent'` in the insert.
5. Update the worker (`sequence-scheduler.ts`) to also write `status: 'failed'` into `sequence_step_executions` on Mailgun send failure (currently it only logs an activity). Define the status enum as `sent | failed | skipped`.
6. Add a **partial unique index** on `sequence_enrollments` that only prevents concurrent active/paused duplicates, allowing re-enrollment after completion or cancellation. Deduplicate existing duplicates first:
   ```sql
   -- Deduplicate before adding index (keep the oldest row per lead+sequence)
   DELETE FROM sequence_enrollments a USING sequence_enrollments b
   WHERE a.id > b.id
     AND a.sequence_id = b.sequence_id
     AND a.lead_id = b.lead_id;
   CREATE UNIQUE INDEX unique_active_enrollment
     ON sequence_enrollments (sequence_id, lead_id)
     WHERE status IN ('active', 'paused');
   ```
   - The enroll endpoint (Phase 7) performs the primary duplicate check at the application level. The partial index catches race conditions.
   - The enroll endpoint MUST catch unique-constraint violations (PostgREST error code `23505`) and treat them as skips (same as the app-level duplicate), continuing with the loop. Do NOT surface a 500 for a race condition.
   - **Re-enrollment is allowed**: A lead with a `completed` or `cancelled` enrollment may be re-enrolled in the same sequence. The partial index does not block this. The app-level skip logic must be updated to only skip `status IN ('active', 'paused')`, not `completed`.

**Acceptance Criteria**:
- `sequence_step_executions.status` column exists with `DEFAULT 'sent'`
- All existing rows backfilled to `'sent'`
- `sendOutreachEmail()` writes `status: 'sent'` on every insert
- Worker writes `status: 'failed'` on Mailgun failure
- `replies.ts` fallback query orders by `created_at` (not `sent_at`)
- Partial unique index `unique_active_enrollment` exists on `(sequence_id, lead_id) WHERE status IN ('active', 'paused')`

**Surgical Smoke Test**:
1. Run migration in Supabase SQL Editor → `\d sequence_step_executions` shows `status` column
2. Query: `SELECT status FROM sequence_step_executions LIMIT 1` → no nulls (backfill worked)
3. Send one sequence email → query row, verify `status = 'sent'`
4. Trigger a Mailgun failure (bad domain or API key) → verify row has `status = 'failed'`
5. Open reply drawer for a reply linked to this enrollment → verify original_email appears in fallback (uses `created_at` ordering)

---

### Phase 2 — Template Variable Substitution
> **Requires Phase 1 migration to already be deployed.**

**Files**: New file `apps/api/src/lib/email/template.ts`, `apps/api/src/services/sequence-scheduler.ts` (imports from new file)
**Changes**:
1. Create `apps/api/src/lib/email/template.ts` with a shared `substituteTemplate(template: string, lead: any, profile: any): string` helper. The worker, preview endpoint (future), and reply draft generator (future) will all import from here.
2. **Variable map and fallbacks**:
   - `{{business_name}}` → `lead.business_name || ''`
   - `{{name}}` → `lead.contact_full_name || lead.owner_name || ''`
   - `{{city}}` → `lead.city || ''`
   - `{{email}}` → `lead.email || ''`
   - `{{phone}}` → `lead.phone || ''`
   - `{{website}}` → `lead.website || ''`
   - `{{category}}` → `lead.category || ''`
   - `{{my_name}}` → `profile.full_name || ''`
   - `{{my_company}}` → `profile.company_name || ''`
   - `{{my_email}}` → `profile.user_email || ''`
3. **Escaping requirement**: Before substitution, run each replacement value through a lightweight HTML entity escaper (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`). This is mandatory — lead data comes from web scraping and user input, and the body is rendered as HTML in Mailgun and the reply drawer.
4. **Missing variable policy**: Replace with empty string (`''`). Do NOT leave the `{{placeholder}}` visible in sent emails. This is a product decision, not a configuration toggle.
5. In worker step 4b, call `substituteTemplate()` on `step.subject_template` and `step.body_template` before passing to `sendOutreachEmail()`.
6. Pass the substituted `subject` and `html` (and `text` as a plain-text variant if we add one) to `sendOutreachEmail()`. Store the **substituted** `subject` and `body_plain` in `sequence_step_executions` so the reply drawer shows personalized content, not raw template syntax.
7. No new dependencies. Use a 15-line inline escape function inside `template.ts`, not a library.

**Acceptance Criteria**:
- `substituteTemplate()` is importable from `apps/api/src/lib/email/template.ts`
- All 10 template variables map correctly with appropriate fallbacks
- HTML entity escaping runs before every interpolation (`<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;`, `"` → `&quot;`)
- Missing variables render as empty string (no `{{placeholder}}` visible)
- Worker passes substituted `subject` and `html` to `sendOutreachEmail()`
- `sequence_step_executions` stores substituted content (not raw templates)

**Surgical Smoke Test**:
1. Create sequence with `Hi {{business_name}}` in body and a lead with `business_name = "<script>alert(1)</script>"`
2. Enroll lead, trigger worker (or wait for queue)
3. Query `sequence_step_executions` — `body_plain` must contain `&lt;script&gt;alert(1)&lt;/script&gt;`, NOT raw `<script>`
4. Verify `subject` contains substituted business name, not `{{business_name}}`
5. Verify Mailgun logs show the escaped string

---

### Phase 3a — Sequence Activation Guard (separate from editing)
**Files**: `apps/api/src/routes/sequences.ts`, `apps/web/src/pages/sequences/[id].tsx`
**Changes**:
1. In `POST /sequences/:id/enroll`, BEFORE the enrollment loop, fetch the sequence with `.select('id, status')` and reject if `status !== 'active'` with 400 and message "Sequence must be active before enrolling leads." Also reject if `status === 'paused'` with "Sequence is paused. Resume first."
2. In `POST /sequences/:id/enroll`, also check `sequence.steps:sequence_steps(count)` — if 0 steps, return 400 "Sequence has no steps."
3. Frontend button states:
   - When `status === 'draft'`: show **"Activate"** button. Hide **"Enroll Leads"**.
   - When `status === 'active'`: show **"Enroll Leads"** button.
   - When `status === 'paused'`: show **"Resume"** button (calls `POST /sequences/:id/resume`, which already exists). Hide **"Enroll Leads"**.
4. Activation (draft→active) is `PATCH /sequences/:id` with `{status: 'active'}`. The backend already supports this. No new endpoint needed.
5. On the backend, validate that a sequence has at least 1 step before allowing `status` to change to `'active'`. Reject with 400 if 0 steps.
6. Clarify state machine:
   - `sequences.status` = 'draft' → 'active' (via Activate) or 'paused' (via Pause)
   - `sequences.status` = 'active' → 'paused' (via Pause)
   - `sequences.status` = 'paused' → 'active' (via Resume endpoint, which also resumes paused enrollments)
   - Enroll is blocked when `sequences.status` is 'draft' or 'paused'.
   - **Resume behavior**: `POST /sequences/:id/resume` ALWAYS flips `sequences.status` to 'active' and returns 200, even if zero paused enrollments exist. This allows new enrollments to proceed. It does NOT re-enroll cancelled leads — only resumes existing paused enrollments by re-queuing their next step.

**Acceptance Criteria**:
- `POST /sequences/:id/enroll` rejects with 400 if sequence `status` is `'draft'` or `'paused'`
- `POST /sequences/:id/enroll` rejects with 400 if sequence has zero steps
- `PATCH /sequences/:id` with `{status: 'active'}` rejects with 400 if zero steps
- Frontend shows "Activate" button for draft, "Enroll Leads" for active, "Resume" for paused
- `POST /sequences/:id/resume` returns 200 even with zero paused enrollments (flips status to active)

**Surgical Smoke Test**:
1. Create sequence (auto-draft) → try to enroll → verify 400 "Sequence must be active before enrolling leads"
2. Try to activate sequence with zero steps → verify 400 "Sequence must have at least one step to activate"
3. Add a step, click Activate → verify `GET /sequences/:id` returns `status: 'active'`
4. Try enrolling again → verify 200, enrollment rows created
5. Pause sequence → verify frontend shows "Resume" button, "Enroll Leads" hidden
6. Try enrolling while paused → verify 400 "Sequence is paused. Resume first."
7. Resume sequence with zero paused enrollments → verify 200, `status: 'active'`

---

### Phase 3b — Fix Sequence Step Editing (separate phase from activation)
**Files**: `apps/api/src/routes/sequences.ts`, `apps/web/src/pages/sequences/[id].tsx`
**Changes**:
1. Extend `updateSequenceSchema` to optionally accept `steps: z.array(stepSchema)`.
2. In `PATCH /sequences/:id`, BEFORE processing `steps`, check if the sequence has any enrollments with `status IN ('active', 'paused')`. If yes, return 409 with error "Cannot edit steps while sequence has active or paused enrollments. Pause and cancel all enrollments first, or create a new sequence." This prevents `current_step` pointers from becoming stale for in-flight sequences.
   - **Rationale**: Completed/cancelled enrollments have already consumed all steps — their `current_step` is past the max step_order and they are inert. Only active/paused enrollments have a live `current_step` that would break if steps are reordered or deleted. Blocking edits for ALL enrollments would permanently freeze sequences after their first use, which is a product-killer.
3. If `steps` is provided and no active/paused enrollments exist, perform the update via a Postgres RPC function that wraps DELETE + INSERT in a single transaction. This eliminates the partial-failure risk (DELETE succeeds, INSERT fails → data loss).
   - Create the RPC in a migration (`031_update_sequence_steps_rpc.sql`):
   ```sql
   CREATE OR REPLACE FUNCTION update_sequence_steps(
     p_sequence_id UUID,
     p_steps JSONB
   ) RETURNS VOID AS $$
   BEGIN
     DELETE FROM sequence_steps WHERE sequence_id = p_sequence_id;
     INSERT INTO sequence_steps (sequence_id, step_order, subject_template, body_template, delay_days)
     SELECT 
       p_sequence_id,
       (s->>'step_order')::INT,
       s->>'subject_template',
       s->>'body_template',
       COALESCE((s->>'delay_days')::INT, 0)
     FROM jsonb_array_elements(p_steps) AS s;
   END;
   $$ LANGUAGE plpgsql;
   ```
   - In `PATCH /sequences/:id`, call `await supabaseAdmin.rpc('update_sequence_steps', { p_sequence_id: id, p_steps: JSON.stringify(steps) })`.
   - If the RPC fails, return 500 with error "Failed to update steps".
4. Frontend: On save error 409, show toast: "Cannot edit steps while the sequence has active enrollments. Create a new sequence instead."
5. **UX decision**: Do NOT disable the Save button proactively when active enrollments exist. Let the user attempt the save and surface the 409 toast on failure. Proactive disabling would require a real-time enrollment status check on the detail page, which is out of scope for this PRD.

**Acceptance Criteria**:
- `PATCH /sequences/:id` accepts an optional `steps` array
- Editing steps is blocked (409) if any enrollments have `status IN ('active', 'paused')`
- Editing steps is allowed (200) if only `completed`/`cancelled` enrollments exist
- Steps are updated transactionally via RPC (no partial DELETE+INSERT failure)
- Frontend surfaces a clear toast on 409

**Surgical Smoke Test**:
1. Create a sequence with 2 steps, zero enrollments → PATCH with new subject → 200, GET returns updated subject
2. Enroll a lead (active enrollment) → PATCH with new subject → 409 with correct error message
3. Let enrollment complete (all steps sent, status='completed') → PATCH with new subject → 200
4. Verify that `sequence_steps` rows were replaced (count stays the same if same number of steps)

---

### Phase 4 — Fix dashboard `dead_leads_pending`
**Files**: `apps/api/src/routes/analytics.ts`
**Changes**:
1. Replace hardcoded `0` with query:
   - Count `lead_activities` where `type='dead_lead_prompt'` and `created_at >= now() - interval '7 days'`
   - Inner join to `leads` on `lead_id` where `leads.status IN ('new', 'contacted')`
   - Use a single Supabase query or a small RPC. If joining in PostgREST is awkward, do two queries: (a) fetch activity lead_ids, (b) filter by lead status, then count.
2. Return actual count in `sequence_stats.dead_leads_pending`
3. **Window**: 7 days (not 30). A dead lead prompt older than 7 days without action is a data quality issue, not a dashboard metric.

**Acceptance Criteria**:
- `sequence_stats.dead_leads_pending` returns actual count, never hardcoded `0`
- Count includes only `dead_lead_prompt` activities from last 7 days where lead `status IN ('new', 'contacted')`
- Count drops to 0 when all matching leads are archived/contacted

**Surgical Smoke Test**:
1. Manually insert a `lead_activities` row: `type='dead_lead_prompt', lead_id='...', user_id='...', created_at=now()`
2. Ensure the lead has `status='new'` → call `GET /analytics/dashboard` → verify `dead_leads_pending` ≥ 1
3. Change the lead's `status` to `'archived'` → call dashboard again → verify `dead_leads_pending` = 0
4. Insert an activity older than 7 days → verify it is NOT counted

---

### Phase 5 — Fix resume delay edge case
**Files**: `apps/api/src/routes/sequences.ts` (resume endpoint)
**Changes**:
1. `current_step` is the **next unsent step index** (1-based). The worker increments it after each successful send.
2. On resume, the next step to send is always at `current_step`. We do NOT need to check `sequence_step_executions` to see if it was sent — the worker only increments `current_step` after a successful send AND after queuing the next job.
3. The correct fix: queue the step at `enrollment.current_step` with `delay: 0`. The pause period has already consumed whatever delay was intended.
4. If `current_step` exceeds the maximum `step_order` for this sequence, mark the enrollment as `completed` and queue the dead-lead prompt.
5. Update the enrollment's `next_step_at` to `now()`.

**Acceptance Criteria**:
- Resume queues the step at `enrollment.current_step` with `delay: 0` (not the step's `delay_days`)
- If `current_step` exceeds max `step_order`, enrollment is marked `completed` and dead-lead prompt is queued
- `next_step_at` is updated to current time on resume

**Surgical Smoke Test**:
1. Enroll lead, let step 1 send (worker increments `current_step` to 2)
2. Pause sequence before step 2 is processed
3. Resume sequence → verify BullMQ job for step 2 has `delay: 0`
4. Verify `next_step_at` updated to current time
5. Let all steps complete → verify enrollment `status = 'completed'`
6. Resume a completed enrollment → verify no error, enrollment stays `completed`

---

### Phase 6 — Scheduler health check on enroll + monitoring
**Files**: `apps/api/src/routes/sequences.ts`, `apps/api/src/index.ts`, `apps/api/src/services/sequence-scheduler.ts`
**Changes**:
1. In `apps/api/src/services/sequence-scheduler.ts`, add a module-level health flag and a background interval (the initial ping happens in `index.ts`, not here):
   ```ts
   let schedulerHealthy = false;
   
   export function setSchedulerHealthy(v: boolean) {
     schedulerHealthy = v;
   }
   
   export function isSchedulerHealthy(): boolean {
     return schedulerHealthy;
   }
   
   // Re-check every 30s after startup
   if (schedulerQueue) {
     setInterval(() => {
       schedulerQueue!.client.ping()
         .then(() => { schedulerHealthy = true; })
         .catch(() => { schedulerHealthy = false; });
     }, 30000);
   }
   ```
2. In `apps/api/src/index.ts`, BEFORE `app.listen()`, block on the initial Redis ping:
   ```ts
   // Block server readiness until scheduler connectivity is verified
   if (schedulerQueue) {
     try {
       await schedulerQueue.client.ping();
       setSchedulerHealthy(true);
     } catch {
       setSchedulerHealthy(false);
       console.warn('Scheduler unavailable at startup — will retry every 30s');
     }
   }
   
   app.listen(PORT, () => { ... });
   ```
   This prevents spurious 503 errors on the first enroll request that arrives before the async startup ping resolves.
3. In `POST /sequences/:id/enroll`, BEFORE creating any enrollment rows, verify scheduler health **synchronously** by calling `isSchedulerHealthy()`. If `false`, return 503 with error "Sequence scheduler is temporarily unavailable. Please try again later." Do NOT ping Redis on the request hot path.
4. In `/health` endpoint (`index.ts`), read the same `schedulerHealthy` flag:
   ```ts
   let schedulerStatus = 'disabled';
   if (schedulerQueue) {
     schedulerStatus = isSchedulerHealthy() ? 'connected' : 'error';
   }
   ```
   Return `"scheduler": schedulerStatus` in the health JSON.
5. Cap enrollment batch size at 500 leads. If `lead_ids.length > 500`, return 400 "Cannot enroll more than 500 leads at once."

> **Rationale**: A synchronous Redis `ping()` on the enroll hot path adds 50–200ms per request on Upstash (cold-start penalty). For a 500-lead batch this is called once, but under load it becomes a latency bomb. The background interval gives the same correctness without blocking user requests. The **initial** ping blocks server boot so the first request never hits a false-negative 503.

**Acceptance Criteria**:
- Server does not accept requests until the initial Redis ping resolves (either success or failure)
- `isSchedulerHealthy()` returns the cached flag synchronously on every enroll request
- `/health` reflects `'connected'`, `'error'`, or `'disabled'` without making a live Redis call
- Enrolling >500 leads returns 400 before any DB writes

**Surgical Smoke Test**:
1. Start server with a bad `UPSTASH_REDIS_TOKEN` → verify `/health` returns `"scheduler": "error"`
2. Within 1 second of boot (before 30s interval fires), call enroll → verify 503, zero DB rows created
3. Fix token, restart server → verify `/health` returns `"scheduler": "connected"` immediately after boot
4. Try enrolling 501 leads → verify 400 before any DB writes
5. Verify `setInterval` is running by waiting 30s, breaking Redis, checking `/health` flips to `"error"`

---

### Phase 7 — Duplicate enrollment guard
**Files**: `apps/api/src/routes/sequences.ts`
**Changes**:
1. The enroll loop already checks for existing enrollments with `status IN ['active', 'paused']` and skips duplicates. **Update this from the current `['active', 'completed']` — completed enrollments should be re-enrollable.**
2. However, this is a soft skip — it silently drops the duplicate lead from the count. The user sees `enrolled: N` where N < selected count, with no indication of which leads were skipped.
3. Change the behavior: collect skipped lead IDs, and return them in the response:
   ```json
   { "enrolled": 3, "skipped": 2, "skipped_ids": ["uuid1", "uuid2"] }
   ```
4. If ALL leads are skipped (already enrolled), return 409 with message "All selected leads are already enrolled in this sequence."
5. Wrap each enrollment `INSERT` in a try/catch. If PostgREST returns error code `23505` (unique constraint violation), treat it as a skip (same as the app-level check) and continue. Do NOT let a race condition between two simultaneous enroll requests surface as a 500. The final response shape is the same: `{enrolled, skipped, skipped_ids}`.

**Acceptance Criteria**:
- Skip logic checks `status IN ('active', 'paused')` only (completed enrollments are re-enrollable)
- Response shape is `{enrolled: number, skipped: number, skipped_ids: string[]}`
- If all leads are skipped → 409 "All selected leads are already enrolled in this sequence."
- PostgREST `23505` (unique constraint violation) is caught and treated as a skip, NOT a 500
- Partial unique index `unique_active_enrollment` handles race conditions

**Surgical Smoke Test**:
1. Enroll lead A in sequence X → verify response: `{enrolled: 1, skipped: 0, skipped_ids: []}`
2. Enroll lead A again in sequence X → verify response: `{enrolled: 0, skipped: 1, skipped_ids: ['A']}`
3. Enroll ONLY lead A again → verify 409 "All selected leads are already enrolled"
4. Let lead A complete the sequence (all steps sent, status='completed')
5. Enroll lead A again → verify 200 (re-enrollment succeeds, partial index allows it)
6. Simulate race condition: two parallel enroll requests for the same new lead → verify one succeeds, one is skipped (no 500)

---

### Phase 8 — End-to-end integration test
**Acceptance Criteria**:
- All 7 gaps from the Problem section are verified closed by one continuous user journey
- Template substitution, activation gating, step editing, resume timing, health checks, duplicate guards, and dead-lead counts all work together without regression
- No 500 errors at any step; all edge cases (XSS escaping, zero-paused resume, re-enrollment of completed leads) handled gracefully

**Surgical Smoke Test** (run this end-to-end in one continuous session):

1. **Create sequence** with all template variables: `Hi {{name}} at {{business_name}} in {{city}}. From {{my_name}} at {{my_company}}.`
2. **Activate sequence** → verify `PATCH` returns 200, `GET /sequences/:id` returns `status: 'active'`
3. **Enroll 3 leads** (one with `business_name = "<script>"`) → verify `enrolled: 3`, no 503 error
   - Query: `SELECT * FROM sequence_enrollments WHERE sequence_id = '...'` — should have 3 rows
4. **Trigger step 1** (wait for queue or manually advance) → verify Mailgun log / `sequence_step_executions` row
   - First, find the XSS lead's enrollment:
     ```sql
     SELECT e.id, l.business_name 
     FROM sequence_enrollments e
     JOIN leads l ON l.id = e.lead_id
     WHERE e.sequence_id = '...' AND l.business_name LIKE '%script%';
     ```
   - Query: `SELECT subject, body_plain, status FROM sequence_step_executions WHERE enrolment_id = '...'`
   - **Note**: Column is `enrolment_id` (British spelling, single 'l') per migration 009. Do NOT use `enrollment_id`.
   - Assert: `subject` contains substituted business name, NOT `{{business_name}}`
   - Assert: `body_plain` contains `&lt;script&gt;` for the XSS lead
   - Assert: `status = 'sent'`
5. **Reply to one email** (simulate Mailgun inbound webhook or insert `reply_events` row manually)
   - Verify enrollment `status` becomes `paused`
   - Verify `reply_events` row exists
6. **Check reply drawer** → verify original email shows substituted text (not raw template)
   - Query: `SELECT subject, body_plain FROM sequence_step_executions WHERE enrolment_id = '...' AND status = 'sent' ORDER BY created_at DESC LIMIT 1`
   - **Note**: Column `enrolment_id` uses British spelling per migration 009.
7. **Resume sequence** → verify `POST /sequences/:id/resume` returns 200
   - Verify next step queues with `delay: 0` (check BullMQ dashboard or Redis)
8. **Let remaining leads complete sequence** → verify `sequence_enrollments` rows show `status: 'completed'`
9. **Wait 24hr for dead-lead prompt** (or manually insert `lead_activities` row with `type = 'dead_lead_prompt'`)
   - Query: `SELECT COUNT(*) FROM lead_activities WHERE type = 'dead_lead_prompt' AND user_id = '...'`
10. **Verify dashboard** → `GET /analytics/dashboard` returns `sequence_stats.dead_leads_pending` > 0
11. **Mark lead as archived** → verify `dead_leads_pending` drops to 0

---

## Optimization Summary

**What we improved vs current partial state:**
- **Scoped fixes, not rewrites**: The Inngest reply pipeline, Mailgun webhook, and classifier are solid — we leave them untouched and fix only the broken wiring around them.
- **No new dependencies**: Template substitution is pure string logic. No new libraries needed.
- **Backwards compatible**: All changes are additive (new column with default, stricter validation). Existing active sequences continue running.
- **Removed false confidence**: Draft→active gating prevents users from accidentally enrolling incomplete sequences. Step editing now actually persists (with safety guard).
- **Observability**: Health endpoint reads a cached scheduler health flag (updated by a background interval and a blocking startup ping). Dashboard no longer lies about dead leads.
- **Security**: Template variables are HTML-escaped before interpolation, closing an XSS vector in sent emails and reply drawer rendering.
- **Shared template logic**: `substituteTemplate` lives in `apps/api/src/lib/email/template.ts` for reuse by worker, preview endpoint, and reply draft generator.
- **Re-enrollment support**: Completed leads can be re-enrolled in the same sequence via a partial unique index.

**What was NOT built (intentionally de-scoped):**
- No UI redesign of sequence detail page (only adds an Activate button)
- No new analytics charts
- No email template gallery/library
- No A/B testing of step variants
- No LLM-generated sequence steps (user writes their own templates)
- **No unsubscribe mechanism** (legal compliance — separate ticket)
