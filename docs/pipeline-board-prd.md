# Pipeline Board PRD
## Repurposing Gray UI Ticket Board for LeadGen Pipeline

**Date:** 2026-04-23
**Source:** https://github.com/Jason-uxui/gray-ui-csm (Tickets page/board components)
**Target:** `/apps/web/src/pages/pipeline/index.tsx` (full rewrite)

---

## 1. What's Transferable from Gray UI

### 1.1 Fully Transferable (Copy-paste-adapt)

| Gray UI Component | What It Does | Transferability |
|---|---|---|
| `ticket-board.tsx` — DnD engine | `@dnd-kit/core` + `@dnd-kit/sortable` collision detection, drag preview math, placement calculation, ticket re-ordering algorithm | **100% transferable**. The drag/drop logic is pure geometry + state math. Only rename `Ticket` → `Lead`, `queueStatus` → `columnKey`. |
| `ticket-column.tsx` — Column shell | Droppable container, header with count badge, "Insert here" preview slot, hover styling | **100% transferable**. Swap Tabler icons for Lucide, adapt CSS tokens to LeadGen theme. |
| `SortableContext` + `useSortable` wiring | Per-column sortable lists, vertical list strategy, transform/transition CSS | **100% transferable**. Identical API. |
| `collisionDetectionStrategy` | Pointer-first, corner-fallback, ticket-before-column priority | **100% transferable**. Pure `@dnd-kit` configuration. |
| `applyTicketMove` / `getDragPlacement` / `getDragPreview` | Board-order recomputation, dead-zone handling, visual shift calculation | **100% transferable**. Rename variables only. |
| DragOverlay + recently-moved highlight | Ghost card during drag, 1200ms post-move highlight flash | **100% transferable**. |
| Client-ready RAF gate | `useEffect` + `requestAnimationFrame` to prevent SSR/DnD hydration mismatch | **100% transferable**. |

### 1.2 Partially Transferable (Adapt Heavily)

| Gray UI Component | What It Does | Transferability |
|---|---|---|
| `ticket-card.tsx` | Card layout: channel icon, priority, subject, assignee avatar, tags | **~40% transferable**. Keep the rounded-2xl `Card` shell, drag/click handler pattern, and recently-moved glow. Replace all inner content with LeadGen lead fields (business name, category, email, hot score, status dropdown). |
| `tickets-page.tsx` | Page shell: header, search toolbar, stats, layout switcher, bulk actions, drawer | **~25% transferable**. The layout-mode switching (board vs table) and bulk-feedback toast pattern are good reference. LeadGen doesn't need table view on the pipeline page, doesn't need drawer (we have `/leads/[id]`), and doesn't need bulk export. **Don't port this whole file.** |
| `use-tickets-page-state.ts` | Zustand-like hook managing filters, sorting, selection, query params | **~10% transferable**. The local state management pattern is useful, but LeadGen already has `usePipelineBoard` spec'd. Reference for how to split presentational vs stateful logic. |

### 1.3 Not Transferable (Build Fresh or Use Existing)

| Gray UI Pattern | Why Not Transferable | LeadGen Replacement |
|---|---|---|
| Mock data layer (`mock-data.ts`) | Hard-coded 20 tickets with fake assignees | Fetch via `api.leads.list({ limit: 500 })` |
| Ticket drawer (slide-out detail) | Gray UI has inline drawer; LeadGen has separate `/leads/[id]` page | Navigate to `/leads/${lead.id}` on card click |
| Assignee avatars | LeadGen has no "assignee" concept yet | Skip avatar section; maybe add owner badge later |
| Ticket priority indicator | Tickets have urgent/high/medium/low; leads have hot score | Use `HotScoreBadge` from existing pipeline page |
| Bulk actions (export, multi-delete, multi-assign) | Gray UI has complex bulk ops | Out of scope for MVP. Single-card moves only. |
| Sidebar filters | Gray UI has category/priority sidebar groups | Pipeline page doesn't need sidebar filters (already filtered by column) |

---

## 2. What's NOT in Gray UI That We Must Build

1. **Dual-domain field mapping** (`engagement_status` vs `pipeline_stage`) — Gray UI has a single `queueStatus` enum. LeadGen needs `PIPELINE_COLUMNS` config with per-column `field` and `value`.
2. **TanStack Query integration** — Gray UI uses local React state + mock data. LeadGen needs `useQuery` + `useMutation` with optimistic update + rollback.
3. **Query key invalidation** — `queryClient.invalidateQueries({ queryKey: ["leads"] })` to sync with leads table.
4. **Overflow indicator** — Gray UI shows all tickets in columns. LeadGen has leads with `replied`/`interested` statuses invisible to the 6-column board. Need a "X leads in other statuses" footer badge.
5. **Status dropdown on each card** — Existing LeadGen pipeline has a `<select>` per card for non-DnD moves. Preserve this inside the DnD card.
6. **API error handling + toast** — Gray UI doesn't have network calls. LeadGen needs `toast.success/error` on move.

---

## 3. Architecture Decisions (Locked)

### 3.1 Dependencies

```bash
# Already installed: framer-motion
# Must add:
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Note:** Gray UI uses `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`. Use same versions to avoid API drift.

### 3.2 Query Key Strategy

```ts
// Pipeline board query
queryKey: ["leads", { view: "pipeline" }]

// On mutation success, invalidate prefix:
queryClient.invalidateQueries({ queryKey: ["leads"] })
```

This catches both the board cache and the leads table cache. They don't share the exact entry (different filter objects), but they share invalidation. No drift.

### 3.3 PIPELINE_COLUMNS Config (Corrected)

```ts
// apps/web/src/lib/pipeline-config.ts
export const PIPELINE_COLUMNS = [
  { key: "new",           label: "New Leads",     field: "engagement_status", value: "new",           terminal: false, color: "#1d6fa8" },
  { key: "contacted",     label: "Contacted",     field: "engagement_status", value: "contacted",     terminal: false, color: "#996200" },
  { key: "qualified",     label: "Qualified",     field: "pipeline_stage",    value: "qualified",     terminal: false, color: "#6b21a8" },
  { key: "proposal_sent", label: "Proposal Sent", field: "pipeline_stage",    value: "proposal_sent", terminal: false, color: "#0f0f0e" },
  { key: "converted",     label: "Won",           field: "pipeline_stage",    value: "converted",     terminal: true,  color: "#1a7a45" },
  { key: "lost",          label: "Lost",          field: "pipeline_stage",    value: "lost",          terminal: true,  color: "#b83232" },
] as const;
```

**Critical fix:** Uses `converted` (the actual DB enum value), not `won` (the display label).

### 3.4 Board Order — Ephemeral by Design

```ts
// In usePipelineBoard hook:
const [boardOrderMap, setBoardOrderMap] = useState<Map<string, number>>(new Map());
```

**Documented trade-off:**
```ts
// boardOrderMap is intentionally ephemeral (useState, not persisted).
// Cards reorder visually within a session but reset to API order on
// navigation or refresh. Promote to Zustand + localStorage if users
// report this as a bug.
```

### 3.5 Overflow Badge (Non-Draggable Leads)

Leads with `engagement_status` of `replied`, `interested`, `not_interested`, `out_of_office` are **excluded from the 6 board columns**. Instead, show a sticky footer:

```tsx
{excludedCount > 0 && (
  <div className="...">
    <span>{excludedCount} leads in other statuses</span>
    <Link href="/leads">View in Leads table →</Link>
  </div>
)}
```

This prevents the "lead vanished after reply" data integrity bug.

---

## 4. File Structure

```
apps/web/src/
├── lib/
│   └── pipeline-config.ts          # PIPELINE_COLUMNS + types
├── hooks/
│   └── use-pipeline-board.ts       # Data fetch, move mutation, boardOrderMap
├── components/
│   └── pipeline/
│       ├── pipeline-board.tsx      # DnD context + collision (from Gray UI)
│       ├── pipeline-column.tsx     # Droppable column shell (from Gray UI)
│       ├── pipeline-card.tsx       # Lead card content (LeadGen-specific)
│       └── pipeline-page.tsx       # Page shell + overflow badge
└── pages/
    └── pipeline/
        └── index.tsx               # Re-export PipelinePage
```

---

## 5. usePipelineBoard Hook Spec

```ts
function usePipelineBoard(): {
  leads: PipelineLead[];          // Filtered to 6 columns + sorted by boardOrderMap
  isLoading: boolean;
  moveLead: (
    leadId: string,
    targetColumnKey: PipelineColumnKey,
    insertBeforeLeadId?: string | null
  ) => void;
  isMoving: boolean;              // mutation.isPending
  boardOrderMap: Map<string, number>;
  excludedCount: number;           // Leads in replied/interested/etc
}
```

**Move mutation flow:**
1. Look up `targetColumnKey` in `PIPELINE_COLUMNS` → `{ field, value }`
2. Build PATCH body with **snake_case keys**:
   ```ts
   { status: value, [field]: value, [otherField]: null }
   // e.g. { status: "qualified", pipeline_stage: "qualified", engagement_status: null }
   ```
3. `onMutate`: snapshot previous Query cache, apply optimistic reorder
4. `onError`: rollback to `context.previous`
5. `onSettled`: `queryClient.invalidateQueries({ queryKey: ["leads"] })`

**Null-clearing is mandatory** — the backend auto-clears in some paths but not all. Explicit nulls prevent orphaned dual-domain values.

---

## 6. Visual Design Adaptation

### 6.1 CSS Token Mapping (Gray UI → LeadGen)

| Gray UI Token | LeadGen Equivalent | Usage |
|---|---|---|
| `bg-muted/40` | `bg-surface-2` or `bg-surface` | Column background |
| `border-border/50` | `border-border/40` | Column border |
| `rounded-2xl` | `rounded-xl` (LeadGen uses slightly tighter radius) | Column + card radius |
| `text-muted-foreground` | `text-text-muted` | Secondary text |
| `text-foreground` | `text-text` | Primary text |
| `bg-primary/5` | `bg-primary/5` | Drag hover highlight |
| `border-primary/50` | `border-primary/50` | Column drop target border |
| `shadow-none` (Card default) | Keep `shadow-none` | LeadGen cards are flat |
| `scale-[0.98] rotate-1 opacity-35` | Keep exact transform | Dragging card ghost style |

### 6.2 Layout

Gray UI uses a responsive grid:
```css
grid-cols-2 (sm) → grid-cols-4 (xl)
```

LeadGen pipeline has 6 columns, so adapt:
```css
grid-cols-1 (mobile scroll) → grid-cols-3 (md) → grid-cols-6 (xl)
```

On mobile: horizontal scroll with `snap-x snap-mandatory` (same as Gray UI).

---

## 7. Acceptance Criteria

### 7.1 Functional

- [ ] Pipeline page renders 6 columns: New Leads, Contacted, Qualified, Proposal Sent, Won, Lost
- [ ] Each column shows a count badge with correct lead count
- [ ] Leads are sorted by `boardOrderMap` within each column (ephemeral session order)
- [ ] Dragging a card shows the ghost overlay with `scale-[0.98] rotate-1 opacity-35` style
- [ ] Dropping on a column header appends to the end of that column
- [ ] Dropping between two cards inserts at the drop position
- [ ] "Insert here" preview slot appears during drag (thin line or expanded slot)
- [ ] Column background highlights (`bg-primary/5 border-primary/50`) when a card is dragged over
- [ ] Recently-moved card gets a 1200ms highlight flash (`border-primary/35 bg-primary/5`)
- [ ] Clicking a card navigates to `/leads/${lead.id}`
- [ ] Each card has a `<select>` dropdown to change status without dragging
- [ ] Changing status via dropdown or DnD calls `api.leads.update` with snake_case PATCH
- [ ] PATCH explicitly sets the target field AND nulls the opposing field
- [ ] Move shows optimistic UI update; reverts on error with toast
- [ ] On success, both Pipeline and Leads pages refetch (shared invalidation)
- [ ] Footer badge shows count of leads in `replied`/`interested`/`not_interested`/`out_of_office` with link to `/leads`

### 7.2 Performance

- [ ] Initial render uses existing framer-motion `AnimatePresence` + `layout` for card entrance (adapt from current pipeline page)
- [ ] Drag operation maintains 60fps (no re-renders of non-target columns)
- [ ] Board handles 100+ leads per column without scroll jank
- [ ] SSR-safe: DnD only initialises after `requestAnimationFrame` gate

### 7.3 Responsive

- [ ] Desktop (xl): 6 columns in equal-width grid
- [ ] Tablet (md): 3 columns, horizontal scroll for remaining
- [ ] Mobile (<md): Single column swipe with `snap-x`, card width `88vw`

### 7.4 Data Integrity

- [ ] A lead with `engagement_status: "replied"` never appears in any board column
- [ ] After DnD to "Won", the lead's `pipeline_stage` is `"converted"` and `engagement_status` is `null` in the DB
- [ ] After DnD to "New Leads", the lead's `engagement_status` is `"new"` and `pipeline_stage` is `null` in the DB
- [ ] No lead ever has both `engagement_status` and `pipeline_stage` non-null simultaneously

---

## 8. Implementation Order

1. **Install dependencies** — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
2. **Write `pipeline-config.ts`** — `PIPELINE_COLUMNS` with `as const`
3. **Verify null-clear PATCH** — Manual curl against local Hono:
   ```bash
   curl -X PATCH http://localhost:3001/leads/:id \
     -d '{"pipeline_stage":"qualified","engagement_status":null}'
   ```
   Then query DB to confirm `engagement_status` is actually `null`.
4. **Write `usePipelineBoard`** — Query + mutation + optimistic update
5. **Port DnD components** (adapted from Gray UI):
   - `pipeline-board.tsx` (collision engine)
   - `pipeline-column.tsx` (droppable shell)
6. **Write `pipeline-card.tsx`** — Lead content + status dropdown
7. **Write `pipeline-page.tsx`** — Shell + overflow badge
8. **Wire up `pages/pipeline/index.tsx`** — Replace existing page
9. **Test cross-page sync** — Move lead in board → verify leads table shows updated status

---

## 9. Critique & Risk Areas

### 9.1 What's Sophisticated in Gray UI (Worth Keeping)

1. **Collision detection strategy** — The pointer → corner → column fallback is production-hardened. Don't simplify it.
2. **Dead-zone math** — `Math.max(6, Math.min(14, overRect.height * 0.12))` prevents jitter when hovering near card center. Keep it.
3. **Click suppression** — `suppressClickRef` + `unlockClickTimeoutRef` prevents the card click from firing after a drag release. Essential.
4. **Drag preview memoisation** — `areDragPreviewsEqual` avoids React re-renders on every pixel of mouse movement.

### 9.2 What's Over-Engineered in Gray UI (Consider Dropping)

1. **Bulk action system** — `runBulkUpdate`, `pushBulkFeedback`, `getSelectedTicketsSnapshot`, CSV export. LeadGen doesn't need any of this for MVP. The tickets page has ~400 lines of bulk code that we should not port.
2. **Drawer system** — Gray UI's `TicketDrawer` is a complex slide-out with message composer, reply-from selector, draft handling. LeadGen navigates to a separate page. Skip entirely.
3. **Table view toggle** — The pipeline page is board-only. Don't port `activeLayout` switching or `TicketTable`.
4. **Stats section** — Gray UI has expandable metrics. LeadGen already shows counts in column headers; skip the extra stats panel.

### 9.3 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `@dnd-kit` version conflict with React 19 / Next.js 14 | Medium | Pin to Gray UI's exact versions. Test hydration immediately. |
| Board order resets on navigation annoy users | Medium | Document as known limitation. Promote to Zustand if 2+ users complain. |
| Null-clear PATCH doesn't actually clear in DB | High | **Blocker:** Test with curl before writing any UI code. |
| `framer-motion` `layout` + `@dnd-kit` transform conflict | Medium | Disable framer `layout` on cards during active drag (set `layout={!isDragging}`). |
| Mobile horizontal scroll conflicts with card drag | Medium | Use `activationConstraint: { distance: 8 }` and `touch-action: none` on drag handles. |
| 500 leads × 6 columns = 3000 DOM nodes | Low | Virtualisation not needed at this scale. Monitor with React DevTools Profiler. |

---

## 10. Appendix: Quick Reference — Gray UI → LeadGen Name Mapping

| Gray UI | LeadGen |
|---|---|
| `Ticket` | `PipelineLead` |
| `queueStatus` | `columnKey` (from `PIPELINE_COLUMNS`) |
| `boardOrder` | `boardOrderMap` value |
| `ticketNumber` | Drop (not needed) |
| `subject` | `businessName` |
| `assignee` | Drop (no assignee concept) |
| `health` | `engagementStatus` (badge color) |
| `priority` | `hotScore` (HotScoreBadge) |
| `channel` | Drop (not relevant) |
| `ticketBoardColumns` | `PIPELINE_COLUMNS` |
| `getColumnDropId()` | `getColumnDropId()` (same pattern) |
| `getTicketDropId()` | `getLeadDropId()` |
| `onMoveTicket` | `moveLead` (from hook) |
| `onOpenTicket` | `router.push(`/leads/${lead.id}`) |
