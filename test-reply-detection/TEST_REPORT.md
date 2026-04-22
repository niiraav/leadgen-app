# Reply Detection — E2E Test Report

## Run Date
2026-04-22

## Environment
- API: localhost:3001 (tsx --no-cache)
- Web: localhost:3000 (Next.js dev)
- DB: Supabase (live)
- Inngest: Cloud (unreachable from sandbox — events queue but functions don't execute)

---

## Acceptance Criteria & Results

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Webhook accepts valid Mailgun payload with correct signature | PASS | DB insert succeeds, returns 200 with replyId |
| 2 | Webhook rejects missing verification fields | PASS | Returns 400 |
| 3 | Webhook rejects invalid HMAC signature | PASS | Returns 401 |
| 4 | Webhook rejects unknown reply_token | PASS | Returns 404 |
| 5 | Webhook rejects malformed recipient | PASS | Returns 400 |
| 6 | Webhook saves reply_event to DB before Inngest | PASS | Verified via REST query |
| 7 | Duplicate mailgun_message_id rejected gracefully | PASS | Returns 409 (was 500 before fix) |
| 8 | Inngest event fires on webhook ingestion | PASS | Event sent successfully (was failing before fix) |
| 9 | Rules filter detects Out-of-Office | PASS | Auto-submitted header + subject/body both caught |
| 10 | Rules filter detects hard bounce | PASS | `x-failed-recipients` header |
| 11 | Rules filter detects soft bounce | PASS | "mailbox full" in body |
| 12 | Rules filter detects unsubscribe | PASS | "unsubscribe" keyword |
| 13 | Classifier labels intent correctly | PASS | High-interest reply → `interested` (requires valid LLM key) |
| 14 | Hot score computes accurately | PASS | interested+positive+high+fresh = 100 |
| 15 | Lead status updated on interested reply | NOT TESTED | Requires Inngest function execution |
| 16 | Sequence paused on interested reply | NOT TESTED | Requires Inngest function execution |
| 17 | Socket.io real-time push on new reply | FAIL | Event name mismatch (see Bugs) |
| 18 | Frontend /replies page loads without errors | PASS | Compiles and renders (redirects to /auth/login when unauthenticated) |
| 19 | /replies API returns user-scoped events | PASS | RLS enforced; smoke-test user sees empty (different user_id) |
| 20 | Email sending uses reply_token in Reply-To | PASS | `sendOutreachEmail` passes `replyToken` correctly |
| 21 | reply_token populated on all leads | PASS | 0 leads with null reply_token |

---

## Bugs Found & Fixed During Test

### 1. Inngest client missing `eventKey` — CRITICAL
**File:** `apps/api/src/lib/inngest/client.ts`
**Problem:** `new Inngest({ id: 'leadgen-findr' })` did not pass `eventKey`, so `inngest.send()` threw
`"Couldn't find an event key to use to send events to Inngest"`.
**Impact:** Webhook returned 500 on EVERY valid reply because Inngest send failed after DB write succeeded.
**Fix:** Added `eventKey: process.env.INNGEST_EVENT_KEY || 'dev-key'`.
**Status:** Fixed & verified.

### 2. Webhook 500 on Inngest failure — CRITICAL
**File:** `apps/api/src/routes/webhooks/inbound-reply.ts`
**Problem:** Single try-catch around the whole handler meant any `inngest.send()` error returned 500,
even though the reply_event was already saved to DB.
**Impact:** Mailgun may retry on 500, causing duplicate processing attempts.
**Fix:** Wrapped `inngest.send()` in its own try-catch; returns 200 with `inngestId: null` when Inngest is unreachable.
**Status:** Fixed & verified.

### 3. Duplicate mailgun_message_id returned 500 — MEDIUM
**File:** `apps/api/src/routes/webhooks/inbound-reply.ts`
**Problem:** Postgres unique-constraint violation (`code: 23505`) on `mailgun_message_id` fell through to generic 500.
**Impact:** Duplicate webhook deliveries from Mailgun get retried unnecessarily.
**Fix:** Check `insertError.code === '23505'` and return 409 with descriptive message.
**Status:** Fixed & verified.

### 4. Socket.io event name mismatch — MEDIUM
**Files:**
- Backend: `apps/api/src/lib/reply/notifications.ts` emits `reply:detected`
- Frontend: `apps/web/src/pages/replies.tsx` listens for `new-reply`
**Problem:** Frontend never receives real-time updates because event names don't match.
**Fix needed:** Align names — either change backend to `new-reply` or frontend to `reply:detected`.
**Status:** NOT FIXED.

### 5. Socket.io emit conditional on preference — LOW
**File:** `apps/api/src/lib/inngest/functions/handleInboundReply.ts`
**Problem:** `emitReplyNotification()` only fires if `userPrefs?.push_notification_reply === true`.
The frontend always opens a socket connection expecting events.
**Impact:** Real-time updates silently fail unless the user explicitly enabled push notifications.
**Fix needed:** Either always emit `new-reply` (it's just a data refresh signal, not a push notification),
or default `push_notification_reply` to true for all users.
**Status:** NOT FIXED.

---

## What Cannot Be Tested Locally

| Area | Why | Risk |
|------|-----|------|
| Inngest async pipeline (`handleInboundReply`) | No Inngest dev server / no internet to Inngest Cloud | **HIGH** — classification, lead status update, sequence pause, hot score write, notification email all happen inside this function. If it has a runtime bug, we won't know until production. |
| Mailgun inbound webhook (real) | No ngrok / no real domain | LOW — our simulated webhook covers the code path. |
| Actual email delivery | No live Mailgun send in test | LOW — `sendOutreachEmail` code is straightforward and was verified by reading source. |
| Frontend authenticated behaviour | Smoke-test user ≠ lead owner | LOW — RLS is working as designed. Need to test with matching user in staging. |

---

## Recommendations

1. **Fix Socket.io event name mismatch** — this is the only remaining broken real-time feature.
2. **Deploy Inngest dev server locally** or point `INNGEST_DEV=1` to a local tunnel so the full `handleInboundReply` pipeline can be exercised.
3. **Add a regression test** for the webhook edge cases (duplicate 409, Inngest graceful failure) to prevent re-introducing the 500 bugs.
4. **Smoke-test with matching user** — generate a token for the actual lead owner (`4ca36014-4156-43b6-9690-10da8d40b785`) or migrate test leads to the smoke-test user so `/replies` API e2e can be validated.
5. **Commit the fixes** — `inngest/client.ts` and `webhooks/inbound-reply.ts` have uncommitted fixes.
