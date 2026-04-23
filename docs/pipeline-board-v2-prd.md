# Pipeline Board v2 PRD
## Persistent Ordering, Bulk Operations & Polish

**Date:** 2026-04-23
**Depends on:** `pipeline-board-prd.md` (v1 — fully implemented)
**Status:** Planning / Not yet scheduled

---

## 1. Problem Statement

### 1.1 Current Pain Points (v1)

| Pain Point | Severity | User Impact |
|---|---|---|
| **Column reorder resets on refresh** | 🔴 Critical | User carefully arranges 30 "Qualified" leads by priority. Refreshes. Arrangement is gone. Trust in the board evaporates. |
| **No bulk operations** | 🟡 High | Moving 15 "Contacted" leads to "Qualified" requires 15 individual drags or 15 dropdown changes. |
| **No keyboard accessibility** | 🟡 High | Keyboard-only users cannot reorder or move leads. WCAG 2.1 violation. |
| **No vertical auto-scroll within tall columns** | 🟡 Medium | Dragging a lead from bottom of 40-item "New Leads" column to top requires manual scrolling while holding the drag. |
| **No inline quick actions** | 🟢 Low | Every action (view notes, send email, view profile) requires navigating away from the board. |
| **Recently-moved highlight not implemented** | 🟢 Low | v1 PRD spec'd a 1200ms post-move highlight flash. Never wired up. |

### 1.2 The Core Architectural Gap

v1 uses ephemeral `useState` for board ordering:

```ts
const [columnOrder, setColumnOrder] = useState<Record<string, string[]>>({});
```

This state lives in `usePipelineBoard` hook memory. It survives React re-renders but dies on:
- Page refresh
- Browser back/forward
- Component unmount ( navigating to `/leads/[id]` and back)
- New tab open

**User expectation:** "I put my hottest leads at the top of Qualified. They should still be there tomorrow."

---

## 2. v2 Feature Scope

### 2.1 P0 — Must Have

| Feature | Description | Complexity |
|---|---|---|
| **Persistent board order** | Column card order survives refresh, navigation, new tabs. Per-user, per-column. | Medium |
| **Bulk multi-select + drag** | Cmd/Ctrl-click to select multiple cards. Drag selection as a group to a new column. | High |

### 2.2 P1 — Should Have

| Feature | Description | Complexity |
|---|---|---|
| **Keyboard reorder** | Tab to focus a card, arrow keys to move within column, Shift+arrow to move between columns. | Medium |
| **Vertical auto-scroll during drag** | When dragging near top/bottom of a tall column, the column auto-scrolls to reveal more cards. | Low |
| **Recently-moved highlight flash** | 1200ms border + background highlight on a card immediately after it's dropped in a new column. | Low |

### 2.3 P2 — Nice to Have

| Feature | Description | Complexity |
|---|---|---|
| **Inline quick-preview drawer** | Click a card (not drag) to slide out a drawer with lead details, notes, email history — without leaving the board. | Medium |
| **Column-level bulk actions** | "Mark all in column as..." dropdown in column header. | Low |
| **Board search/filter** | Type to filter cards across all columns by business name, email, or category. | Low |
| **Lead priority/pinning** | Pin leads to top of column (separate from sort order). Stored as `is_pinned` boolean. | Low |

---

## 3. Persistent Board Order — Deep Design

### 3.1 The Data Model Problem

A lead moves between columns. Its position in column A is irrelevant once it's in column B. We need **per-column, per-lead ordering** that cleans up old positions automatically.

### 3.2 Option Analysis

| Approach | Migration Required | Query Complexity | Cleanup on Move | Cross-Device Sync | Recommendation |
|---|---|---|---|---|---|
| A. `metadata` JSONB field | ❌ None | Medium (JSONB index) | Manual (client must delete old key) | ✅ Yes | **Phase 1 fallback** |
| B. New `lead_board_positions` table | ✅ Yes | Low (standard index) | Automatic (ON DELETE CASCADE + trigger) | ✅ Yes | **Recommended** |
| C. `board_order` column on `leads` | ✅ Yes | Low | Impossible (single integer, no column scope) | ✅ Yes | ❌ Rejected |

### 3.3 Recommended: `lead_board_positions` Table

```sql
-- Migration: 026_board_positions.sql (SQLite)
CREATE TABLE IF NOT EXISTS lead_board_positions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,             -- Supabase auth UID stored as plain string (no FK, cross-DB)
  column_id TEXT NOT NULL,           -- maps to PIPELINE_COLUMNS[].id
  position REAL NOT NULL DEFAULT 0,  -- float positions for gap-based insert
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(lead_id, user_id, column_id)
);

CREATE INDEX idx_board_positions_user_column 
  ON lead_board_positions(user_id, column_id, position);
```

**Why this table is better than JSONB `metadata`:**

1. **Queryable ordering:** `SELECT lead_id FROM lead_board_positions WHERE user_id = $1 AND column_id = 'qualified' ORDER BY position`
2. **Automatic cleanup:** `ON DELETE CASCADE` on both `lead_id` and `user_id`
3. **Multi-user safe:** Each user has their own board order for shared leads (if multi-tenancy expands)
4. **No JSONB mutation complexity:** Supabase `.update({ metadata: { ...metadata, board_order: {...} } })` is race-condition-prone

**Trade-off:** One extra join per `leads.list()` query. With a proper index and 500-lead limit, this is negligible.
### 3.4 Position Rebalancing Strategy

Float positions fragment over time as leads are inserted between neighbours.

**SQLite schema uses:** `position REAL NOT NULL DEFAULT 0`

- Insert between position 4 and 5 → assign `4.5`
- No rebalancing needed until gaps get smaller than 0.001
- **Rebalance trigger:** synchronous, in the same transaction, when gap < 0.001

**Why not a scheduled job?** At single-tenant SaaS scale with SQLite, async rebalancing introduces a window where the DB has fragmented positions. Synchronous rebalance-on-breach keeps the data model simple and consistent.

**Synchronous rebalance implementation (corrected):**

The client sends `prev_lead_id` and `next_lead_id` — the lead IDs directly above and below the drop target — rather than a pre-computed `new_position`. The server looks up their current positions, checks the gap, and if rebalance is needed, splices the moved lead into the correct array index before rebalancing the full column.

```ts
// After fetching all rows in the target column, ordered by position:
const allInColumn = db
  .select()
  .from(leadBoardPositions)
  .where(and(eq(leadBoardPositions.userId, userId), eq(leadBoardPositions.columnId, column_id)))
  .orderBy(asc(leadBoardPositions.position))
  .all();

// Splice the moved lead from its old position into the new position
const movedIdx = allInColumn.findIndex((r) => r.leadId === lead_id);
const movedRow = allInColumn.splice(movedIdx, 1)[0];
const targetIdx = allInColumn.findIndex((r) => r.leadId === prev_lead_id) + 1; // Insert after prev
allInColumn.splice(targetIdx, 0, movedRow);

// Check gap at the target index
const prevPos = allInColumn[targetIdx - 1]?.position ?? -1000;
const nextPos = allInColumn[targetIdx + 1]?.position ?? (allInColumn.length + 1) * 1000;
const gap = nextPos - prevPos;

if (gap < 0.001) {
  // Rebalance: rewrite all positions as 0, 1000, 2000...
  allInColumn.forEach((row, i) => {
    db.update(leadBoardPositions)
      .set({ position: i * 1000 })
      .where(eq(leadBoardPositions.id, row.id))
      .run();
  });
  // Post-rebalance, the moved lead sits exactly at targetIdx * 1000
  finalPosition = targetIdx * 1000;
} else {
  // No rebalance needed — midpoint is safe
  finalPosition = (prevPos + nextPos) / 2;
}
```

### 3.5 Backend API Changes

Board routes use Drizzle + better-sqlite3 (same as leads data), not SupabaseAdmin.

```ts
// apps/api/src/routes/board.ts (new file)
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import { leadBoardPositions } from "@/db/schema";
import { eq, and, asc, ne } from "drizzle-orm";

const boardRouter = new Hono();

// GET /board/positions?column_ids=new,contacted,qualified,proposal_sent,converted,lost
// Returns: { [columnId]: { lead_id: string, position: number }[] }
boardRouter.get("/positions", async (c) => {
  const userId = c.get("jwtPayload").sub;
  const { column_ids } = c.req.query();
  const ids = column_ids.split(",");

  const rows = db
    .select()
    .from(leadBoardPositions)
    .where(
      and(
        eq(leadBoardPositions.userId, userId),
        inArray(leadBoardPositions.columnId, ids)
      )
    )
    .orderBy(asc(leadBoardPositions.position))
    .all();

  const map: Record<string, { lead_id: string; position: number }[]> = {};
  for (const row of rows) {
    (map[row.columnId] ||= []).push({
      lead_id: row.leadId,
      position: row.position,
    });
  }
  return c.json(map);
});

// POST /board/reorder — minimal write, one row
// Body: { lead_id: string, column_id: string, prev_lead_id: string|null, next_lead_id: string|null }
// Client sends neighbour IDs (the leads directly above and below the drop target).
// Server looks up their current positions, splices the moved lead into the correct
// array index, checks the gap, and if < 0.001 rebalances synchronously.
const reorderSchema = z.object({
  lead_id: z.string(),
  column_id: z.enum(["new", "contacted", "qualified", "proposal_sent", "converted", "lost"]),
  prev_lead_id: z.string().nullable(),   // null = insert at top
  next_lead_id: z.string().nullable(),   // null = insert at bottom
});

boardRouter.post("/reorder", zValidator("json", reorderSchema), async (c) => {
  const userId = c.get("jwtPayload").sub;
  const { lead_id, column_id, prev_lead_id, next_lead_id } = c.req.valid("json");

  // Fetch all positions in this column, ordered
  const columnRows = db
    .select()
    .from(leadBoardPositions)
    .where(
      and(
        eq(leadBoardPositions.userId, userId),
        eq(leadBoardPositions.columnId, column_id)
      )
    )
    .orderBy(asc(leadBoardPositions.position))
    .all();

  // Splice the moved lead from its old position into the new position
  const movedIdx = columnRows.findIndex((r) => r.leadId === lead_id);

  // Cross-column move: lead doesn't exist in target column yet, nothing to splice out
  const movedRow = movedIdx !== -1
    ? columnRows.splice(movedIdx, 1)[0]
    : { leadId: lead_id, userId, columnId: column_id, position: 0, id: "" }; // placeholder

  // Compute target index: after prev_lead_id, or at top if null
  const targetIdx = prev_lead_id
    ? columnRows.findIndex((r) => r.leadId === prev_lead_id) + 1
    : 0;
  columnRows.splice(targetIdx, 0, movedRow);

  // Check gap at the target index
  const prevPos = columnRows[targetIdx - 1]?.position ?? -1000;
  const nextPos = columnRows[targetIdx + 1]?.position ?? (columnRows.length + 1) * 1000;
  const gap = nextPos - prevPos;

  let finalPosition: number;

  if (gap < 0.001) {
    // Rebalance: rewrite all positions as 0, 1000, 2000...
    columnRows.forEach((row, i) => {
      db.update(leadBoardPositions)
        .set({ position: i * 1000 })
        .where(eq(leadBoardPositions.id, row.id))
        .run();
    });
    finalPosition = targetIdx * 1000;
  } else {
    finalPosition = (prevPos + nextPos) / 2;
  }

  // Upsert the moved lead's position (its column may also have changed)
  db.insert(leadBoardPositions)
    .values({
      leadId: lead_id,
      userId,
      columnId: column_id,
      position: finalPosition,
    })
    .onConflictDoUpdate({
      target: [leadBoardPositions.leadId, leadBoardPositions.userId, leadBoardPositions.columnId],
      set: { position: finalPosition },
    })
    .run();

  return c.json({ success: true, position: finalPosition });
});

// DELETE old board_positions when lead moves to new column via PATCH /leads/:id
```

**Integration with existing PATCH /leads/:id:**

In `apps/api/src/routes/leads.ts`, after a successful status update:

```ts
// Delete stale board positions for this lead (all rows where column_id ≠ new)
db.delete(leadBoardPositions)
  .where(
    and(
      eq(leadBoardPositions.leadId, id),
      ne(leadBoardPositions.columnId, targetColumnId)
    )
  )
  .run();
```

### 3.6 Frontend Changes

**Two-query loading state matrix:**

```ts
// hooks/usePipelineBoard.ts — v2 additions

// 1. Fetch leads (existing)
const { data: leads, isLoading: leadsLoading } = useQuery({
  queryKey: ["leads"],
  queryFn: api.leads.list,
  staleTime: 30_000,
});

// 2. Fetch board positions (separate, non-blocking)
const { data: positions, isError: positionsError } = useQuery({
  queryKey: ["board", "positions"],
  queryFn: () => api.board.getPositions(PIPELINE_COLUMNS.map(c => c.id)),
  staleTime: 60_000,
  retry: 1,              // Don't hammer the server if positions fail
});

// 3. Sort: positions available → board order; unavailable → hot_score fallback
const sortedLeads = sortLeadsByBoardOrder(
  leads ?? [],
  positionsError ? {} : (positions ?? {})
);
```

**Graceful degradation:** If the positions endpoint returns 500, the board still loads normally with leads sorted by `hot_score DESC`. No blank board, no user-visible error. Positions failure is silent — the user just sees the default sort.

**Minimal-write reorder mutation:**

```ts
const reorderMutation = useMutation({
  mutationFn: ({ leadId, columnId, prevLeadId, nextLeadId }: {
    leadId: string; columnId: string; prevLeadId: string | null; nextLeadId: string | null;
  }) => api.board.reorder(leadId, columnId, prevLeadId, nextLeadId),
  
  onMutate: async ({ leadId, columnId, prevLeadId }) => {
    await queryClient.cancelQueries({ queryKey: ["board", "positions"] });
    const previous = queryClient.getQueryData(["board", "positions"]);
    
    // Optimistic: splice the lead into its new position in the positions array
    queryClient.setQueryData(["board", "positions"], (old: any) => {
      const col = old?.[columnId] ?? [];
      const moved = col.find((p: any) => p.lead_id === leadId);
      if (!moved) return old;
      const rest = col.filter((p: any) => p.lead_id !== leadId);
      const targetIdx = prevLeadId
        ? rest.findIndex((p: any) => p.lead_id === prevLeadId) + 1
        : 0;
      rest.splice(targetIdx, 0, moved);
      return { ...old, [columnId]: rest };
    });
    
    return { previous };
  },
  
  onError: (_err, _vars, context) => {
    if (context?.previous) {
      queryClient.setQueryData(["board", "positions"], context.previous);
    }
  },
});
```

**Sort helper with fallback:**

```ts
function sortLeadsByBoardOrder(
  leads: PipelineLead[],
  positions: Record<string, { lead_id: string; position: number }[]>
): PipelineLead[] {
  const positionMap = new Map<string, number>();
  for (const [colId, rows] of Object.entries(positions)) {
    rows.forEach((row) => positionMap.set(`${colId}:${row.lead_id}`, row.position));
  }
  
  return [...leads].sort((a, b) => {
    const colA = getLeadColumn(a);
    const colB = getLeadColumn(b);
    const posA = positionMap.get(`${colA}:${a.id}`) ?? Infinity;
    const posB = positionMap.get(`${colB}:${b.id}`) ?? Infinity;
    // If neither has a position, fall back to hot_score desc
    if (posA === Infinity && posB === Infinity) return b.hotScore - a.hotScore;
    return posA - posB;
  });
}
```

**Key design decisions:**
- Board positions are a **separate query** from leads data. Two caches invalidate independently.
- Positions failure must **never block** the board. Fallback to `hot_score` sort is automatic.
- Reorder sends **one row** (lead_id + new_position), not the full column array. Optimistic update is trivially cheap.

---

## 4. Bulk Multi-Select + Drag

### 4.1 UX Pattern

1. **Enter selection mode:** Click a "Select" button in page header (or Cmd/Ctrl+click any card)
2. **Select cards:** Cmd/Ctrl+click to toggle selection. Selected cards get a `ring-2 ring-primary` border.
3. **Drag selection:** Grab any selected card — all selected cards lift as a group.
4. **Drop:** Drop on a column header. All selected cards move to that column.
5. **Feedback:** Toast shows "Moved 12 leads to Qualified"

### 4.2 State Management

```ts
const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
const [isSelectionMode, setIsSelectionMode] = useState(false);

const toggleSelection = (leadId: string) => {
  setSelectedLeadIds(prev => {
    const next = new Set(prev);
    if (next.has(leadId)) next.delete(leadId);
    else next.add(leadId);
    return next;
  });
};
```

### 4.3 DnD Adaptation

- When `selectedLeadIds.size > 1`, the drag overlay shows a **stack of cards** (not just one):
  ```tsx
  <DragOverlay>
    <div className="relative">
      {selectedLeads.map((lead, i) => (
        <div key={lead.id} style={{ transform: `translateY(${i * 4}px)` }}>
          <PipelineCard lead={lead} ... />
        </div>
      ))}
      <div className="absolute -top-2 -right-2 bg-primary text-white rounded-full px-2 py-0.5 text-xs font-bold">
        {selectedLeadIds.size}
      </div>
    </div>
  </DragOverlay>
  ```

- On drop: call `api.leads.batchUpdate(selectedIds, { status, [field]: value, [opposingField]: null })`

### 4.4 Backend: Batch Update Endpoint

Extend existing `PATCH /leads/batch` or create `POST /leads/bulk-move`:

```ts
const bulkMoveSchema = z.object({
  lead_ids: z.array(z.string()).max(100),
  status: z.string(),
  field: z.enum(["engagement_status", "pipeline_stage"]),
  value: z.string(),
});

// Build the update object dynamically — Drizzle doesn't accept [field] variable keys
const updateData =
  field === "pipeline_stage"
    ? { status: value, pipelineStage: value, engagementStatus: null }
    : { status: value, engagementStatus: value, pipelineStage: null };

// UPDATE all leads in a single SQLite query
import { inArray } from "drizzle-orm";

db.update(leads)
  .set({ ...updateData, updatedAt: new Date().toISOString() })
  .where(and(inArray(leads.id, lead_ids), eq(leads.userId, userId)))
  .run();

// DELETE stale board positions for all moved leads (old columns ≠ new)
db.delete(leadBoardPositions)
  .where(
    and(
      inArray(leadBoardPositions.leadId, lead_ids),
      ne(leadBoardPositions.columnId, column_id)
    )
  )
  .run();
```

**Races to handle:** If a lead in the selection was moved by another tab between selection and drag, the batch update still applies. Acceptable — last writer wins.

---

## 5. Keyboard Accessibility

### 5.1 Keyboard Navigation Map

| Key | Action |
|---|---|
| `Tab` | Focus next card in current column |
| `Shift+Tab` | Focus previous card in current column |
| `↑` / `↓` | Move focused card up/down within current column (reorder) |
| `Shift+↑` / `Shift+↓` | Move focused card to previous/next column |
| `Space` | Select/deselect card (when in selection mode) |
| `Enter` | Open lead detail (or quick-preview drawer in v2) |
| `Escape` | Clear selection, exit selection mode |

### 5.2 Implementation

Use `@dnd-kit`'s `KeyboardSensor` with a custom `coordinateGetter`:

```ts
const keyboardSensor = useSensor(KeyboardSensor, {
  coordinateGetter: (id, { context }) => {
    const { active, over } = context || {};
    // Calculate target position based on arrow key + Shift modifier
    // Return { x, y } for the DnD engine
  },
});
```

**Challenge:** `@dnd-kit/core@6.3.1`'s `KeyboardSensor` coordinate getter API changed between v6 and v7. We pinned v6.3.1 specifically to avoid React 19 issues. The coordinate getter in v6 takes `(event, { active, context })` not `(id)`. 

**Recommendation:** Skip `KeyboardSensor` for column moves. Instead, implement keyboard reorder as **imperative mutations** (direct API calls with toast feedback) without DnD involvement. Simpler, more reliable, and doesn't fight the pinned DnD version.

```ts
// Keyboard handler on PipelineBoard
const handleKeyDown = (e: KeyboardEvent) => {
  if (!focusedLeadId) return;
  if (e.key === "ArrowUp" && e.shiftKey) {
    e.preventDefault();
    moveToPreviousColumn(focusedLeadId);
  }
  if (e.key === "ArrowDown" && e.shiftKey) {
    e.preventDefault();
    moveToNextColumn(focusedLeadId);
  }
  // ... etc
};
```

---

## 6. Vertical Auto-Scroll Within Columns

### 6.1 The Problem

When a column has 40+ leads, dragging a card from bottom to top requires the user to scroll manually while holding the drag. `@dnd-kit` supports this natively via the `autoScroll` configuration.

### 6.2 Implementation

```tsx
<DndContext
  autoScroll={{
    enabled: true,
    layoutShiftCompensation: true,
    // Add vertical scroll configuration
    acceleration: 10,
    threshold: {
      x: 0.2,   // 20% of viewport width for horizontal board scroll
      y: 0.1,   // 10% of viewport height for vertical column scroll
    },
  }}
>
```

**Additional CSS required on columns:**
```css
.pipeline-column {
  max-height: calc(100vh - 200px); /* Account for header */
  overflow-y: auto;
  overflow-x: hidden;
}
```

**Note:** `@dnd-kit/core@6.3.1` has limited vertical auto-scroll within nested scroll containers. If this doesn't work reliably, the fallback is **column max-height + native scroll** and accept that users must drop, scroll, drag again for very tall columns.

---

## 7. Recently-Moved Highlight Flash

### 7.1 Design

When a card is dropped in a new column:
1. Card gets `border-primary/60 bg-primary/10` for 1200ms
2. Fades back to normal via CSS transition

### 7.2 Implementation

```tsx
// In PipelineCard
const [wasRecentlyMoved, setWasRecentlyMoved] = useState(false);

useEffect(() => {
  // Detect column change by comparing previous column to current
  if (previousColumn !== currentColumn) {
    setWasRecentlyMoved(true);
    const timer = setTimeout(() => setWasRecentlyMoved(false), 1200);
    return () => clearTimeout(timer);
  }
}, [currentColumn]);

<Card className={cn(
  "transition-colors duration-500",
  wasRecentlyMoved && "border-primary/60 bg-primary/10"
)}>
```

**Simpler approach:** Store `recentlyMovedIds` in `usePipelineBoard` hook, managed by the `moveMutation.onSuccess` callback:

```ts
const [recentlyMovedIds, setRecentlyMovedIds] = useState<Set<string>>(new Set());

// In moveMutation:
onSuccess: (_data, variables) => {
  setRecentlyMovedIds(prev => new Set([...prev, variables.leadId]));
  setTimeout(() => {
    setRecentlyMovedIds(prev => {
      const next = new Set(prev);
      next.delete(variables.leadId);
      return next;
    });
  }, 1200);
}
```

---

## 8. Inline Quick-Preview Drawer

### 8.1 UX

- **Click** a card (not drag) → slide-out drawer from right edge
- Drawer shows: business name, full contact info, notes preview, recent activities, email history snippet
- **"Open full profile →"** button at bottom navigates to `/leads/[id]`
- **Escape** or click outside closes drawer
- Drawer is **non-blocking** — board remains interactive behind it

### 8.2 Implementation

Re-use Gray UI's `TicketDrawer` pattern (slide-out panel with `AnimatePresence`). LeadGen doesn't have this component yet.

```tsx
// components/pipeline/LeadQuickDrawer.tsx
<motion.div
  initial={{ x: "100%" }}
  animate={{ x: 0 }}
  exit={{ x: "100%" }}
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
  className="fixed right-0 top-0 h-full w-[400px] bg-surface border-l border-border shadow-2xl z-50"
>
  {/* Lead detail preview */}
</motion.div>
```

**Data:** Fetch via `api.leads.get(leadId)` with `staleTime: 30_000` and a lightweight select (don't need full enrichment data, just contact + notes + last 3 activities).

---

## 9. Implementation Phases

### Phase 1: Persistent Board Order (2-3 days)

**Step 0 (pre-requisite):** Move `PIPELINE_COLUMNS` from `apps/web/src/hooks/usePipelineBoard.ts` to `packages/shared` so both `apps/api` and `apps/web` can import it. The `leads.ts` PATCH handler needs the column-to-status mapping to derive `targetColumnId` when cleaning up stale board positions. Without this, the API cannot know which `column_id` a lead was moved to from its raw status/pipeline_stage/engagement_status values.

1. **Migration:** Create `026_board_positions.sql`
2. **Backend:** Create `apps/api/src/routes/board.ts` with GET/POST endpoints
3. **Backend:** Wire cleanup into `leads.ts` PATCH handler
4. **Frontend:** Add `api.board.*` methods to `api.ts`
5. **Frontend:** Integrate board positions into `usePipelineBoard`
6. **Test:** Reorder, refresh, verify order persists

### Phase 2: Bulk Multi-Select (2-3 days)

1. **Backend:** Extend or create batch move endpoint
2. **Frontend:** Selection mode state + Cmd/Ctrl+click handlers
3. **Frontend:** Multi-card drag overlay (stack visual)
4. **Frontend:** Bulk move mutation with optimistic update
5. **Test:** Select 10 cards, move to new column, verify all updated

### Phase 3: Keyboard + Polish (1-2 days)

1. **Keyboard:** Arrow key handlers for reorder and column moves
2. **Vertical scroll:** Test and configure autoScroll for tall columns
3. **Highlight flash:** Implement `recentlyMovedIds` state
4. **Drawer:** Build `LeadQuickDrawer` component

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Float position rebalance trigger complexity | Medium | High | Start with integer positions + 1000-gap spacing. Rebalance only when gap < 10. |
| Board positions query adds latency to leads.list | Low | Medium | Fetch positions as **separate parallel query**, not joined. No blocking. |
| Multi-select drag performance with 50+ cards | Medium | Medium | Limit selection to 50 cards. Show count badge, not full stack, on overlay. |
| Keyboard DnD coordinate getter v6 API mismatch | High | Low | Skip KeyboardSensor. Use imperative mutations instead. |
| Two tabs reordering same column create race | Medium | Medium | Last-write-wins is acceptable. If not, add `updated_at` optimistic locking. |
| Migration 026 conflicts with existing migration numbering | Low | High | Check `apps/api/migrations/` for next available number before writing. |

---

## 11. Acceptance Criteria

### 11.1 Persistent Order

- [ ] Reordering cards within a column survives page refresh
- [ ] Reordering survives navigation to `/leads/[id]` and back
- [ ] Order is per-user (User A's Qualified order doesn't affect User B)
- [ ] Moving a lead to a new column removes it from old column's order
- [ ] New leads (no position) appear at bottom of column, sorted by `hot_score DESC`
- [ ] A lead created after the board loads appears at the bottom of its column
      without requiring a manual refresh
- [ ] After the user drags that new lead to a specific position, it persists
      on refresh (verifies the first reorder write for an unpositioned lead)
- [ ] Deleting a lead removes its position row automatically (CASCADE)

### 11.2 Bulk Operations

- [ ] Cmd/Ctrl+click selects/deselects cards
- [ ] Selected cards show `ring-2 ring-primary` border
- [ ] "Select Mode" button toggles selection UI
- [ ] Dragging any selected card lifts all selected cards as a group
- [ ] Drop on column moves all selected cards to that column
- [ ] Toast shows "Moved N leads to [Column]"
- [ ] Batch move uses single API call (not N sequential calls)

### 11.3 Keyboard

- [ ] Tab navigates between cards within a column
- [ ] Arrow keys reorder focused card within column
- [ ] Shift+arrow moves focused card to adjacent column
- [ ] Enter opens lead detail page
- [ ] Escape clears selection

### 11.4 Polish

- [ ] Card dropped in new column gets 1200ms highlight flash
- [ ] Dragging near top/bottom of tall column auto-scrolls vertically
- [ ] Clicking a card (not dragging) opens quick-preview drawer
- [ ] Drawer shows lead contact, notes preview, last 3 activities
- [ ] Board search filters cards by business name in real-time

---

## 12. Open Questions

1. **Should board order be shared across devices?** If a user reorders on laptop, should phone show same order? (Yes — stored in DB, so automatic.)
2. **Should we support custom columns?** User-defined columns beyond the 6 standard ones? (No — out of scope. Stick to enum-backed columns.)
3. **What happens to order when a lead's `hot_score` changes?** If a lead was manually dragged to top, but its hot_score drops, should auto-sort override manual order? (No — manual order takes precedence. Only unpositioned leads sort by hot_score.)
4. **Should deleted leads' positions be soft-deleted for undo?** (No — CASCADE delete is fine. Board order is not user-critical data.)

---

## 13. Effort Estimate

| Phase | Days | Risk |
|---|---|---|
| Phase 1: Persistent Order | 2-3 | Low |
| Phase 2: Bulk Multi-Select | 2-3 | Medium |
| Phase 3: Keyboard + Polish | 1-2 | Low |
| **Total** | **5-8 days** | — |

**Recommended schedule:** Implement Phase 1 immediately (highest user pain). Schedule Phases 2-3 for next sprint.
