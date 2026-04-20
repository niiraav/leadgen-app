# PHASE 1 — FULL STATUS INVENTORY
> Generated: 2026-04-20 | LeadGenApp monorepo exhaustive audit

---

## 1. ARCHITECTURE OVERVIEW

```
LeadGenApp/                          (Turborepo monorepo, npm workspaces)
├── apps/api/                        (Hono API, port 3001, ESM)
├── apps/web/                        (Next.js 14 Pages Router, port 3000)
├── packages/shared/                 (Shared types, schemas, tiers)
├── turbo.json                       (Turbo task pipeline)
└── package.json                     (Root workspace config)
```

**Key architectural facts:**
- App Router is BROKEN — all pages use Pages Router (`src/pages/`)
- Backend uses Supabase raw queries (NOT Drizzle ORM despite schema.ts existing)
- DB columns are snake_case everywhere
- Brand: "Findr" (not Gapr, not Reachly)
- Prices: GBP (£). tiers.ts = source of truth

---

## 2. API ROUTES (apps/api/src/routes/) — 18 files

### MOUNT MAP (from apps/api/src/index.ts)

| Mount Path | Router | Auth Middleware |
|---|---|---|
| `/leads` | leadsRouter | `/leads/*` |
| `/leads` | enrichmentRouter | `/leads/*` |
| `/leads/lists` | listsRouter | `/lists/*` |
| `/leads/saved-filters` | savedFiltersRouter | `/saved-filters/*` |
| `/leads` | aiEmailRouter | `/leads/*` |
| `/leads` | reviewsRouter | `/leads/*` |
| `/search` | searchRouter | `/search/*` |
| `/pipeline` | pipelineRouter | `/pipeline/*` |
| `/sequences` | sequencesRouter | `/sequences/*` |
| `/import` | importRouter | `/import/*` |
| `/analytics` | analyticsRouter | `/analytics/*` |
| `/profile` | profileRouter | `/profile/*` |
| `/billing` | billingRouter | `/billing/*` (except /webhook) |
| `/dead-leads` | deadLeadsRouter | `/dead-leads/*` |
| `/replies` | repliesRouter | `/replies/*` |
| `/message-picker` | messagePickerRouter | `/message-picker/*` |
| `/notifications` | notificationsRouter | `/notifications/*` |
| `/webhooks/inbound-reply` | inboundReplyRouter | PUBLIC (no auth) |

**Special endpoints in index.ts:**
- `GET /health` — health check (public)
- `GET /kpi` — KPI stats (auth)
- `ALL /api/inngest/*` — Inngest handler (public)

### ROUTE DETAIL

#### leads.ts (1113 lines) — 22 routes
| Method | Path | Purpose | Issues |
|---|---|---|---|
| GET | /leads | List + cursor pagination, filter, sort | SQL injection risk on search param |
| GET | /leads/:id | Single lead | — |
| POST | /leads | Create lead (credit-gated) | — |
| PATCH | /leads/:id | Update fields | — |
| DELETE | /leads/:id | Delete lead | — |
| POST | /leads/batch | Batch create with dedup | No credit enforcement; excessive debug logs |
| GET | /leads/:id/enrichment-preview | Free masked preview | — |
| POST | /leads/:id/enrichment-unlock | Paid enrichment unlock | — |
| POST | /leads/:id/enrich-contact | Legacy alias | Should be deprecated |
| POST | /leads/:id/verify-email | Email verification (feature+credit gated) | — |
| POST | /leads/:id/generate-bio | AI bio via OpenRouter | — |
| PATCH | /leads/:id/notes | Append notes | — |
| GET | /leads/export/csv | CSV export | No pagination — OOM risk on large datasets |
| POST | /leads/:id/ai-email | AI email gen | DUPLICATE of ai-email.ts route |
| POST | /leads/:id/classify-reply | Classify reply intent | — |
| POST | /leads/:id/undo-status | Revert status | — |
| GET | /leads/stale | Find stale leads (14+ days) | — |
| POST | /leads/:id/snooze-stale | Snooze stale lead | — |
| POST | /leads/:id/archive | Archive lead | — |
| GET | /leads/credits/email-verifications | Usage count | — |
| POST | /leads/verify-batch | Batch email verify | O(n²) delay check |
| GET | /leads/:id/replies | Reply events | — |

#### search.ts (305 lines) — 1 route
| POST | /search/google-maps | Google Maps search (Outscraper) | Hardcoded country='GB'; hot score double-counts no_website |

#### sequences.ts (453 lines) — 9 routes
| GET | /sequences | List with counts | — |
| GET | /sequences/:id | Get with steps | — |
| POST | /sequences | Create (growth-gated) | — |
| PATCH | /sequences/:id | Update | — |
| POST | /sequences/:id/enroll | Enroll leads (credit-gated) | N+1 queries |
| POST | /sequences/enrollments/:id/reply | Mark replied | — |
| POST | /sequences/:id/pause | Pause | **CRITICAL: cancels ALL user jobs, not just target sequence** |
| POST | /sequences/:id/resume | Resume | — |
| DELETE | /sequences/:id | Delete | Should use DB cascade |

#### billing.ts (1013 lines) — 9 routes
| GET | /billing/status | Plan, limits, trial/grace | — |
| POST | /billing/sync | Force-sync from Stripe | No timeout |
| GET | /billing/usage | Monthly usage | — |
| POST | /billing/checkout | Stripe checkout | — |
| POST | /billing/topup | Credit pack purchase | — |
| POST | /billing/portal | Stripe portal session | — |
| POST | /billing/cancel | Set cancel_at_period_end | — |
| POST | /billing/reactivate | Remove cancel flag | — |
| POST | /billing/webhook | Stripe events (PUBLIC) | 300+ lines; `as any` on apiVersion |

#### analytics.ts (192 lines) — 3 routes
| GET | /analytics/dashboard | KPIs, funnel, categories | 4+ separate queries; dead_leads_pending hardcoded 0 |
| GET | /analytics/dead-leads | Dead leads list | Overlaps /dead-leads/prompts; inconsistent status filter |
| GET | /analytics/pipeline-health | Health score | Undocumented formula |

#### ai-email.ts (111 lines) — 1 route
| POST | /leads/:id/ai-email | AI email (feature+credit gated) | Duplicate of leads.ts; JSON.parse can throw |

#### enrichment.ts (170 lines) — 3 routes
| POST | /leads/:id/enrich | Owner name from reviews | — |
| PATCH | /leads/:id/social-links | Update socials | **BUG: else-if chain means only FB XOR LinkedIn XOR IG processed** |
| POST | /admin/backfill-gmb-urls | Admin backfill | **No admin guard — any user can call** |

#### dead-leads.ts (54 lines) — 1 route
| GET | /dead-leads/prompts | Dead lead prompts | Hardcoded limit 50; inconsistent status filter |

#### import.ts (111 lines) — 1 route
| POST | /import/csv | Import from JSON | **CSV upload NOT implemented**; N+1 inserts; credit over-counting |

#### lists.ts (282 lines) — 6 routes
| GET | /lists | List with counts | N+1 for lead counts |
| POST | /lists | Create | — |
| PATCH | /lists/:id | Update | — |
| DELETE | /lists/:id | Delete | — |
| PATCH | /leads/:id/list | Assign lead | Overlaps leads.ts PATCH |
| POST | /leads/bulk-list | Bulk assign | — |

#### message-picker.ts (435 lines) — 4 routes
| GET | /message-picker | Templates + quota | — |
| POST | /message-picker/send | Send via WhatsApp/SMS | Just returns wa.me/sms: URL |
| POST | /message-picker/templates | Create template | — |
| DELETE | /message-picker/templates/:id | Delete template | — |

#### notifications.ts (71 lines) — 3 routes
| GET | /notifications | List + unread | Hardcoded limit 50 |
| PATCH | /notifications/:id | Mark read | — |
| PATCH | /notifications | Mark all read | — |

#### pipeline.ts (85 lines) — 2 routes
| POST | /pipeline/:id/status | Update status | Overlaps leads.ts PATCH; free-form status string |
| GET | /pipeline/:id/activity | Activity log | — |

#### profile.ts (183 lines) — 4 routes
| GET | /profile | Get with completeness | — |
| PATCH | /profile | Update (allowlist) | No type validation beyond !== undefined |
| GET | /profile/completeness | Score + missing fields | next_prompt always null |
| POST | /profile/generate-usp | AI USP via OpenRouter | **No auth/credit check; no rate limit** |

#### replies.ts (245 lines) — 4 routes
| GET | /replies | List with filter/pagination | — |
| GET | /replies/:id | Single + AI draft | **Sync OpenRouter call adds 1-3s latency** |
| PATCH | /replies/:id/intent | Correct intent label | — |
| POST | /replies/:id/snooze | Snooze + pause enrollment | — |

#### reviews.ts (120 lines) — 1 route
| POST | /:id/fetch-reviews | Fetch GMB reviews + AI insights | 7-day cache; requires place_id |

#### saved-filters.ts (91 lines) — 3 routes
| GET | /saved-filters | List | — |
| POST | /saved-filters | Create | No validation of filter structure |
| DELETE | /saved-filters/:id | Delete | — |

#### webhooks/inbound-reply.ts (149 lines) — 1 route
| POST | /webhooks/inbound-reply | Mailgun webhook (PUBLIC) | Mailgun HMAC verified; sends Inngest event |

---

## 3. API SERVICES (apps/api/src/services/) — 5 files

| File | Purpose | Exports | Issues |
|---|---|---|---|
| **ai-email.ts** | AI email generation + reply classification | `generateEmailWithAI()`, `classifyReply()`, `cleanBusinessName()` | Duplicate classifyReply (also in lib/reply/classifier.ts); uses gemma-2-9b-it (removed model); profile cast to `any` |
| **outscraper.ts** | Google Maps search, contact enrichment, email verify, reviews | `searchGoogleMaps()`, `contactsPreview()`, `enrichContact()`, `enrichmentMultiple()`, `verifyEmail()`, `fetchReviewsForPlace()` | Property name mismatch (companySize vs company_size); async polling up to 100s |
| **owner-name-extractor.ts** | Owner name from GMB reviews | `extractOwnerNameFromReviews()` | Second OpenAI client instance; generic names stored with 'low' confidence |
| **review-insights.ts** | AI extraction from reviews | `extractReviewInsights()` | Third OpenAI client; uses gemini-2.0-flash-001 (different from others) |
| **sequence-scheduler.ts** | BullMQ job scheduler | `schedulerQueue`, `deadLeadQueue`, `initQueues()`, `startSequenceWorker()`, `stopWorkers()` | Same content for html+text; no backpressure on Mailgun; DST not handled |

---

## 4. API LIB (apps/api/src/lib/) — 16 files

| File | Purpose | Issues |
|---|---|---|
| **billing/downgrade.ts** | Downgrade to free on cancel | Non-atomic; ai_emails_locked column doesn't exist; subscriptions table update ignores errors |
| **billing/enforce.ts** | Credit enforcement + feature gates | Plan lookup duplicated; `(tier as any)[field]` unsafe; enrichment shares search quota |
| **billing/tiers.ts** | Re-export of shared tiers | **Duplicates packages/shared/src/tiers.ts** — drift risk |
| **email/mailgun.ts** | Mailgun client + webhook verify | Non-null assertions on env vars; signing key fallback insecure |
| **email/send.ts** | Send outreach email + persist execution | Same content for html+text; step ID used as sequence_id; fire-and-forget execution insert |
| **enrichment-mapper.ts** | Normalize Outscraper data into lead schema | Empty if body (no effect); company_socials column "not yet in DB"; double-counted primary fields |
| **gmb-urls.ts** | Build Google Maps URLs | No URL encoding on data_id |
| **inngest/client.ts** | Inngest client singleton | Minimal config |
| **inngest/functions/handleInboundReply.ts** | Reply processing pipeline | Second Inngest client; empty subject/body; step hardcoded to 0; socket fails in Inngest worker |
| **inngest/functions/handleNotNowSnooze.ts** | Resume after "not now" | originalSequenceId can be null (type mismatch); hot score reset to 0 |
| **inngest/functions/index.ts** | Function registry + Hono handler | **THIRD Inngest client instance** — ID mismatch risk |
| **reply/classifier.ts** | LLM intent classification | Raw fetch (inconsistent); JSON.parse can throw; No fallback extraction |
| **reply/hotScore.ts** | 0-100 hot score from sentiment/urgency | Hardcoded weights; future timestamps give score > 20 |
| **reply/notifications.ts** | Socket.io notification | Silent return if no socket; emoji mapping duplicated |
| **reply/rulesFilter.ts** | Rule-based pre-filter for emails | "gdpr" keyword false-positive; "back on" can match non-OOO |
| **reply/sequenceAction.ts** | Pause/cancel enrollments | No error handling; enrolmentId may be null; out_of_office does nothing |
| **socket.ts** | Socket.io server singleton | CORS `*`; token in query param; no rate limit |
| **stripe-client.ts** | Stripe singleton + price IDs | `as any` on apiVersion; returns empty string silently if env missing |
| **uk-corrections.ts** | US→UK spelling corrections | Only ~20 word pairs; doesn't handle hyphenated words |
| **usage.ts** | Monthly usage tracking | Race condition (non-atomic read-then-write); `searches_count` vs schema's `search_count` |

---

## 5. API DB (apps/api/src/) — 2 files

| File | Purpose | Issues |
|---|---|---|
| **db.ts** | Supabase client, auth middleware, helper functions | SQL injection on search param; batchCreateLeads sequential; unused Hono import; extra DB round-trip for cursor |
| **db/schema.ts** | Drizzle ORM schema (NOT used at runtime) | subscriptionsRelations references usageTracking; searches_count vs search_count mismatch; balanceAfter required but not always provided |

---

## 6. FRONTEND PAGES (apps/web/src/pages/) — 23 files

| Page | Purpose | API Calls | Issues |
|---|---|---|---|
| **_app.tsx** | App shell + providers | — | — |
| **index.tsx** | Landing page | — | Minimal (429 chars) |
| **auth/login.tsx** | Login | Supabase direct | — |
| **auth/signup.tsx** | Signup + auto-create profile | PATCH /profile | — |
| **auth/callback.tsx** | OAuth redirect | Supabase direct | — |
| **billing/index.tsx** | Plan selection | GET /billing/status, /usage; POST /checkout, /sync | — |
| **billing/manage.tsx** | Subscription management | GET /status, /usage; POST /portal, /cancel, /reactivate | — |
| **billing/success.tsx** | Post-checkout success | POST /billing/sync | — |
| **billing/upgrade.tsx** | Upgrade prompt | POST /billing/checkout | — |
| **dashboard/index.tsx** | Main dashboard | GET /leads, /pipeline-health, /stale, /profile | KPI stubs: 3 of 4 values = 0 |
| **leads/index.tsx** | Leads table | Full CRUD + lists + filters | 20K chars; inline sub-components |
| **leads/[id].tsx** | Lead detail | 14+ API calls | 25K chars; most API-heavy page |
| **leads/import/index.tsx** | CSV import | POST /leads/batch | — |
| **pipeline/index.tsx** | Kanban board | GET /leads, PATCH status | **react-beautiful-dnd (deprecated)** |
| **replies.tsx** | Reply inbox | GET /leads, POST classify, undo | 20K chars |
| **search/google-maps.tsx** | Google Maps search | POST /search, GET preview, POST unlock, POST /leads | — |
| **search/index.tsx** | Redirect to google-maps | — | Could be server redirect |
| **sequences/index.tsx** | Sequence list | GET /sequences, DELETE, PATCH | — |
| **sequences/new.tsx** | Create sequence | POST /sequences, POST /ai/email, GET /leads | — |
| **sequences/[id].tsx** | Sequence detail | GET /sequences/:id, PATCH, GET /leads | — |
| **sequences/[id]/enroll.tsx** | Enroll leads | GET /sequences/:id, POST /enroll, GET /leads | — |
| **settings/index.tsx** | Profile + USP config | GET/PATCH /profile, POST /generate-usp | 24K chars; complex form |
| **test-saved-leads.tsx** | Dev test page | — | **Should not be in production** |

### Pages API routes (apps/web/src/pages/api/) — 12 files
Next.js API routes that proxy or augment the Hono backend:
- analytics/dashboard.ts, analytics/dead-leads.ts, analytics/pipeline-health.ts
- auth/login.ts, login/google.ts, signout.ts, signup.ts
- dead-leads/[id]/archive.ts
- leads/[id]/archive.ts, classify-reply.ts, snooze-stale.ts, undo-status.ts, verify-email.ts, stale.ts
- profile/[...slug].ts, profile/index.ts
- search/google-maps.ts
- sequences/[id].ts, [id]/enroll.ts, [id]/pause.ts, [id]/resume.ts, index.ts

---

## 7. FRONTEND COMPONENTS (apps/web/src/components/) — 22 files

| Component | Purpose | Issues |
|---|---|---|
| **providers.tsx** | ProfileProvider + SocketProvider wrapper | — |
| **UsageBanner.tsx** | Usage quota bar + upgrade CTA | — |
| **dashboard/HotLeadsWidget.tsx** | Hot leads + stale + pipeline health | — |
| **layout/topbar.tsx** | Top nav + notifications + profile | — |
| **layout/sidebar.tsx** | Side nav with plan badge | — |
| **layout/bottom-nav.tsx** | Mobile bottom nav | — |
| **leads/LeadsTable.tsx** | Reusable data table (577 lines) | Inline HotScoreBar, StatusBadge, EmailIcon, InlineNotes |
| **leads/ChannelButtons.tsx** | WhatsApp/SMS buttons | — |
| **leads/NotesEditor.tsx** | Notes editor | — |
| **leads/ActivityLog.tsx** | Activity timeline | — |
| **leads/EnrichButton.tsx** | Enrichment preview + unlock | — |
| **leads/VerifyEmailButton.tsx** | Email verification | — |
| **leads/MessagePicker.tsx** | Template picker + sender (502 lines) | Complex modal |
| **leads/ListsSidebar.tsx** | List management sidebar | — |
| **leads/SavedFilters.tsx** | Saved filter management | — |
| **search/SearchForm.tsx** | Search input form | — |
| **search/SearchResultsTable.tsx** | Search results display | — |
| **search/SearchHistoryPanel.tsx** | Recent searches | — |
| **search/types.ts** | Search component types | — |
| **replies/ReplyDrawer.tsx** | Reply detail drawer (22K) | Complex classification state |
| **onboarding/onboarding-modal.tsx** | 5-step wizard (22K) | Monolithic |
| **nudges/profile-nudges.tsx** | Profile completion nudges | In-memory only (lost on refresh) |
| **ui/upgrade-prompt.tsx** | Upgrade CTA card | — |
| **ui/undo-banner.tsx** | Undo status change banner | — |
| **ui/pipeline-health-card.tsx** | Health metrics card | — |
| **ui/log-reply-modal.tsx** | Manual reply logging | — |
| **ui/auto-action-banner.tsx** | AI auto-action notification | — |
| **ui/card.tsx** | Composable card primitives | — |
| **ui/badge.tsx** | Badge/tag component | — |

---

## 8. FRONTEND LIB (apps/web/src/lib/) — 9 files

| File | Purpose | Issues |
|---|---|---|
| **api.ts** | Central API client — all backend calls | kpi.get() stubs 3 of 4 values; mapSearchResult() generates non-persistent IDs |
| **auth.ts** | Auth helpers (getSession, requireAuth) | — |
| **services.ts** | Service URL constants | — |
| **socket.ts** | Socket.io client + useRealtimeSocket | — |
| **supabase.ts** | Supabase client init | — |
| **use-reply-toast.ts** | Socket→toast bridge | — |
| **utils.ts** | cn() Tailwind merge | — |
| **activity-utils.ts** | Activity formatting | — |
| **mock-data.ts** | Dev fixtures | Should not ship to prod |

---

## 9. FRONTEND CONTEXT & STORES — 2 files

| File | Purpose | Issues |
|---|---|---|
| **contexts/profile-context.tsx** | Global profile + billing state | Nudge state in-memory; billing cached forever (no re-fetch); refreshBilling() short-circuits |
| **stores/ui.ts** | UI state (Zustand) | — |

---

## 10. SHARED PACKAGE (packages/shared/) — 8 files

| File | Purpose | Issues |
|---|---|---|
| **types.ts** | Lead, LeadStatus, LeadSource, ReviewSummary, Notification, etc. | LeadStatus is monolithic (engagement+pipeline+compliance+lifecycle) |
| **schemas.ts** | Zod validation schemas | — |
| **tiers.ts** | Plan tier definitions (free/outreach/growth) | **Duplicated in apps/api/src/lib/billing/tiers.ts** — drift risk |
| **hot-score.ts** | Hot score computation (no_website +25, low_reviews +10, high_rating +10) | — |
| **index.ts** | Re-exports all | — |
| **constants/scoreThresholds.ts** | GREEN=80, AMBER=50 | — |
| **utils/emailDeliverability.ts** | Vendor status → EmailDeliverabilityState | — |
| **utils/resolveLastActivity.ts** | Activity priority resolution | — |

---

## 11. ENV & CONFIG

### apps/api/.env (actual, not committed)
```
PORT=3001, HOST=0.0.0.0, CORS_ORIGIN=*
SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
OUTSCRAPER_API_KEY
OPENROUTER_API_KEY
FIREWORKS_API_KEY, FIREWORKS_BASE_URL, FIREWORKS_MODEL (LLM fallback)
MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_WEBHOOK_SIGNING_KEY, INBOUND_REPLY_DOMAIN
INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, 6x STRIPE_PRICE_* keys
UPSTASH_REDIS_URL (optional — BullMQ)
```

### apps/web/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
```

---

## 12. CRITICAL BUGS (by severity)

### P0 — Breaks core functionality
1. **sequences.ts pause cancels ALL user jobs** — pausing one sequence kills pending jobs across ALL sequences
2. **Social links PATCH else-if bug** — only one social field processed per request (FB XOR LinkedIn XOR IG)
3. **Duplicate POST /leads/:id/ai-email** — leads.ts and ai-email.ts both define this route; shadowing depends on mount order

### P1 — Silent data loss / incorrect behavior
4. **Non-atomic usage increments** — race condition can lose counts
5. **KPI stubs** — dashboard shows 0 for contacted_this_week, replies, open_sequences
6. **enrichment-mapper empty if body** — domain/website merge block has no effect
7. **billing/downgrade non-atomic** — partial failures leave user in inconsistent state
8. **CSV export no pagination** — will OOM on large datasets
9. **Import N+1 inserts + credit over-counting** — credits charged for leads that may fail to insert

### P2 — Feature gaps / inconsistency
10. **3 duplicate client instances** — OpenAI (3), Inngest (3) — wasted connections + config drift risk
11. **tiers.ts duplicated** — packages/shared and apps/api/lib/billing — drift risk
12. **Drizzle schema decorative** — not used at runtime, can silently drift from actual DB
13. **Hardcoded country='GB'** in search results
14. **No admin guard** on /admin/backfill-gmb-urls
15. **No rate limit** on /profile/generate-usp
16. **react-beautiful-dnd** deprecated in pipeline page
17. **test-saved-leads.tsx** in production routes
18. **Billing cache staleness** — refreshBilling() short-circuits if already fetched

---

## 13. FILE COUNT SUMMARY

| Domain | Files | Lines (approx) |
|---|---|---|
| API routes | 18 | ~4,200 |
| API services | 5 | ~1,200 |
| API lib | 16 | ~2,400 |
| API db | 2 | ~900 |
| API scripts+config | 5 | ~200 |
| Frontend pages | 23 | ~5,000 |
| Frontend pages/api | 12 | ~1,500 |
| Frontend components | 22 | ~4,500 |
| Frontend lib | 9 | ~1,200 |
| Frontend context/stores | 2 | ~300 |
| Shared package | 8 | ~500 |
| Config/env | 8 | ~200 |
| Docs | 3 | ~200 |
| **TOTAL** | **~133** | **~21,300** |

---

## 14. DEPENDENCY MAP (key integrations)

```
Outscraper API  → search, enrichment, email verify, reviews
OpenRouter      → ai-email, bio generation, USP generation, reply classification
Fireworks.ai    → LLM fallback (FIREWORKS_API_KEY)
Stripe          → billing, checkout, webhooks, portal
Supabase        → auth, DB (PostgreSQL), RLS
Mailgun         → outbound email, inbound reply webhook
Inngest         → async reply processing, not-now snooze
BullMQ/Redis    → sequence scheduler, dead-lead prompts
Socket.io       → real-time reply notifications
```

---

*End of Phase 1 inventory. Every source file accounted for.*
