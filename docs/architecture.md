# LeadGen App — System Architecture

## Overview

**LeadGen App (Gapr)** is a B2B lead generation platform that discovers local businesses via Google Maps, enriches them with data, verifies emails, generates AI outreach, and manages the entire pipeline. Built as a Turborepo monorepo with Next.js Pages Router frontend, Hono Node.js backend, Supabase database, and Stripe billing.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                                 │
│                                                                          │
│  Next.js Pages Router (Port 3000)                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     Frontend Pages                                   │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐   │ │
│  │  │Dashboard │ │  Search  │ │  Leads │ │ Pipeline │ │Sequences  │   │ │
│  │  │          │ │  Google  │ │  Detail│ │  Kanban  │ │  Email    │   │ │
│  │  │          │ │  Maps    │ │  List  │ │          │ │ Campaigns │   │ │
│  │  └──────────┘ └──────────┘ └────────┘ └──────────┘ └───────────┘   │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────────┐   │ │
│  │  │ Billing  │ │ Settings │ │ Auth (Login / Signup / Callback)  │   │ │
│  │  │          │ │          │ │                                  │   │ │
│  │  └──────────┘ └──────────┘ └──────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Shared Layers                                                            │
│  ┌─────────────────────┐  ┌─────────────────────────┐  ┌─────────────┐  │
│  │  Supabase Auth JWT  │  │  Shared TS types/pkgs   │  │ Profile Ctx │  │
│  │  (browser client)   │  │  (tiers, schemas)       │  │ (state mgmt)│  │
│  └─────────────────────┘  └─────────────────────────┘  └─────────────┘  │
│                                                                          │
│  UI Components                                                           │
│  ┌────────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────────┐    │
│  │  Sidebar   │  │  Cards   │  │ Onboarding    │  │ Pipeline Health │    │
│  │  + Nav     │  │  + Badge │  │ Modal         │  │ Cards          │    │
│  └────────────┘  └──────────┘  └──────────────┘  └────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
         │
         ▼  HTTP (CORS *) + Supabase Auth JWT
┌──────────────────────────────────────────────────────────────────────────┐
│                        API LAYER (Port 3001)                              │
│  Hono / Node.js / tsx                                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      Middleware Stack                                │ │
│  │  CORS → JWT Auth (Supabase) → Route Handlers                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Routes:                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐    │
│  │ /leads   │ │ /search  │ │ /pipeline│ │ /profiles│ │ /billing   │    │
│  │ CRUD     │ │ Maps     │ │ Status   │ │ CRUD     │ │ Stripe     │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│  │ /sequences│ │ /import │ │ /enrich  │ │ /analytics│                   │
│  │ Email Seq │ │ CSV     │ │ GMB/Owner│ │ KPIs/Health│                   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Webhook: POST /billing/webhook (raw body, Stripe signature)     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Services:                                                               │
│  ┌──────┐  ┌────────┐  ┌────────────┐  ┌────────┐  ┌────────────────┐  │
│  │SerpAPI│ │AI Email│ │Owner Name  │  │Search  │  │ Sequence       │  │
│  │Search │ │(OpenAI)│ │Extractor   │  │Filter  │  │ Scheduler      │  │
│  └──────┘  └────────┘  └────────────┘  └────────┘  └────────────────┘  │
│                                                                          │
│  Library:                                                                │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐  ┌────────────────────┐│
│  │ GMB URLs │ │UK/EN Fix │ │Stripe Client   │  │Usage Tracking      ││
│  │Builder   │ │Corrections│ │(checkout/web)  │  │(per-month counters)││
│  └──────────┘  └──────────┘  └────────────────┘  └────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌────────────────────┐            ┌─────────────────────────────────────────┐
│   THIRD-PARTY APIs │            │              DATABASES                  │
│                    │            │                                         │
│  ┌──────────────┐  │            │  ┌───────────────────────────────────┐  │
│  │  SerpAPI     │  │            │  │  Supabase (PostgreSQL)            │  │
│  │  Google Maps │  │            │  │  ┌─────────────────────────────┐  │  │
│  │  Search      │  │            │  │  │  auth.users                 │  │  │
│  └──────────────┘  │            │  │  │  profiles                   │  │  │
│                    │            │  │  │  leads                      │  │  │
│  ┌──────────────┐  │            │  │  │  usage_tracking             │  │  │
│  │  OpenAI      │  │            │  │  │  lead_activities            │  │  │
│  │  (via Open-  │  │            │  │  │  sequences                  │  │  │
│  │   router)    │  │            │  │  │  sequence_enrollments       │  │  │
│  │  GPT-4o-mini │  │            │  │  └─────────────────────────────┘  │  │
│  └──────────────┘  │            │  └───────────────────────────────────┘  │
│                    │            │                                         │
│  ┌──────────────┐  │            │  ┌───────────────────────────────────┐  │
│  │  ZeroBounce  │  │            │  │  SQLite (local dev, Drizzle)      │  │
│  │  Email Verify│  │            │  │  leadgen.db (fallback/local)      │  │
│  └──────────────┘  │            │  └───────────────────────────────────┘  │
│                    │            └─────────────────────────────────────────┘
│  ┌──────────────┐  │
│  │  Stripe      │  │
│  │  Payments /  │  │
│  │  Billing     │  │
│  │  (Checkout,  │  │
│  │  Webhooks,   │  │
│  │  Portal)     │  │
│  └──────────────┘  │
└────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend Router** | Next.js 14.2 Pages Router | App Router disabled due to routing bug |
| **Backend Framework** | Hono (v4) + @hono/node-server | Fast, minimal API on Node.js |
| **Database (prod)** | Supabase (PostgreSQL) | Auth, profiles, leads, sequences |
| **Database (dev)** | SQLite + Drizzle ORM | Local development |
| **Auth** | Supabase Auth (JWT) | Email/password + Google Sign-in |
| **Lead Enrichment** | SerpAPI (Google Maps) | Business discovery, reviews, place_id |
| **AI Generation** | OpenRouter → GPT-4o-mini | Email drafting, owner name extraction |
| **Email Verification** | ZeroBounce | Email deliverability validation |
| **Billing** | Stripe (v2025-02-24.acacia) | Subscriptions, checkouts, webhooks |
| **Monorepo** | Turborepo | Orchestrates apps/ + packages/ |
| **Styling** | Tailwind CSS | Utility-first CSS with dark theme |
| **State** | React Context + hooks | Profile context, UI store |

---

## Data Flow

### 1. Lead Discovery (Search → Create)
```
User enters business type + city
         │
         ▼
[Frontend] POST /api/search/google-maps (Pages API proxy)
         │
         ▼
[Hono]    POST /search/google-maps
         │
         ├─→ SerpAPI Google Maps Search
         │    Returns: place_id, data_id, reviews_link, business details
         │
         ├─→ Computes hot_score (no_website +25, no_email +5, etc.)
         │
         ▼
[Frontend] User selects leads → POST /leads (single) or /leads/batch
         │
         ▼
[Hono]    POST /leads or /leads/batch
         │
         ├─→ Zod validation (createLeadSchema)
         │    Validates: business_name, place_id, data_id, review_count, etc.
         │
         ├─→ Supabase INSERT INTO leads (with user_id scope)
         │
         ├─→ Supabase INSERT INTO lead_activities (type: 'created')
         │
         └─→ Usage: incrementUsage(userId, 'leads_count')
```

### 2. Lead Enrichment (GMB URL + Owner Name)
```
User clicks "Auto-find owner name" on lead detail
         │
         ▼
[Frontend] POST /leads/:id/enrich (via api.enrich.enrichLead)
         │
         ▼
[Hono]    POST /billing/enrich/:id/enrich
         │
         ├─→ Rate limit: 1 attempt per 7 days (reset if no owner found)
         │
         ├─→ extractOwnerNameFromReviews(lead.data_id)
         │    ├─→ SerpAPI: google_maps_reviews engine
         │    ├─→ Fetches up to 40 reviews, extracts owner_answer.name
         │    ├─→ Finds most frequent owner reply name
         │    ├─→ AI (GPT) extracts first name from full name
         │    └─→ Returns { owner_name, first_name, confidence }
         │
         ├─→ buildGmbUrl(lead) — creates canonical Google Maps deep link
         │
         └─→ Supabase UPDATE leads SET owner_name, owner_first_name,
             gmb_url, enriched_at
```

### 3. AI Email Generation
```
User clicks "Compose Email" on lead detail
         │
         ▼
[Frontend] POST /leads/:id/ai-email (via api.ai.composeEmail)
         │
         ▼
[Hono]    POST /leads/:id/ai-email
         │
         ├─→ Gathers: lead info, profile settings, owner_first_name
         │
         ├─→ applyUkCorrections() — US→UK spelling on template
         │
         ├─→ openai.chat.completions.create({
         │     model: 'openai/gpt-4o-mini',
         │     response_format: { type: 'json_object' },
         │     messages: [ system prompt + lead context ]
         │   })
         │
         └─→ Returns { subject: string, body: string }
```

### 4. Billing Flow (Stripe)
```
User clicks "Upgrade to Starter" on /billing page
         │
         ▼
[Frontend] POST /billing/checkout { plan: 'starter', period: 'monthly' }
         │
         ▼
[Hono]    Creates/retrieves Stripe customer
         │
         ├─→ stripe.checkout.sessions.create({
         │     mode: 'subscription',
         │     payment_method_types: ['card'],
         │     success_url: `${ORIGIN}/billing?checkout=success`,
         │   })
         │
         ▼
[Stripe]  User completes checkout → redirects to success_url
         │
         ▼
[Stripe]  Webhook → POST /billing/webhook (raw body, striped sig)
         │
         ├─→ checkout.session.completed → UPDATE profiles SET plan, status
         │
         ├─→ invoice.payment_succeeded → RESET usage_tracking counters
         │
         ├─→ customer.subscription.updated → UPDATE status, ends_at
         │
         └─→ customer.subscription.deleted → DOWNGRADE to free,
             preserve all user data
```

### 5. Usage Tracking (Per-Month)
```
Every user action triggers incrementUsage:
  • Google Maps search  → incrementUsage(userId, 'searches_count')
  • Lead created        → incrementUsage(userId, 'leads_count')
  • Email verified      → incrementUsage(userId, 'email_verifications_count')
  • AI email generated  → incrementUsage(userId, 'ai_emails_count')

Each month, a usage_tracking row tracks:
  { user_id, month, searches_count, email_verifications_count,
    ai_emails_count, leads_count }

Plan tiers define monthly limits. On upgrade, counters reset to 0.
On downgrade (free tier), user data preserved, access locked.
```

---

## Database Schema

### Core Tables (Supabase PostgreSQL)

| Table | Purpose |
|-------|---------|
| `auth.users` | Supabase Auth (managed by Supabase) |
| `profiles` | User profile, billing plan, workspace settings, onboarding state |
| `leads` | Business leads with enrichment data (GMB, social, owner) |
| `usage_tracking` | Per-month usage counters for billing limits |
| `lead_activities` | Audit trail (created, updated, emailed, replied, status changed) |
| `sequences` | Email sequence templates (name, steps) |
| `sequence_enrollments` | Leads enrolled in sequences with scheduling state |

### Key Enrichment Fields on `leads`

| Column | Type | Source |
|--------|------|--------|
| `place_id` | TEXT | SerpAPI Google Maps search |
| `data_id` | TEXT | SerpAPI Google Maps search |
| `gmb_url` | TEXT | Canonical Google Maps deep link |
| `gmb_reviews_url` | TEXT | Reviews link from SerpAPI |
| `owner_name` | TEXT | Extracted from GMB reviews via AI |
| `owner_first_name` | TEXT | First name from owner extraction |
| `owner_name_source` | TEXT | `'gmb_reviews'` or `'manual'` |
| `facebook_url` | TEXT | Manual user entry |
| `linkedin_url` | TEXT | Manual user entry |
| `instagram_url` | TEXT | Manual user entry |
| `enriched_at` | TIMESTAMPTZ | Last enrichment completion |
| `enrichment_attempted_at` | TIMESTAMPTZ | Rate limiting for enrichment |

### Key Billing Fields on `profiles`

| Column | Type | Purpose |
|--------|------|---------|
| `stripe_customer_id` | TEXT | Stripe customer identifier |
| `stripe_subscription_id` | TEXT | Stripe subscription identifier |
| `plan` | TEXT | `'free'`, `'starter'`, `'pro'`, `'enterprise'` |
| `subscription_status` | TEXT | `'none'`, `'active'`, `'past_due'`, `'cancelled'` |
| `subscription_ends_at` | TIMESTAMPTZ | Current billing period end |
| `trials` | INTEGER | Number of free trials used |

---

## Plan Tiers

| Feature | Free | Starter (£12/mo) | Pro (£29/mo) | Enterprise |
|---------|------|--------------------|---------------|------------|
| Leads | 50 | 1,000 | 10,000 | Unlimited |
| Searches/mo | 50 | 1,000 | 5,000 | Unlimited |
| Email verifications | 0 | 200 | 1,000 | Unlimited |
| AI emails/mo | 10 | 100 | 500 | Unlimited |
| Sequence contacts | 0 | 0 | 500 | Unlimited |
| Custom stages | No | No | No | Yes |
| Top-up credits | — | £5 (100) / £20 (500) | Same | Same |

---

## Security

- **API Authentication:** JWT scoped to user_id via Supabase Auth
- **Row-Level Security:** All queries filtered by user_id (server-enforced)
- **Stripe Webhook:** Raw body signature verification (`stripe.webhooks.constructEvent`)
- **Data Isolation:** User data preserved on downgrade, never deleted
- **CORS:** Permissive (`*`) — relies on JWT scope for authorization

---

## File Structure

```
leadgen-app/
├── apps/
│   ├── web/                          # Next.js Frontend (Port 3000)
│   │   ├── src/
│   │   │   ├── pages/                # Pages Router routes
│   │   │   │   ├── _app.tsx          # App wrapper, auth check, toast
│   │   │   │   ├── auth/             # Login, signup, callback
│   │   │   │   ├── billing/          # Stripe billing page
│   │   │   │   ├── dashboard/        # KPI dashboard
│   │   │   │   ├── leads/            # Lead list, detail, import
│   │   │   │   ├── pipeline/         # Kanban pipeline
│   │   │   │   ├── sequences/        # Email campaigns
│   │   │   │   └── search/google-maps.tsx  # Lead discovery
│   │   │   ├── components/           # Reusable UI (sidebar, cards, nudges)
│   │   │   ├── contexts/             # Profile context (state + billing)
│   │   │   ├── lib/                  # API client, auth, Supabase, utils
│   │   │   └── stores/               # UI state store
│   │   └── src/pages/api/            # Next.js API proxy routes
│   ├── api/                          # Hono Backend (Port 3001)
│   │   ├── src/
│   │   │   ├── index.ts              # Server entry, middleware, routes
│   │   │   ├── db.ts                 # Supabase client, auth middleware
│   │   │   ├── routes/               # Business logic endpoints
│   │   │   ├── services/             # SerpAPI, AI email, enrichment
│   │   │   ├── scripts/              # Backfill geo-data script
│   │   │   └── migrations/           # SQL migrations
│   │   └── leadgen.db                # SQLite local database
│   └── api-drizzle/                  # Drizzle schema (local dev)
│
├── packages/
│   └── shared/                       # Shared TypeScript types
│       └── src/
│           ├── types.ts              # Lead, Sequence, UserProfile, etc.
│           ├── schemas.ts            # Zod schemas for Lead validation
│           └── tiers.ts              # Plan tier definitions + limits
│
├── package.json                      # Root Turborepo config
└── turbo.json                        # Turbo pipeline
```
