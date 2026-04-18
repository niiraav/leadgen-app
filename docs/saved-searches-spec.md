# Saved Searches — Feature Spec

**Status:** Spec (tracked for Phase 5+)
**Priority:** Medium — power-user productivity feature
**Depends on:** existing `saved_filters` + `search_history` tables + API routes (already built)

---

## Current State

The backend is fully wired:
- **DB tables:** `saved_filters` (id, user_id, name, filters JSONB, created_at) and `search_history` (id, user_id, query, location, limit_count, result_count, params JSONB, created_at)
- **API routes:** `GET/POST/DELETE /leads/saved-filters`, `GET /search/history`
- **Frontend api.ts:** `api.savedFilters.list/create/delete`, `api.searchHistory.list()`
- **Existing component:** `<SavedFilters>` dropdown on the leads page sidebar (generic filter save/load)

**The gap:** No UI on the search page to use any of this. Users type a search from scratch every time.

---

## Feature: Saved Searches on the Search Page

### Overview

Allow users to save a search configuration (business type + location + all filters) with a name, and re-run it later in one click. Also show recent search history for quick re-execution.

### User Stories

1. **Save a search:** After running a search I like, I click "Save this search", give it a name, and it persists across sessions.
2. **Re-run a saved search:** From the search page, I see my saved searches. Clicking one pre-fills + auto-executes the search.
3. **Delete a saved search:** I can remove saved searches I no longer need.
4. **Recent history:** Even without saving, my last 10 searches appear as a "Recent" list I can re-click.
5. **Notification of new results:** (Future/optional) A saved search can be marked "watch" and periodically re-run, notifying if result count changes.

### UI Design

#### Search Form Enhancement

In the `SearchForm` component header row, add a **bookmark icon button** next to the Search button:

```
[Business type ▼] [Location 📍] [# Count] [🔍 Search] [🔖 Save]
```

- "Save" button is disabled until a search has been successfully executed (no blank saves)
- Clicking "Save" opens a small popover asking for a name, defaulting to `"{businessType} in {location}"`

#### Saved Searches Panel

Below the SearchForm (or in the collapsed SearchBar), add a horizontal scrollable row of **search chips**:

```
[★ Plumbers in London] [★ Electricians in Manchester] [🕐 Dentists in Bristol 2h ago]
```

- **Starred chips** = saved searches (persistent, gold/amber tint)
- **Clock chips** = recent history (transient, grey tint, auto-pruned after 30 days)
- Clicking a chip: pre-fills filters + auto-executes search
- Right-click or long-press: shows "Delete" option (saved only)
- Chip shows: name (saved) or "{query} in {location}" (history), with relative timestamp

#### Collapsed Search Bar

When search form is collapsed (after a search), the collapsed bar gains a "Saved" dropdown:

```
[Plumbers in London · 42 results · 2m ago] [Refine] [Clear] [★ Saved ▼]
```

The dropdown lists saved searches + recent history in one list, grouped by section.

### Data Flow

#### Save Search

```
User clicks "Save" → POST /leads/saved-filters { name, filters: { businessType, location, leadCount, hasWebsite, minRating, maxReviews } }
→ Response includes created record → Add to local state → Show toast "Saved: {name}"
```

#### Load Saved Search

```
User clicks saved chip → Parse filters from JSONB → Set SearchForm state → Call handleSearch(parsedFilters)
→ Search executes with saved params
```

#### Search History

History is **automatically recorded** on every search (already happening in the search route). We just need to **display** it.

```
On page load → GET /search/history → Render as "Recent" chips
On search → Refresh history list
```

### Schema Notes

**`saved_filters` table** — already exists, perfectly suited. The `filters` JSONB column stores whatever the search form emits:
```json
{
  "businessType": "Plumber",
  "location": "London",
  "leadCount": 25,
  "hasWebsite": true,
  "minRating": 4,
  "maxReviews": 30
}
```

**`search_history` table** — already exists. `params` JSONB stores the same structure for history entries. Already recorded on every search execution.

No schema changes needed.

### API Endpoints

All already exist:
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/leads/saved-filters` | List user's saved searches |
| POST | `/leads/saved-filters` | Save a new search |
| DELETE | `/leads/saved-filters/:id` | Delete a saved search |
| GET | `/search/history` | List recent search history (last 20) |

No API changes needed.

### Frontend Components to Build

1. **`SearchSavedChips.tsx`** — Horizontal scrollable chip row showing saved + recent searches
2. **`SaveSearchPopover.tsx`** — Small popover for naming a saved search (appears near "Save" button)
3. **SearchForm modification** — Add "Save" button + SavedChips row below form
4. **CollapsedSearchBar modification** — Add "Saved" dropdown
5. **`google-maps.tsx` modification** — Wire up saved searches + history fetch on mount

### Tier Gating

- **Free/Starter:** Up to 3 saved searches
- **Outreach:** Up to 10 saved searches
- **Growth:** Unlimited saved searches
- **Search history:** Available on all tiers (it's just a UX convenience)

Enforcement: API returns 403 if limit exceeded. Frontend shows upgrade prompt.

### Future Enhancements (out of scope for initial build)

1. **Watch mode:** Periodically re-run saved searches and notify of new leads (cron job)
2. **Saved search + auto-add:** Auto-save new leads from a watched search into a list
3. **Sharing:** Share a saved search config with team members
4. **Analytics:** Track how often each saved search is run, conversion rate of leads found

---

## Implementation Checklist

- [ ] Create `SearchSavedChips.tsx` component
- [ ] Create `SaveSearchPopover.tsx` component
- [ ] Modify `SearchForm.tsx` — add Save button
- [ ] Modify `CollapsedSearchBar.tsx` — add Saved dropdown
- [ ] Modify `google-maps.tsx` — fetch saved searches + history on mount
- [ ] Add tier-limit check on save (show upgrade prompt if over limit)
- [ ] Test: save, load, delete, re-run from chip
- [ ] Test: recent history chips appear and work
- [ ] Test: tier gating works
