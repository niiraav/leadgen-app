# Drawer Enrichment PRD — LeadQuickDrawer Additive Enhancement

## Status: DRAFT — Awaiting approval before sprint start

---

## 1. Objective

Restore the rich information display that existed in the pre-PRD-v1 drawer and add new backend-surfaced intelligence. Every change is **additive** — existing drawer features (deal value, follow-up date, health strip, quick options, save indicator) remain untouched.

The drawer is now **stage-aware**: what surfaces depends on which pipeline stage the lead is in, because the question you're asking changes per stage.

---

## 2. Guiding Principles

- **Read-only first, then mutate.** Each phase starts with display; edit capability only in Phase 2 (notes).
- **Backend over client-side.** Replace client-side `followUpHealth()` with authoritative `GET /leads/:id/health`.
- **Defensive rendering.** Every new block has an explicit null/empty check. If data is missing, the block is hidden — no placeholder ghosts.
- **No layout shifts on existing elements.** Deal value input, follow-up input, quick pills, and save indicator keep their exact DOM order and styling within their respective sections.
- **End-of-phase QA gate.** Every phase is independently shippable and tested before the next begins.
- **Stage-aware, not stage-naive.** The same drawer component renders different information depending on `lead.status` / `lead.pipelineStage`. The goal is to answer the question the user actually has at that stage.
- **Optimistic UI for high-frequency actions.** "Mark handled" / "Mark read" must feel instant. Specified explicitly.
- **Loading states are specified.** The drawer receives a full `Lead` object from the pipeline page (via `get_pipeline_leads_with_replies` RPC), so display fields need no skeleton. Only the health endpoint (Phase 2) and on-demand bio generation (Phase 3) need loading states.

---

## 3. Stage-Aware Question Mapping

| Stage | User's Question | Primary Need |
|-------|----------------|--------------|
| **New** | Is this worth pursuing? | Context — who are they, are they reachable, is there social proof |
| **Contacted** | Did they respond? What's next? | Reply awareness + follow-up tracking |
| **Replied** | What did they say and what do I do about it? | Full reply + intent + composer + actions |
| **Interested / Qualified** | What's the deal shape and when do I follow up? | Deal value + follow-up |
| **Proposal Sent** | Have they responded? Is this going cold? | Health + recency + reply check |
| **Converted** | What was the value and what happened? | Record keeping (value, notes, history) |
| **Lost** | Why did this fail? | Loss reason + reflection |
| **Archived** | Reference only — what was this? | Same as Converted (notes, deal value, contact for reference) |

---

## 4. Stage-Aware Visibility Matrix

| Block | New | Contacted | Replied | Interested | Proposal | Converted | Lost | Archived |
|-------|-----|-----------|---------|------------|----------|-----------|------|----------|
| **DNC banner** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Reply preview** | — | ✓ | ✓ (highest) | ✓ | ✓ | — | — | — |
| **Reply actions** (mark handled/read) | — | ✓ | ✓ | ✓ | ✓ | — | — | — |
| **Follow-up date + quick options** | ✓ (primary) | ✓ | ✓ | ✓ | ✓ | — | — | — |
| **Deal value** | — | — | — | ✓ (primary) | ✓ | ✓ | ✓ (at stake) | ✓ |
| **Composer / "Send message"** | — | collapsed | **prominent** | collapsed | collapsed | — | — | — |
| **Backend health strip** | — | ✓ | ✓ | ✓ | ✓ (prominent) | — | — | — |
| **Notes** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Contact block** | ✓ (expanded) | collapsed | collapsed | collapsed | collapsed | ✓ (expanded) | ✓ (expanded) | ✓ (expanded) |
| **Email verification badge** | ✓ | — | — | — | — | — | — | — |
| **Enrichment contact block** | ✓ | — | — | — | — | — | — | — |
| **AI bio** | ✓ (collapsed) | — | — | ✓ (collapsed) | — | — | — | — |
| **Review summary** | ✓ (collapsed) | — | — | ✓ (collapsed) | — | — | — | — |
| **Rating + reviews** | ✓ | — | — | — | — | — | — | — |
| **Category + tags** | ✓ | — | — | — | — | — | — | — |
| **Loss reason** | — | — | — | — | — | — | ✓ (prominent) | — |
| **Last activity** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Open full profile** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Cut from drawer entirely:**
- Hot score pill — already on the card, redundant
- Stage/status badge — already on the card, redundant
- Contact enrichment status badge — internal ops signal, not useful during triage
- Created date as primary field — surfaced through "last activity" instead

---

## 5. Drawer Data Model

The drawer receives a full `Lead` object from the parent pipeline page. The pipeline list endpoint (`GET /pipeline/leads`) uses a Supabase RPC (`get_pipeline_leads_with_replies`) that returns the complete lead row plus computed reply columns. **No separate fetch is required for display-only fields** (`lead.latestReply`, `lead.ai_bio`, `lead.review_summary`, `lead.email_status`, etc.).

Fields that require live fetch:
- **Backend health** → `GET /leads/:id/health` (Phase 2)
- **AI bio generation** → `POST /leads/:id/generate-bio` (Phase 3, on-demand only)

Loading states:
- Health block shows a 2-line skeleton while fetching.
- Bio generation shows an inline spinner inside the bio block.
- All other blocks render synchronously from the in-memory `Lead` object.

### Phase 0 Prerequisite (do before Phase 1)

**Expand `PipelineLead` interface and mapping in `usePipelineBoard.ts`.**

The RPC returns `to_jsonb(l.*)` — the full `leads` table row — but the frontend mapping currently only extracts ~15 fields. The drawer needs additional fields that are dropped on the floor. Before Phase 1, extend:

```typescript
// In apps/web/src/hooks/usePipelineBoard.ts

export interface PipelineLead {
  // ... existing fields ...
  phone: string;
  address: string;
  website_url: string;
  rating: number | null;
  review_count: number | null;
  tags: string[] | null;
  notes: string | null;
  ai_bio: string | null;
  review_summary: any | null;
  email_status: string | null;      // or email_deliverability
  doNotContact: boolean;
  contact_full_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  last_contacted: string | null;
}
```

And extend the `queryFn` mapping to include these fields from the raw API response (snake_case to camelCase). This is a one-time mapping expansion; no backend changes needed.

---

## 6. `getDrawerVisibility` Utility Specification

This is the single source of truth for stage-based visibility. All stage logic lives here. The JSX consumes booleans — no inline ternaries for stage rules.

```typescript
// File: apps/web/src/components/pipeline/drawer-visibility.ts

import type { PipelineLead } from "@/hooks/usePipelineBoard";

export interface DrawerVisibility {
  showDncBanner: boolean;
  showReplyPreview: boolean;
  showReplyActions: boolean;
  showFollowUp: boolean;
  showDealValue: boolean;
  showComposer: boolean;
  showComposerProminent: boolean;
  showHealth: boolean;
  showNotes: boolean;
  showContactBlock: boolean;
  expandContactBlock: boolean;
  showEmailVerification: boolean;
  showEnrichmentContact: boolean;
  showAiBio: boolean;
  showReviewSummary: boolean;
  showRating: boolean;
  showCategoryTags: boolean;
  showLossReason: boolean;
  showLastActivity: boolean;
  showFooter: boolean;
}

function stageKey(stage: string | undefined): string {
  // Normalize: handle both old status strings and new pipelineStage values
  return (stage ?? "new").toLowerCase();
}

// ── Default config: safest fallback for unknown/corrupted stages ──
// Shows only universally-safe blocks. Does NOT expose enrichment, rating,
// expanded contact, or other triage-oriented data that may be inappropriate
// for a lead in an unrecognized stage.
const DEFAULT_VISIBILITY: DrawerVisibility = {
  showDncBanner: true,
  showReplyPreview: false,
  showReplyActions: false,
  showFollowUp: false,
  showDealValue: false,
  showComposer: false,
  showComposerProminent: false,
  showHealth: false,
  showNotes: true,
  showContactBlock: true,
  expandContactBlock: false,
  showEmailVerification: false,
  showEnrichmentContact: false,
  showAiBio: false,
  showReviewSummary: false,
  showRating: false,
  showCategoryTags: false,
  showLossReason: false,
  showLastActivity: true,
  showFooter: true,
};

// ── Interested config: reused by both interested and qualified ──
const INTERESTED_VISIBILITY: DrawerVisibility = {
  showDncBanner: true,
  showReplyPreview: true,
  showReplyActions: true,
  showFollowUp: true,
  showDealValue: true,
  showComposer: true,
  showComposerProminent: false,
  showHealth: true,
  showNotes: true,
  showContactBlock: true,
  expandContactBlock: false,
  showEmailVerification: false,
  showEnrichmentContact: false,
  showAiBio: true,
  showReviewSummary: true,
  showRating: false,
  showCategoryTags: false,
  showLossReason: false,
  showLastActivity: true,
  showFooter: true,
};

const VISIBILITY_CONFIG: Record<string, DrawerVisibility> = {
  new: {
    showDncBanner: true,
    showReplyPreview: false,
    showReplyActions: false,
    showFollowUp: true,
    showDealValue: false,
    showComposer: false,
    showComposerProminent: false,
    showHealth: false,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: true,
    showEmailVerification: true,
    showEnrichmentContact: true,
    showAiBio: true,
    showReviewSummary: true,
    showRating: true,
    showCategoryTags: true,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  contacted: {
    showDncBanner: true,
    showReplyPreview: true,
    showReplyActions: true,
    showFollowUp: true,
    showDealValue: false,
    showComposer: true,
    showComposerProminent: false,
    showHealth: true,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: false,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  replied: {
    showDncBanner: true,
    showReplyPreview: true,
    showReplyActions: true,
    showFollowUp: true,
    showDealValue: false,
    showComposer: true,
    showComposerProminent: true,
    showHealth: true,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: false,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  interested: INTERESTED_VISIBILITY,
  qualified: INTERESTED_VISIBILITY,
  proposal_sent: {
    showDncBanner: true,
    showReplyPreview: true,
    showReplyActions: true,
    showFollowUp: true,
    showDealValue: true,
    showComposer: true,
    showComposerProminent: false,
    showHealth: true,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: false,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  converted: {
    showDncBanner: true,
    showReplyPreview: false,
    showReplyActions: false,
    showFollowUp: false,
    showDealValue: true,
    showComposer: false,
    showComposerProminent: false,
    showHealth: false,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: true,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  lost: {
    showDncBanner: true,
    showReplyPreview: false,
    showReplyActions: false,
    showFollowUp: false,
    showDealValue: true,
    showComposer: false,
    showComposerProminent: false,
    showHealth: false,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: true,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: true,
    showLastActivity: true,
    showFooter: true,
  },
  archived: {
    showDncBanner: true,
    showReplyPreview: false,
    showReplyActions: false,
    showFollowUp: false,
    showDealValue: true,
    showComposer: false,
    showComposerProminent: false,
    showHealth: false,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: true,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
};

export function getDrawerVisibility(lead: PipelineLead): DrawerVisibility {
  const stage = stageKey(lead.pipelineStage ?? lead.status);
  const config = VISIBILITY_CONFIG[stage];
  if (!config) {
    console.warn(`[DrawerVisibility] Unknown stage "${stage}" for lead ${lead.id}. Falling back to DEFAULT.`);
    return DEFAULT_VISIBILITY;
  }
  return config;
}
```

**Rules for the utility:**
1. `pipelineStage` is checked first; falls back to `status` for backward compatibility.
2. Any unrecognized stage falls back to `DEFAULT_VISIBILITY` (conservative: notes, contact collapsed, DNC, last activity, footer only). A `console.warn` is emitted so unexpected stages are visible in dev.
3. `qualified` is an alias of `interested` — they share the same user intent (deal shape + follow-up). Both reference the same `INTERESTED_VISIBILITY` constant object. No runtime mutation.
4. The JSX consumes `const v = getDrawerVisibility(lead)` and uses `v.showX` booleans. No other stage checks in the component.

---

## 7. Final Drawer Section Order (top-to-bottom)

```
[HEADER]     Business name + Close button

[URGENT]     DNC banner (if true — always first, all stages)
             Unread reply preview (if latestReply exists)
             → Contacted, Replied, Interested, Proposal Sent
             Reply actions (mark handled / mark read)
             → Same stages as reply preview

[ACTION]     Follow-up date + quick options (Tomorrow / 3d / 1w / 2w)
             → Hidden on Converted, Lost, Archived
             Deal value input (£) — visible from Interested onwards
             → Hidden on New, Contacted, Replied
             Composer / "Send message" button
             → Prominent in Replied, collapsed elsewhere, hidden on New/Converted/Lost/Archived

[HEALTH]     Backend health strip + days since activity + stale flag
             → Hidden on New, Converted, Lost, Archived
             Loading skeleton while fetching (2 lines)

[NOTES]      Notes textarea (blur-to-save)
             Max 2000 characters, hard limit via maxLength={2000}
             Character counter shown in muted text below textarea when < 200 chars remaining
             → All stages

[CONTEXT]    Contact block (email+phone+address+website)
             → Expanded on New, Converted, Lost, Archived
             → Collapsed by default on Contacted, Replied, Interested, Proposal Sent
             Email verification badge (inline beside email) — New only
             Enrichment contact block — New only

[INTEL]      AI bio (collapsible) — New and Interested only
             Review summary (collapsible) — New and Interested only
             → Hidden on all other stages

[META]       Rating + reviews — New only
             Category + tags — New only
             Loss reason (prominent) — Lost only
             Last activity (muted) — all stages

[FOOTER]     Open full profile → /leads/{id}
```

---

## 8. Phase Plan

### Phase 0 — PipelineLead Mapping Expansion (Prerequisite)

**Goal:** Expand the `PipelineLead` interface and the API response mapping so the drawer has access to all fields it needs.

**Files changed:**
- `apps/web/src/hooks/usePipelineBoard.ts` — extend `PipelineLead` interface and `queryFn` mapping

**Fields to add to the mapping (all come from `to_jsonb(l.*)` in the RPC):**
- `phone`, `address`, `website_url`
- `rating`, `review_count`, `tags`
- `notes`, `ai_bio`, `review_summary`
- `email_status` / `email_deliverability`, `doNotContact` / `do_not_contact`
- `contact_full_name`, `contact_title`, `contact_email`, `contact_phone`
- `last_contacted`

**Testing Gate 0:**
- [ ] Pipeline page loads without error
- [ ] All existing pipeline features (drag-drop, filters, search, view toggle) still work
- [ ] No TypeScript errors in `usePipelineBoard.ts`
- [ ] Console has no "unknown field" warnings from the mapping

---

### Phase 1 — Profile Restoration + Reply Preview + Compliance Banners (Presentational only)

**Goal:** Restore the static information blocks, add compliance signals, and surface reply previews where they're most urgent.

**Blocks added:**

| Block | Data Source | Stage Rule |
|-------|-------------|------------|
| DNC banner | `lead.doNotContact` | All stages, top of drawer |
| Reply preview (read-only) | `lead.latestReply`, `lead.unreadReplyCount` | Contacted, Replied, Interested, Proposal Sent |
| Contact block (email, phone, address, website) | `lead.email`, `lead.phone`, `lead.address+city+country`, `lead.website_url` | Expanded on New/Converted/Lost/Archived, collapsed elsewhere |
| Email verification badge | `lead.email_status` | New only, inline beside email |
| Enrichment contact block | `lead.contact_full_name`, `lead.contact_title`, `lead.contact_email`, `lead.contact_phone` | New only |
| Rating + review count | `lead.rating`, `lead.review_count` | New only |
| Category + tags flex | `lead.category`, `lead.tags[]` | New only |
| Last activity | `lead.lastActivity` | All stages, muted style |
| Loss reason (prominent) | `lead.lossReason` + `LOSS_REASON_LABELS` | Lost only |
| Footer: "Open full profile" | Link to `/leads/${lead.id}` | All stages |

**Removed from old drawer:**
- Hot score pill
- Stage/status badge
- Contact enrichment status badge
- Created date as primary field

**Implementation notes:**
- Reply preview is **display only** in this phase — no actions yet. Shows sender snippet (CSS `line-clamp-2`), relative timestamp, intent badge, unread count pill.
- If no `latestReply`, the entire reply section is hidden (no "No replies" placeholder).
- Contact block uses a `<details>` / collapsible pattern. Default `open` prop set by `expandContactBlock` from `getDrawerVisibility`.
- **Parent page wiring change:** `pipeline/index.tsx` currently stores a full `lead` object in `quickDrawer` state. Change to store only `leadId`:
  ```typescript
  const [quickDrawer, setQuickDrawer] = useState<{ open: boolean; leadId: string | null }>({ open: false, leadId: null });
  
  const handleCardClick = useCallback((lead: PipelineLead) => {
    setQuickDrawer({ open: true, leadId: lead.id });
  }, []);
  
  // Derive current lead from React Query cache each render
  const drawerLead = useMemo(
    () => board.leads.find((l) => l.id === quickDrawer.leadId) ?? null,
    [board.leads, quickDrawer.leadId]
  );
  ```
  Pass `drawerLead` to `<LeadQuickDrawer lead={drawerLead} ... />`. This ensures the drawer receives live updates when the lead moves stages or fields change — no re-open required.

**Testing Gate 1:**
- [ ] Drawer opens/closes without error for leads with all fields populated
- [ ] Drawer opens/closes without error for leads with NO optional fields (minimal lead)
- [ ] DNC banner appears at top when `doNotContact=true`
- [ ] New-stage lead: contact block expanded, rating/tags visible, enrichment visible
- [ ] Contacted-stage lead: contact block collapsed by default, reply preview visible if replies exist
- [ ] Replied-stage lead: reply preview visible, no rating/tags/enrichment
- [ ] Lost-stage lead: loss reason prominent, no follow-up, no health, contact expanded
- [ ] Converted-stage lead: deal value visible, no follow-up, no health, contact expanded
- [ ] Archived-stage lead: same as Converted (deal value, notes, contact expanded, no health/composer)
- [ ] No console errors, no layout shifts on existing inputs
- [ ] Mobile: drawer width stays `max-w-md`, content scrolls naturally
- [ ] Reply preview hidden for leads without `latestReply`
- [ ] Drag a card to a different column while drawer is open → drawer content updates (stage visibility changes) without closing/reopening

---

### Phase 2 — Interactive Core (Notes + Backend Health)

**Goal:** Add mutation capability for notes and replace client-side health with authoritative backend health.

**Blocks added:**

| Block | Data Source / API | Stage Rule |
|-------|-------------------|------------|
| Notes textarea (blur-to-save) | `lead.notes` + `api.leadActions.updateNotes` | All stages |
| Backend health strip | `api.leads.getHealth(id)` | Contacted, Replied, Interested, Proposal Sent |
| Days since activity | From health response | Same as above |
| Stale flag | From health response | Same as above |

**Implementation notes:**
- `api.leads.getHealth` currently exists in `api.ts` but is **never invoked** in the app. This phase wires it.
- Notes save uses the dedicated `PATCH /leads/:id/notes` endpoint (`api.leadActions.updateNotes`), not the generic `api.leads.update`.
- Notes textarea: `maxLength={2000}`. This is a **hard limit** enforced by the browser. Show character count in muted text below textarea when `< 200` chars remaining. On blur, if the user has trimmed to empty, save as `null` (not `""`).
- On blur, show saving spinner then "Saved" indicator (reuse existing save indicator component).
- Health endpoint config:
  - Fetched once on drawer open
  - `staleTime: 60_000`
  - `refetchOnWindowFocus: false`
  - `enabled: isOpen && !!lead.id && visibility.showHealth`
  - Cancelled on drawer close via `enabled` toggle
- **Important:** `getDrawerVisibility(lead)` must be called at the **top of the drawer component** (before any `useQuery` calls), and its result stored in a variable. The `visibility.showHealth` boolean is then used inside the query config. Never call `getDrawerVisibility` conditionally or inside the query object itself — that would violate Rules of Hooks.
- Existing client-side `followUpHealth()` strip is replaced by the backend health strip where `showHealth` is true. On stages where health is hidden, the old strip is simply not rendered.
- Health block shows a 2-line skeleton (`h-4 bg-surface-2 rounded animate-pulse`) while `isLoading`.

**Testing Gate 2:**
- [ ] Backend health endpoint returns successfully for 10+ leads across different stages
- [ ] Health color matches backend `follow_up_health` (red/amber/green/null)
- [ ] Stale flag adds a "Stale" sub-badge when true
- [ ] Health hidden on New, Converted, Lost, Archived
- [ ] Health skeleton appears while loading, then resolves
- [ ] Switching browser tabs does NOT refetch health (`refetchOnWindowFocus: false`)
- [ ] Notes save on blur, no 409/overwrite conflicts
- [ ] Notes at 2000 chars: counter shown in warning color, save still succeeds
- [ ] Notes empty → saves as `null`, not `""`
- [ ] Rapid open/close/reopen does not create stale health requests or race conditions
- [ ] Health fetch is cancelled on drawer close (React Query `enabled` flag)

---

### Phase 3 — Intelligence Layer (Read-only enrichment display)

**Goal:** Surface AI-generated and review-derived intelligence where it's most useful.

**Blocks added:**

| Block | Data Source / API | Stage Rule |
|-------|-------------------|------------|
| AI Bio collapsible | `lead.ai_bio` + `api.leadActions.generateBio` | New and Interested only, collapsed by default |
| Review Summary | `lead.review_summary` | New and Interested only, collapsed by default |

**Implementation notes:**
- `generateBio` is async (LLM call). Show loading state inside the bio block only. Drawer remains interactive.
- If no `ai_bio`, show "Generate bio" button that triggers `generateBio(lead.id, 200)` and updates local React state on success. Does NOT mutate the lead object in the parent — the drawer owns this local state until refresh.
- Review summary sub-blocks (only show if data exists):
  - Themes → tag pills
  - Pain Points → bulleted list
  - USP Candidates → bulleted list
  - Staff Names → comma-separated
  - Owner Name + Evidence → blockquote style
- If no `review_summary`, entire section is hidden (no "No reviews" placeholder).
- Both sections are hidden on stages other than New and Interested.

**Testing Gate 3:**
- [ ] AI bio renders when present; collapses/expands smoothly
- [ ] "Generate bio" button visible when no bio; triggers generation
- [ ] Generate bio succeeds and replaces button with bio text
- [ ] Generate bio handles 402 (upgrade required) gracefully (shows upgrade prompt inline)
- [ ] Review summary renders all 5 sub-blocks independently (test with partial data)
- [ ] Review summary absent → entire section hidden
- [ ] Sections hidden on Contacted, Replied, Proposal Sent, Converted, Lost, Archived
- [ ] No memory leaks from async bio generation after drawer closes (cancel query on unmount)

---

### Phase 4 — Reply Actions + Quick Compose (Optimistic UI)

**Goal:** Enable rapid reply handling and quick composer access with instant-feeling interactions.

**Blocks added:**

| Block | Data Source / API | Stage Rule |
|-------|-------------------|------------|
| Reply quick-actions | `api.replies.handled`, `api.replies.read` | Contacted, Replied, Interested, Proposal Sent |
| Quick composer button | Link to `/leads/${id}?action=compose` | Prominent in Replied; collapsed elsewhere; hidden on New/Converted/Lost/Archived |

**Implementation notes:**
- **Optimistic UI is mandatory.** Reply actions must feel instant:
  - On "Mark handled" click: immediately hide the reply preview block from the drawer (local state). Fire the API in the background. On error, restore the block and show a toast.
  - On "Mark read" click: immediately clear the unread count badge (local state). Fire the API. On error, restore the badge.
  - Invalidate the pipeline query (`api.pipeline.list`) on success so the card overlay updates within 2s.
  - Use React Query's `onMutate` / `onError` / `onSettled` pattern for the optimistic updates.
- **Local state for reply rendering:** The drawer maintains:
  ```typescript
  const [localLatestReply, setLocalLatestReply] = useState(lead?.latestReply ?? null);
  const [localUnreadCount, setLocalUnreadCount] = useState(lead?.unreadReplyCount ?? 0);

  useEffect(() => {
    setLocalLatestReply(lead?.latestReply ?? null);
    setLocalUnreadCount(lead?.unreadReplyCount ?? 0);
  }, [lead?.id]);
  ```
  All reply rendering (preview, actions, unread badge) uses `localLatestReply` and `localUnreadCount`, not `lead.latestReply` directly. This allows optimistic mutations to update the UI immediately without waiting for the parent cache to refresh.
- Reply action buttons are inline with the reply preview block, below the snippet.
- **Composer:** The detail page (`/leads/[id].tsx`) already handles `?action=compose` (line 204: `const isRecontact = router.query.action === "compose"`). No prerequisite work needed. The composer button links directly to `/leads/${lead.id}?action=compose`.
- If `latestReply` is null, the entire reply section (preview + actions) is hidden.

**Reply action optimistic pattern (specification):**

```typescript
// Pseudocode for the mutation hook (inside drawer component)
const markHandled = useMutation({
  mutationFn: (replyId: string) => api.replies.handled(replyId, 'archive'),
  onMutate: async (replyId) => {
    await queryClient.cancelQueries({ queryKey: ['leads', { view: 'pipeline' }] });
    const previous = queryClient.getQueryData(['leads', { view: 'pipeline' }]);

    // Optimistically update pipeline cache
    queryClient.setQueryData(['leads', { view: 'pipeline' }], (old: any) => {
      if (!old) return old;
      return old.map((l: any) =>
        l.id === lead.id
          ? { ...l, latestReply: null, unreadReplyCount: 0 }
          : l
      );
    });

    // Optimistically update drawer local state
    setLocalLatestReply(null);
    setLocalUnreadCount(0);
    return { previous };
  },
  onError: (err, replyId, context) => {
    queryClient.setQueryData(['leads', { view: 'pipeline' }], context?.previous);
    setLocalLatestReply(lead?.latestReply ?? null);
    setLocalUnreadCount(lead?.unreadReplyCount ?? 0);
    toast.error('Failed to mark handled');
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  },
});
```

**Testing Gate 4:**
- [ ] Reply preview shows for leads with `latestReply`
- [ ] Reply preview + actions hidden for leads without replies
- [ ] "Mark handled" click: reply preview disappears immediately (optimistic)
- [ ] Pipeline card unread badge disappears within 2s after "Mark handled"
- [ ] "Mark handled" API failure: reply preview reappears + toast error shown
- [ ] "Mark read" click: unread count clears immediately (optimistic)
- [ ] "Mark read" API failure: unread count restores + toast error shown
- [ ] Composer button navigates to detail page with `?action=compose` and auto-opens composer
- [ ] No console errors during rapid mark-handled / mark-read / close / reopen sequences

---

## 9. API Changes Required

| Endpoint | Change | Justification |
|----------|--------|---------------|
| `GET /leads/:id/health` | **None** — already exists, just unused | Phase 2 replaces client-side health |
| `PATCH /leads/:id/notes` | **None** — already exists via `api.leadActions.updateNotes` | Phase 2 notes editing |
| `POST /leads/:id/generate-bio` | **None** — already exists | Phase 3 bio regeneration |
| `POST /leads/:id/ai-email` | **None** — already exists | Phase 4 composer (navigates to detail page) |
| `PATCH /replies/:id/read` | **None** — already exists | Phase 4 mark read |
| `POST /replies/:id/handled` | **None** — already exists | Phase 4 mark handled |
| Detail page `?action=compose` | **Already supported** — `/leads/[id].tsx` line 204 | Phase 4 composer button auto-opens composer |

**No backend work required.** All endpoints exist. The only frontend prerequisite is the `PipelineLead` mapping expansion in Phase 0.

---

## 10. Risk Register

| Risk | Mitigation |
|------|------------|
| Drawer becomes too tall on small laptops | Cap max-height with `overflow-y-auto`. Phase 1 adds ~400px; test on 768px height viewport. Collapsible sections default to collapsed except where specified. |
| `api.leads.getHealth` is slow | React Query `enabled` tied to drawer open; `staleTime: 60_000`; `refetchOnWindowFocus: false`. Skeleton shown while loading. |
| Notes blur-save races with deal value blur-save | Separate endpoints (`updateNotes` vs `update`). No overlap. |
| AI bio generation is expensive/slow | Inline spinner in bio block only. Drawer remains interactive. Cancel on close via query cancellation. |
| Reply mutations fail silently | **Optimistic UI with rollback.** On error, restore local state and show toast. Never silent. |
| Mobile drawer feels cramped | Keep `max-w-md`. Collapsible sections default collapsed. Test on 375px width. |
| Stage logic becomes spaghetti | `getDrawerVisibility(lead)` utility — single source of truth. JSX consumes booleans only. |
| Parent page passes stale lead snapshot | **Fixed in Phase 1.** Parent stores `leadId` only; derives lead from `board.leads` each render. Drawer receives live updates from React Query cache. |

---

## 11. QA Checklist (per phase)

See Testing Gates 0–4 in each phase section above.

Global regression checks (run after every phase):
- [ ] Deal value still saves on blur (Interested+)
- [ ] Follow-up date still saves on blur (non-Converted/Lost/Archived)
- [ ] Quick options (Tomorrow/3d/1w/2w) still work
- [ ] Drawer close (X, Escape, backdrop click) still works
- [ ] Keyboard navigation (Tab, Shift+Tab) cycles through new inputs naturally
- [ ] Stage transitions (moving a lead from New → Contacted → Replied) update drawer contents without re-open

---

## 12. Definition of Done (entire PRD)

- [ ] Phase 0 (mapping expansion) merged and tested
- [ ] All 4 phases merged and tested
- [ ] `getDrawerVisibility` utility exists and is the only stage-logic source in the drawer
- [ ] Zero console errors in drawer for minimal lead (no optional fields)
- [ ] Zero console errors in drawer for maximal lead (all fields populated)
- [ ] Mobile drawer scrolls smoothly, no cut-off buttons
- [ ] Each phase could be shipped independently (no cross-phase dependencies)
- [ ] Smoke test account (`smoke-2026@leadgenapp.com`) passes all 5 testing gates
- [ ] Stage-aware visibility verified across all 8 stages (including Archived)
- [ ] Reply actions use optimistic UI with rollback on failure
- [ ] Health endpoint uses `refetchOnWindowFocus: false`
