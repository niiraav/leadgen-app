export const STATUS_ORDER = [
    'new', 'contacted', 'replied', 'interested', 'not_interested',
    'qualified', 'proposal_sent', 'converted', 'closed', 'lost',
    'archived', 'out_of_office', 'do_not_contact'
];
/** Map a numeric hot_score (0-100) to a ScoreTier */
export function getScoreTier(score) {
    if (score >= 80)
        return 'hot';
    if (score >= 50)
        return 'warm';
    return 'cold';
}
//# sourceMappingURL=types.js.map