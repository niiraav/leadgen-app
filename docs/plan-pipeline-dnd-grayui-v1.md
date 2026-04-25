# Pipeline Board — DnD Restore + Gray-UI Sophistication + Card Makeover

## Goal
Restore the drag-and-drop kanban board with all interactions from the old `PipelineBoard`, layer in Gray-UI-level DnD sophistication (insert-preview slots, smart collision detection, responsive layout), simplify cards to a per-column hierarchy, and keep the new page chrome (health strip, filter pills, search). The drawer remains the detail/action surface; the card stays a triage surface.

---

## Architecture

### Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/src/pages/pipeline/index.tsx` | **Rewrite** | Page shell: health strip + filters + search + `PipelineBoard` |
| `apps/web/src/components/pipeline/PipelineBoard.tsx` | **Create** | DnD shell: `DndContext`, `SortableContext` per column, `DragOverlay`, collision strategy, drag preview tracking |
| `apps/web/src/components/pipeline/PipelineColumn.tsx` | **Create** | Column droppable, header with count, empty state, preview slot injection, recently-moved shift animation |
| `apps/web/src/components/pipeline/PipelineCard.tsx` | **Create** | Sortable card wrapper + card content per hierarchy spec |
| `apps/web/src/components/pipeline/PipelineCardOverlay.tsx` | **Create** | Drag overlay clone (scaled, rotated, shadowed — Gray-UI style) |
| `apps/web/src/components/pipeline/SelectionToolbar.tsx` | **Restore** | Bulk move N selected leads to any column |
| `apps/web/src/hooks/usePipelineBoard.ts` | **Restore + extend** | Query + mutations: leads, board positions, move, bulk move, selection state |
| `apps/web/src/lib/shared/types.ts` | **Extend** | Add `replyIntent?: string` to `Lead` (derived from `latestReply?.intent`) |
| `apps/web/src/lib/api.ts` | **Keep** | `api.board.getPositions`, `api.board.reorder`, `api.pipeline.updateStatus`, `api.leads.update` already exist |
| `apps/web/src/components/pipeline/LeadQuickDrawer.tsx` | **Keep** | Already works, wire `onClick` from cards |
| `apps/web/src/components/pipeline/FollowUpModal.tsx` | **Keep** | Commitment-stage gate (Qualified/Proposal Sent) |
| `apps/web/src/components/pipeline/LossReasonModal.tsx` | **Keep** | Lost-stage gate |

---

## Phase 1: Restore DnD Shell + Page Chrome

### 1.1 `pages/pipeline/index.tsx` — Page shell

Keep from current version:
- Health summary strip (4 cards: Pipeline Value, Avg Deal, Overdue, Committed)
- Search input with URL sync
- Filter pills: All, Due Today, Overdue, This Week, Stale — with active state and URL sync
- "Add Lead" button

Remove from current version:
- All inline board rendering (the `flex gap-3` board with `<select>` dropdowns)
- `handleMoveLead` with `<select>` logic
- `handleFollowUpConfirm`, `handleLossConfirm` — these move into `usePipelineBoard`

Add:
- `<PipelineBoard />` as the board body
- Pass `filteredLeads` (after search + pill filter) into `PipelineBoard`
- Keep modals/drawer at page level (they need `onUpdate` callbacks that refresh the board query)

### 1.2 `usePipelineBoard.ts` — Hook (restore + extend)

Restore from old version:
- `useQuery` for leads list
- `useQuery` for board positions (map `lead_id -> position` per column)
- `moveMutation` — single lead drag-to-column
- `bulkMoveMutation` — multi-select toolbar move
- `selectedIds`, `selectLead`, `selectAllInColumn`, `clearSelection`
- `isMultiDrag` detection
- `recentlyMovedIds` Set for highlight

Extend with:
- **Follow-up gate**: when dropping into `qualified` or `proposal_sent`, check `lead.followUpDate`. If missing, pause the move and open `FollowUpModal`. After modal confirms, then proceed with the actual move.
- **Loss gate**: when dropping into `lost`, pause and open `LossReasonModal`. After confirm, move + save reason.
- **Expose callback props** `onOpenFollowUpModal(lead, targetColumn)` and `onOpenLossModal(lead)` so the page-level modals can be controlled from the hook.

### 1.3 `PipelineBoard.tsx` — DnD Shell

Structure:
```tsx
<DndContext
  sensors={sensors}
  collisionDetection={collisionDetectionStrategy}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
  onDragCancel={resetDragState}
>
  <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-none">
    {columns.map(column => (
      <SortableContext key={column.id} items={dropIds} strategy={verticalListSortingStrategy}>
        <PipelineColumn ...>
          {leads.map(lead => <PipelineCard key={lead.id} ... />)}
        </PipelineColumn>
      </SortableContext>
    ))}
  </div>
  <DragOverlay>{activeLead && <PipelineCardOverlay lead={activeLead} />}</DragOverlay>
</DndContext>
```

State:
- `draggingLeadId: string | null`
- `dragPreview: { columnId: string; index: number } | null`
- `recentlyMovedId: string | null`
- `suppressClickRef: boolean` — suppress card click for 0ms after drag end

Sensors:
- `PointerSensor` with `activationConstraint: { distance: 8 }` (Gray-UI style)

---

## Phase 2: Gray-UI Sophistication

### 2.1 Smart Collision Detection

Gray-UI's strategy (ported to LeadGen):
```ts
function collisionDetectionStrategy(args) {
  // 1. Pointer-within for ticket drop zones first
  const pointer = pointerWithin(args);
  const ticketPointer = pointer.filter(id => isTicketDropId(String(id)));
  if (ticketPointer.length > 0) return ticketPointer;

  // 2. Fallback to closest-corners for tickets
  const corners = closestCorners(args);
  const ticketCorners = corners.filter(id => isTicketDropId(String(id)));
  if (ticketCorners.length > 0) return ticketCorners;

  // 3. Pointer-within for column drop zones
  const colPointer = pointer.filter(id => isColumnDropId(String(id)));
  if (colPointer.length > 0) return colPointer;

  // 4. Fallback to closest-corners for columns
  return corners.filter(id => isColumnDropId(String(id)));
}
```

Drop ID scheme (Gray-UI convention):
- Tickets: `ticket:${lead.id}`
- Columns: `column:${column.id}`
- `parseDragTarget(id)` helper returns `{ type: 'column'|'ticket', ... }`

### 2.2 Drag Preview Slots

`PipelineColumn` receives `previewIndex?: number`.

When dragging and preview lands in this column:
- **Empty column**: render a full-height dashed "Drop here" slot
- **Before first card** (`index === 0`): render a compact horizontal line + "Insert here" pill
- **Between cards**: render compact line before the card at `index`
- **After last card** (`index === length`): render compact line after all cards
- **Shift animation**: cards at/after preview index get `translate-y-2` to make room

Slot visual:
```tsx
<div className="relative flex items-center justify-center overflow-hidden rounded-2xl transition-all duration-150 ease-out my-0.5 h-6">
  <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-primary/45" />
  <span className="relative rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-primary">
    Insert here
  </span>
</div>
```

### 2.3 Responsive Layout

Gray-UI uses a responsive grid that collapses to horizontal scroll on mobile:
```tsx
<div className="
  mx-auto grid w-full
  snap-x snap-mandatory
  auto-cols-[minmax(17.5rem,88vw)] grid-flow-col gap-4
  overflow-x-auto pr-1 pb-2
  sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible sm:pr-0 sm:pb-0
  xl:grid-cols-4
">
```

For LeadGen (7 columns), adapt to:
- Mobile: `auto-cols-[minmax(280px,88vw)]` horizontal scroll, snap to columns
- Tablet (`md:`): `grid-cols-3` or keep horizontal
- Desktop (`lg:`): `grid-cols-4` or `grid-cols-5`
- Wide (`xl:`): `grid-cols-7` — all columns visible

Actually, 7 columns is too many for `grid-cols-7` on most screens. Better:
- Always horizontal scroll with `flex` (not grid) for the board container
- `min-w-[280px] max-w-[320px]` per column
- `snap-x snap-start` on each column
- This matches the old board's layout which worked well

### 2.4 Recently Moved Highlight

After a successful drop:
- Set `recentlyMovedId` to the moved lead's ID
- Clear after 1200ms
- Card gets `border-primary/35 bg-primary/5 shadow-sm` when `isRecentlyMoved`

### 2.5 Click Suppression

After `onDragEnd` or `onDragCancel`:
- Set `suppressClickRef.current = true`
- Clear via `setTimeout(..., 0)` (next tick)
- Card `onClick` checks `if (suppressClickRef.current) return`

---

## Phase 3: Card Makeover (Hierarchy Spec)

### 3.1 Card Content Rules

**Always visible on every card:**
1. Business name — `text-sm font-semibold text-text truncate`
2. Stage badge — small pill showing the column's stage name (e.g., "Contacted", "Proposal Sent")

**One state signal (highest precedence wins):**
1. Reply state — if `latestReply && unreadReplyCount > 0` (any column)
2. Follow-up state — if `followUpDate` exists and no unread reply
3. Loss state — if `status === 'lost'`

**Visible when meaningful (column-dependent):**

| Column | Extra signals |
|--------|--------------|
| New / Contacted | Follow-up dot/label if set |
| Replied | Unread reply badge + intent pill + action chip |
| Interested / Qualified | Follow-up signal |
| Proposal Sent | Deal value if set + follow-up signal |
| Converted | Deal value optionally |
| Lost | Loss reason badge (muted) |
| Archived | Minimal |

**Never on the card:**
- Email address
- Category dropdown
- "View profile" CTA (whole card is clickable to drawer)
- Hot score badge
- Location (unless truly needed — skip for now)
- Any edit control

### 3.2 Card Visual Design

```tsx
<Card
  onClick={handleCardClick}
  className={cn(
    "gap-0 rounded-2xl border py-0 shadow-none ring-0 transition-[transform,opacity,box-shadow,border-color,background-color] duration-200",
    isDragging ? "scale-[0.98] rotate-1 border-primary/25 opacity-35 shadow-xl" : "",
    isRecentlyMoved ? "border-primary/35 bg-primary/5 shadow-sm" : "",
    isSelected ? "ring-2 ring-primary/30" : "",
  )}
>
  <CardContent className="p-3 space-y-2">
    {/* Row 1: Stage badge + state signal */}
    <div className="flex items-center gap-1.5">
      <StageBadge stage={column.id} />
      <StateSignal lead={lead} />
    </div>

    {/* Row 2: Business name */}
    <p className="text-sm font-semibold text-text line-clamp-2">
      {lead.business_name}
    </p>

    {/* Row 3: Context row (deal value, loss reason, etc.) */}
    <ContextRow lead={lead} columnId={column.id} />
  </CardContent>
</Card>
```

### 3.3 State Signal Component

```tsx
function StateSignal({ lead }: { lead: Lead }) {
  // 1. Unread reply — highest priority
  if (lead.unreadReplyCount && lead.unreadReplyCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        {lead.unreadReplyCount} unread
      </span>
    );
  }

  // 2. Follow-up
  if (lead.followUpDate) {
    const health = followUpHealth(lead.followUpDate);
    if (health === 'red') {
      return <span className="... bg-destructive/10 text-destructive ...">Overdue</span>;
    }
    if (health === 'amber') {
      return <span className="... bg-warning/10 text-warning ...">Due today</span>;
    }
    return <span className="... bg-success/10 text-success ...">{formatDate(lead.followUpDate)}</span>;
  }

  // 3. Loss
  if (lead.status === 'lost' && lead.lossReason) {
    return <span className="... bg-gray-100 text-gray-500 ...">{LOSS_REASON_LABELS[lead.lossReason]}</span>;
  }

  return null;
}
```

### 3.4 Context Row (column-dependent)

```tsx
function ContextRow({ lead, columnId }: { lead: Lead; columnId: string }) {
  // Proposal Sent / Converted: show deal value
  if ((columnId === 'proposal_sent' || columnId === 'converted') && lead.dealValue && lead.dealValue > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">
        <PoundSterling className="w-3 h-3" />
        {formatCompactDealValue(lead.dealValue)}
      </span>
    );
  }

  // Replied: intent pill
  if (columnId === 'replied' && lead.latestReply?.intent) {
    const intent = lead.latestReply.intent;
    const colors = { interested: 'bg-green-50 text-green-700', question: 'bg-blue-50 text-blue-700', objection: 'bg-amber-50 text-amber-700', not_now: 'bg-yellow-50 text-yellow-700', not_interested: 'bg-red-50 text-red-700' };
    return <span className={`inline-flex ... rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[intent] || 'bg-gray-50 text-gray-600'}`}>{intentLabels[intent] || intent}</span>;
  }

  return null;
}
```

---

## Phase 4: Drawer + Modal Integration

### 4.1 Card Click -> Drawer

The entire card is clickable (except the drag handle area, which captures pointer events). On click:
- If `suppressClickRef.current` is true → ignore (just finished drag)
- If lead is already selected in bulk mode → ignore (selection mode)
- Otherwise → `onOpenDrawer(lead)`

The page-level `LeadQuickDrawer` receives the lead and `onUpdate` callback.

### 4.2 Commitment Gate (FollowUpModal)

In `usePipelineBoard.moveMutation`:
```ts
const isCommitment = ['qualified', 'proposal_sent'].includes(targetColumn);
if (isCommitment && !lead.followUpDate) {
  // Don't fire mutation yet — signal page to open FollowUpModal
  onRequestFollowUp(lead, targetColumn);
  return;
}
// Otherwise proceed with normal move
```

After modal confirms:
```ts
// Save follow-up date first
await api.leads.update(lead.id, { followUpDate: date, followUpSource: 'manual' });
// Then proceed with the pending move
moveMutation.mutate({ leadId, targetColumn });
```

### 4.3 Loss Gate (LossReasonModal)

Same pattern:
```ts
if (targetColumn === 'lost') {
  onRequestLossModal(lead);
  return;
}
```

After modal confirms:
```ts
await api.leads.update(lead.id, { status: 'lost', lossReason, lossReasonNotes });
// Then move (or the update already changed status)
```

---

## Phase 5: Bulk Selection + Keyboard Nav

### 5.1 Restore from old code

- **Click+Cmd/Ctrl**: toggle individual lead selection
- **Shift+click**: range select within column
- **Column header checkbox**: select/deselect all in column
- **SelectionToolbar**: floating bar at bottom showing `N selected` + "Move to" dropdown + Clear button
- **Bulk move**: `bulkMoveMutation` iterates selected IDs, applies same gating (follow-up/loss) — for bulk, skip gating and just move (user can set follow-up in drawer later)

### 5.2 Keyboard Navigation (restore from old)

- **ArrowUp/Down**: focus previous/next card in same column
- **ArrowLeft/Right**: jump to first card of prev/next column
- **Shift+ArrowUp/Down**: move focused lead to prev/next column (with gating)
- **Enter**: open drawer for focused lead
- **Escape**: close drawer → clear selection

---

## Phase 6: Filter Pills + Search Integration

### 6.1 Filter logic (already works in current page)

Keep the `filteredLeads` useMemo from current `pages/pipeline/index.tsx`:
- Search: matches `business_name`, `email`, `category`
- Due Today: `followUpDate === today (UTC)`
- Overdue: `followUpDate < today (UTC)`
- This Week: `today <= followUpDate <= endOfWeek`
- Stale: `updated_at > 14 days ago`

Pass `filteredLeads` into `PipelineBoard` instead of raw `leads`. The board sorts them into columns.

### 6.2 Empty states per filter

When a filter is active and a column has 0 matches:
- Show "No leads match this filter" instead of "No leads in this stage"

---

## Critical Analysis & Risks

### What's good about this plan
- **Separation of concerns**: page chrome (filters/search/health) is separate from board logic — easy to test independently
- **Gray-UI collision detection** is genuinely better than the old `closestCorners` alone — reduces accidental column drops when hovering between cards
- **Preview slots** give users exact positional feedback — no guessing where the card will land
- **Card hierarchy** removes ~60% of visual noise per card, making the board scannable at a glance

### Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| `replyIntent` field doesn't exist on `latestReply` | Derive from `latestReply?.intent` if present; if not, skip intent pill (graceful degrade) |
| Board positions table may be empty for existing users | First load falls back to default sort (by updated_at or created_at); positions are only saved after first drag |
| 7 columns overflows on mobile | Horizontal scroll with snap points is the correct mobile pattern — tested in Gray-UI |
| Loss gate + bulk move = confusing UX | For bulk moves to Lost, skip the loss modal (too many dialogs). User can set loss reason in drawer later. |
| Commitment gate interrupts flow | Only triggers on first drop into commitment stage without follow-up. After follow-up is set, subsequent moves are instant. |
| DnD + click suppression race condition | Gray-UI uses `setTimeout(..., 0)` which runs before React's click event in the same microtask. Verified pattern. |

### Open questions before implementation
1. **Do we want `replyIntent` derived from `latestReply`?** The `latestReply` schema isn't fully visible — need to check if `.intent` exists. If not, we can add it or skip the intent pill.
2. **Should Converted column show deal value always or optionally?** Spec says "optionally" — I'll show it when set, hide when 0.
3. **Do we keep `unreadReplyCount` sticky banner?** The old board had a sticky banner for unread replies. The spec says reply signal is per-card. I'd suggest keeping the sticky banner + adding per-card badges — both can coexist.

### File sizes estimate
- `PipelineBoard.tsx`: ~250 lines (DnD shell + state management)
- `PipelineColumn.tsx`: ~150 lines (droppable + header + preview slots)
- `PipelineCard.tsx`: ~120 lines (sortable wrapper + card content)
- `PipelineCardOverlay.tsx`: ~40 lines (drag clone)
- `usePipelineBoard.ts`: ~400 lines (restore old + add gating)
- `pages/pipeline/index.tsx`: ~200 lines (chrome + modal wiring)

Total: ~16 files touched, ~1200 new lines. This is a large sprint — worth using parallel subagents for frontend component creation, but the hook + board integration must be done sequentially due to tight coupling.

### Recommended execution order
1. Write plan doc (this doc) ✅
2. Restore `usePipelineBoard.ts` + `PipelineBoard.tsx` shell (Phase 1)
3. Add Gray-UI collision + preview slots (Phase 2)
4. Simplify cards (Phase 3)
5. Wire drawers/modals (Phase 4)
6. Restore selection + keyboard (Phase 5)
7. Wire filters + search + test (Phase 6)
