# Search Results PRD

## 1. Purpose
The Search Results page helps users quickly judge whether a business is worth saving. It is a qualification surface, not a lead management surface, and every design choice should support that decision.

## 2. Scope
This PRD covers the Google Maps search page at `/search/google-maps`, including search form, collapsed summary bar, results table, row actions, recent searches, and state persistence. It does not cover saved leads workflow, pipeline stages, or paid enrichment beyond the row action needed to trigger it.

**Explicitly in scope:**
- Search form with quick-select, location, count, website filter
- Collapsed summary bar
- Results table with column sorting
- Row actions (Save, Enrich)
- Recent searches panel
- Search state persistence across navigation
- Backend duplicate detection on search load

**Explicitly out of scope:**
- Saved searches UI changes (keep existing implementation)
- Google Places autocomplete
- Map view
- Export from Search Results
- Column visibility toggles
- Drag-and-drop reordering
- Pagination beyond Outscraper's returned set

## 3. Page States

The page has two visual modes:

**Expanded:** pre-search or editing filters. Shows centered narrow container (`max-w-xl`), search form card, and recent searches panel below.

**Collapsed:** results visible. Shows full-width container (`max-w-7xl`), compact summary bar at top, results table below.

Clicking **Refine** returns the page to expanded mode with current filters preserved. Clicking **Clear** (X in summary bar) wipes results and returns to expanded mode.

## 4. Search Form

### Fields
| Field | Type | Default | Notes |
|---|---|---|---|
| Business type | Text input + quick-select dropdown | `""` | Required. 8 quick-type chips (Plumber, Electrician, Dentist, Estate Agent, Restaurant, Accountant, Cleaner, Hairdresser) |
| Location | Text input | `profile.target_geography \|\| ""` | Required. Plain text — no autocomplete |
| Result count | Segmented control: **10 · 25 · 50 · 100** | `25` | Fixed steps, no free input |
| Website filter | 3-state toggle: any → has website → no website | `undefined` (neutral) | Cycles: neutral → has → no → neutral |

### Validation
- Search button disabled until both `businessType` and `location` are non-empty
- Enter key triggers search when both fields filled

### Target-area nudge
- `TargetAreaNudge` banner appears above the form when profile has no `target_geography`
- It is the **only mechanism** that writes to `profile.target_geography`
- Searching does not auto-save the location to profile
- On dismiss, profile refreshes and the location input picks up the new default

### Clear filters
- X button only visible when form is dirty
- Resets `businessType` to `""` only — other fields stay
- Does not clear existing results

## 5. Collapsed Summary Bar

When results are present, a compact bar replaces the expanded form:

```
🔍 Plumber · 📍 Manchester · #25 · 23 results    [Refine] [✕]
```

Elements:
- Search icon (blue, 16px)
- Business type (bold, truncated to `max-w-[180px]`)
- Location with MapPin icon
- Requested count with Hash icon
- Website filter badge (only if active)
- **Result count** (blue, bold): e.g. "23 results"
- Refine button → expands form
- Clear button (X) → wipes results, returns to expanded mode

The summary bar is the user's working memory for the current query. It must remain readable after any interaction — sorting, selecting, scrolling.

## 6. Results Table

### Column Order

| # | Column | Header | Align | Width | Content |
|---|---|---|---|---|---|
| 1 | Checkbox | ☐ | center | 32px | Select/deselect individual rows. Header has select-all. |
| 2 | Business | BUSINESS | left | flex | Name (bold, truncated `max-w-[200px]`) + category (muted subtext). **Saved rows:** "Saved" pill badge next to name. Clicking name on saved row navigates to `/leads/{existingLeadId}`. |
| 3 | Category | CATEGORY | left | auto | Short business type label from source data. |
| 4 | Location | LOCATION | left | auto | City name, muted |
| 5 | Rating & Reviews | ★ | center | auto | Combined: `★ 4.8 (3 reviews)` — amber star icon + rating number + review count in parentheses. The star and rating use standard text weight. Review count uses `text-text-muted`. |
| 6 | Website | 🌐 | center | auto | **Has website:** green `Link` icon (20px Lucide), tooltip shows actual URL. **No website:** "No site" text badge — `text-text-muted`, no background, no border. |
| 7 | Phone | 📞 | left | auto | Actual phone number text. Missing: `—` (em dash, `text-text-faint`). Truncate with `max-w-[140px]`. |
| 8 | Actions | ACTIONS | center | 80px | Save + Enrich inline buttons. See §7. |

### Default Order
The table must load in the order Outscraper returns results. The backend **must not** re-sort by `hot_score` or any other derived metric. `hot_score` stays internal-only for post-save use and must not be visible or used as the default ranking signal on this page.

### Sort Behavior
Only these columns are sortable:
- **Business name**
- **Location**
- **Rating + reviews**

**Not sortable:** Website, Phone, Actions.

Header sorting is a **3-state click cycle:**
1. **1st click:** Sort ascending (indicator: ↑ chevron in header)
2. **2nd click:** Sort descending (indicator: ↓ chevron in header)
3. **3rd click:** Return to Outscraper default order (indicator: no chevron, neutral state)

**Rating + Reviews sort logic:** Combined comparator — `rating` primary descending, `reviews` secondary descending. For ascending, reverse both.

**Restoring neutral order:** Read from the original React Query cached response. Do not re-fetch. The cached array is immutable — client-side sort creates a copy; neutral state returns the original cached reference.

### Saved/Duplicate Rows
- When a result is already saved (`duplicate: true`), the row is dimmed (50% opacity)
- Checkbox is hidden
- Action buttons are hidden
- A small "Saved" pill badge appears next to the business name
- Clicking the business name navigates to the existing lead detail page (`/leads/{existingLeadId}`)

## 7. Row Actions

Each unsaved row has **two** inline action buttons:

| Button | Icon | Visual Weight | Tooltip | Credits | Behavior |
|---|---|---|---|---|---|
| Save | Plus | **Primary** — default text color, blue hover | "Save lead — 1 credit" | 1 | Saves the lead (creates in DB), marks row as duplicate, routes to `/leads/{id}` |
| Enrich | Zap | **Secondary** — muted text color, amber hover | "Save & Enrich — 2 credits" | 2 | Saves the lead, then triggers enrichment, routes to `/leads/{id}`. Enrichment completes asynchronously. |

**No overflow menu for MVP.** No "Save and open" button.

### Per-Row Save States
Save action must show per-row state, not a global spinner:

| State | Visual |
|---|---|
| idle | Plus icon, hoverable |
| saving | Spinner (Loader2) |
| saved | Brief "Saved" text or checkmark (usually navigates away immediately) |
| already saved | Row is already `duplicate: true` — action buttons hidden entirely |

Use `savingId` state (similar to existing `enrichingId`) to track which row is actively saving.

### Bulk Actions
When rows are selected via checkboxes, a sticky bar appears at the bottom:
- "{N} selected — {N} credit(s)"
- "Save — {N} credit(s)" button (disabled if lead limit exceeded)
- "Clear" button to deselect all
- Credit limit warning when `currentLeadCount + selected > userLeadLimit`

## 8. Search History

### Recent Searches
- Displayed below the search form in expanded mode
- Stored as structured params (`{ businessType, location, leadCount, hasWebsite }`), not concatenated strings
- Each entry shows: business type · location · timestamp
- Click re-runs the search from stored params
- Delete button (X) removes immediately with **no confirmation dialog**
- Panel is **hidden entirely** when no recent searches exist

### Saved Searches
**Leave existing implementation untouched.** Both frontend `SavedSearchesPanel` and backend `saved_filters` table/routes remain as-is.

## 9. Empty States

| State | Display |
|---|---|
| Pre-search (no search run yet) | **Nothing.** No "No results yet" card. The expanded search form is the entire page. |
| Zero-result search | "No leads found" centered card with subtitle "Try different search terms or location" |
| Loading | 8 skeleton rows |
| Error | Red error card with "Retry" link |
| Upgrade required | `UpgradePrompt` compact component |

## 10. Persistence

Search results, filters, collapsed or expanded state, and row selection should persist when the user navigates away to a lead and returns via back navigation.

**Implementation:** React Query cache.

```tsx
const { data, isLoading } = useQuery({
  queryKey: ['googleMapsSearch', filters],
  queryFn: () => api.search.googleMaps(filters),
  staleTime: Infinity,
  gcTime: 1000 * 60 * 30, // 30 minutes
});
```

- Query key includes the full filter state so different searches have separate caches
- `staleTime: Infinity` prevents automatic refetch
- `gcTime: 30 min` keeps data in memory long enough for back-navigation
- On successful save, invalidate the search cache so duplicate rows refresh correctly:
  ```tsx
  queryClient.invalidateQueries({ queryKey: ['googleMapsSearch'] });
  ```
- Scroll position persistence is **not required**

## 11. Backend Requirements

### Remove hot_score sorting
Delete the `leads.sort((a, b) => b.hot_score - a.hot_score)` line from the search endpoint. Return results in Outscraper's native API response order.

### Add duplicate detection on search load
After mapping Outscraper results, cross-reference `place_id`s against the user's existing leads:

```ts
const placeIds = leads.map((l) => l.place_id).filter(Boolean) as string[];
if (placeIds.length > 0) {
  const { data: existingLeads } = await supabaseAdmin
    .from('leads')
    .select('id, place_id')
    .eq('user_id', userId)
    .in('place_id', placeIds);

  const existingMap = new Map(
    existingLeads?.map((l) => [l.place_id, l.id]) ?? []
  );

  leads = leads.map((l) => ({
    ...l,
    duplicate: existingMap.has(l.place_id),
    existingLeadId: existingMap.get(l.place_id) ?? undefined,
  }));
}
```

This ensures users see "Saved" badges immediately for leads they saved in previous sessions, without needing to attempt a duplicate save first.

### hot_score remains internal
The `hot_score` field stays in the `SearchResult` type and the `leads` table schema. It is used after save for lead scoring and pipeline prioritization. It is **never** displayed on the search page, never used as a default sort on the search endpoint, and never exposed as a user-facing ranking signal in the search context.

## 12. Acceptance Criteria

### Search Form
- [ ] Search container is centered and narrow (`max-w-xl`) in expanded mode
- [ ] Business type field shows 8 quick-select chips on focus (Plumber, Electrician, Dentist, Estate Agent, Restaurant, Accountant, Cleaner, Hairdresser)
- [ ] Free-text entry in business type remains available alongside quick-select
- [ ] Quick-select suggestions do not block typing or custom search terms
- [ ] Location input pre-fills from `profile.target_geography` on mount
- [ ] Target-area nudge banner only appears when profile has no `target_geography`
- [ ] Dismissing the nudge writes the chosen location to profile and refreshes the location input
- [ ] Result count segmented control shows exactly 10, 25, 50, 100
- [ ] Website filter cycles: neutral → has website → no website → neutral
- [ ] Search button is disabled until both business type and location are non-empty
- [ ] Pressing Enter triggers search when both fields are filled
- [ ] Clear filters button only resets `businessType` to empty string; location, count, and website filter stay
- [ ] Clear filters button only appears when form is dirty
- [ ] Searching does not auto-save location to profile

### Collapsed Summary Bar
- [ ] Summary bar appears only after a successful search returns results
- [ ] Summary bar shows: business type (truncated), location, count, result count in blue bold
- [ ] Website filter badge only appears in summary bar when active (has or no website)
- [ ] Refine button expands the form with current filters preserved
- [ ] Clear button (X) wipes results and returns to expanded mode
- [ ] Summary bar remains visible and readable after sorting, selecting, or scrolling

### Results Table — Structure
- [ ] Table loads in Outscraper's native response order (not sorted by hot_score)
- [ ] Columns in order: Checkbox, Business, Category, Location, Rating & Reviews, Website, Phone, Actions
- [ ] **Email column is removed**
- [ ] **Score column and ScoreBar component are removed**
- [ ] **Category is a separate column between Business and Location**
- [ ] Checkbox header has select-all that toggles all unsaved rows
- [ ] Business name is bold, truncated to `max-w-[200px]`
- [ ] Category is muted subtext below or beside the business name (compact)
- [ ] Location shows city name, muted
- [ ] Rating & Reviews column combines: `★ 4.8 (3 reviews)` — star icon + rating in standard text, review count in `text-text-muted`
- [ ] Website: green `Link` icon (20px Lucide) with tooltip showing actual URL for has-website rows
- [ ] Website: "No site" text badge with `text-text-muted`, no background, no border for no-website rows
- [ ] Phone: actual phone number text, left-aligned, truncated `max-w-[140px]`
- [ ] Phone: `—` (em dash, `text-text-faint`) for missing phone numbers
- [ ] Actions column shows Save (Plus icon, primary weight) and Enrich (Zap icon, secondary weight) on unsaved rows
- [ ] No overflow menu (⋮) on any row
- [ ] Saved rows show "Saved" pill badge next to business name
- [ ] Saved rows are dimmed to 50% opacity
- [ ] Saved rows hide checkbox and action buttons
- [ ] Clicking business name on saved row navigates to `/leads/{existingLeadId}`
- [ ] Clicking business name on unsaved row does nothing (no fake navigation)

### Results Table — Sorting
- [ ] Only Business, Location, and Rating & Reviews columns are sortable
- [ ] Website, Phone, and Actions columns are not sortable (no click handler, no chevron)
- [ ] 1st click on sortable header: sort ascending, show ↑ chevron
- [ ] 2nd click: sort descending, show ↓ chevron
- [ ] 3rd click: return to neutral, chevron disappears, order restores to Outscraper default
- [ ] Rating & Reviews sort uses combined comparator: rating primary descending, reviews secondary descending
- [ ] Neutral sort reads from original React Query cached response (no re-fetch)
- [ ] Sort state is preserved when navigating away and returning via back button
- [ ] Sort indicators are visually distinct (chevron icons in column header)

### Row Actions
- [ ] Save is primary action: default text color, blue hover, Plus icon
- [ ] Enrich is secondary: muted text color, amber hover, Zap icon
- [ ] Save tooltip: "Save lead — 1 credit"
- [ ] Enrich tooltip: "Save & Enrich — 2 credits"
- [ ] Per-row save state: clicking Save shows spinner on that row only (savingId)
- [ ] Per-row enrich state: clicking Enrich shows spinner on that row only (enrichingId)
- [ ] After successful save, row immediately shows "Saved" badge and becomes dimmed
- [ ] Duplicate save attempts are prevented by duplicate detection — row already shows Saved state
- [ ] No "Save and open" combined action exists

### Bulk Actions
- [ ] Selecting rows via checkbox shows sticky bottom bar
- [ ] Bottom bar shows "{N} selected — {N} credit(s)"
- [ ] Save button in bottom bar is disabled when `currentLeadCount + selected > userLeadLimit`
- [ ] Credit limit warning text appears when limit exceeded
- [ ] Clear button in bottom bar deselects all rows
- [ ] Bulk save marks all saved rows as duplicate in the table

### Recent Searches
- [ ] Recent searches panel only appears when there is data
- [ ] Recent searches panel is hidden entirely when empty (no placeholder or empty state)
- [ ] Each entry re-runs from structured params (businessType, location, leadCount, hasWebsite)
- [ ] Each entry shows compact summary: business type · location · timestamp
- [ ] Delete button (X) removes entry immediately without confirmation dialog
- [ ] Delete is optimistic: UI removes immediately, backend follows
- [ ] Recent searches are stored as structured params, not concatenated strings

### Saved Searches
- [ ] Saved searches UI remains unchanged from current implementation
- [ ] Both frontend panel and backend routes/table remain functional

### Empty States
- [ ] No pre-search empty state: expanded form is the entire page before first search
- [ ] No-results state only appears after a search returns zero results
- [ ] No-results shows "No leads found" with "Try different search terms or location" subtitle
- [ ] Loading shows exactly 8 skeleton rows
- [ ] Error shows red card with "Retry" link
- [ ] Upgrade required shows compact `UpgradePrompt`

### Persistence
- [ ] Search results persist when navigating to a lead detail page and pressing back
- [ ] Filter state (businessType, location, leadCount, hasWebsite) persists across back navigation
- [ ] Collapsed/expanded state persists across back navigation
- [ ] Row selection state persists across back navigation
- [ ] Sort state persists across back navigation
- [ ] Implementation uses React Query cache with `staleTime: Infinity` and `gcTime: 30min`
- [ ] After saving a lead, returning to search shows the row as "Saved" (duplicate detection)
- [ ] Scroll position does not need to persist

### Backend
- [ ] Search endpoint returns results in Outscraper's native order (no hot_score sort)
- [ ] Search endpoint cross-references `place_id` against user's existing leads
- [ ] Search endpoint returns `duplicate: true` and `existingLeadId` for already-saved leads
- [ ] Search endpoint stores structured params in search history (not just concatenated string)
- [ ] DELETE /search/history/:id endpoint scopes to user_id
- [ ] hot_score remains in response payload and data model for post-save use only

## 13. Implementation Checklist

### Backend
- [ ] Remove `hot_score` sort from `POST /search/google-maps`
- [ ] Add `place_id` duplicate detection query after mapping results
- [ ] Return `duplicate` and `existingLeadId` fields in search response

### Types
- [ ] Remove `emailState` and `phoneAvailability` from `SearchResult` interface
- [ ] Remove unused `EmailLockState`, `ContactAvailability`, `ScoreTier` imports
- [ ] Keep `hot_score` in `SearchResult` for post-save use only

### google-maps.tsx (Page)
- [ ] Rewrite search to use `useQuery` with `staleTime: Infinity`, `gcTime: 30min`
- [ ] Add `savingId` state for per-row save tracking
- [ ] Remove `emailState` and `phoneAvailability` from result mapping
- [ ] Invalidate search cache after successful save/enrich
- [ ] Keep `existingLeadId` in mapping from backend response
- [ ] Keep Saved Searches UI untouched

### SearchResultsTable
- [ ] Remove **Email** column entirely
- [ ] Add **Category** as a separate column between Business and Location
- [ ] Change **Phone** from icon to text: show `phone` string or `—`
- [ ] **Website:** green `Link` icon (20px Lucide) for has-website, tooltip shows actual URL. "No site" text badge (`text-text-muted`, no bg/border) for no-website
- [ ] Remove **Score** column and `ScoreBar` component entirely
- [ ] Remove `getScoreTier` import
- [ ] Add 3-state sort cycle on Business, Location, Rating+Reviews headers
- [ ] Rating+Reviews sort: combined comparator (rating primary, reviews secondary)
- [ ] Neutral sort returns original React Query cached array
- [ ] Add per-row save state: `savingId` prop, show spinner on active row only
- [ ] Saved row name click navigates to `/leads/{existingLeadId}`
- [ ] Add sort chevron indicators (↑ ↓) to column headers

### Verification
- [ ] Build passes
- [ ] Smoke test: search → save → back-nav → results persist
- [ ] Smoke test: duplicate detection shows "Saved" badge on repeat search
- [ ] Smoke test: column sort cycles through asc → desc → neutral
- [ ] Smoke test: Clear filters resets only businessType
