# 4-Axis Intent Profile

> **Status:** IMPLEMENTATION PRD — Ready for Hermes  
> **Scope:** Backend scoring engine + DB migration + Pipeline UI (badge + filter) + Drawer dimension bars + Search default filter  
> **Estimated Effort:** 2 sessions  
> **Collision Risk:** LOW — touches PipelineCard, drawer-visibility.ts, LeadQuickDrawer, search page. No overlap with accessibility audit (components/ui/*, _app.tsx, auth pages).

---

## 1. Why Now

Current `hot_score` (0-100) is purely arithmetic: no website = +25, low rating = -15. It cannot distinguish:
- "I hate my CRM, need help" (🔵 Ready to Buy)
- "My website is fine, go away" (🔴 Venting)

The 4-Axis Intent Profile makes the product **opinionated**. Instead of "here's 200 plumbers," it says "here are 12 plumbers ready to buy, and here's why." That's the moat against Apollo/ZoomInfo.

**This was scoped as Sprint 2 in gaps mapping. The prerequisite data (reviews, enrichment, flags) all exists now.**

---

## 2. Four Axes

| Axis | Question | Signals Used |
|------|----------|-------------|
| **Awareness** | Do they know they have a problem? | No website + has reviews = aware of reputation but missing digital channel |
| **Urgency** | How soon do they need a solution? | Recent negative review, seasonal category, working hours gaps |
| **Budget Fit** | Can they afford the solution? | Review count (business size proxy), price_range, category typical spend |
| **Accessibility** | Can we reach them effectively? | Has email? Phone? Owner name? Socials? |

**Verdict (from composite score):**

| Verdict | Composite | Meaning | Action |
|---------|-----------|---------|--------|
| 🔴 **Venting** | 0-24 | Low awareness, high complaint | Monitor only — not ready |
| 🟡 **Researching** | 25-49 | Aware but comparing | Nurture with content |
| 🟢 **Evaluating** | 50-74 | Has need + signals | Warm — outreach now |
| 🔵 **Ready to Buy** | 75-100 | Urgency + access + fit | Hot — contact immediately |

---

## 3. Database Migration

**File:** `apps/api/migrations/016_intent_profile.sql`

```sql
-- Add intent_profile columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent_verdict TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent_dimensions JSONB DEFAULT '{}';

-- Index for fast filtering by verdict
CREATE INDEX IF NOT EXISTS idx_leads_intent_verdict ON leads(intent_verdict);

-- Backfill existing leads: set to null (will be computed on next touch)
-- DO NOT mass-update — compute lazily via endpoint
```

**Drizzle schema update:** `apps/api/src/db/schema.ts`

Add to `leads` table (after `hotScore`):
```typescript
intentVerdict: text('intent_verdict'),
intentDimensions: jsonb('intent_dimensions').$type<Record<string, number>>().default({}),
```

Add to `export type Lead` inference (auto from schema, but verify).

---

## 4. Backend: Scoring Engine

**New file:** `apps/api/src/lib/intent-profile.ts`

```typescript
export interface IntentDimensions {
  awareness: number;      // 0-100
  urgency: number;        // 0-100
  budgetFit: number;      // 0-100
  accessibility: number;  // 0-100
}

export interface IntentProfile {
  overall: number;        // 0-100 composite
  dimensions: IntentDimensions;
  verdict: 'venting' | 'researching' | 'evaluating' | 'ready_to_buy';
  explanation: string;   // One-line rationale
}
```

### `computeIntentProfile(lead: Lead): IntentProfile`

Pure function. No DB calls. Uses ONLY fields already on the lead object.

**Scoring logic (deterministic, no LLM — keep it fast):**

```typescript
export function computeIntentProfile(lead: Lead): IntentProfile {
  // ── Awareness ──
  // Do they know they have a problem?
  // High = they have reviews/reputation but no digital presence = they KNOW customers can't find them
  let awareness = 40;
  if (!lead.websiteUrl && (lead.reviewCount ?? 0) > 5) awareness += 30; // aware but invisible
  else if (!lead.websiteUrl) awareness += 10; // maybe don't care
  else if (lead.websiteUrl && (lead.reviewCount ?? 0) > 10) awareness += 20; // has presence, engaged
  if (lead.rating && lead.rating < 3.5) awareness += 15; // bad reviews = aware something's wrong
  if (lead.readinessFlags?.includes('no_website')) awareness += 10;
  awareness = Math.min(100, Math.max(0, awareness));

  // ── Urgency ──
  // How soon do they need a solution?
  let urgency = 30;
  if (lead.rating && lead.rating < 3.0) urgency += 25; // bleeding reviews = urgent
  else if (lead.rating && lead.rating < 3.5) urgency += 15;
  if ((lead.reviewCount ?? 0) > 0 && (lead.reviewCount ?? 0) < 5) urgency += 10; // new business, establishing
  const painPoints = (lead.reviewSummary as any)?.pain_points;
  if (Array.isArray(painPoints) && painPoints.length > 0) urgency += 15; // specific complaints
  urgency = Math.min(100, Math.max(0, urgency));

  // ── Budget Fit ──
  // Can they afford a solution?
  let budgetFit = 40;
  const reviews = lead.reviewCount ?? 0;
  if (reviews >= 100) budgetFit += 25; // established, has budget
  else if (reviews >= 30) budgetFit += 15;
  else if (reviews >= 10) budgetFit += 5;
  else if (reviews === 0) budgetFit -= 10; // brand new, might not have budget
  if (lead.priceRange?.includes('£££') || lead.priceRange?.includes('$$$$')) budgetFit += 15;
  else if (lead.priceRange?.includes('££')) budgetFit += 5;
  budgetFit = Math.min(100, Math.max(0, budgetFit));

  // ── Accessibility ──
  // Can we reach them?
  let accessibility = 20;
  if (lead.email) accessibility += 25;
  if (lead.phone) accessibility += 20;
  if (lead.contactEmail || lead.contact_email) accessibility += 15;
  if (lead.contactPhone || lead.contact_phone) accessibility += 10;
  if (lead.ownerName || lead.owner_name || lead.contactFullName || lead.contact_full_name) accessibility += 10;
  if (lead.linkedinUrl || lead.linkedin_url || lead.contactLinkedin || lead.contact_linkedin) accessibility += 5;
  if (lead.websiteUrl) accessibility += 10; // can research further
  accessibility = Math.min(100, Math.max(0, accessibility));

  // ── Composite ──
  const overall = Math.round((awareness + urgency + budgetFit + accessibility) / 4);

  // ── Verdict ──
  let verdict: IntentProfile['verdict'];
  if (overall >= 75) verdict = 'ready_to_buy';
  else if (overall >= 50) verdict = 'evaluating';
  else if (overall >= 25) verdict = 'researching';
  else verdict = 'venting';

  // ── Explanation ──
  const explanations: Record<IntentProfile['verdict'], string> = {
    venting: 'Low engagement signals — monitor for changes',
    researching: 'Aware of need but not actively seeking — nurture with content',
    evaluating: 'Shows need signals and is reachable — good for warm outreach',
    ready_to_buy: 'High urgency, reachable, and budget-aligned — contact immediately',
  };

  return {
    overall,
    dimensions: { awareness, urgency, budgetFit, accessibility },
    verdict,
    explanation: explanations[verdict],
  };
}
```

### Integration Points

1. **Search results:** In `apps/api/src/routes/search.ts`, after computing `hot_score`, also compute `intentProfile` via `computeIntentProfile()` and include it in the response payload. Add `intent_verdict` and `intent_dimensions` to the mapped lead object.

2. **Pipeline list endpoint:** In `apps/api/src/routes/leads.ts` (the `GET /leads` pipeline list route), include `intent_verdict` and `intent_dimensions` in the select. If null, compute on-the-fly and return. Do NOT write back to DB on read (avoid read-side writes).

3. **Compute-on-save:** In `apps/api/src/routes/leads.ts` (POST /leads and PATCH /leads/:id), after inserting/updating a lead, run `computeIntentProfile()` and write `intent_verdict` + `intent_dimensions` to the DB. This ensures saved leads have profiles.

4. **New endpoint:** `GET /leads/:id/intent-profile`
   - Returns `{ profile: IntentProfile }`
   - If lead has cached values, return them
   - If not, compute, write to DB, return
   - Auth: require lead ownership

---

## 5. Frontend: Pipeline Card Intent Badge

**File:** `apps/web/src/components/pipeline/PipelineCard.tsx`

### Changes

1. **Add intent badge row** above or replacing the stage badge in context row area.

The stage badge (Row 2) stays. Add a new **Row 2b: Intent verdict chip** that renders ONLY when `lead.intent_verdict` exists.

```tsx
// Add to PipelineCard props/interface — no change needed, lead already has all fields via PipelineLead

// In render, add after stage badge (Row 2):
{lead.intent_verdict && (
  <div className="mt-1">
    <IntentBadge verdict={lead.intent_verdict} />
  </div>
)}
```

**New component:** `apps/web/src/components/pipeline/IntentBadge.tsx`

```tsx
import { Badge } from "@/components/ui/badge";

const VERDICT_CONFIG = {
  venting:      { label: "Venting",      variant: "destructive" as const, emoji: "🔴" },
  researching:  { label: "Researching",  variant: "warning" as const,     emoji: "🟡" },
  evaluating:   { label: "Evaluating",   variant: "default" as const,     emoji: "🟢" },
  ready_to_buy: { label: "Ready to Buy", variant: "success" as const,     emoji: "🔵" },
};

export function IntentBadge({ verdict, showEmoji = true }: { verdict: string; showEmoji?: boolean }) {
  const config = VERDICT_CONFIG[verdict as keyof typeof VERDICT_CONFIG];
  if (!config) return null;
  return (
    <Badge variant={config.variant} className="text-micro">
      {showEmoji && <span className="mr-1">{config.emoji}</span>}
      {config.label}
    </Badge>
  );
}
```

**Update PipelineLead interface:** `apps/web/src/hooks/usePipelineBoard.ts`

Add to `PipelineLead`:
```typescript
intent_verdict: string | null;
intent_dimensions: Record<string, number> | null;
```

And in the queryFn mapping (`api.pipeline.list()` result), map them:
```typescript
intent_verdict: l.intent_verdict ?? l.intentVerdict ?? null,
intent_dimensions: l.intent_dimensions ?? l.intentDimensions ?? null,
```

---

## 6. Frontend: Pipeline Intent Filter

**File:** `apps/web/src/pages/pipeline/index.tsx` (or the filter bar component)

### Changes

Add an **Intent Verdict** filter to the existing filter bar (next to "Due Today / Overdue / This Week / Stale").

```typescript
// Add to FilterType
type FilterType = "all" | "due_today" | "overdue" | "this_week" | "stale" | "evaluating_plus" | "ready_to_buy";
```

**Filter logic** in `usePipelineBoard.ts` (`filteredLeads` useMemo):

```typescript
case "evaluating_plus":
  result = result.filter((l) =>
    l.intent_verdict === "evaluating" || l.intent_verdict === "ready_to_buy"
  );
  break;
case "ready_to_buy":
  result = result.filter((l) => l.intent_verdict === "ready_to_buy");
  break;
```

**UI:** Two new filter pills:
- "Ready to Buy 🔵" — shows only `ready_to_buy`
- "Evaluating+ 🟢🔵" — shows `evaluating` + `ready_to_buy` (default recommended view)

**Default behavior:** When a user opens the pipeline page with no active filter, default to "evaluating_plus" if intent data exists on any leads. If no leads have intent_verdict, fallback to "all".

---

## 7. Frontend: Drawer Dimension Bars

**File:** `apps/web/src/components/pipeline/LeadQuickDrawer.tsx`

### Changes

1. **Add `showIntentProfile` to DrawerVisibility** in `drawer-visibility.ts`:

```typescript
showIntentProfile: boolean;
```

Set `showIntentProfile: true` for stages: `new`, `interested`, `qualified`, `proposal_sent`.
Set `showIntentProfile: false` for `contacted`, `replied` (intent is less relevant once engaged), `converted`, `lost`, `archived`.

2. **Add dimension bars section** in LeadQuickDrawer, in the INTEL section (after Review Summary or before it).

```tsx
{/* ── INTENT PROFILE ── */}
{v?.showIntentProfile && lead.intent_dimensions && (
  <details className="group" open>
    <summary className="flex items-center justify-between cursor-pointer list-none">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Target className="w-3.5 h-3.5 text-primary" />
        Intent Profile
      </span>
      {lead.intent_verdict && <IntentBadge verdict={lead.intent_verdict} showEmoji />}
    </summary>
    <div className="mt-3 space-y-2">
      <DimensionBar label="Awareness" value={lead.intent_dimensions.awareness ?? 0} />
      <DimensionBar label="Urgency" value={lead.intent_dimensions.urgency ?? 0} />
      <DimensionBar label="Budget Fit" value={lead.intent_dimensions.budgetFit ?? 0} />
      <DimensionBar label="Accessibility" value={lead.intent_dimensions.accessibility ?? 0} />
    </div>
  </details>
)}
```

**New component:** `apps/web/src/components/pipeline/DimensionBar.tsx`

```tsx
export function DimensionBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const colorClass =
    clamped >= 75 ? "bg-success" :
    clamped >= 50 ? "bg-primary" :
    clamped >= 25 ? "bg-warning" :
    "bg-destructive";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-micro-sm text-muted-foreground">{label}</span>
        <span className="text-micro-sm font-medium text-foreground">{clamped}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass} transition-all duration-500`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
```

**Import `Target` from lucide-react** in LeadQuickDrawer.

---

## 8. Frontend: Search Default Filter

**File:** `apps/web/src/pages/search/google-maps.tsx` (or wherever search results render)

### Changes

The search results table already has intent data (from search.ts update). Add a **default filter** that hides 🔴 Venting leads.

**UI approach:** Add a toggle/filter chips above the results table:
- "All Results" — no filter
- "Evaluating+" — default ON, shows only 🟢 Evaluating + 🔵 Ready to Buy
- "Ready to Buy" — shows only 🔵

**State:**
```typescript
const [intentFilter, setIntentFilter] = useState<"all" | "evaluating_plus" | "ready_to_buy">("evaluating_plus");
```

**Filter logic:** Applied client-side on the `results` array before rendering.

```typescript
const filteredResults = useMemo(() => {
  if (intentFilter === "all") return results;
  if (intentFilter === "evaluating_plus") return results.filter(r => r.intent_verdict === "evaluating" || r.intent_verdict === "ready_to_buy");
  if (intentFilter === "ready_to_buy") return results.filter(r => r.intent_verdict === "ready_to_buy");
  return results;
}, [results, intentFilter]);
```

**Display count:** Show "Showing 12 of 50 leads (24 hidden — low intent)" when filter is active and hiding results.

---

## 9. API Types & Shared Contracts

### Backend types (`apps/api/src/lib/intent-profile.ts`)
Export `IntentProfile`, `IntentDimensions`, `IntentVerdict`.

### Frontend types
- Add `intent_verdict: string | null` and `intent_dimensions: Record<string, number> | null` to `PipelineLead` in `usePipelineBoard.ts`.
- Add to search result type if a dedicated interface exists.

### API client (`apps/web/src/lib/api.ts`)
Add:
```typescript
getIntentProfile: (leadId: string) =>
  request("GET", `/leads/${leadId}/intent-profile`),
```

---

## 10. Testing & Verification

### Backend tests (manual curl)

1. **Search returns intent:**
   ```bash
curl -X POST https://leadgen-app-uz2o.onrender.com/search/google-maps \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"plumbers","location":"London","maxResults":5}' | jq '.results[0].intent_verdict, .results[0].intent_dimensions'
```
   Expect: `intent_verdict` is one of `venting|researching|evaluating|ready_to_buy`, `intent_dimensions` has 4 numeric keys.

2. **Pipeline list includes intent:**
   ```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://leadgen-app-uz2o.onrender.com/leads?limit=5 | jq '.[0].intent_verdict'
```

3. **Endpoint computes on demand:**
   ```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://leadgen-app-uz2o.onrender.com/leads/LEAD_ID/intent-profile | jq '.profile.verdict, .profile.overall'
```

4. **Save lead computes intent:**
   Save a lead from search results. Then fetch its intent profile. Expect computed values.

### Frontend verification

1. **Pipeline card:** Open pipeline. Cards show intent badge (🔴🟡🟢🔵) next to stage badge.
2. **Filter:** Click "Evaluating+" filter. Only 🟢🔵 cards remain. Count updates.
3. **Drawer:** Click a card. Drawer shows "Intent Profile" section with 4 dimension bars (0-100) + verdict badge.
4. **Search:** Run a search. Default filter is "Evaluating+". Toggle to "All Results" to see hidden 🔴🟡 leads.

---

## 11. Files to Touch

| File | Change |
|------|--------|
| `apps/api/migrations/016_intent_profile.sql` | New — add columns + index |
| `apps/api/src/db/schema.ts` | Add `intentVerdict`, `intentDimensions` to leads table |
| `apps/api/src/lib/intent-profile.ts` | New — scoring engine |
| `apps/api/src/routes/search.ts` | Compute + include intent in search results |
| `apps/api/src/routes/leads.ts` | Include intent in pipeline list; compute on save; add `GET /leads/:id/intent-profile` |
| `apps/web/src/hooks/usePipelineBoard.ts` | Add `intent_verdict`, `intent_dimensions` to PipelineLead + mapping |
| `apps/web/src/components/pipeline/IntentBadge.tsx` | New — verdict badge component |
| `apps/web/src/components/pipeline/PipelineCard.tsx` | Render intent badge |
| `apps/web/src/components/pipeline/DimensionBar.tsx` | New — horizontal bar component |
| `apps/web/src/components/pipeline/drawer-visibility.ts` | Add `showIntentProfile` flag |
| `apps/web/src/components/pipeline/LeadQuickDrawer.tsx` | Add intent profile section with dimension bars |
| `apps/web/src/lib/api.ts` | Add `getIntentProfile` method |
| `apps/web/src/pages/pipeline/index.tsx` | Add intent filter pills to filter bar |
| `apps/web/src/pages/search/google-maps.tsx` | Add intent filter chips above results table |

---

## 12. Rollout Plan

**Session 1 (Backend + DB):**
1. Migration `016_intent_profile.sql`
2. Schema update
3. `intent-profile.ts` scoring engine
4. Integrate into search.ts
5. Integrate into leads.ts (list + save + new endpoint)
6. Deploy, run manual curl tests

**Session 2 (Frontend):**
1. PipelineCard intent badge
2. Pipeline intent filter
3. Drawer dimension bars
4. Search default filter
5. Manual verification
6. Commit

---

## 13. Open Decisions (for Nirav)

1. **Emoji vs no-emoji:** Intent badge uses emoji (🔴🟡🟢🔵) for instant recognition. Alternative: colored dot + text only. Emoji is cleaner.
2. **hot_score deprecation:** Keep `hot_score` column for backward compat (pipeline sorts by it as fallback). Intent profile is additive, not replacing. Future: sort by `intent_profile.overall` DESC.
3. **LLM-enhanced explanations:** Current explanations are static strings. Future enhancement: use LLM to generate personalized one-liner ("This plumber has 50 reviews but no website — they're losing after-hours bookings"). Out of scope for this PRD.

---

*End PRD — ready for Hermes instruction conversion.*
