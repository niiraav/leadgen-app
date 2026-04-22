# Pipeline & Leads Table — Smoke Test Acceptance Criteria

**Date:** 2026-04-22
**User:** smoke-2026@leadgenapp.com (13 leads)
**Branch:** uncommitted (Phase 4)

---

## 1. Pipeline Page — Kanban Status Transitions

### 1.1 Engagement → Engagement (within same domain)
- [x] Contacted → Replied
- [x] Replied → Interested
- [x] New Leads → Contacted
- **Expected:** No console errors, card moves between columns, count updates correctly.
- **Result:** PASS

### 1.2 Engagement → Pipeline (cross-domain)
- [x] New Leads → Proposal Sent
- [x] Contacted → Qualified
- [x] Replied → Proposal Sent
- **Expected:** No "Invalid status transition" error, card moves, engagement badge removed, activity log records "Pipeline stage changed" + "Engagement status changed".
- **Result:** PASS — was broken before fix, now works.

### 1.3 Pipeline → Engagement (cross-domain reverse)
- [x] Qualified → Contacted
- [x] Proposal Sent → New Leads
- [x] Won → Contacted (if applicable)
- **Expected:** No console errors, card moves, engagement badge restored with correct hot score.
- **Result:** PASS

### 1.4 Pipeline → Pipeline (within same domain)
- [x] Qualified → Proposal Sent
- [x] Proposal Sent → Won
- [x] Won → Lost
- **Expected:** Card moves between columns, count updates.
- **Result:** PASS

### 1.5 Column Counts
- [x] Column header counts match actual card count after each move.
- [x] Total "13 leads in your pipeline" matches sum of all columns.
- **Result:** PASS

---

## 2. Leads Table — Domain-Aware Status Dropdown

### 2.1 Engagement Status Dropdown
- [x] Click "new" / "contacted" / "replied" / "interested" button opens dropdown.
- **Options shown:** New, Contacted, Replied, Interested, Not Interested, Out Of Office, Move to Pipeline, Close Lead, Mark Do Not Contact.
- **Result:** PASS

### 2.2 Pipeline Status Dropdown
- [x] Click "qualified" / "proposal_sent" / "converted" / "lost" button opens dropdown.
- **Options shown:** Qualified, Proposal Sent, Converted, Lost, Move to Engagement, Close Lead, Mark Do Not Contact.
- **Result:** PASS

### 2.3 Status Change from Table
- [x] Engagement → Engagement (e.g. new → contacted)
- [x] Move to Pipeline (engagement → qualified)
- [x] Move to Engagement (pipeline → contacted)
- **Expected:** Status badge updates inline, last activity refreshes, no page reload required.
- **Result:** PASS

---

## 3. Lead Detail Page — Activity Log

### 3.1 Activity Log Entries
- [x] Pipeline stage changed — shows when lead moved to pipeline stage.
- [x] Engagement status changed — shows when engagement status updated.
- [x] Lead updated — shows raw field changes (status, engagement_status, pipeline_stage).
- [x] Multiple entries may appear for a single move (dual-write logging).
- **Result:** PASS

### 3.2 Status Badge on Detail Page
- [x] Engagement badge shown when lead is in engagement domain.
- [x] Pipeline badge shown when lead is in pipeline domain.
- [x] Dual-badge logic shows engagement badge only when it differs from pipeline stage.
- **Result:** PASS

---

## 4. API — PUT /leads/:id

### 4.1 Cross-Domain Status Updates
- [x] Changing status from engagement → pipeline updates `status` and `pipeline_stage` fields correctly.
- [x] Changing status from pipeline → engagement updates `status` and `engagement_status` fields correctly.
- [x] No 400 "Invalid status transition" error for valid cross-domain moves.
- **Result:** PASS

### 4.2 Activity Logging
- [x] `recordLeadActivity()` captures field-aware descriptions.
- [x] Database inserts into `lead_activity_log` table.
- **Result:** PASS

---

## 5. Regression — Known Previously Working Flows

### 5.1 "Add to Contacts"
- [x] Click "Add to Contacts" from Pipeline card → lead moved to Contacted.
- [x] Activity log shows "Added to contacts".
- **Result:** PASS

### 5.2 Dashboard Pipeline Funnel
- [x] Dashboard shows correct counts per stage.
- [x] Funnel totals = Pipeline page totals.
- **Result:** PASS

### 5.3 Sequences / Replies Pages
- [x] Navigate to Sequences page — loads without error.
- [x] Navigate to Replies page — loads without error.
- **Result:** PASS (navigated, no console errors)

---

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| No issues found during smoke test | — | — |

## Notes

- All test moves were reverted; test data restored to original state.
- No console errors observed during any transition.
- Both dev servers (api:3001, web:3000) ran successfully during test.
