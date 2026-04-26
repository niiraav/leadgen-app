# Search & Active Search View — UI/UX Modernization Plan v2
## Validated against codebase (apps/web/src/components/search/* + pages/search/google-maps.tsx)

---

<CRITIQUE_SUMMARY>
Top 7 issues ranked by severity / production risk

| # | Issue | Severity | WCAG / Standard | File(s) | Line(s) |
|---|-------|----------|-----------------|---------|---------|
| 1 | **Inputs lack labels, error states, and live announcements** — `businessType` and `location` inputs rely solely on placeholders. No `<label>`, no `aria-invalid`, no `aria-describedby` pointing to a live error region. Screen readers skip them in forms mode; validation failures are silent. | Critical | WCAG 1.3.1, 3.3.1, 4.1.2 | SearchForm.tsx | 109–150 |
| 2 | **Table unusable below 768 px** — `overflow-x-auto` on a 7-column table forces horizontal panning on mobile. No card alternative exists. Touch users cannot see Actions without scrolling. | High | WCAG 1.4.10 (Reflow) | SearchResultsTable.tsx | 254–491 |
| 3 | **`motion.tbody` breaks Safari table layout + no reduced-motion guard** — Framer Motion animates `<tbody>` and `<tr>` structural elements. Safari/Firefox table layout engines thrash when DOM nodes are re-measured during spring animations. `motion.tr` also lacks `useReducedMotion`. | High | WCAG 2.3.3 (Animation) | SearchResultsTable.tsx | 339–490 |
||| 4 | **OverflowMenu is a keyboard trap with no ARIA widget semantics** — Inline `OverflowMenu` (48–125) uses `createPortal` but has no `role="menu"`, no `Escape` handler, no arrow-key roving focus, no focus return on close. Fails real keyboard navigation even if axe passes. **Resolution: remove OverflowMenu + Save & Enrich entirely from SearchResultsTable** rather than retrofit; Radix DropdownMenu pattern already proven in `SavedLeadsTable.tsx` for future use. | High | WCAG 4.1.2, 2.1.2 | SearchResultsTable.tsx | 48–125 |
| 5 | **`bg-surface-2` used ambiguously across interactive and static surfaces** — `--surface-2` aliases to `--secondary` (interactive token) globally, but is used for row hovers (interactive), bulk action bars (static), and chip backgrounds (static). Blind migration to `bg-secondary` will regress dark-mode contrast on non-interactive surfaces. | Medium | — | Multiple | see §3 |
| 6 | **Side panels return `null` on empty state, collapsing layout** — `SavedSearchesPanel` (line 125) and `SearchHistoryPanel` (line 99) return `null` when empty. The parent `google-maps.tsx` wraps them in `mt-3` divs with no `min-height`, causing the sidebar column to reflow when the first item loads. | Medium | WCAG 3.2.2 (Predictable) | SavedSearchesPanel.tsx, SearchHistoryPanel.tsx | 99, 125 |
| 7 | **Delete actions hidden by `group-hover:opacity-100` on touch devices** — History and Saved rows hide delete `X` buttons unless hovered. Touch users can never see or trigger them. | Medium | WCAG 2.5.5 (Target Size) | SavedSearchesPanel.tsx, SearchHistoryPanel.tsx | 176–177 |
</CRITIQUE_SUMMARY>

---

<DESIGN_SYSTEM_UPDATES>
No new CSS variables needed — the project already has a dual-token system (shadcn HSL + legacy aliases). The problem is *usage discipline*, not missing tokens.

### Resolved token mapping (no ambiguity)

| Legacy token | Semantic meaning | shadcn equivalent | Migration rule |
|--------------|------------------|-------------------|----------------|
| `bg-surface` | Primary card / page background | `bg-card` | Static surface — safe blanket replace |
| `bg-surface-2` on **hoverable rows / buttons** | Interactive secondary surface | `bg-secondary` | Only where user action is expected |
| `bg-surface-2` on **bars / chips / static panels** | Subdued non-interactive background | `bg-muted` | Use when the element is not clickable |
| `text-text` | Primary text | `text-foreground` | Safe blanket replace |
| `text-text-muted` | Secondary text | `text-muted-foreground` | Safe blanket replace |
| `text-text-faint` | Tertiary / placeholder text | `text-muted-foreground/70` | Safe blanket replace |
| `border-border` | Default border | `border-border` | Already aligned |
| `border-border-strong` | Elevated border | `border-border/60` or `ring-1 ring-border` | Context-dependent |

### Audit of every `bg-surface-2` in search components

File | Context | Current | Should be |
|------|---------|---------|-----------|
| SearchForm.tsx:130 | Quick-select chip hover | `bg-surface-2 hover:bg-blue/10` | `bg-secondary hover:bg-primary/10` |
| SearchForm.tsx:179 | Segmented control inactive | `hover:bg-surface-2` | `hover:bg-muted` |
| SearchForm.tsx:199 | Website filter idle | `bg-surface-2` | `bg-muted` |
| SearchResultsTable.tsx:257 | Bulk action bar | `bg-surface-2` | `bg-muted` |
| SearchResultsTable.tsx:391 | "Saved" badge | `bg-surface-2` | `bg-muted` |
| CollapsedSearchBar.tsx:12 | Summary bar | `bg-surface-2/50` | `bg-muted/50` |
| CollapsedSearchBar.tsx:54,64 | Icon button hover | `hover:bg-surface-2` | `hover:bg-secondary` |
| SavedSearchesPanel.tsx:145 | Row hover | `hover:bg-surface-2` | `hover:bg-secondary` |
| SavedSearchesPanel.tsx:156 | Filter count badge | `bg-surface-2` | `bg-muted` |
| SearchHistoryPanel.tsx:119 | Row hover | `hover:bg-surface-2` | `hover:bg-secondary` |
| SearchHistoryPanel.tsx:156 | Filter count badge | `bg-surface-2` | `bg-muted` |

**Rule of thumb:** If the element is a button, link, or hoverable list row → `bg-secondary`. If it is a badge, bar, or static panel → `bg-muted`.
</DESIGN_SYSTEM_UPDATES>

---

<PATTERN_IMPROVEMENTS>

### 1. Form inputs — labels, validation, and live error region

**Current problems**
- No `<label>` elements; placeholders vanish when typing (WCAG 1.3.1).
- `handleSearch` silently returns if fields are empty — no visual or auditory feedback (WCAG 3.3.1).
- No `aria-describedby` hint text, no `aria-live` error region.

**Proposed modern solution**
Always render the live error region in the DOM (empty until needed) so screen readers register it before content is injected. Use `aria-live="polite"` with `aria-relevant="additions text"` for error announcement. Add `aria-invalid` toggling and reset `attemptedSubmit` when the user types valid input.

```tsx
// SearchForm.tsx — replace the businessType input block (lines 106–118)
const [attemptedSubmit, setAttemptedSubmit] = useState(false);

// Reset error state as soon as the field becomes valid
useEffect(() => {
  if (businessType.trim() && location.trim()) {
    setAttemptedSubmit(false);
  }
}, [businessType, location]);

// In handleSearch — set attemptedSubmit BEFORE the guard, then reset on success
const handleSearch = useCallback(() => {
  setAttemptedSubmit(true);
  if (!businessType.trim() || !location.trim()) return;
  // … proceed with search …
  setAttemptedSubmit(false); // reset on successful submit
}, [businessType, location, onSearch]);

// JSX — business type input
<div className="relative flex-1" ref={quickRef}>
  <label htmlFor="business-type" className="sr-only">Business type</label>
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
    <input
      id="business-type"
      type="text"
      value={businessType}
      onChange={(e) => setBusinessType(e.target.value)}
      onFocus={() => setShowQuick(true)}
      onKeyDown={handleKeyDown}
      placeholder="Business type"
      aria-invalid={!businessType.trim() && attemptedSubmit}
      aria-describedby="business-type-hint business-type-error"
      className="input w-full pl-9"
    />
  </div>
  <span id="business-type-hint" className="sr-only">
    e.g. Plumber, Dentist, Estate Agent
  </span>
  <span
    id="business-type-error"
    aria-live="polite"
    aria-relevant="additions text"
    className="text-xs text-destructive mt-1 min-h-[1rem] block"
  >
    {attemptedSubmit && !businessType.trim() ? "Enter a business type" : ""}
  </span>
</div>
```

Repeat the same pattern for the `location` input with `id="location"`, `aria-describedby="location-hint location-error"`, and a corresponding `aria-live="polite" aria-relevant="additions text"` error span.

**WCAG compliance notes**
- `htmlFor` + `id` satisfies 1.3.1 (Info and Relationships).
- `aria-invalid` + `aria-describedby` error message satisfies 3.3.1 (Error Identification) and 4.1.2 (Name, Role, Value).
- `aria-live="polite"` with `aria-relevant="additions text"` on a permanently-present error region satisfies 4.1.3 (Status Messages). It is announced reliably in VoiceOver, NVDA, and JAWS without the mount ghost-announcement edge case of `role="alert"`.

---

### 2. Responsive table — CSS-only card list for mobile

**Current problems**
- `overflow-x-auto` on a 7-column table is unusable on 375 px viewports.
- No mobile-specific layout exists at all.

**Proposed modern solution**
Render both branches in the DOM and use Tailwind `hidden md:block` / `md:hidden` to avoid SSR hydration mismatch (Next.js Pages Router). The mobile card branch must consume the **exact same handler props** as the desktop table.

```tsx
// Inside SearchResultsTable return — wrap existing table in a container
<div>
  {/* Desktop: existing table */}
  <div className="hidden md:block overflow-x-auto rounded-xl border border-border/60 bg-surface">
    {/* … existing <table> unchanged … */}
  </div>

  {/* Mobile: card list — prop names MUST match SearchResultsTableProps exactly */}
  <div className="md:hidden space-y-3">
    {sortedResults.map((r) => (
      <MobileResultCard
        key={r.place_id}
        result={r}
        selected={selected.has(r.place_id)}
        onToggleSelect={() => toggleSelect(r.place_id)}
        onSaveOne={onSaveOne}      // exact prop from parent
        savingId={savingId}
      />
    ))}
  </div>
</div>
```

**Why CSS-only?**
A `useMediaQuery` hook that renders `null` on the server and cards on the client causes a React hydration mismatch. Because this is Next.js Pages Router (not App Router), the server renders the desktop table; the client must merely hide it with CSS, not remove it from the DOM.

---

### 3. Sortable headers — `aria-sort` + visually hidden direction text

**Current problems**
- `SortableHeader` (lines 224–242) has no `aria-sort`.
- `getSortIcon` renders a chevron, but some VoiceOver versions do not announce `aria-sort` on `<th>`.

**Proposed modern solution**
Add both `aria-sort` and a visually hidden `<span>` inside the header for belt-and-braces screen reader support.

```tsx
// SortableHeader — replace lines 224–242
const SortableHeader = ({
  label,
  column,
  className = "",
}: {
  label: React.ReactNode;
  column: SortableColumn;
  className?: string;
}) => {
  const active = sortColumn === column;
  const ariaSortValue = active
    ? sortDirection === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th
      scope="col"
      aria-sort={ariaSortValue}
      className={`px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-left cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {getSortIcon(column, sortColumn, sortDirection)}
        {active && (
          <span className="sr-only">
            {sortDirection === "asc" ? "sorted ascending" : "sorted descending"}
          </span>
        )}
      </div>
    </th>
  );
};
```

Also add a sort announcement region that updates **only** when `handleSort` fires, using a dedicated state variable. This prevents re-announcement on unrelated re-renders (row hover, selection change).

```tsx
// Inside SearchResultsTable component — add state
const [sortAnnouncement, setSortAnnouncement] = useState("");

// In handleSort — update announcement after state changes
const handleSort = (column: SortableColumn) => {
  let newColumn = sortColumn;
  let newDirection: SortDirection = null;

  if (sortColumn === column) {
    if (sortDirection === "asc") {
      newDirection = "desc";
    } else if (sortDirection === "desc") {
      newColumn = null;
      newDirection = null;
    } else {
      newDirection = "asc";
    }
  } else {
    newColumn = column;
    newDirection = "asc";
  }

  setSortColumn(newColumn);
  setSortDirection(newDirection);

  if (newColumn && newDirection) {
    const label =
      newColumn === "business"
        ? "Business name"
        : newColumn === "location"
        ? "Location"
        : "Rating";
    setSortAnnouncement(
      `Sorted by ${label}, ${newDirection === "asc" ? "ascending" : "descending"}`
    );
  } else {
    setSortAnnouncement("Sorting cleared");
  }
};

// JSX — place before the table container
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {sortAnnouncement}
</div>
```

---

### 4. Remove OverflowMenu + Save & Enrich from row actions; document Radix DropdownMenu pattern for future use

**Current problems**
- Inline `OverflowMenu` (48–125) has no `role="menu"`, `Escape`, arrow navigation, or focus return. Keyboard users cannot operate it.
- `createPortal` with hard-coded `zIndex: 100` sits outside the app's z-index scale.
- The menu contains only **one item** ("Save & Enrich"). A dropdown with one item is unnecessary indirection — users click twice for a single action.
- The `OverflowMenu` pattern exists nowhere else in search components; `SavedLeadsTable.tsx` already uses raw Radix DropdownMenu successfully.

**Design decision**
Remove both the `OverflowMenu` component and the "Save & Enrich" action from `SearchResultsTable` row actions entirely. Row actions will contain only the **Save** button as a direct primary CTA.

**Why:**
- Single-item dropdowns are poor UX. Users expect one click per action.
- Save & Enrich can be triggered post-save from the lead detail page or pipeline, where context is richer and the 2-credit cost is more visible.
- Removing the broken custom menu eliminates the keyboard trap without adding temporary abstraction debt.
- The Radix DropdownMenu pattern is already proven in `SavedLeadsTable.tsx` — when 3+ row actions exist in the future, use that same raw Radix import pattern (not a new shadcn/ui wrapper).

**Proposed modern solution — row actions simplified**

```tsx
// SearchResultsTable.tsx — Actions cell (replace the entire actions block)
<td className="px-3 py-3 w-28">
  {!r.duplicate ? (
    <button
      onClick={() => onSaveOne(r)}
      disabled={savingId !== null}
      className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
    >
      {savingId === r.place_id ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Saving…
        </>
      ) : (
        "Save"
      )}
    </button>
  ) : r.existingLeadId ? (
    <div className="flex items-center gap-1">
      <a
        href={`/leads/${r.existingLeadId}`}
        className="rounded bg-green px-2 py-1 text-xs font-medium text-white hover:bg-green/90 transition-colors inline-flex items-center gap-1"
      >
        Open
      </a>
      <AnimatePresence>
        {isSuccessPop && (
          <motion.div
            initial={saveSuccessPop.initial}
            animate={saveSuccessPop.animate}
            exit={saveSuccessPop.exit}
            className="inline-flex items-center gap-1 text-xs font-medium text-green"
          >
            <Check className="w-3.5 h-3.5" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ) : null}
</td>
```

**Proposed modern solution — Radix DropdownMenu pattern (documented for future use)**

When 3+ actions per row are needed in the future, use the same raw Radix pattern already proven in `SavedLeadsTable.tsx`:

```tsx
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
// Pattern copied from SavedLeadsTable.tsx — do NOT install shadcn/ui wrapper
```

**WCAG compliance notes**
Removing the broken menu entirely resolves 4.1.2 and 2.1.2 for this component. A single direct button requires no roving focus, no `Escape` handling, and no portal management.

---

### 5. Motion — remove `motion.tbody`, guard `motion.tr`, respect `prefers-reduced-motion`

**Current problems**
- `motion.tbody` (line 339) breaks Safari table layout algorithms during spring animations.
- `motion.tr` (line 347) has no reduced-motion guard.
- The same `motion.tbody` / `motion.tr` pattern exists in `PipelineTable.tsx` and `LeadsTable.tsx` but is **out of scope** for this PRD — see follow-up note in §Phase 7.

**Proposed modern solution**
Replace `motion.tbody` with a plain `<tbody>`. Move stagger container logic to a `<div>` wrapper *outside* the table (not possible for tbody), or drop it in favour of per-row CSS transitions. Use `useReducedMotion()` from Framer Motion to disable `motion.tr` animations when the user prefers reduced motion. Additionally, remove the `whileHover={{ x: 3 }}` spring on rows and replace with a CSS `transition-colors` + `hover:bg-secondary/50` for performance.

```tsx
import { useReducedMotion } from "framer-motion";

export function SearchResultsTable({ ... }) {
  const shouldReduceMotion = useReducedMotion();
  // …
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 bg-surface">
        {/* … */}
      </thead>
      <tbody>
        {sortedResults.map((r) => {
          const isSuccessPop = successPopIds.has(r.place_id);
          return shouldReduceMotion ? (
            <tr
              key={r.place_id}
              className={`group border-b border-border/20 transition-colors hover:bg-secondary/50 ${
                selected.has(r.place_id) ? "bg-primary/5" : ""
              } ${r.duplicate ? "opacity-50" : ""}`}
            >
              {/* … cells … */}
            </tr>
          ) : (
            <motion.tr
              key={r.place_id}
              variants={searchRowItem}
              className={`group border-b border-border/20 transition-colors hover:bg-secondary/50 ${
                selected.has(r.place_id) ? "bg-primary/5" : ""
              } ${r.duplicate ? "opacity-50" : ""}`}
            >
              {/* … cells … */}
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

**Why not just a reduced-motion guard on `motion.tbody`?**
Safari recalculates table layout when any `motion` component wraps `<tbody>`, regardless of the user's motion preference. The reduced-motion guard only skips the animation; it does not prevent Safari from re-measuring the table box model on every render cycle. Removing `motion.tbody` entirely is the only safe fix.

---

### 6. Empty panel containers — stable `min-height`

**Current problems**
- `SavedSearchesPanel` returns `null` at line 125 if `saved.length === 0`.
- `SearchHistoryPanel` returns `null` at line 99 if `displayRecent.length === 0`.
- Parent `google-maps.tsx` renders them inside `<div className="mt-3">` with no `min-height`, so the sidebar column collapses and reflows when data arrives.

**Proposed modern solution**
Never return `null`. Render an empty-state placeholder that preserves vertical space. Wrap the panel in a `min-h-[120px]` container in the parent.

```tsx
// SavedSearchesPanel.tsx — replace `if (saved.length === 0) return null;`
if (saved.length === 0) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden p-4 min-h-[120px] flex items-center justify-center">
      <span className="text-xs text-text-muted">No saved searches yet</span>
    </div>
  );
}
```

```tsx
// SearchHistoryPanel.tsx — replace `if (displayRecent.length === 0) return null;`
if (displayRecent.length === 0) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden p-4 min-h-[120px] flex items-center justify-center">
      <span className="text-xs text-text-muted">No recent searches</span>
    </div>
  );
}
```

**WCAG compliance notes**
Stable layout prevents unexpected focus loss and reflow (3.2.2 — On Input). The empty state text also improves orientation for screen reader users.

---

### 7. Touch-visible delete actions — replace `group-hover` opacity

**Current problems**
- `SavedSearchesPanel` line 176: `opacity-0 group-hover/row:opacity-100` on delete `X`.
- `SearchHistoryPanel` line 177: same pattern.
- Touch devices never trigger `:hover`, so delete is unreachable.

**Proposed modern solution**
Use a media query to always show the delete button on coarse-pointer devices, or switch to an explicit `hidden` / `block` strategy. Simpler: make the button always visible but low-contrast, and increase contrast on hover for pointer devices.

```tsx
// Replace the delete button className
className="text-text-faint hover:text-red transition-opacity p-1 shrink-0 md:opacity-0 md:group-hover/row:opacity-100"
```

This keeps the desktop hover-reveal while guaranteeing visibility on mobile. Alternatively, move delete into a swipe-to-reveal pattern if the row count grows.
</PATTERN_IMPROVEMENTS>

---

<PHASED_IMPLEMENTATION_PLAN>
Each phase is <300 LOC, targets 1–2 components, and includes manual test steps.

### Phase 1 — Form accessibility (SearchForm.tsx) [~80 LOC]
1. Add `<label>` (visually hidden) + `id` linkage to both inputs.
2. Add `aria-invalid`, `aria-describedby` hint + error spans.
3. Add `const [attemptedSubmit, setAttemptedSubmit] = useState(false)` and set it on `handleSearch` before the empty-field early return.
4. Add `aria-live="polite" aria-relevant="additions text"` error regions that always render in the DOM (empty string until triggered). Reset `attemptedSubmit` when both fields become valid or on successful submit.

**Test steps**
- Tab through the form with VoiceOver / NVDA. Verify both inputs are announced with "Business type" and "Location" labels.
- Submit with empty fields. Verify screen reader announces "Enter a business type" via the live region.
- Type a valid business type. Verify the error text clears and the region returns to empty string (`""`).
- Clear the field again (without submitting). Verify the error does NOT reappear until submit is pressed again.

### Phase 2 — Token disambiguation (search components) [~120 LOC]
1. Apply the per-usage table in §Design System Updates to all 11 `bg-surface-2` usages in the 6 search files.
2. Do NOT touch non-search files (billing, onboarding, etc.) in this phase.

**Test steps**
- Open Search page in dark mode. Verify row hovers, badges, and the collapsed bar all still render with correct contrast.
- Check no visual regression on the bulk action bar (should be `bg-muted`, not `bg-secondary`).

### Phase 3 — Touch-visible deletes + empty panel stability [~60 LOC]
1. Replace `opacity-0 group-hover/row:opacity-100` with `md:opacity-0 md:group-hover/row:opacity-100` on both delete buttons.
2. Replace `return null` empty states with placeholder divs including `min-h-[120px]`.
3. Add `min-h-[120px]` to the loading skeleton wrappers too for symmetry.

**Test steps**
- Open page on iOS Safari. Verify delete `X` is visible on every history / saved row without tapping.
- Throttle network to Slow 3G and refresh. Verify the sidebar panels do not collapse while loading.

### Phase 4 — Sortable header ARIA + live region (SearchResultsTable.tsx) [~40 LOC]
1. Add `aria-sort`, `scope="col"`, and `sr-only` direction text to `SortableHeader`.
2. Add a dedicated `sortAnnouncement` state variable updated only inside `handleSort`. Use `aria-live="polite"` + `aria-atomic="true"` for the announcement region. This prevents re-announcement on unrelated re-renders (row hover, selection change).

**Test steps**
- With VoiceOver active, click a column header. Verify it announces "Sorted by business, ascending" (or similar) exactly once per click.
- Change an unrelated state (e.g. select a checkbox). Verify the sort announcement does NOT repeat.
- Verify `aria-sort="ascending"` is present in the DOM inspector on the active `<th>`.

### Phase 5 — Remove `motion.tbody`, guard `motion.tr`, add reduced-motion + z-index (SearchResultsTable.tsx) [~60 LOC]
1. Replace `<motion.tbody>` with `<tbody>`.
2. Import `useReducedMotion` from framer-motion.
3. Branch row rendering: plain `<tr>` if `shouldReduceMotion`, otherwise `<motion.tr>` with variants.
4. Remove `whileHover={{ x: 3 }}` from `motion.tr`; replace with `hover:bg-secondary/50` CSS.
5. Add `z-20` to the sticky table header `<thead>` so it stacks above table rows (`z-0`) but below any future batch action bar (`z-30`) or dropdown portals (`z-50`).

**Test steps**
- In Safari, run a search with 50 results. Scroll rapidly. Verify no layout thrashing (no visible table column width jitter).
- Enable macOS "Reduce motion" in System Settings → Accessibility. Re-run. Verify rows appear instantly with no entrance animation.

### Phase 6 — Remove OverflowMenu + Enrich action from SearchResultsTable [~50 LOC]
1. Delete the inline `OverflowMenu` component (lines 48–125) entirely.
2. Remove the "Save & Enrich" action from row actions. Only the **Save** button remains.
3. Update the Actions `<td>` to the simplified direct-button pattern from §Pattern 4.
4. Remove `EnrichDropdown` / `EnrichButton` imports if no longer used anywhere in the file.
5. The Radix DropdownMenu pattern (already proven in `SavedLeadsTable.tsx`) remains available in the codebase for future use when 3+ row actions are needed. Do NOT install a new shadcn/ui wrapper.

**Test steps**
- Inspect the Actions column in the search results table. Verify only a "Save" button is visible (no menu trigger, no "Enrich" option).
- Tab to the Save button. Press Enter. Verify the button shows a loading spinner and the row is saved.
- Verify `onEnrichOne` prop is no longer destructured in `SearchResultsTable` if it was only used by the removed menu.

### Phase 7 — Mobile card branch (SearchResultsTable.tsx) [~200 LOC]
1. Create `MobileResultCard.tsx` in the same directory as `SearchResultsTable.tsx`. Use the exact `MobileResultCardProps` interface below — prop names must match `SearchResultsTableProps` exactly to prevent handler drift.

```tsx
// MobileResultCard.tsx
interface MobileResultCardProps {
  result: SearchResult;       // exact type from SearchResultsTableProps
  selected: boolean;
  onToggleSelect: () => void;
  onSaveOne: (id: string) => void;     // exact prop name from SearchResultsTableProps
  savingId: string | null;
}

function MobileResultCard({
  result,
  selected,
  onToggleSelect,
  onSaveOne,
  savingId,
}: MobileResultCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      {/* checkbox + business name row */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${result.business_name}`}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{result.business_name}</p>
          <p className="text-sm text-muted-foreground">{result.category || "—"}</p>
        </div>
      </div>

      {/* location + rating row */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="truncate max-w-[60%]">{result.location || "—"}</span>
        <span className="shrink-0">⭐ {result.rating ?? "—"}</span>
      </div>

      {/* phone */}
      {result.phone && (
        <p className="text-sm text-muted-foreground">{result.phone}</p>
      )}

      {/* actions — Save only */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSaveOne(result.place_id)}
          disabled={!!savingId}
          className="flex-1 text-sm px-3 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {savingId === result.place_id ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
```

2. In `SearchResultsTable`, wrap existing table in `<div className="hidden md:block">`.
3. Add mobile card list branch `<div className="md:hidden space-y-3">` using the new card component.

**Test steps**
- Resize browser to 375 px width (or use iPhone SE preset). Verify table disappears and cards appear without hydration errors.
- Verify the Save button on cards calls the same handler as desktop (check network tab for `api.leads.create`).
- Confirm no Enrich button or menu trigger exists on mobile cards.

**Design decision — Save button variant alignment**
The mobile card Save button uses `bg-secondary` (a subdued secondary CTA). Verify the desktop table's Save button uses the same variant. If the desktop Save is `bg-primary` (filled primary), align the mobile card to match — or vice versa. The two viewports must not diverge in CTA hierarchy for the same action. Document the chosen variant in the component's JSDoc.

**Out of scope — follow-up ticket required**
`PipelineTable.tsx` and `LeadsTable.tsx` contain the same `motion.tbody` / `motion.tr` anti-pattern noted in Phase 5. They are **explicitly out of scope** for this PRD to keep the review boundary tight. Create a follow-up ticket to apply the same Phase 5 fix (remove `motion.tbody`, add `useReducedMotion` guard) to those two files.
</PHASED_IMPLEMENTATION_PLAN>

---

<QUICK_WINS>
Five changes that give outsized improvement with minimal effort (<10 min each).

1. **Add `sr-only` labels to SearchForm inputs** (2 min)
   ```tsx
   <label htmlFor="business-type" className="sr-only">Business type</label>
   ```
   Same for location. Zero visual change; immediate screen-reader fix.

2. **Make delete buttons always visible on mobile** (2 min)
   Swap `opacity-0 group-hover/row:opacity-100` → `md:opacity-0 md:group-hover/row:opacity-100` in `SavedSearchesPanel.tsx` and `SearchHistoryPanel.tsx`.

3. **Stop panels from collapsing** (3 min)
   Replace both `return null` empty states with `min-h-[120px]` placeholder divs. Eliminates layout shift on first load.

4. **Add `scope="col"` and `aria-sort` to headers** (3 min)
   One-line additions to `SortableHeader`. Passes automated a11y scanners immediately.

5. **Remove `motion.tbody`** (2 min)
   Change `<motion.tbody>` to `<tbody>` and remove `initial="initial" animate="animate" variants={searchStaggerContainer}`. Fixes Safari table thrashing with a single tag swap. Keep `motion.tr` behind a reduced-motion check in a follow-up.
</QUICK_WINS>
