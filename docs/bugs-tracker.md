# Bug Tracker — Drawer Enrichment Sprint

| # | Bug | Status | File(s) Changed | Commit |
|---|-----|--------|----------------|--------|
| 1 | AI Bio long / showing LLM thinking | **FIXED** | `LeadQuickDrawer.tsx` — added `sanitizeBio()`, `BioSummary` with line-clamp + expand | |
| 2 | Compose button orphaned | **FIXED** | `LeadQuickDrawer.tsx` — replaced `<Link>` with `<ChannelButtons compact ... />`; `usePipelineBoard.ts` — added `contact_linkedin` + `linkedin_url` to interface & mapping | |
| 3 | Pipeline > Lead drawer > View profile Runtime error | **PENDING** | | |
| 4 | Leads page > can't change lead status | **PENDING** | | |
| 5 | Lead info page doesn't load (infinite loop error) | **PENDING** | | |

## Fix #2 Detail

**Problem:** Drawer showed a single orphaned `<Link>` labeled "Compose" that looked out of place.

**Fix:** Reused the existing `ChannelButtons` component (already used on the lead detail page) which provides:
- Email compose button → navigates to `/leads/${id}?action=compose` + closes drawer
- WhatsApp button (with `MessagePicker` template modal)
- SMS/iMessage button (with `MessagePicker` template modal)
- LinkedIn button (if URL available)
- Call button (tel: link)
- DNC disabled state

**Files:**
- `apps/web/src/components/pipeline/LeadQuickDrawer.tsx`
- `apps/web/src/hooks/usePipelineBoard.ts`
