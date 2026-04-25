# Drawer Enrichment — Next Phase Prompt

## Context

This session completed Phase 0 + Phase 1 of the Drawer Enrichment PRD, plus 6 bug fixes on the pipeline page. The code is in `/Users/niravarvinda/Documents/Code/LeadGenApp`.

## What Was Already Done (Phase 0 + Phase 1)

### Phase 0 — PipelineLead Mapping Expansion
- File: `apps/web/src/hooks/usePipelineBoard.ts`
- Added fields to `PipelineLead` interface and `queryFn` mapping: `phone`, `address`, `website_url`, `rating`, `review_count`, `tags`, `notes`, `ai_bio`, `review_summary`, `email_status`, `doNotContact`, `contact_full_name`, `contact_title`, `contact_email`, `contact_phone`, `last_contacted`

### Phase 1 — Profile Restoration + Reply Preview + Compliance Banners
- **File: `apps/web/src/components/pipeline/drawer-visibility.ts`** (NEW) — `getDrawerVisibility(lead)` utility with `DrawerVisibility` interface. Stage configs for: new, contacted, replied, interested/qualified (shared INTERESTED_VISIBILITY), proposal_sent, converted, lost, archived. Unknown stages fall back to DEFAULT with console.warn.
- **File: `apps/web/src/components/pipeline/LeadQuickDrawer.tsx`** — All Phase 1 blocks implemented:
  - DNC banner (top, all stages)
  - Reply preview with line-clamp-2, relative time, unread count pill (Contacted/Replied/Interested/Proposal)
  - Contact block (details/summary) with expand/collapse per stage rules
  - Email verification badge (New only, inline beside email)
  - Enrichment contact block (New only)
  - Rating + review count (New only)
  - Category + tags flex row (New only)
  - Loss reason banner (Lost only)
  - Last activity muted line (all stages)
  - Footer with "Open full profile" link (all stages)
  - Notes textarea with blur-to-save, 2000 char limit, character counter warning at <200 remaining, saving/saved indicators
  - Backend health strip with 2-line skeleton while loading, fetched via `api.leads.getHealth(lead!.id)`, enabled only when `v?.showHealth` and `isOpen`
- **File: `apps/web/src/pages/pipeline/index.tsx`** — Parent page stores only `leadId` in `quickDrawer` state. `drawerLead` derived from `board.leads` via `useMemo` each render. This ensures drag-and-drop stage transitions update the drawer live without closing/reopening.

### 6 Bug Fixes Also Delivered
| Bug | File(s) | Fix |
|-----|---------|-----|
| #1 Unsubscribe auto-move | `apps/api/src/routes/webhook.ts` | Added unsubscribe detection in inbound reply webhook. Auto-updates status to `not_interested` + `pipelineStage: 'lost'` + `engagementStatus: 'unsubscribed'` |
| #2 Notes save in card | `LeadQuickDrawer.tsx` | Notes input `onBlur` saves via `onUpdate` and renders a read-only card below textarea when notes exist |
| #3 Same-column DnD reorder | `PipelineBoardDesktop.tsx`, `pipeline/index.tsx` | Added `onReorderLead` prop. Same-column drops compute `prevLeadId`/`nextLeadId` from reordered array and call `reorderMutation.mutate()` directly |
| #4 Deselect / filter persistence | `usePipelineBoard.ts` | Plain click deselects if only selected lead. `handleSearch` + `handleFilterChange` clear selection. `moveMutation`/`bulkMoveMutation` `onSettled` clear selection |
| #5 Toolbar positioning | `SelectionToolbar.tsx` | `sticky bottom-4` → `fixed bottom-4 left-0 right-0` |
| #6 Overlay misalignment | `LeadQuickDrawer.tsx` | `z-50` → `z-[100]`, backdrop `absolute` → `fixed` |

## PRD Location

`/Users/niravarvinda/Documents/Code/LeadGenApp/docs/drawer-enrichment-prd.md`

## Current State of Key Files

| File | Status |
|------|--------|
| `apps/web/src/hooks/usePipelineBoard.ts` | Phase 0 mapping expanded, bug #3/#4 fixes in place |
| `apps/web/src/components/pipeline/drawer-visibility.ts` | Phase 1 complete — all 8 stages configured |
| `apps/web/src/components/pipeline/LeadQuickDrawer.tsx` | Phase 1 blocks present + health strip (which is actually Phase 2). Also has notes editing (Phase 2). |
| `apps/web/src/pages/pipeline/index.tsx` | leadId-only state pattern (Phase 1) in place |
| `apps/web/src/components/pipeline/SelectionToolbar.tsx` | `fixed` positioning (bug #5) |
| `apps/web/src/components/pipeline/PipelineBoardDesktop.tsx` | `onReorderLead` prop (bug #3) |
| `apps/api/src/routes/webhook.ts` | Unsubscribe detection (bug #1) |

## IMPORTANT: Phase Overlap Detected

The current `LeadQuickDrawer.tsx` already contains code from Phase 2 (notes editing + backend health strip). Notes saving and health fetching are already wired. This means:
- Phase 2 is **partially complete** — notes editing and health fetching are already in the drawer.
- What Phase 2 still needs: QA verification (Testing Gate 2), specifically:
  - Health endpoint returns successfully for 10+ leads across stages
  - Health color matches backend `follow_up_health` (red/amber/green/null)
  - Stale flag adds "Stale" sub-badge when true
  - Health hidden on New, Converted, Lost, Archived
  - Health skeleton appears while loading, then resolves
  - Switching browser tabs does NOT refetch health
  - Notes save on blur, no 409/overwrite conflicts
  - Notes at 2000 chars: counter shown in warning color
  - Notes empty → saves as null, not ""
  - Rapid open/close/reopen does not create stale health requests
  - Health fetch cancelled on drawer close

## Next Phase Scope

**Phase 2 QA + Phase 3 + Phase 4** is the remaining work.

### Phase 3 — Intelligence Layer (AI Bio + Review Summary)

**Blocks to add:**
- AI Bio collapsible — `lead.ai_bio` + `api.leadActions.generateBio`. New and Interested only. Collapsed by default. If no `ai_bio`, show "Generate bio" button that triggers `generateBio(lead.id, 200)`.
- Review Summary — `lead.review_summary`. New and Interested only. Collapsed by default. Sub-blocks (only show if data exists):
  - Themes → tag pills
  - Pain Points → bulleted list
  - USP Candidates → bulleted list
  - Staff Names → comma-separated
  - Owner Name + Evidence → blockquote style
- If no `review_summary`, entire section hidden (no placeholder).
- Both sections hidden on stages other than New and Interested.
- Drawer remains interactive during bio generation.

### Phase 4 — Reply Actions + Quick Compose (Optimistic UI)

**Blocks to add:**
- Reply quick-actions (Mark handled / Mark read) — `api.replies.handled`, `api.replies.read`. Contacted, Replied, Interested, Proposal Sent.
- Quick composer button — links to `/leads/${id}?action=compose`. Prominent in Replied; collapsed elsewhere; hidden on New/Converted/Lost/Archived.
- **Optimistic UI mandatory**:
  - "Mark handled": immediately hide reply preview block (local state). Fire API background. On error, restore block + toast.
  - "Mark read": immediately clear unread count badge (local state). Fire API. On error, restore badge.
  - Invalidate pipeline query on success so card overlay updates within 2s.
  - Use React Query `onMutate`/`onError`/`onSettled`.
- **Local state for reply rendering:**
  ```typescript
  const [localLatestReply, setLocalLatestReply] = useState(lead?.latestReply ?? null);
  const [localUnreadCount, setLocalUnreadCount] = useState(lead?.unreadReplyCount ?? 0);

  useEffect(() => {
    setLocalLatestReply(lead?.latestReply ?? null);
    setLocalUnreadCount(lead?.unreadReplyCount ?? 0);
  }, [lead?.id]);
  ```
  All reply rendering uses `localLatestReply` and `localUnreadCount`, not `lead.latestReply` directly.
- Composer button: detail page (`/leads/[id].tsx`) already handles `?action=compose` (line ~204). No prerequisite work needed.

## Constraints (Still Apply)

- **Additive only.** Existing drawer elements (deal value input, follow-up date input, quick options pills, save indicator) must keep their exact DOM order, styling, and behavior. Do not refactor them.
- Every new block must have an explicit null/empty check. If data is missing, hide the block entirely — no placeholder ghosts.
- The drawer is stage-aware via `getDrawerVisibility(lead)` in `drawer-visibility.ts`. This is the single source of truth. No inline stage ternaries in JSX.
- Drawer section order must match Section 7 of the PRD exactly.
- Do NOT modify backend/API routes, add new dependencies, or change existing drag-and-drop/filters/search/view toggle behavior.

## QA Gates to Pass

### Phase 2 (QA Only — code already exists)
- [ ] Backend health endpoint returns successfully for 10+ leads across different stages
- [ ] Health color matches backend `follow_up_health`
- [ ] Stale flag adds "Stale" sub-badge when true
- [ ] Health hidden on New, Converted, Lost, Archived
- [ ] Health skeleton appears while loading, then resolves
- [ ] Switching browser tabs does NOT refetch health
- [ ] Notes save on blur, no 409/overwrite conflicts
- [ ] Notes at 2000 chars: counter shown in warning color
- [ ] Notes empty → saves as null, not ""
- [ ] Rapid open/close/reopen does not create stale health requests
- [ ] Health fetch is cancelled on drawer close

### Phase 3 Testing Gate
- [ ] AI bio renders when present; collapses/expands smoothly
- [ ] "Generate bio" button visible when no bio; triggers generation
- [ ] Generate bio succeeds and replaces button with bio text
- [ ] Generate bio handles 402 (upgrade required) gracefully
- [ ] Review summary renders all 5 sub-blocks independently (test with partial data)
- [ ] Review summary absent → entire section hidden
- [ ] Sections hidden on Contacted, Replied, Proposal Sent, Converted, Lost, Archived
- [ ] No memory leaks from async bio generation after drawer closes

### Phase 4 Testing Gate
- [ ] Reply preview shows for leads with `latestReply`
- [ ] Reply preview + actions hidden for leads without replies
- [ ] "Mark handled" click: reply preview disappears immediately (optimistic)
- [ ] Pipeline card unread badge disappears within 2s after "Mark handled"
- [ ] "Mark handled" API failure: reply preview reappears + toast error shown
- [ ] "Mark read" click: unread count clears immediately (optimistic)
- [ ] "Mark read" API failure: unread count restores + toast error shown
- [ ] Composer button navigates to detail page with `?action=compose` and auto-opens composer
- [ ] No console errors during rapid mark-handled / mark-read / close / reopen sequences

### Global Regression Checks (run after every phase)
- [ ] Deal value still saves on blur (Interested+)
- [ ] Follow-up date still saves on blur (non-Converted/Lost/Archived)
- [ ] Quick options (Tomorrow/3d/1w/2w) still work
- [ ] Drawer close (X, Escape, backdrop click) still works
- [ ] Keyboard navigation (Tab, Shift+Tab) cycles through new inputs naturally
- [ ] Stage transitions (moving a lead from New → Contacted → Replied) update drawer contents without re-open

## Smoke Test Account

- smoke-2026@leadgenapp.com / Sm0keTest!2026
- UID: a5c431a2

## Key Files for Next Phase

1. `apps/web/src/components/pipeline/LeadQuickDrawer.tsx` — Add Phase 3 (AI bio, review summary) + Phase 4 (reply actions with optimistic UI, composer button)
2. `apps/web/src/components/pipeline/drawer-visibility.ts` — Already complete, verify no changes needed
3. `apps/web/src/hooks/usePipelineBoard.ts` — Already has all fields mapped
4. `apps/web/src/pages/pipeline/index.tsx` — Already derives leadId → drawerLead

## How to Start

1. Read `docs/drawer-enrichment-prd.md` to refresh Phase 3 and Phase 4 specifications.
2. Verify Phase 2 code (notes + health) is working correctly by running the Phase 2 QA gate.
3. Implement Phase 3 blocks in `LeadQuickDrawer.tsx` — add after the existing `[CONTEXT]` section (Contact block), before `[META]`.
4. Implement Phase 4 blocks in `LeadQuickDrawer.tsx` — reply actions go inline with reply preview block; composer button is its own section.
5. Run all QA gates before declaring done.
