# Reply Detection — E2E Acceptance Criteria

## Scope
End-to-end validation of the inbound reply detection pipeline, from outbound email
through Mailgun webhook ingestion to Inngest classification, lead update, sequence
action, and frontend surfacing.

## AC-1: Outbound Email — Reply-To Header
- [ ] Sequence worker sends email via Mailgun with `Reply-To: reply+{token}@{domain}`
- [ ] `sequence_step_executions` row is created with subject, body, mailgun_message_id
- [ ] Lead’s `reply_token` is an opaque 24-char hex string (not the raw lead UUID)

## AC-2: Webhook Ingestion — Happy Path
- [ ] POST `/webhooks/inbound-reply` returns 200 with `{ status: 'ok', replyId, inngestId }`
- [ ] `reply_events` row inserted with correct `lead_id`, `user_id`, `body_plain`, `subject`, `sender_email`
- [ ] `reply_events.type` defaults to `'reply'` (rules filter runs later in Inngest)
- [ ] Inngest event `reply/received` is fired with `replyEventId`, `leadId`, `enrolmentId`

## AC-3: Webhook Security
- [ ] Missing `token`/`timestamp`/`signature` → 400
- [ ] Invalid HMAC signature → 401
- [ ] Valid signature with wrong recipient format (no `reply+token@`) → 400
- [ ] Valid signature with unknown reply_token → 404

## AC-4: Rules Pre-Filter (Inngest Pipeline)
- [ ] Out-of-office auto-reply → `type: 'out_of_office'`, lead status `out_of_office`
- [ ] Hard bounce (mailer-daemon, undeliverable) → `email_status: 'bounced'`
- [ ] Soft bounce (mailbox full, try again later) → `email_status: 'bounced_soft'`
- [ ] Unsubscribe/opt-out → `status: 'do_not_contact'`, `do_not_contact: true`
- [ ] Normal reply → proceeds to LLM classification

## AC-5: LLM Classification & Hot Score
- [ ] LLM returns valid JSON with intent, sentiment_score, urgency, confidence, key_phrase, suggested_next_action, reenrol_at
- [ ] Invalid/unexpected LLM response falls back to `intent: 'other'`, confidence 30
- [ ] `hot_score` computed 0–100 from sentiment (50%), urgency (0/15/30), step bonus, recency
- [ ] `needs_review = true` when confidence < 60 OR intent === 'other'
- [ ] `reply_events` updated with classification fields and `processed_at`

## AC-6: Lead Update
- [ ] Lead `status` updated to `'replied'`
- [ ] Lead `hot_score` updated
- [ ] Lead `last_reply_at` set to received timestamp
- [ ] Lead `last_reply_intent` set to classified intent
- [ ] `not_now` intent with `reenrol_at` → lead `next_action_at` and `next_action_note` populated

## AC-7: Sequence Action
- [ ] `interested` / `not_interested` / `referral` → enrollment `status: 'cancelled'`, `paused_reason: 'reply_detected'`
- [ ] `question` / `objection` / `not_now` / `other` → enrollment `status: 'paused'`
- [ ] `out_of_office` → no sequence action (continues normally)
- [ ] No enrolmentId provided → sequence action skipped gracefully

## AC-8: Not-Now Snooze (Inngest Durable)
- [ ] Inngest `reply/not-now-snooze` event scheduled with `ts: sleepUntilMs`
- [ ] On wake: lead still exists + not `do_not_contact` → reactivate
- [ ] On wake: enrollment exists → resume to `active`
- [ ] On wake: enrollment missing → create fresh enrollment
- [ ] Lead deleted or marked `do_not_contact` → skip reactivation

## AC-9: Notification Layer
- [ ] Notification persisted to `notifications` table with correct `user_id`, `type: 'reply_received'`, `title`, `lead_id`
- [ ] Socket.io emits `reply:detected` to room `user:{userId}` if server is online
- [ ] Socket.io gracefully skipped if server not initialized (Inngest worker context)

## AC-10: Frontend — Replies Page
- [ ] `/replies` loads with auth, shows reply list sorted by `hot_score` DESC
- [ ] Intent filter tabs (All, Interested, Question, Objection, Not Now, Not Interested) work
- [ ] "Needs Review only" toggle filters `needs_review = true`
- [ ] Pagination works (limit 20)
- [ ] Empty state shown only when zero replies exist

## AC-11: Frontend — Reply Drawer
- [ ] Clicking eye icon opens drawer with full reply body, key phrase highlight
- [ ] "Needs Review" banner shown when confidence < 70 and not dismissed
- [ ] Intent label dropdown updates via PATCH `/replies/:id/intent`
- [ ] Correction recorded in `label_corrections` table
- [ ] "Mark Interested", "Snooze 30d", "Do Not Contact" buttons trigger correct API calls
- [ ] AI suggested reply draft fetched/generated via GET `/replies/:id`
- [ ] Drawer fetches lead timeline from `/pipeline/:id/activity`

## AC-12: Dashboard — Hot Leads Widget
- [ ] Widget fetches top replies by hot_score, filters `intent IN ('interested', 'question')`
- [ ] Shows unactioned count and top 3 leads
- [ ] Click navigates to reply detail

## AC-13: Real-Time Socket
- [ ] Socket connects with Supabase auth token
- [ ] `reply:detected` event triggers toast/notification in browser
- [ ] Reconnection handled gracefully

## AC-14: Edge Cases & Resilience
- [ ] Duplicate webhook with same `mailgun_message_id` handled (no duplicate `reply_events`)
- [ ] Webhook body > 1MB or malformed JSON handled gracefully
- [ ] Inngest function failure retried (Inngest built-in retry)
- [ ] LLM API failure (rate limit, timeout) → fallback classification, pipeline continues
- [ ] DB connection failure during webhook → 500, no data loss (Mailgun will retry? actually Mailgun does NOT retry)
