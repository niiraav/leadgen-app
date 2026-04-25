# Pipeline Board — DnD Restore + Gray-UI Sophistication + Card Makeover (Revised)

## Goal
Restore the drag-and-drop kanban board with all interactions from the old `PipelineBoard`, layer in Gray-UI-level DnD sophistication (insert-preview slots, smart collision detection, responsive layout), simplify cards to a per-column hierarchy, and keep the new page chrome (health strip, filter pills, search). The drawer remains the detail/action surface; the card stays a triage surface.

**Key structural change:** Split into two sprints. Sprint A = the reliable board (DnD, cards, filters, mobile). Sprint B = workflow intelligence (follow-up gating, loss gating, collective modals). This removes async intersection bugs from the foundation.

---

## Architecture

### Files to create/modify

| File | Action | Sprint | Purpose |
|------|--------|--------|---------|
| `apps/web/src/pages/pipeline/index.tsx` | **Rewrite** | A | Page shell: health strip + filters + search + `visibleLeads` pipeline + board toggle |
| `apps/web/src/components/pipeline/PipelineBoardDesktop.tsx` | **Create** | A | DnD kanban: `DndContext`, `SortableContext`, `DragOverlay`, collision strategy, preview slots |
| `apps/web/src/components/pipeline/PipelineBoardMobile.tsx` | **Create** | A | Grouped list: stage headers, stacked cards, inline `<select>` status change |
| `apps/web/src/components/pipeline/PipelineColumn.tsx` | **Create** | A | Droppable column, header, empty state, preview slot injection |
| `apps/web/src/components/pipeline/PipelineCard.tsx` | **Create** | A | Sortable card wrapper + card content per hierarchy spec |
| `apps/web/src/components/pipeline/PipelineCardOverlay.tsx` | **Create** | A | Drag overlay clone (scaled, rotated, shadowed — Gray-UI style) |
| `apps/web/src/components/pipeline/SelectionToolbar.tsx` | **Restore** | A | Bulk move N selected leads to any column |
| `apps/web/src/hooks/usePipelineBoard.ts` | **Restore + slim** | A | Queries, mutations, selection, board positions. NO gating logic. |
| `apps/web/src/lib/shared/types.ts` | **Extend** | A | Add `replyIntent?: string` to `Lead` (derived from `latestReply?.intent`) |
| `apps/web/src/components/pipeline/LeadQuickDrawer.tsx` | **Keep** | A | Already works, wire `onClick` from cards |
| `apps/web/src/components/pipeline/FollowUpModal.tsx` | **Keep** | B | Commitment-stage gate (Qualified/Proposal Sent) |
| `apps/web/src/components/pipeline/LossReasonModal.tsx` | **Keep** | B | Lost-stage gate |
| `apps/web/src/hooks/usePipelineGates.ts` | **Create** | B | Thin controller: intercepts moves, decides if gate needed, exposes `pendingGate` state |
| `apps/web/src/components/pipeline/BulkFollowUpModal.tsx` | **Create** | B | Collective follow-up modal: date picker + quick chips + "Skip for now" |
| `apps/web/src/components/pipeline/BulkLossModal.tsx` | **Create** | B | Collective loss modal: reason dropdown + notes + "Skip" |

---

## Sprint A: The Reliable Board

### 1.1 Single `visibleLeads` Pipeline

In `pages/pipeline/index.tsx`, ONE `useMemo` produces `visibleLeads`:

```ts
const visibleLeads = useMemo(() => {
  let result = leads;

  // 1. Search filter
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(l =>
      (l.business_name || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.category || '').toLowerCase().includes(q)
    );
  }

  // 2. Pill filter
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

  switch (activeFilter) {
    case 'due_today':
      result = result.filter(l => {
        if (!l.followUpDate) return false;
        const d = new Date(l.followUpDate);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      });
      break;
    case 'overdue':
      result = result.filter(l => {
        if (!l.followUpDate) return false;
        const d = new Date(l.followUpDate);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime() < today.getTime();
      });
      break;
    case 'this_week':
      result = result.filter(l => {
        if (!l.followUpDate) return false;
        const d = new Date(l.followUpDate);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime() >= today.getTime() && d.getTime() <= endOfWeek.getTime();
      });
      break;
    case 'stale':
      result = result.filter(l => {
        const updated = l.updated_at ? new Date(l.updated_at) : null;
        if (!updated) return false;
        const days = Math.round((today.getTime() - updated.getTime()) / 86400000);
        return days > 14;
      });
      break;
  }

  // 3. Per-column sort: unread replies first, then by board position, then by updated_at desc
  return result.map(lead => ({ ...lead, _sortKey: computeSortKey(lead) }));
}, [leads, search, activeFilter, boardPositions]);
```

`computeSortKey(lead)`: unread replies get `-Infinity`, followed by board position (from `boardPositions` query), then `updated_at` desc. `boardPositions` is destructured from `usePipelineBoard()` in the page component and included in the `useMemo` dependency array so cards reorder immediately after a drag repositions them. This is passed into both `PipelineBoardDesktop` and `PipelineBoardMobile` identically.

### 1.2 `usePipelineBoard.ts` — Slimmed Data Hook

Responsibilities ONLY:
- `useQuery('leads', ...)` — fetch leads, map with `mapBackendLead`
- `useQuery('boardPositions', ...)` — fetch positions from `/board/positions`
- `moveMutation.mutate({ leadId, targetColumn, prevLeadId? })` — POST `/board/reorder`
- `bulkMoveMutation.mutate({ leadIds, targetColumn })` — iterates moves
- `selectedIds: Set<string>`, `selectLead()`, `selectAllInColumn()`, `clearSelection()`
- `recentlyMovedIds: Set<string>` — highlight for 1200ms after mutation success
- `refresh()` — invalidate both queries

NO gating logic. The hook blindly executes moves. If the backend rejects a move, handle the error normally.

### 1.3 Desktop Board — DnD Shell

`PipelineBoardDesktop` receives:
- `leads: Lead[]` (already filtered + sorted)
- `columns: PipelineColumn[]`
- `onMoveLead: (leadId: string, targetColumn: string, prevLeadId?: string) => void`
- `onOpenDrawer: (lead: Lead) => void`
- `onStatusChange?: (leadId: string, targetColumn: string) => void` — direct move, no gating (Sprint A)
- `selectedIds`, `onSelect`, `onSelectAll`, `onClearSelection`
- `recentlyMovedIds`

Structure:
```tsx
<DndContext
  sensors={sensors}
  collisionDetection={smartCollisionDetection}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
  onDragCancel={resetDragState}
  autoScroll={{ layoutShiftCompensation: 'always', threshold: { x: 0.2, y: 0.2 } }}
>
  <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-none snap-x">
    {columns.map(col => (
      <SortableContext key={col.id} items={dropIds} strategy={verticalListSortingStrategy}>
        <PipelineColumn ...>
          {colLeads.map(lead => <PipelineCard key={lead.id} ... />)}
        </PipelineColumn>
      </SortableContext>
    ))}
  </div>
  <DragOverlay>
    {activeLead && <PipelineCardOverlay lead={activeLead} />}
  </DragOverlay>
</DndContext>
```

#### Smart Collision Detection (Gray-UI port)

```ts
function smartCollisionDetection(args: CollisionDetectionArgs): CollisionDescriptor[] {
  // 1. Pointer-within for ticket drop zones
  const pointer = pointerWithin(args);
  const ticketPointer = pointer.filter(c => isTicketDropId(String(c.id)));
  if (ticketPointer.length > 0) return ticketPointer;

  // 2. Fallback: closestCorners for tickets
  const corners = closestCorners(args);
  const ticketCorners = corners.filter(c => isTicketDropId(String(c.id)));
  if (ticketCorners.length > 0) return ticketCorners;

  // 3. Pointer-within for column drop zones
  const colPointer = pointer.filter(c => isColumnDropId(String(c.id)));
  if (colPointer.length > 0) return colPointer;

  // 4. Fallback: closestCorners for columns
  return corners.filter(c => isColumnDropId(String(c.id)));
}
```

Drop IDs:
- Tickets: `ticket:${lead.id}`
- Columns: `column:${column.id}`

#### Drag Preview Tracking

State:
- `draggingLeadId: string | null`
- `dragPreview: { columnId: string; index: number } | null`
- `suppressClickRef: boolean`

`handleDragOver` computes preview index by comparing active rect center to over rect center, with a dead zone of `max(6, min(14, overHeight * 0.12))` pixels to prevent jitter.

Preview slot injection in `PipelineColumn`:
- Empty column + dragging: full-height dashed "Drop here" slot
- Before first card (`index === 0`): compact horizontal line + "Insert here" pill
- Between cards: compact line before card at `index`
- After last card (`index === length`): compact line after all cards
- Cards at/after preview index get `translate-y-2` to make room

#### Click Suppression

After `onDragEnd` or `onDragCancel`:
```ts
suppressClickRef.current = true;
setTimeout(() => { suppressClickRef.current = false; }, 0);
```

Do **not** pass `suppressClickRef` down to cards. Instead, wrap `onOpenDrawer` at the board level:

```ts
const handleCardClick = useCallback((lead: Lead) => {
  if (suppressClickRef.current) return;
  onOpenDrawer(lead);
}, [onOpenDrawer]);
```

`PipelineCard` receives `onClick: (lead: Lead) => void` and calls it directly. The board's `handleCardClick` checks the ref before forwarding to `onOpenDrawer`. This keeps click-suppression logic in one place and avoids prop-drilling the ref through three levels.

Card `onClick` is defined as:
```tsx
onClick={() => onClick?.(lead)}
```

No local suppression check inside `PipelineCard` — the board wrapper handles it.

#### Recently Moved Highlight

After successful drop:
```ts
setRecentlyMovedId(leadId);
setTimeout(() => setRecentlyMovedId(null), 1200);
```
Card gets `border-primary/35 bg-primary/5 shadow-sm` when `isRecentlyMoved`.

### 1.4 Mobile Board — Grouped List

`PipelineBoardMobile` receives same props as desktop (including `onStatusChange`).

On mobile (< `md` breakpoint), render grouped vertical list instead of kanban:
```tsx
<div className="space-y-6 md:hidden">
  {columns.map(col => {
    const colLeads = leads.filter(l => getLeadColumn(l) === col.id);
    return (
      <section key={col.id}>
        <header className="flex items-center gap-2 mb-2 sticky top-0 bg-background z-10 py-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
          <h3 className="text-sm font-semibold">{col.title}</h3>
          <span className="text-xs text-muted-foreground">{colLeads.length}</span>
        </header>
        <div className="space-y-2">
          {colLeads.map(lead => (
            <MobileCard key={lead.id} lead={lead} onOpen={onOpenDrawer}>
              {/* Inline status select — mobile only */}
              <select
                value={lead.status}
                onChange={e => {
                  e.stopPropagation();
                  onStatusChange(lead.id, e.target.value);
                }}
                className="mt-2 w-full h-8 px-2 text-xs rounded-md bg-surface-2 border"
              >
                {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </MobileCard>
          ))}
        </div>
      </section>
    );
  })}
</div>
```

Mobile card uses same hierarchy as desktop card but without drag handle. `onStatusChange` is passed directly from the board props — in Sprint A this calls `moveMutation.mutate({ leadId, targetColumn })` with no gating. Sprint B replaces it with `gates.requestMove()` at the page level.

### 1.5 Card Makeover

**Card content rules:**

Always visible:
1. Business name — `text-sm font-semibold text-text truncate`
2. Stage badge — tiny pill with column name

One state signal (highest precedence):
1. Reply state — if `unreadReplyCount > 0` → red pulse dot + count
2. Follow-up state — if `followUpDate` exists and no unread reply → dot/label
3. Loss state — if `status === 'lost'`

Context row (column-dependent):

| Column | Extra |
|--------|-------|
| New / Contacted | Follow-up signal if set |
| Replied | Intent pill (from `latestReply?.intent`) |
| Interested / Qualified | Follow-up signal |
| Proposal Sent | Deal value if set + follow-up signal |
| Converted | Deal value if set |
| Lost | Loss reason badge (muted) |
| Archived | Minimal |

Never on card:
- Email address, category, location, "View profile", hot score, edit controls

**Whole card is clickable** to open `LeadQuickDrawer`. Cursor changes to `cursor-pointer`. On hover, subtle right-arrow appears.

**Reply-aware sorting:** Within each column, leads with `unreadReplyCount > 0` sort to top. This is done in the `visibleLeads` pipeline, not in the card.

### 1.6 Selection + Keyboard Nav

Restore from old code:
- **Cmd/Ctrl+click**: toggle individual lead selection
- **Shift+click**: range select within column
- **Column header checkbox**: select/deselect all in column
- **SelectionToolbar**: floating bar at bottom showing `N selected` + "Move to" dropdown + Clear button
- **Bulk move**: `bulkMoveMutation` — no gating in Sprint A, just moves

Keyboard nav (desktop only):
- **ArrowUp/Down**: focus previous/next card in same column
- **ArrowLeft/Right**: jump to first card of prev/next column
- **Shift+ArrowUp/Down**: move focused lead to prev/next column (calls `onMoveLead`)
- **Enter**: open drawer for focused lead
- **Escape**: close drawer → clear selection
- **Click-outside**: clicking on any blank area of the board (non-card, non-drawer, non-toolbar) clears selection and removes focus

### 1.7 Page Shell

Keep from current version:
- Health summary strip (4 cards)
- Search input with URL sync (`?search=`, `?filter=`)
- Filter pills: All, Due Today, Overdue, This Week, Stale
- "Add Lead" button

Add:
- `useMediaQuery('(min-width: 768px)')` toggle between `PipelineBoardDesktop` and `PipelineBoardMobile`
- `LeadQuickDrawer` at page level
- Modals NOT wired in Sprint A (gates are Sprint B)

---

## Sprint B: Workflow Intelligence

### 2.1 `usePipelineGates.ts` — Thin Gate Controller

Sits between the page and `usePipelineBoard`. Receives move requests, decides if gating needed.

```ts
interface PendingGate {
  type: 'follow_up' | 'loss';
  leads: Lead[];           // 1 for single, N for bulk
  targetColumn: string;
  // For follow-up: defaultDays from column config
  // For loss: pre-populate reason if any lead already has one
}

function usePipelineGates(board: ReturnType<typeof usePipelineBoard>) {
  const [pendingGate, setPendingGate] = useState<PendingGate | null>(null);

  const requestMove = (leadIds: string[], targetColumn: string) => {
    const leads = board.leads.filter(l => leadIds.includes(l.id));

    // Follow-up gate: commitment stages without follow-up date
    if (['qualified', 'proposal_sent'].includes(targetColumn)) {
      const missing = leads.filter(l => !l.followUpDate);
      if (missing.length > 0) {
        setPendingGate({ type: 'follow_up', leads: missing, targetColumn });
        return;
      }
    }

    // Loss gate
    if (targetColumn === 'lost') {
      setPendingGate({ type: 'loss', leads, targetColumn });
      return;
    }

    // No gate needed — proceed
    if (leadIds.length === 1) {
      board.moveMutation.mutate({ leadId: leadIds[0], targetColumn });
    } else {
      board.bulkMoveMutation.mutate({ leadIds, targetColumn });
    }
  };

  const confirmGate = async (data: { followUpDate?: string; lossReason?: string; lossNotes?: string }) => {
    if (!pendingGate) return;

    // Save gate data to all leads in parallel
    try {
      await Promise.all(
        pendingGate.leads.map(async (lead) => {
          if (pendingGate.type === 'follow_up' && data.followUpDate) {
            await api.leads.update(lead.id, {
              followUpDate: data.followUpDate,
              followUpSource: 'manual',
            });
          }
          if (pendingGate.type === 'loss' && data.lossReason) {
            await api.leads.update(lead.id, {
              status: 'lost',
              lossReason: data.lossReason,
              lossReasonNotes: data.lossNotes,
            });
          }
        })
      );
    } catch (err) {
      console.error('Gate data save failed:', err);
      // Abort: do not proceed with the move if gate data could not be saved
      return;
    }

    // Now proceed with the moves
    const ids = pendingGate.leads.map(l => l.id);
    if (ids.length === 1) {
      board.moveMutation.mutate({ leadId: ids[0], targetColumn: pendingGate.targetColumn });
    } else {
      board.bulkMoveMutation.mutate({ leadIds: ids, targetColumn: pendingGate.targetColumn });
    }

    setPendingGate(null);
  };

  const skipGate = () => {
    if (!pendingGate) return;
    // Proceed without saving gate data
    const ids = pendingGate.leads.map(l => l.id);
    if (ids.length === 1) {
      board.moveMutation.mutate({ leadId: ids[0], targetColumn: pendingGate.targetColumn });
    } else {
      board.bulkMoveMutation.mutate({ leadIds: ids, targetColumn: pendingGate.targetColumn });
    }
    setPendingGate(null);
  };

  const cancelGate = () => setPendingGate(null);

  return { pendingGate, requestMove, confirmGate, skipGate, cancelGate };
}
```

### 2.2 Collective Modals

**BulkFollowUpModal:**
- Title: "Set follow-up for N leads" where N = `pendingGate.leads.length` (the subset missing a follow-up date, not the total selected count)
- Date picker
- Quick chips: Tomorrow, 3 days, 1 week
- Primary: "Apply to all"
- Secondary: "Skip for now"
- Tertiary: "Cancel" (aborts the move entirely)

> **Design note:** If 3 of 8 bulk-selected leads already have a follow-up date, `requestMove` creates `pendingGate` with only the 3 missing one. The other 5 proceed to the target column without a gate. The modal title must show "3 leads", not "8 leads".

**BulkLossModal:**
- Title: "Why are these N leads lost?"
- Reason dropdown (`LOSS_REASON_LABELS`)
- Notes textarea (optional, applies to all)
- Primary: "Mark as lost"
- Secondary: "Skip"
- Tertiary: "Cancel"

### 2.3 Page Integration

Replace direct `board.moveMutation` calls with `gates.requestMove()`.

```tsx
// In page component
const board = usePipelineBoard();
const gates = usePipelineGates(board);

// Pass gates.requestMove into PipelineBoardDesktop as onMoveLead
// Wire modals:
{gates.pendingGate?.type === 'follow_up' && (
  <BulkFollowUpModal
    leads={gates.pendingGate.leads}
    onConfirm={gates.confirmGate}
    onSkip={gates.skipGate}
    onCancel={gates.cancelGate}
  />
)}
```

---

## Build & Test Checklist

### Sprint A
- [ ] `npx tsc --noEmit` in `apps/web` passes
- [ ] Board renders 7 columns with correct counts
- [ ] Drag card between columns → card moves, API call fires, position saved
- [ ] Preview slot appears between cards during drag
- [ ] Drag overlay shows scaled/rotated card clone
- [ ] Recently moved card gets highlight for 1.2s
- [ ] Click card → drawer opens
- [ ] Drag card → no accidental click fires
- [ ] Search filters cards in real-time
- [ ] Filter pills filter correctly (Due Today, Overdue, This Week, Stale)
- [ ] Mobile (< md) shows grouped list with inline status select
- [ ] Desktop (>= md) shows kanban with drag
- [ ] Cmd+click selects multiple cards
- [ ] Selection toolbar appears, bulk move works
- [ ] Keyboard nav: arrows focus, shift+arrows move, enter opens drawer
- [ ] Health strip shows correct numbers
- [ ] Smoke test: build, login, drag, search, filter, mobile toggle

#### Sprint A Acceptance Criteria

1. **Board renders correctly**: All 7 pipeline columns (New, Contacted, Replied, Interested, Qualified, Proposal Sent, Converted, Lost, Archived) display with correct lead counts in headers.
2. **Single `visibleLeads` pipeline**: Search, filter pills, and per-column sorting all consume the same `useMemo` result. No drift between desktop board, mobile list, health strip, or toolbar.
3. **Drag-and-drop works end-to-end**: Dragging a card from one column to another visually moves it, fires a `POST /board/reorder` API call, persists the new position in Supabase, and other clients see the change on refresh.
4. **Preview slots visible**: During drag, a compact horizontal line with "Insert here" pill appears between cards. Empty columns show a full-height dashed "Drop here" slot.
5. **Drag overlay styled**: The dragged card clone scales to 1.05, rotates -2deg, casts a `shadow-xl`, and has `opacity-90` — distinct from the original.
6. **Click suppression reliable**: After any drag operation (complete or cancel), clicking the card that was just dragged does NOT open the drawer. The `suppressClickRef` + `setTimeout(..., 0)` pattern prevents 100% of accidental post-drag clicks.
7. **Recently moved highlight**: For 1200ms after a successful drop, the moved card gets `border-primary/35 bg-primary/5 shadow-sm`.
8. **Auto-scroll during drag**: Dragging a card toward the right edge of the board triggers horizontal scroll. Dragging toward the bottom of a tall column triggers vertical scroll. `layoutShiftCompensation: 'always'` prevents layout jumps.
9. **Selection system restored**: Cmd+click toggles individual cards. Shift+click range-selects within a column. Column header checkbox selects/deselects all. Selection toolbar appears when `selectedIds.size > 0` with "Move to" dropdown + Clear button.
10. **Bulk move executes**: Selecting 3 cards and choosing "Move to → Qualified" from the toolbar moves all 3. Each fires its own `POST /board/reorder`. No gating in Sprint A.
11. **Click-outside clears selection**: Clicking any blank area of the board (non-card, non-drawer, non-toolbar) clears `selectedIds` and removes keyboard focus.
12. **Keyboard navigation functional**: ArrowUp/Down focuses prev/next card in same column. ArrowLeft/Right jumps to first card of adjacent column. Shift+ArrowUp/Down moves focused lead to prev/next column. Enter opens drawer. Escape closes drawer then clears selection.
13. **Mobile list renders**: Below `md` breakpoint, the kanban hides and a grouped vertical list appears. Each section has a sticky header with stage name + count. Inline `<select>` changes status directly.
14. **Card hierarchy correct**: Business name + stage badge always visible. One state signal (reply > follow-up > loss). Context row is column-dependent (intent in Replied, deal value in Proposal Sent/Converted). No email, category, location, or "View profile" on the card.
15. **Health strip accurate**: The 4 summary cards (Total Leads, Unread Replies, Due Today, Overdue) show counts that match the `visibleLeads` pipeline.
16. **Search + URL sync**: Typing in the search box filters cards in real-time. The URL updates to `?search=term`. Reloading the page restores the search term and filtered results.
17. **Filter pills work**: Clicking "Due Today" filters to leads whose `followUpDate` (set to UTC midnight) equals today's UTC midnight. "Overdue" = `< today`. "This Week" = `today` through end of current week (Sunday). "Stale" = `updated_at` > 14 days ago.
18. **Drawer wired**: Clicking any card opens `LeadQuickDrawer` with that lead's data.
19. **TypeScript clean**: `npx tsc --noEmit` in `apps/web` produces zero errors.
20. **No console errors**: Opening the pipeline page, dragging cards, selecting, filtering, and opening the drawer produces zero uncaught exceptions or React warnings.

#### Sprint A Smoke Test Procedure

**Precondition**: Logged in as smoke user. At least 10 leads exist across multiple stages.

1. **Load the page**: Navigate to `/pipeline`. Verify 7 columns render with correct counts. Health strip shows 4 cards.
2. **Search test**: Type "cafe" in search. Verify only leads matching "cafe" in name/email/category remain visible. URL shows `?search=cafe`. Clear search — all leads return.
3. **Filter test**: Click "Due Today" pill. Verify only leads with `followUpDate === today` show. Click "All" — all return. Repeat for Overdue, This Week, Stale.
4. **Drag test**: Drag a card from "New" to "Contacted". Verify card visually moves, API call fires in Network tab (200 OK), card gets highlight for 1.2s. Refresh page — card stays in "Contacted".
5. **Preview slot test**: During drag, hover between two cards in target column. Verify compact horizontal line appears. Drop card there — it lands between those two cards.
6. **Click suppression test**: Immediately after dropping a card, click it. Verify drawer does NOT open. Wait 500ms, click again — drawer opens.
7. **Drawer test**: Click any card. Verify `LeadQuickDrawer` slides in with correct lead data. Close with Escape or overlay click.
8. **Selection test**: Cmd+click 2 cards in different columns. Verify both show selected state. Shift+click a third in same column as second — range selects. Toolbar appears at bottom. Click "Move to → Interested". Verify all 3 move.
9. **Click-outside test**: With 2 cards selected, click blank board area. Verify selection clears, toolbar disappears.
10. **Keyboard test**: Click a card to focus it. Press ArrowDown — focus moves to next card. Press Shift+ArrowRight — lead moves to next column. Press Enter — drawer opens. Press Escape — drawer closes, selection clears.
11. **Mobile test**: Resize viewport to 375px wide. Verify kanban hides, grouped list appears. Verify inline `<select>` on a card changes its stage. Resize back to desktop — kanban returns.
12. **Console check**: Open DevTools console. Verify zero errors, zero warnings across all above steps.

### Sprint B
- [ ] Drag to Qualified without follow-up → modal opens
- [ ] Apply follow-up → move completes
- [ ] Skip follow-up → move completes without date
- [ ] Cancel → move aborted
- [ ] Drag single to Lost → loss modal opens
- [ ] Bulk select 3 leads → move to Proposal Sent → collective follow-up modal
- [ ] Apply date to all → all move
- [ ] Skip → all move without date
- [ ] Activity logged for gate events
- [ ] `npx tsc --noEmit` passes
- [ ] Smoke test

#### Sprint B Acceptance Criteria

1. **Follow-up gate triggers**: Dragging or bulk-moving any lead to "Qualified" or "Proposal Sent" when `followUpDate` is missing opens `BulkFollowUpModal`.
2. **Loss gate triggers**: Dragging or bulk-moving any lead to "Lost" opens `BulkLossModal`.
3. **Gate modal shows correct subset count**: If 3 of 8 selected leads already have a follow-up date, only the 3 missing dates trigger the gate. Modal title reads "Set follow-up for 3 leads", not "8 leads". The other 5 proceed to the target column without interruption.
4. **Apply follow-up**: Choosing a date in `BulkFollowUpModal` and clicking "Apply to all" saves `followUpDate` + `followUpSource: 'manual'` to all gated leads via parallel API calls, then proceeds with the move.
5. **Skip follow-up**: Clicking "Skip for now" proceeds with the move WITHOUT saving any follow-up data.
6. **Cancel aborts move**: Clicking "Cancel" closes the modal and the move NEVER fires. Lead stays in original column.
7. **Loss modal functional**: `BulkLossModal` shows reason dropdown (`LOSS_REASON_LABELS`), optional notes textarea. "Mark as lost" saves `lossReason` + `lossReasonNotes` + sets `status: 'lost'` to all gated leads in parallel, then moves them. "Skip" moves without saving. "Cancel" aborts.
8. **Parallel updates, atomic abort**: `confirmGate` uses `Promise.all()` for lead updates. If ANY update fails, the entire operation aborts — no partial state changes, no move fires.
9. **No gate for leads with existing data**: Leads already possessing `followUpDate` bypass the follow-up gate entirely. Leads already with `lossReason` still trigger the loss gate (re-entry allowed).
10. **Activity logging**: Every gate interaction (apply, skip, cancel) logs an activity entry visible in the lead's activity feed.
11. **Keyboard nav respects gates**: Shift+Arrow moving a lead into a gated column triggers the modal. After modal action, keyboard focus returns to the board.
12. **Mobile gates work**: Changing status via inline `<select>` to a gated stage triggers the modal on mobile too.
13. **TypeScript clean**: `npx tsc --noEmit` in `apps/web` produces zero errors.
14. **No console errors**: All gate flows execute without uncaught exceptions.

#### Sprint B Smoke Test Procedure

**Precondition**: Logged in as smoke user. At least 3 leads exist in "New" or "Contacted" with NO `followUpDate` set.

1. **Single follow-up gate**: Drag a lead with no `followUpDate` from "New" to "Qualified". Verify `BulkFollowUpModal` opens with title "Set follow-up for 1 lead".
   - Click "Apply to all", pick tomorrow's date. Verify modal closes, lead moves to "Qualified", card shows follow-up signal.
   - Verify Network tab shows `POST /leads/update` (follow-up save) then `POST /board/reorder` (move).
2. **Skip follow-up**: Drag another no-follow-up lead to "Proposal Sent". In modal, click "Skip for now". Verify lead moves immediately, no follow-up date set.
3. **Cancel follow-up**: Drag a third no-follow-up lead to "Qualified". In modal, click "Cancel". Verify lead stays in original column, no API calls fire.
4. **Existing follow-up bypass**: Drag a lead that ALREADY has `followUpDate` to "Qualified". Verify modal does NOT open — lead moves immediately.
5. **Single loss gate**: Drag any lead to "Lost". Verify `BulkLossModal` opens. Select "Pricing too high" from dropdown, add note "Competitor beat us". Click "Mark as lost". Verify lead moves to "Lost", card shows loss reason badge.
6. **Skip loss**: Drag another lead to "Lost". Click "Skip". Verify lead moves without loss reason.
7. **Cancel loss**: Drag a third lead to "Lost". Click "Cancel". Verify lead stays in original column.
8. **Bulk follow-up gate**: Select 3 leads (2 without follow-up, 1 with). Use toolbar "Move to → Proposal Sent". Verify `BulkFollowUpModal` opens with title "Set follow-up for 2 leads". The lead with existing follow-up moves immediately (visible in "Proposal Sent"). Apply date to the 2 gated leads — they join the third in "Proposal Sent".
9. **Bulk loss gate**: Select 2 leads. "Move to → Lost". Verify `BulkLossModal` opens with "Why are these 2 leads lost?". Apply reason + notes. Both move.
10. **Parallel failure test**: Temporarily block `/leads/update` in DevTools (block request URL). Try to apply follow-up to 2 leads. Verify modal stays open or shows error, NO moves fire, NO partial updates occur.
11. **Activity log check**: Open a lead's detail page that went through a gate. Verify activity feed shows "Follow-up date set via pipeline gate" or "Marked as lost: [reason]".
12. **Console check**: Open DevTools console. Verify zero errors, zero warnings across all gate flows.
13. **Mobile gate test**: Resize to mobile. Use inline `<select>` to change a no-follow-up lead to "Qualified". Verify modal opens and functions correctly.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `replyIntent` doesn't exist on `latestReply` | Medium | Low | Skip intent pill, card still works |
| Board positions table empty for new users | High | Low | Fallback sort by `updated_at` desc until first drag |
| Mobile inline select triggers card click | Medium | Medium | `e.stopPropagation()` on select `onChange` |
| DnD + click suppression race | Low | Medium | Gray-UI `setTimeout(..., 0)` pattern, tested |
| Filter drift between consumers | Low (with single pipeline) | High | Single `visibleLeads` memo enforced |
| Bulk gate modal feels heavy for single lead | Medium | Low | Single lead uses same modal but title says "1 lead" |
| Keyboard nav breaks with dynamic columns | Low | Low | Column order from `PIPELINE_COLUMNS` constant |
