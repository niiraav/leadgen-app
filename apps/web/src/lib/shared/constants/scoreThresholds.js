/**
 * Shared score thresholds for hot score colour-coding.
 *
 * These thresholds drive UI rendering across the app:
 * - HotScoreBar (LeadsTable)
 * - HotScoreBadge (badge component)
 * - SearchResultsTable
 * - HotLeadsWidget
 * - ReplyDrawer urgency labels
 *
 * IMPORTANT: These values are normalised from the HotScoreBar component
 * (apps/web/src/components/leads/LeadsTable.tsx) which uses >= 80 / >= 50.
 * Other components had different thresholds — they should be migrated to
 * use these constants in Sprint 3.
 */
export const SCORE_THRESHOLDS = {
    /** Score >= GREEN → hot/green tier */
    GREEN: 80,
    /** Score >= AMBER (and < GREEN) → warm/amber tier */
    AMBER: 50,
    // Score < AMBER → cold/red tier (no constant needed, it's the fallback)
};
//# sourceMappingURL=scoreThresholds.js.map