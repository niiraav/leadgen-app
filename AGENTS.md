# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Monorepo shape
- Turborepo + npm workspaces.
- Apps:
  - `apps/web`: Next.js (Pages Router) frontend.
  - `apps/api`: Hono + Node backend API.
- Package:
  - `packages/shared`: shared types/schemas/plan tier logic consumed by both apps.

## Common commands
Run from repo root unless noted.

### Install
- `npm install`

### Dev
- Start all long-running dev tasks via Turbo:
  - `npm run dev`
- Start only web:
  - `npm --workspace @leadgen/web run dev`
- Start only API:
  - `npm --workspace @leadgen/api run dev`

### Build / lint / typecheck
- Build all workspaces:
  - `npm run build`
- Lint (currently implemented in web app):
  - `npm run lint`
- Typecheck (workspace tasks via Turbo):
  - `npm run typecheck`
- Typecheck only shared package:
  - `npm --workspace @leadgen/shared run typecheck`

### Database / schema tasks
- Generate Drizzle artifacts (workspace task):
  - `npm run db:generate`
- Push DB schema (workspace task):
  - `npm run db:push`

### Tests
- There is currently no test runner script wired in root or workspaces (`test` script is absent).
- Single-test command is not available until a test framework/script is added.

## Architecture: big picture

### Request flow and auth
- Browser auth is Supabase-based (`apps/web/src/lib/supabase.ts`).
- Frontend requests generally go directly to the API through `apps/web/src/lib/api.ts`, which uses `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`) and attaches Supabase JWT bearer tokens.
- The API (`apps/api/src/index.ts`) applies `authMiddleware` from `apps/api/src/db.ts` on most route groups, with `/billing/webhook` intentionally bypasses JWT auth for Stripe signatures.
- Some Next.js API routes in `apps/web/src/pages/api/**` also proxy requests to `http://localhost:3001` while forwarding the session token.

### Backend composition (`apps/api`)
- Entry point: `src/index.ts` mounts Hono route modules (`/leads`, `/search`, `/pipeline`, `/sequences`, `/billing`, etc.), Inngest handler (`/api/inngest/*`), and webhook endpoints.
- Data access + auth utility layer is centralized in `src/db.ts` (Supabase clients, auth middleware, CRUD helpers for leads/sequences/activities/KPIs).
- Domain logic is split across:
  - `src/routes/*`: HTTP surface + request validation (Zod) + orchestration.
  - `src/services/*`: integrations/workers (Outscraper, AI email helpers, sequence scheduler).
  - `src/lib/*`: cross-cutting internals (billing enforcement/tiers/downgrade, usage counters, reply handling, socket server, email, inngest client/functions).

### Async + realtime subsystems
- Sequence automation uses BullMQ + Redis (`apps/api/src/services/sequence-scheduler.ts`) and is initialized on API startup (`initQueues`, `startSequenceWorker` in `src/index.ts`).
- Realtime notifications use Socket.IO on the same HTTP server (`apps/api/src/lib/socket.ts`); clients authenticate with Supabase token and join `user:{id}` rooms.
- Inngest functions are registered in `apps/api/src/lib/inngest/functions/index.ts` and exposed under `/api/inngest/*`.

## Pipeline data contract
- `GET /pipeline/leads` returns complete lead rows via Supabase RPC `get_pipeline_leads_with_replies`. The drawer receives its display data from the React Query cache (via `useMemo` + `leadId`) — never a stale local snapshot.
- Board reorder uses fractional positions with gap-detection rebalance in `apps/api/src/routes/board.ts` (`POST /board/reorder`).
- `apps/web/src/components/pipeline/drawer-visibility.ts` — complete stage-aware visibility matrix for all 8 stages (new, contacted, replied, interested, qualified, proposal_sent, converted, lost, archived).
- `apps/web/src/components/pipeline/LeadQuickDrawer.tsx` — Phase 0 + Phase 1 complete. Contains: DNC banner, reply preview with line-clamp-2, contact block (details/summary with expand/collapse per stage), email verification badge, enrichment contact block, rating+reviews, category+tags, loss reason, last activity, footer, notes textarea with blur-to-save and 2000-char limit, backend health strip with 2-line skeleton. Parent page stores `leadId` only; derives live lead from React Query cache so drag-and-drop stage transitions update the drawer without closing.
- **Unsubscribe replies** — FIXED. `handleInboundReply.ts` (webhook route) now auto-moves unsubscribes to `not_interested` with `pipelineStage: 'lost'`, `engagementStatus: 'unsubscribed'`.
- **Same-column DnD reorder** — FIXED. `PipelineBoardDesktop.tsx` now has `onReorderLead` prop. Same-column drops compute `prevLeadId`/`nextLeadId` from reordered array and call `reorderMutation.mutate()` directly instead of routing through `moveMutation`.
- **Selection persistence on filter change** — FIXED. `handleSearch`, `handleFilterChange`, `moveMutation.onSettled`, and `bulkMoveMutation.onSettled` all call `clearSelection()`.
- **Plain click deselect** — FIXED. Plain click now deselects if it's the only selected lead (already selected → deselects).
- **SelectionToolbar positioning** — FIXED. Changed from `sticky` to `fixed bottom-4 left-0 right-0`.
- **Drawer overlay** — FIXED. `z-50` → `z-[100]`, backdrop `absolute` → `fixed`.
- **AI Bio long text / LLM thinking** — FIXED. Added `sanitizeBio()` helper (strips markdown `**`/`*/`/headings, collapses whitespace, hard-caps 280 chars) and `<BioSummary>` subcomponent with `line-clamp-3` + "Read more" toggle in a compact container (`bg-surface-2 border rounded-md px-3 py-2`). Also added backend sanitization in `leads.ts` bio generation route (`slice(0, 200)`). Root cause: backend stored raw LLM output with no truncation; frontend rendered with `whitespace-pre-wrap` in unbounded `<p>` tag.

## Bug fix patterns learned
- **LLM output sanitization:** Always sanitize LLM-generated text before storage AND before display. Strip markdown, collapse whitespace, and enforce a hard character cap. Display with `line-clamp-*` + expand toggle in a styled container to prevent layout explosion.
- **Optimistic UI rollback:** Cache original values in mutation `context` during `onMutate`, not from the `lead` prop (which gets wiped by the optimistic update).
- **Consistent CTA labels:** Avoid conditional CTA text/styling for the same action. If the same Link/button performs the same action across stages, use a single label and consistent visual treatment. Remove the conditional flag from the visibility config and simplify the component to one static rendering path.
- **Client-side lastActivity fallback:** When the backend RPC/endpoint does not return a computed `lastActivity` field, derive it client-side from available lead metadata (reply timestamps, `last_contacted`, `updated_at`, `created_at`). This avoids an extra N+1 query and immediately populates the UI. Implement the fallback inside the shared lead mapper (`mapBackendLead`) so all consumers (pipeline list, leads list, detail page) benefit uniformly.

### Frontend structure (`apps/web`)
- App shell and providers are set in `src/pages/_app.tsx`:
  - React Query client
  - Profile/undo providers
  - auth-aware layout (sidebar/topbar/bottom nav hidden on auth pages)
- Page-level features live under `src/pages/*` (leads, pipeline, billing, search, sequences, auth, etc.).
- Shared UI and feature components live in `src/components/*`.
- API client (`src/lib/api.ts`) is the typed contract boundary between UI and backend and includes backend-to-frontend field mapping helpers.

### Shared contract package (`packages/shared`)
- `src/types.ts` and `src/schemas.ts` provide shared shapes/validation primitives used across apps.
- `src/tiers.ts` is the canonical plan/limit source (free/outreach/growth) used by billing/feature-gating logic.

## Environment-sensitive areas
- API side expects Supabase, Stripe, and (optionally) Upstash Redis/Mailgun/OpenAI-related env vars.
- Web/API integration assumes API is reachable at port `3001` unless overridden; some Next API proxy files currently hardcode `http://localhost:3001`.
