# Search Page PRD — Google Maps Lead Search

**Status:** Final  
**Scope:** MVP search page (`/search/google-maps`)  
**Source:** Outscraper Google Maps API

---

## 1. Page States

The page has two visual modes: **Expanded** (pre-search / editing filters) and **Collapsed** (results visible).

### Expanded Mode
- Centered narrow container (`max-w-xl`)
- Page title: "Find **B2B Leads**" with subtitle
- Search form card
- Below the card: Recent Searches panel
- Shows when: no search has been run yet, or user clicks "Refine" in collapsed bar

### Collapsed Mode
- Full-width container (`max-w-7xl`)
- Collapsed search summary bar at top
- Results table below
- Shows when: search returns results and form collapses

Transition: on successful search → form collapses, summary bar appears. Clicking "Refine" expands the form again.

---

## 2. Search Form

### Fields
| Field | Type | Default | Notes |
|---|---|---|---|
| Business type | Text input + quick-select dropdown | `""` | Required. 8 quick-type chips (Plumber, Electrician, Dentist, Estate Agent, Restaurant, Accountant, Cleaner, Hairdresser) |
| Location | Text input | `profile.target_geography \|\| ""` | Required. Reads from profile on mount. Plain text — no autocomplete (out of scope) |
| Result count | Segmented control: **10 · 25 · 50 · 100** | `25` | Fixed steps, no free input |
| Website filter | 3-state toggle: Website / Has website / No website | `undefined` (neutral) | Cycles: neutral → has → no → neutral. Passed as `hasWebsite` boolean or undefined |
| Clear | X button | — | Only visible when form is dirty. Resets `businessType` to `""` (other fields stay). **Does not clear existing results** |

### Validation
- Search button disabled until both `businessType` and `location` are non-empty
- Enter key triggers search when both fields filled

### Target-Area Nudge
- `TargetAreaNudge` banner appears above the form when profile has no `target_geography`
- It is the **only mechanism** that writes to `profile.target_geography`
- Searching does not auto-save the location to profile
- On dismiss, profile refreshes and the location input picks up the new default

---

## 3. Collapsed Search Summary Bar

When results are present, a compact bar replaces the expanded form:

```
🔍 Plumber · 📍 Manchester · #25 · 23 results    [Refine] [✕]
```

Elements:
- Search icon (blue)
- Business type (bold, truncated to 180px)
- Location with MapPin icon
- Requested count with Hash icon
- Website filter badge (only if active)
- **Result count** (blue, bold): e.g. "23 results"
- Refine button → expands form
- Clear button (X) → wipes results, returns to expanded mode

The summary bar is the user's **working memory** for the current query. It must remain readable and complete after any interaction — sorting, selecting, scrolling. It carries the full search context (what + where + how many results) so the user never loses track of what produced the current table state.

---

## 4. Results Table

### Column Order

| # | Column | Header | Width | Content |
|---|---|---|---|---|
| 1 | Checkbox | ☐ | 32px | Select/deselect individual rows. Header row has select-all. |
| 2 | Business | BUSINESS | flex | Name (bold, truncated 200px) + category (muted subtext). Saved rows show a "Saved" badge and are dimmed. **Clicking the name** on a saved row navigates to `/leads/{existingLeadId}`. |
| 3 | Location | LOCATION | auto | City name, muted |
| 4 | Rating & Reviews | ★ | center | Combined: `★ 4.8 (3 reviews)` — amber star icon + rating number + review count in parentheses. **Visual treatment:** The star and rating number use standard text weight/color (not muted). The review count in parentheses uses muted text (`text-text-muted`). This is a primary trust signal — it should be scannable at a glance, not buried. Rating without review count is meaningless; combining them saves a column and enforces correct interpretation. |
| 5 | Website | 🌐 | center | **Has website:** green Globe icon. **No website:** "No site" badge — small text label, `text-text-muted` color, no background fill, no border. It reads as a qualification signal ("this business is less digitally mature"), not an error or missing data state. Do not use em-dash, red coloring, or dimmed icon. The badge must be visually quieter than the green Globe (a real value) but clearly distinct from an error state. |
| 6 | Phone | 📞 | center | Available: green Phone icon. Unavailable: dimmed Phone icon (`text-text-faint`, 50% opacity). Missing phone is genuinely missing data, not a qualification signal — use dimmed icon, not a badge. |
| 7 | Email | ✉️ | center | Unknown: dimmed Mail icon (50% opacity). Locked/available: amber Lock icon. Verified: green Mail icon. Unavailable: dimmed Mail icon. |
| 8 | Actions | ACTIONS | 80px | See §5 |

### Result Order — Authoritative Rules

**The search table has one authoritative default order: the order Outscraper returns results in.** This is the search engine's relevance ranking. No other hidden sort metric may shape the default list.

1. On initial load, results appear in Outscraper's returned order — the backend must **not** re-sort by `hot_score` or any other derived metric. The search endpoint returns results in the same sequence the API provides them.

2. `hot_score` is a **post-save internal field only.** It exists in the `SearchResult` type for use after a result is saved as a lead (lead scoring, pipeline prioritization). It must never appear as a visible column in the search table, must never influence the default sort order, and must never be exposed to the user as a ranking signal on this page.

3. **Column-header sort** is available on four columns. Each header supports a 3-state click cycle:
   - **1st click:** Sort ascending (indicator: ↑ chevron in header)
   - **2nd click:** Sort descending (indicator: ↓ chevron in header)
   - **3rd click:** Return to Outscraper default order (indicator: no chevron, header returns to neutral)

   Sortable columns: Business (alphabetical), Location (alphabetical), Rating (numeric), Reviews (numeric).

4. The "default" state is always recoverable. Because the default is a stable external order (Outscraper relevance), not a derived score, the user can always return to it by cycling the active sort header back to neutral. No invisible metric governs the list.

### Saved/Duplicate Rows
- When a result is saved (`duplicate: true`), the row is dimmed (50% opacity), checkbox is hidden, action buttons are hidden
- A small "Saved" pill badge appears next to the business name
- Clicking the business name navigates to the existing lead detail page

---

## 5. Row Actions

### Individual Row Actions
Each unsaved row has **two** inline action buttons with clear visual hierarchy:

| Button | Icon | Visual Weight | Tooltip | Credits | Behavior |
|---|---|---|---|---|---|
| Save | Plus | **Primary** — default text color, blue hover | "Save lead — 1 credit" | 1 | Saves the lead (creates in DB), marks row as duplicate, routes to `/leads/{id}` |
| Enrich | Zap | **Secondary** — muted text color, amber hover | "Save & Enrich — 2 credits" | 2 | Saves the lead, then triggers enrichment, routes to `/leads/{id}`. Enrichment completes asynchronously on the lead detail page. |

Save is the primary action (most common path: save the lead, review it on the detail page). Enrich is secondary — opt-in for users who want to jump straight to enriched data at higher credit cost.

**No "Save and open" button.** The user clicks Save (1 click), then clicks the business name (1 click) to open the detail page. Two clicks, zero ambiguity. No combined action that needs state management or explanation.

### No Overflow Menu for MVP
There is no overflow menu (⋮) on search rows in the MVP. The two inline actions cover the full action surface. Future actions (e.g. "Add to sequence", "Export") can be added as a third inline button or an overflow menu when justified by usage data.

### Bulk Actions
When rows are selected via checkboxes, a sticky bar appears at the bottom:
- "{N} selected — {N} credit(s)"
- "💾 Save — {N} credit(s)" button (disabled if lead limit exceeded)
- "Clear" button to deselect all
- Credit limit warning when `currentLeadCount + selected > userLeadLimit`

---

## 6. Search History

### Recent Searches
- Displayed below the search form in expanded mode
- Stored as **structured params** (`{ businessType, location, leadCount, hasWebsite }`), not concatenated strings
- Each entry shows: business type · location · timestamp
- Click re-runs the search from stored params (fixes existing bug where `entry.query` was passed as businessType)
- Delete button (X) removes immediately with **no confirmation dialog** — requires backend `DELETE /search/history/:id` (scoped to `user_id`)
- Panel is **hidden entirely** when no recent searches exist (no empty state)

### Saved Searches
- **Frozen for MVP:** The Saved Searches panel (`SavedSearchesPanel`) and save-search UI remain in the codebase but are **hidden from the search page UI**.
- The `saved_filters` table, CRUD API, and types stay intact for future use.
- The save-search trigger (star icon / "Save search" button) is removed from the MVP interface.
- Existing users with saved searches have no UI to manage them — accepted debt.

---

## 7. Empty States

| State | Display |
|---|---|
| Pre-search (no search run yet) | **Nothing.** No "No results yet" card. The expanded search form is the entire page. |
| Zero-result search | "No leads found" centered card with subtitle "Try different search terms or location" |
| Loading | 8 skeleton rows |
| Error | Red error card with "Retry" link |
| Upgrade required | `UpgradePrompt` compact component |

---

## 8. Backend Requirements

| Need | Status | Details |
|---|---|---|
| `DELETE /search/history/:id` | **Missing** | Must scope to `user_id`. Add route + `api.searchHistory.delete()` client method |
| Search history storage | **Bug** | Backend stores `query` as concatenated string. Must store structured `{ businessType, location, leadCount, hasWebsite }` params for correct re-run |
| Default result order | **Change** | Backend must return results in Outscraper's native order. Remove any `ORDER BY hot_score` or derived-metric sort from the search endpoint. The API response order is the canonical order. |

**On `hot_score`:** The field stays in `SearchResult` and the `leads` table schema. It is used after save for lead scoring and pipeline prioritization. It is **never** displayed on the search page, never used as a default sort on the search endpoint, and never exposed as a user-facing ranking signal in the search context. Its role is strictly internal and post-save.

---

## 9. Out of Scope

- Google Places autocomplete for location field
- Saved searches UI (frozen — backend exists, UI hidden)
- Rating/reviews filter controls (`minRating`, `maxReviews`) — frozen in backend/types, hidden from MVP UI
- Map view of results
- Export from search results
- Pagination of search results (Outscraper returns up to `limit` results in one call)
- Drag-and-drop or reorder columns
- Column visibility toggles

---

## 10. Implementation Checklist

1. **Backend:** Add `DELETE /search/history/:id` endpoint (scoped to user_id)
2. **Backend:** Fix search history to store structured params, not concatenated query string
3. **Backend:** Remove `hot_score` sort from search endpoint — return results in Outscraper's native API response order
4. **API client:** Add `api.searchHistory.delete(id)` method
5. **Types:** `SearchResult` — keep `hot_score` field (internal-only, post-save use). Remove Score column from table.
6. **SearchResultsTable:**
   - Remove Score column and `ScoreBar` component entirely
   - Combine Rating + Reviews into one column: `★ 4.8 (3 reviews)` — star+rating in standard text, review count in muted text
   - Replace dimmed Globe icon for no-website with "No site" text badge — `text-text-muted`, no background, no border, no error coloring
   - Two inline actions only: Save (Plus, primary visual weight) + Enrich (Zap, secondary visual weight). No overflow menu.
   - Add column-header 3-state sort cycle: asc (↑) → desc (↓) → neutral (no chevron, returns to Outscraper order). Sortable: Business, Location, Rating, Reviews.
   - Remove any "Save and open" action
7. **CollapsedSearchBar:** Verify it renders above the table when collapsed and stays readable after sort/scroll interactions. Must show full search context: business type + location + result count.
8. **SearchForm:** Remove save-search trigger button from MVP (saved searches frozen)
9. **google-maps.tsx:** Remove pre-search "No results yet" empty state
10. **SearchHistoryPanel:** Fix re-run to use `entry.params` not `entry.query`
11. **SearchHistoryPanel:** Add delete for recent entries, no confirmation
12. **SearchHistoryPanel:** Hide Saved tab in MVP
13. **SearchHistoryPanel:** Hide entirely when no data
14. **Verify build + smoke test**
