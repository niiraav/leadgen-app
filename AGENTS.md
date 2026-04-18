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
- The API (`apps/api/src/index.ts`) applies `authMiddleware` from `apps/api/src/db.ts` on most route groups, with `/billing/webhook` intentionally bypassing JWT auth for Stripe signatures.
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
