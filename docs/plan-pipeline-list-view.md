# Pipeline List View — Implementation Plan (Revised)

## 1. Goal
Add a **List View** to the Pipeline page alongside the existing Kanban Board. Users can toggle between Board and List views. The List View borrows the visual language and layout from Gray-UI's ticket table (reference screenshot) while using LeadGen's existing data layer (`usePipelineBoard`), component primitives, and Tailwind tokens.

---

## 2. Reference Visual Spec (Gray-UI Screenshot)

### 2.1 Top Toolbar
- **Search input** (left): "Search leads by name, email, or category..." with magnifying-glass icon
- **Board order** button: Pin/thumbtack icon + up-arrow sort icon + label
- **Table options** button: Sliders/adjustment icon — opens column visibility popover
- **All Statuses** button: Funnel/filter icon — opens status filter dropdown
- **View toggle** (far right): Segmented control with Board and List icons

### 2.2 Data Table

**Column headers** (left to right):
| Column | Header Icon |
|--------|-------------|
| Checkbox (select all) | — |
| Subject | Document/message icon |
| Status | Circle/clock icon |
| Contact | Person icon |
| Category | Tag/label icon |
| Channel | Monitor/app-window icon |
| Health | Clock/gauge icon |

Header style: uppercase, 11–12 px, muted grey, tracking-wide, font-medium.

**Row style**: White background, subtle bottom border (`border-b`), hover state slightly darker. Subject text truncated with ellipsis.

**Status badge** (pill shape):
- `Open`: light-blue background, blue text, rounded-full, border
- `Closed`: light-grey background, grey text, rounded-full, border
- *Colors derived from `PIPELINE_COLUMNS[].color` dynamically*

**Health badge** (dot + text, sometimes in pill):
- `On Track`: small green filled dot, text "On Track"
- `Warning`: small amber filled dot inside amber-outlined pill
- `Breached`: small red filled dot inside red-outlined pill

**Contact avatar**: Circular initials (e.g., "LT", "NP") on light-grey background, or profile photo. Unassigned shows generic person/question-mark icon.

**Channel icon**: Small inline icon per row — chat bubble, envelope, or Slack logo.

### 2.3 Footer Summary Bar
Sticky bottom bar with stats separated by middots:
```
{total} leads  ·  {open} open  ·  {stale} stale  ·  {unassigned} unassigned  ·  {breached} breached
```
Style: very small text (11 px), muted grey, centred or left-aligned.

### 2.4 Overall Aesthetic
- Background: very light off-white
- Font: Inter, 13–14 px body, 11–12 px labels
- Minimal borders, generous whitespace
- All badges use pastel semantic colors (sky, amber, emerald, red, zinc)

---

## 3. Architecture Decision

**Do NOT port Gray-UI's `DataGrid`**. It is a ~15-file, ~3000-LOC custom component system with column drag-reorder, resize, inline cell editing, drawer panels, keyboard navigation, and summary footer rows. Ported verbatim it would be a maintenance burden and duplicate LeadGen's existing patterns.

**Instead**: Build a purpose-built `PipelineListView` that:
1. Reuses the existing `usePipelineBoard` hook for data, selection, mutations, and filtering.
2. Reuses LeadGen's existing `lucide-react` icons (mapping from Gray-UI's `@tabler/icons-react`).
3. Reuses existing shadcn components (`Badge`, `Avatar`, `DropdownMenu`, `Checkbox`, `Input`).
4. Borrows the **visual language** (badge colors, icon choices, avatar style, footer bar) from Gray-UI.
5. Uses **`@tanstack/react-virtual`** from day one for row virtualization (~30 lines, prevents performance cliff at 200+ leads).

---

## 4. Component Inventory

### 4.1 New Files

```
apps/web/src/components/pipeline/PipelineListView.tsx          # Main list view
apps/web/src/components/pipeline/list/LeadStatusBadge.tsx        # Status pill (maps PIPELINE_COLUMNS color)
apps/web/src/components/pipeline/list/LeadHealthBadge.tsx        # Dot/pill health indicator
apps/web/src/components/pipeline/list/LeadChannelIcon.tsx      # Activity-type → icon mapping
apps/web/src/components/pipeline/list/LeadContactAvatar.tsx     # Initials circle or fallback
apps/web/src/components/pipeline/list/PipelineListToolbar.tsx   # Search, sort, filter, view toggle
apps/web/src/components/pipeline/list/PipelineListFooter.tsx    # Summary stats bar
```

### 4.2 Modified Files

```
apps/web/src/pages/pipeline/index.tsx              # Add viewMode state, render ListView conditionally
```

### 4.3 No Changes Required

- `usePipelineBoard.ts` — already returns `leads`, `selectedIds`, `selectLead`, `moveMutation`, `bulkMoveMutation`, `reorderMutation`, `boardFilter`, `filteredLeadsByColumn`, `positionMap`, `setPendingLossMove`, `confirmLossMove`, `cancelLossMove`, etc.
- `PipelineBoard.tsx`, `PipelineColumn.tsx`, `PipelineCard.tsx`, `SelectionToolbar.tsx`, `LeadQuickDrawer.tsx`, `LossReasonModal.tsx` — board-only, unaffected.

---

## 5. Column Mapping: Gray-UI → LeadGen

| Gray-UI Column | LeadGen Field | Notes |
|----------------|---------------|-------|
| Checkbox | `selectedIds.has(lead.id)` | Same bulk-select pattern as LeadsTable |
| Subject | `lead.businessName` | Truncate with `max-w`, show tooltip on hover |
| Status | Pipeline column label | Derived from `status` / `engagementStatus` / `pipelineStage` via `getLeadColumn()`. Colored pill using `PIPELINE_COLUMNS[].color`. **Inline editable** via dropdown. |
| Contact | `lead.contact_name` or `lead.owner_name` | Fallback to "Unassigned". Solo tool — no multi-user assignment concept. |
| Category | `lead.category` or `lead.industry` | Nullable → "Other" fallback |
| Channel | Derived from `lastActivity.type` | See §7.3 |
| Health | Derived from `followUpDate` | See §7.1 |

**Dropped columns** (vs original Gray-UI plan):
- **# ID** — UUID prefix is not a usable identifier; sequential index changes with sort/filter. Adds visual clutter without functional value in a solo pipeline tool. Business name carries all needed identification.
- **Priority** — Redundant with Health (both derive from `followUpDate` with identical thresholds). A lead that is "Urgent" is also "Breached"; "High" is also "Warning". Showing both is noise. Health ("On Track / Warning / Breached") reads as a system status and fits sales thinking better. If Priority is needed later, add as a hidden column defaulting to off.

---

## 6. Design Tokens (Tailwind Mapping)

### 6.1 Color Tokens
LeadGen already has the needed tokens in `globals.css` and `tailwind.config.js`. Any gaps filled inline.

| Visual Element | Tailwind Class |
|----------------|----------------|
| Open status pill | `bg-sky-50 text-sky-700 border border-sky-200` |
| Closed / grey pill | `bg-muted text-muted-foreground border border-border` |
| On Track health dot | `w-1.5 h-1.5 rounded-full bg-green-500` |
| Warning health pill | `bg-amber-50 text-amber-700 border border-amber-200` |
| Breached health pill | `bg-red-50 text-red-700 border border-red-200` |
| Avatar initials bg | `bg-secondary text-secondary-foreground` |
| Unassigned icon | `bg-muted text-muted-foreground` |
| Table header text | `text-xs font-medium text-muted-foreground uppercase tracking-wider` |
| Row hover | `hover:bg-muted/40` |
| Row border | `border-b border-border/50` |
| Table card wrapper | `bg-card rounded-xl border border-border shadow-sm overflow-hidden` |
| Footer bar | `bg-muted/40 border-t border-border px-4 py-2.5 text-xs text-muted-foreground` |

### 6.2 Typography
- All text: Inter (already configured in Tailwind `fontFamily.sans`)
- Header labels: `text-xs uppercase tracking-wider`
- Body cells: `text-sm`
- Badges/pills: `text-xs font-medium`
- Footer stats: `text-xs`

---

## 7. Derivation Logic

### 7.1 Health (from `followUpDate`)

```typescript
type LeadHealth = "on_track" | "warning" | "breached";

function getLeadHealth(lead: PipelineLead): LeadHealth {
  if (!lead.followUpDate) return "on_track";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const followUp = new Date(lead.followUpDate);
  followUp.setUTCHours(0, 0, 0, 0);
  const diffMs = followUp.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "breached";   // overdue
  if (diffDays <= 3) return "warning";   // due within 3 days
  return "on_track";                     // comfortably future
}
```

**Visual mapping**:
- On Track → green dot only (no pill)
- Warning → amber pill with amber dot
- Breached → red pill with red dot

### 7.2 Channel (from last activity)

Channel is derived from the lead's most recent `LeadActivity` record. The `usePipelineBoard` hook currently does **not** fetch activities — it only returns `PipelineLead[]`. Therefore the List View must either:

**Option A (recommended)**: Add `lastActivityType` and `lastActivityTimestamp` to the `PipelineLead` interface and hydrate them in `usePipelineBoard`'s `queryFn` by joining/leveraging the existing leads API (if the backend already returns these fields). Check if `api.pipeline.list()` already includes `last_activity`.

**Option B**: The List View fetches activities separately via `useQuery(["activities", leadIds])` and maps them.

**Option C (fallback)**: Infer channel crudely from `last_contacted` + `status` (e.g., if `status === 'contacted'` → Email).

**Decision**: Check existing API response first. If `lastActivity` is not in the pipeline list payload, hydrate it in `usePipelineBoard` by calling the activities endpoint, or add the fields to the backend `pipeline/list` response.

**Icon mapping**:
- `emailed` → `Mail` (lucide)
- `whatsapp_sent` → custom WhatsApp SVG (already in `LeadsTable.tsx`)
- `replied` → `MessageSquare`
- `created` / `imported` / default → `Inbox`

---

## 8. Sorting

### 8.1 Sort Presets

| Preset | Label | Logic |
|--------|-------|-------|
| `boardOrder` | Board order | Flatten kanban columns left-to-right, then by `positionMap` ASC, then `hotScore` DESC |
| `pastDueFirst` | Past due first | `followUpDate` ASC (nulls last) |
| `escalatedFirst` | Escalated first | `hotScore` DESC |
| `recentActivity` | Recent activity | `updated_at` DESC (most recently touched first) |

### 8.2 Board Order Detail

```typescript
function sortByBoardOrder(leads: PipelineLead[], positionMap: Record<string, Record<string, number>>) {
  const columnOrder = PIPELINE_COLUMNS.map(c => c.id); // ['new','contacted','replied',...]
  return [...leads].sort((a, b) => {
    const colA = getLeadColumn(a);
    const colB = getLeadColumn(b);
    const colIdxA = columnOrder.indexOf(colA);
    const colIdxB = columnOrder.indexOf(colB);
    if (colIdxA !== colIdxB) return colIdxA - colIdxB;

    const posA = positionMap[colA]?.[a.id] ?? Infinity;
    const posB = positionMap[colB]?.[b.id] ?? Infinity;
    if (posA !== posB) return posA - posB;

    return b.hotScore - a.hotScore;
  });
}
```

This produces a list that mirrors the board visually: top-to-bottom of the first column, then top-to-bottom of the second column, etc.

---

## 9. Filtering

The List View must respect the same filters as the Board. The v3.4 PRD replaced `dueTodayFilter: boolean` with `boardFilter: 'due-today' | 'stale' | null` in `usePipelineBoard`. The list view plan uses `boardFilter` throughout to match this future state.

1. **Search query** (toolbar input): Filters `businessName`, `email`, `category`, `city`, `status` by substring match.
2. **Status filter** ("All Statuses" dropdown): Multi-select status pills. Only show leads whose `status` / `engagementStatus` / `pipelineStage` maps to a selected column.
3. **Board filter** (`'due-today'` | `'stale'` | `null`): Client-side predicate applied to the flattened lead array. Same logic as `filteredLeadsByColumn` in `usePipelineBoard`.

---

## 10. Inline Status Editing

Each row's **Status** cell contains a dropdown trigger (the status pill itself is clickable). Clicking opens a `DropdownMenu` with all pipeline stages as options. Selecting a stage immediately calls `moveMutation.mutate({ leadId, targetColumn })`, same mutation the board uses when dragging a card to a new column.

**UI flow**:
1. User clicks status pill → dropdown opens
2. Dropdown items = `PIPELINE_COLUMNS.map(c => ({ label: c.title, value: c.id, color: c.color }))`
3. On select:
   - If target column is **not** `'lost'`: call `moveMutation.mutate({ leadId, targetColumn })`
   - If target column **is** `'lost'`: call `setPendingLossMove({ leadIds: [leadId], targetColumn })` — this is already exported from `usePipelineBoard`. The existing `LossReasonModal` watches `pendingLossMove` and opens automatically. On submit, `confirmLossMove(reason)` fires `moveMutation` with the loss reason. On cancel, `cancelLossMove()` clears state. **No new page-level state required.**
4. Dropdown closes, badge color animates to new stage color

**Multi-select loss move**: If multiple leads are selected and the user changes one selected lead's status to Lost via the dropdown, only that lead moves. Bulk loss moves are handled via the existing `SelectionToolbar` → "Move to Lost" action, which already uses `setPendingLossMove` with `Array.from(selectedIds)`.

---

## 11. View Toggle & Persistence

### 11.1 State

```typescript
type PipelineViewMode = "board" | "list";

const [viewMode, setViewMode] = useState<PipelineViewMode>("board");

// Hydrate from localStorage after mount to avoid SSR mismatch
useEffect(() => {
  const saved = localStorage.getItem("leadgen-pipeline-view") as PipelineViewMode | null;
  if (saved && (saved === "board" || saved === "list")) {
    setViewMode(saved);
  }
}, []);

useEffect(() => {
  localStorage.setItem("leadgen-pipeline-view", viewMode);
}, [viewMode]);
```

**Rationale**: Reading `localStorage` inside `useState` initialiser causes SSR hydration mismatch in Next.js (server renders `"board"`, client may render `"list"`). The two-`useEffect` pattern defers the read until after mount, eliminating flicker.

### 11.2 Toggle UI

Segmented control in the page header, right side:

```
[ LayoutGrid icon  Board ]  [ List icon  List ]
```

Active segment: `bg-card shadow-sm text-foreground`
Inactive segment: `text-muted-foreground hover:text-foreground`
Container: `bg-muted rounded-lg p-0.5 border border-border`

### 11.3 Shared Data

Both views consume the **same** `usePipelineBoard()` instance so:
- `selectedIds` persist across toggle
- `boardFilter` persists
- Search/filter state persists
- No extra API calls on view switch

---

## 12. Selection & Bulk Actions

The List View reuses the existing selection system from the board:

| Gesture | Board Behavior | List View Behavior |
|---------|---------------|-------------------|
| Click row | Open `LeadQuickDrawer` | Open `LeadQuickDrawer` |
| Click checkbox | N/A | Toggle `selectedIds` |
| Shift+click checkbox | N/A | Range select across **sorted filtered array** |
| Cmd/Ctrl+click checkbox | N/A | Toggle individual |
| Header checkbox | Column select-all | Global select-all visible |
| `Esc` key | Clear selection | Clear selection |

**Critical fix for shift-range**: The existing `selectLead(id, columnLeads, modifiers)` takes `columnLeads` to determine range boundaries. In the **list view**, pass the full `sortedFilteredLeads` array (the exact order rows are rendered in) as the `columnLeads` argument. In the **board**, pass the leads in that specific column. The hook signature does not change; the call site provides the correct context array.

When `selectedIds.size > 0`, the existing `SelectionToolbar` appears (already rendered in `PipelinePage`). It shows bulk-move and bulk-delete actions. These work identically regardless of which view is active.

---

## 13. Row Interaction Matrix

| User Action | Result |
|-------------|--------|
| Click anywhere on row (except checkbox/status dropdown) | Open `LeadQuickDrawer` for that lead |
| Click checkbox | Toggle selection (stop propagation) |
| Click status pill | Open status dropdown (stop propagation) |
| Select status from dropdown | Move lead to that stage, close drawer, toast confirmation |
| Hover row | Subtle background highlight (`hover:bg-muted/40`) |
| Row keyboard focus | Visible focus ring (`focus-visible:ring-2 focus-visible:ring-ring`) |

---

## 14. Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| `>= md` (768 px) | All 7 columns visible |
| `< md` | Hide Category, Channel columns. Allow horizontal scroll. Compress Contact to just avatar (no name). |
| `< sm` (640 px) | Further hide Health. Subject + Status + Contact only. |

---

## 15. Animation

- Row mount: Use existing `framer-motion` `rowStaggerItem` variant from `LeadsTable.tsx` (opacity 0→1, y 6→0, spring).
- Row selection: Subtle background color transition (`transition-colors duration-150`).
- Status change: Badge color cross-fade via `transition-colors`.
- View toggle: `AnimatePresence` wrapping board/list. Both views must have a stable `key` prop — `"board"` for the board, `"list"` for the list — so Framer Motion treats them as separate elements and animates the cross-fade.

```tsx
<AnimatePresence mode="wait">
  {viewMode === "board" ? (
    <motion.div key="board" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <PipelineBoard ... />
    </motion.div>
  ) : (
    <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <PipelineListView ... />
    </motion.div>
  )}
</AnimatePresence>
```

---

## 16. Virtualization

**Decision**: Build with `@tanstack/react-virtual` from day one.

Rationale: A solo user pipeline can realistically reach 200+ leads within months. Retrofitting virtualization into a shipped component is significantly more work than building it in from the start. `@tanstack/react-virtual` adds ~30 lines and prevents the performance cliff entirely.

**Implementation**:
```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: sortedFilteredLeads.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 52, // row height in px
  overscan: 5,
});

// Render only visible rows:
{virtualizer.getVirtualItems().map((virtualItem) => (
  <tr key={virtualItem.key} style={{ height: `${virtualItem.size}px`, transform: `translateY(${virtualItem.start}px)` }}>
    ...
  </tr>
))}
```

The table header remains fixed (sticky). The tbody scrolls inside the virtualizer container.

---

## 17. File-by-File Implementation Spec

### 17.1 `apps/web/src/components/pipeline/list/LeadStatusBadge.tsx`

```typescript
interface LeadStatusBadgeProps {
  status: string;                 // raw status / engagementStatus / pipelineStage
  onChange?: (newColumnId: string) => void; // if provided, renders dropdown trigger
  size?: "sm" | "md";
}
```

- Derive column via `getLeadColumn({ status })`
- Look up `PipelineColumnDef` via `getColumnDef(columnId)`
- Render pill with inline `style={{ backgroundColor: column.color + '15', color: column.color, borderColor: column.color + '30' }}`
- If `onChange` provided, wrap in `DropdownMenu` with items from `PIPELINE_COLUMNS`
- On select, call `onChange(columnId)`

### 17.2 `apps/web/src/components/pipeline/list/LeadHealthBadge.tsx`

```typescript
interface LeadHealthBadgeProps {
  followUpDate: string | null;
}
```

- Derive health via `getLeadHealth()` (§7.1)
- `on_track` → green dot only
- `warning` / `breached` → full pill with dot + text

### 17.3 `apps/web/src/components/pipeline/list/LeadChannelIcon.tsx`

```typescript
interface LeadChannelIconProps {
  lastActivityType?: string;
}
```

- Map type to lucide icon (§7.2)
- Return icon with `className="w-4 h-4 text-muted-foreground"`

### 17.4 `apps/web/src/components/pipeline/list/LeadContactAvatar.tsx`

```typescript
interface LeadContactAvatarProps {
  name?: string;
  className?: string;
}
```

- If name present → initials from first letters of first two words
- If no name → `User` icon inside muted circle
- Use existing `Avatar` shadcn component or a simple `div` with `rounded-full`

### 17.5 `apps/web/src/components/pipeline/list/PipelineListToolbar.tsx`

```typescript
interface PipelineListToolbarProps {
  viewMode: "board" | "list";
  onViewModeChange: (mode: "board" | "list") => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortPreset: PipelineSortPreset;
  onSortChange: (preset: PipelineSortPreset) => void;
  statusFilter: string[];         // selected statuses
  onStatusFilterChange: (statuses: string[]) => void;
  columnVisibility: Record<PipelineColumnId, boolean>;
  onColumnVisibilityChange: (col: PipelineColumnId, visible: boolean) => void;
}
```

- Search input: `Input` with `Search` icon
- Sort dropdown: `DropdownMenu` with presets from §8.1
- Status filter dropdown: Multi-select checkboxes for each `PIPELINE_COLUMNS`
- Table options dropdown: Toggle visibility for each column
- View toggle: Segmented button group (§11.2)

### 17.6 `apps/web/src/components/pipeline/list/PipelineListFooter.tsx`

```typescript
interface PipelineListFooterProps {
  leads: PipelineLead[];
}
```

- Compute counts inline:
  - Total = `leads.length`
  - Open = leads not in `lost`/`closed`/`archived`/`converted` columns
  - Stale = leads where `updated_at` is older than `STALE_DAYS` and stage is not converted/lost (or use `boardFilter === 'stale'` predicate if exposed)
  - Unassigned = no `contact_name` / `owner_name`
  - Breached = `getLeadHealth() === 'breached'`
- Render: `{total} leads · {open} open · {stale} stale · {unassigned} unassigned · {breached} breached`

### 17.7 `apps/web/src/components/pipeline/PipelineListView.tsx`

```typescript
interface PipelineListViewProps {
  leads: PipelineLead[];
  selectedIds: Set<string>;
  onSelect: (id: string, modifiers: SelectModifiers, contextLeads: PipelineLead[]) => void;
  onSelectAll: (ids: string[]) => void; // or toggle-all visible
  onOpenLead: (leadId: string) => void;
  onStatusChange: (leadId: string, columnId: string) => void;
  onLossMove: (leadId: string, targetColumn: PipelineColumnDef) => void; // delegates to setPendingLossMove
  isLoading?: boolean;
  positionMap?: Record<string, Record<string, number>>;
  sortPreset: PipelineSortPreset;
}
```

**Responsibilities**:
1. Flatten `filteredLeadsByColumn` into a single array, or receive pre-filtered `leads` array.
2. Apply active sort preset (§8).
3. Render table wrapper with header + body inside `@tanstack/react-virtual` container (§16).
4. Each row:
   - Checkbox (`Checkbox` from shadcn)
   - Business name (truncated)
   - `LeadStatusBadge` (with `onChange` for inline editing)
   - `LeadContactAvatar`
   - Category text
   - `LeadChannelIcon`
   - `LeadHealthBadge`
5. Row click → `onOpenLead(lead.id)`
6. Checkbox click → `onSelect(lead.id, { shiftKey, metaKey, ctrlKey }, sortedFilteredLeads)` — **pass the full sorted array as contextLeads**
7. Status change to non-lost → `onStatusChange(lead.id, columnId)`
8. Status change to lost → `onLossMove(lead.id, targetColumnDef)`

### 17.8 `apps/web/src/pages/pipeline/index.tsx`

Changes:
1. Import `PipelineListView` and view-mode toggle.
2. Add `viewMode` state with `useEffect` hydration from `localStorage` (§11.1).
3. Add `sortPreset` state (default `"boardOrder"`).
4. Add `searchQuery` state.
5. Add `statusFilter` state (default all columns).
6. Add `columnVisibility` state (default all visible).
7. Conditionally render `PipelineBoard` or `PipelineListView` inside `AnimatePresence` with `key="board"` / `key="list"` (§15).
8. Existing `SelectionToolbar`, `LeadQuickDrawer`, and `LossReasonModal` remain rendered at page level and work for both views.
9. `onLossMove` handler: simply calls `setPendingLossMove({ leadIds: [leadId], targetColumn })` from `usePipelineBoard` — the existing `LossReasonModal` wired to `pendingLossMove` opens automatically.

---

## 18. Backend Requirements

### 18.1 Already Available
- `api.pipeline.list()` → returns `PipelineLead[]` with `id`, `businessName`, `status`, `engagementStatus`, `pipelineStage`, `followUpDate`, `hotScore`, `category`, `city`, `country`, `email`, `dealValue`
- `api.board.getPositions()` → returns `positionMap`
- `api.leads.update(id, patch)` → used by `moveMutation`
- `api.board.reorder(...)` → used by `reorderMutation`

### 18.2 Potentially Missing
- `lastActivityType` / `lastActivityTimestamp` in the pipeline list response.
- **Action**: Verify whether `api.pipeline.list()` already includes these. If not, either:
  - (A) Add `last_activity_type` and `last_activity_at` to the backend's pipeline list endpoint (preferred — single round-trip), or
  - (B) Fetch activities separately in `usePipelineBoard` and join them client-side.

---

## 19. Testing Checklist

### 19.1 Functional
- [ ] Toggle Board ↔ List — no refetch, data identical, no flash
- [ ] Toggle persists in `localStorage` across reloads, no SSR hydration flicker
- [ ] List view shows correct number of rows matching board total
- [ ] Board order sort flattens columns left-to-right, top-to-bottom
- [ ] Past due sort: oldest followUpDate first
- [ ] Escalated sort: highest hotScore first
- [ ] Recent activity sort: most recently updated first
- [ ] Search filters by businessName, email, category, city
- [ ] Status filter shows only leads in selected columns
- [ ] Board filter (`due-today` / `stale`) works in both views
- [ ] Select lead in List → switch to Board → selection persists
- [ ] Select lead in Board → switch to List → selection persists
- [ ] Shift+click range select in List uses rendered row order
- [ ] Click row opens LeadQuickDrawer
- [ ] Inline status change moves lead to correct column
- [ ] Inline status change to Lost triggers LossReasonModal automatically
- [ ] Cancelling LossReasonModal does not move the lead
- [ ] Bulk move from SelectionToolbar works in List view
- [ ] Bulk delete from SelectionToolbar works in List view
- [ ] Footer stats update immediately after move/delete
- [ ] Virtual scroll: scroll 500 leads without frame drops

### 19.2 Visual
- [ ] Status pills match PIPELINE_COLUMNS colors
- [ ] Health badges correct variant per state
- [ ] Avatar renders initials correctly
- [ ] Unassigned shows fallback icon
- [ ] Channel icon matches last activity type
- [ ] Row hover state visible
- [ ] Header uppercase labels readable
- [ ] Footer stats bar visible and correct
- [ ] Table wrapper card has correct border/shadow/rounding
- [ ] Truncated subjects show tooltip on hover

### 19.3 Responsive
- [ ] Mobile: Category, Channel columns hidden
- [ ] Mobile: horizontal scroll works
- [ ] Mobile: Contact shows only avatar (no name)
- [ ] Tablet: reduced columns visible

### 19.4 Edge Cases
- [ ] Empty state: no leads → show EmptyState component
- [ ] All leads filtered out → "No leads match your filters" message
- [ ] Lead with no followUpDate → On Track health
- [ ] Lead with no category → "Other" fallback
- [ ] Lead with no contact_name → "Unassigned"
- [ ] Very long business name → truncated, tooltip shows full name
- [ ] 1000+ leads → virtual scroll handles smoothly

---

## 20. Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Large lead lists (200+) | `@tanstack/react-virtual` from day one (§16). Only visible rows render. |
| Re-render on every select | Memoize row component with `React.memo`. Selection change only re-renders checkbox, not full row. |
| Sort re-computation | Use `useMemo` for sorted/filtered array. Dependencies: `leads`, `sortPreset`, `searchQuery`, `statusFilter`, `boardFilter`. |
| Drawer open | `LeadQuickDrawer` is already a separate component; opening it does not re-render the list. |
| Virtualizer container height | Set `max-height: calc(100vh - header - toolbar - footer)` so tbody scrolls within viewport. |

---

## 21. Open Decisions / TODO

1. **Last activity field**: Verify if backend pipeline list includes `last_activity_type`. If not, file a backend ticket to add it, or fetch separately.
2. **Pagination**: With virtualization, full list rendering is acceptable up to 5000+ rows. No pagination needed for a solo pipeline tool.
3. **Board reorder in List View**: The List View supports "Board order" sort but does not allow drag-to-reorder rows (that's what the Board is for). Confirmed acceptable.
4. **Export CSV**: LeadGen's board already has bulk export via `SelectionToolbar`. Verify it works in List view too — it should, since both use the same `selectedIds`.

---

## 22. Summary of Changes from v1 Plan

| Gap | v1 Plan | Revised Plan |
|-----|---------|--------------|
| Redundant Priority + Health | Both visible | **Priority dropped**. Health stays. |
| `dueTodayFilter` references | Used throughout | Replaced with `boardFilter` enum (matches v3.4 PRD). |
| `selectLead` shift-range | Vague | Explicitly pass `sortedFilteredLeads` as `contextLeads` from list view. |
| # ID column | Mapped to lead.id or idx | **Dropped entirely**. No replacement. |
| LossReasonModal state bridge | Vague, suggested new page state | Clarified: `usePipelineBoard` already exports `setPendingLossMove`. List view calls it directly. |
| Performance threshold | "Consider later, 200 threshold" | **Commit to `@tanstack/react-virtual` from day one** (§16). |
| Assignee column | Labelled "Assignee" | Renamed **"Contact"** using `contact_name` (solo tool, no multi-user assignment). |
| localStorage SSR | Inline guard in `useState` | **Two-`useEffect` hydration pattern** (§11.1). |
| AnimatePresence keys | Unspecified | Explicit `key="board"` / `key="list"` (§15). |
