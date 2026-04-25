# Pipeline List View → Table Rewrite

## Vision Lock

### Problem
Pipeline List view renders leads as oversized cards. At 50+ leads it becomes an infinite scroll of padded boxes that wastes 60% of horizontal screen. No sort, no density, no alignment with the Leads page table users already know.

### Strategic Fit
Leads page table is the most exercised surface. Sharing its visual DNA (row height, checkbox pattern, header style, overflow menu) reduces re-learning to zero. `SelectionToolbar` and bulk move gates in `usePipelineBoard` are table-agnostic.

### Improvements
1. Density: 9 columns at 1440px vs 3–4 card fields.
2. Sortability: Click headers to sort by stage, follow-up date, deal value, last activity.
3. Column parity with Leads page: Name, Email, Phone, Category, Last Activity reuse identical cell renderers.
4. Pipeline-specific columns (deal value, reply count, follow-up date) become scannable.
5. Selection + bulk actions work unchanged via `selectedIds` from the hook.

### Kill / Remove
- `PipelineListView.tsx` → DELETE after table ships. Board view still exists.
- `ListCard` subcomponent → DELETE with parent.
- Any planned `list/` subcomponents from old Gray-UI PRD → DO NOT CREATE.

### Column Stress Test (LOCKED — Nirav confirmed)

| # | Column | Field | Available | Notes |
|---|--------|-------|-----------|-------|
| 1 | Name | `business_name` | Yes | Primary clickable, opens lead drawer |
| 2 | Pipeline Stage | `pipelineStage` / `engagementStatus` | Yes | Color pill via `PIPELINE_COLUMNS`. Replaces generic Status. |
| 3 | Replies | `unreadReplyCount` | Yes | "3 New" badge. Red dot if >0. No total count. |
| 4 | Follow-up Date | `followUpDate` | Yes | Relative date + health color (red/amber/green). |
| 5 | Deal / Debt Value | `dealValue` | Yes | `formatCompactDealValue()` → "£1.2k" or "—". |
| 6 | Last Activity | `lastActivity` (label + timestamp) | Yes | Backend returns string; adapter needed for sort. |
| 7 | Actions | — | — | Mail / WhatsApp / SMS icons + Overflow (⋯) |

**Excluded per Nirav:** Email, Phone, Category, Notes, City.

### Stage vs Category
- **Stage** = `pipelineStage` / `engagementStatus` — the pipeline flow position (New → Contacted → Proposal Sent → ...). Changes via `moveMutation` with gate controller.
- **Category** = `category` — a free-text business tag (e.g. "Real Estate", "Software"). Static metadata, not a workflow state.

### Reality Check
- **LeadsTable.tsx reuse**: LeadsTable has 7 hardcoded columns with no render-props. We need 7 columns including Stage, Deal Value, Replies, Follow-up, Last Activity. **Decision**: Create `PipelineTable.tsx` as a new file that copies ~120 lines of proven structural primitives from LeadsTable (portal tooltip, SortHeader, checkbox pattern, skeleton row, overflow menu) but defines its own 7-column layout. Pattern reuse, not component reuse — avoids Leads-page regression.
- **Sort**: `usePipelineBoard` fetches all pipeline leads client-side. Sorting is client-side for now (safe until 200+ leads).
- **Stage dropdown**: Existing `StatusDropdown` calls `api.leads.update`. Pipeline context needs `moveMutation` (optimistic cache, `recentlyMovedIds` flash, gate controller). Create thin `PipelineStageDropdown` wrapper.

---

## Phased Plan

### Phase 1: PipelineTable Shell — Render all columns static
**Goal:** New `PipelineTable.tsx` renders 9 data columns + Actions with correct data mapping, zero interactivity.

**Files:**
- `apps/web/src/components/pipeline/PipelineTable.tsx` (new, ~280 LOC)
- `apps/web/src/pages/pipeline/index.tsx` (swap import, ~10 LOC)

**Acceptance:**
```gherkin
Given I am on /pipeline with viewMode=list
When the pipeline leads load
Then I see a table with columns: Name, Stage, Replies, Follow-up, Deal Value, Last Activity, Actions
And each row shows the correct data from PipelineLead
And styling matches Leads page (bg-surface, border-border/60, h-14 rows, muted headers)
```

**Manual test:**
1. Open /pipeline, click List toggle.
2. Verify 7 column headers render with correct labels.
3. Verify Name and Stage values match Board cards.
4. Verify Replies column shows unread count + red dot if >0.
5. Verify Follow-up shows relative date with color.
6. Verify Deal Value shows "£1.2k" or "—".
7. Verify Last Activity shows label and timestamp.
8. Resize to 1366px — horizontal scroll appears, no crushed columns.

---

### Phase 2: Selection + Sort + Stage Dropdown
**Goal:** Row checkboxes, column sort, and stage-change dropdown wired to `moveMutation`.

**Files:**
- `apps/web/src/components/pipeline/PipelineTable.tsx` (add checkbox, SortHeader, PipelineStageDropdown, ~120 LOC)
- `apps/web/src/hooks/usePipelineBoard.ts` (add `sortField` / `sortOrder` + client-side sorter, ~60 LOC)

**Acceptance:**
```gherkin
Given the PipelineTable is rendered
When I click a row checkbox
Then the row highlights and the bottom SelectionToolbar appears with correct count
When I click the "Stage" column header
Then rows reorder by stage according to PIPELINE_COLUMNS order
When I click a stage pill in a row
Then a dropdown opens with all pipeline stages
And selecting a stage calls moveMutation and the row flashes recently-moved highlight
```

**Manual test:**
1. Click one checkbox → SelectionToolbar shows "1 selected".
2. Shift-click another → range selects.
3. Click Stage header → rows reorder (new → contacted → replied...).
4. Click a stage pill, select "Proposal Sent" → row flashes yellow border.
5. Select lead, click "Move to Lost" in SelectionToolbar → BulkLossModal opens.

---

### Phase 3: Row Actions + Overflow Menu
**Goal:** Mail/WhatsApp/SMS icons and overflow dropdown with correct disabled states.

**Files:**
- `apps/web/src/components/pipeline/PipelineTable.tsx` (add action buttons + overflow, ~100 LOC)
- `apps/web/src/pages/pipeline/index.tsx` (pass action callbacks, ~20 LOC)

**Acceptance:**
```gherkin
Given a table row with email and phone data
When I hover the Actions column
Then Mail, WhatsApp, SMS icons appear with correct disabled states
And tooltips explain disabled reason
When I click the Overflow (⋯) button
Then a portal dropdown appears with: Open lead, Add note, Export, Mark DNC
```

**Manual test:**
1. Hover Mail on verified email → tooltip "Send email". Click → mailto opens.
2. Hover Mail on DNC lead → tooltip "Actions disabled — DNC". Verify opacity-40.
3. Click Overflow → dropdown with 4+ items.
4. Click "Open lead" → navigates to /leads/{id}.

---

### Phase 4: Cleanup + Build Verification
**Goal:** Delete card code, verify no regressions.

**Files:**
- Delete `apps/web/src/components/pipeline/PipelineListView.tsx`
- Delete `ListCard.tsx` if standalone
- Prune unused imports in `pipeline/index.tsx`

**Acceptance:**
```gherkin
Given the pipeline page loads in List view
Then no PipelineListView code remains in the bundle
And npm run build passes with zero TypeScript errors
And /leads still renders LeadsTable correctly
```

**Manual test:**
1. `npm run build` from monorepo root.
2. Open /leads → LeadsTable renders, sorts, selects as before.
3. Open /pipeline → toggle Board/List → both views render.
4. DevTools Network → no 404s for deleted chunks.
5. `git status` shows `PipelineListView.tsx` as deleted.
