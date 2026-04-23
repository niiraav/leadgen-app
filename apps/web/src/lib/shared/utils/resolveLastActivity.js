// ── Priority order for activity types ──────────────────────────────────────
// Higher index = lower priority. Used to break ties when activities share
// the same timestamp (within 1 second).
const ACTIVITY_PRIORITY = [
    'replied', // highest — reply received
    'reply_classified', // reply with intent classification
    'emailed', // outbound email sent
    'whatsapp_sent', // outbound WhatsApp sent
    'email_logged', // manually logged external email
    'status_changed', // pipeline or engagement status change
    'enriched', // enrichment that added contact data
    'email_verified', // email verification completed
    'email_drafted', // draft saved
    'created', // lead saved (lowest meaningful)
];
// These activity types should NEVER surface as lastActivity.
// They are system noise, not meaningful engagement events.
const EXCLUDED_ACTIVITY_TYPES = new Set([
    'bio_generated',
    'imported',
    'updated',
]);
// ── Human-readable labels for activity types ──────────────────────────────
const ACTIVITY_LABELS = {
    replied: 'Replied',
    reply_classified: 'Replied',
    emailed: 'Email sent',
    whatsapp_sent: 'WhatsApp sent',
    email_logged: 'Email logged',
    status_changed: 'Status changed',
    enriched: 'Enriched',
    email_verified: 'Enriched',
    email_drafted: 'Email drafted',
    created: 'Lead saved',
    bio_generated: '', // excluded
    imported: '', // excluded
    updated: '', // excluded
};
// Activity types that carry reply_intent
const INTENT_CARRYING_TYPES = new Set([
    'replied',
    'reply_classified',
]);
const VALID_REPLY_INTENTS = new Set([
    'interested',
    'question',
    'objection',
    'not_now',
    'not_interested',
]);
/**
 * Resolve the most meaningful recent activity from a list of activity records.
 *
 * Rules:
 *  1. Exclude bio_generated, imported, updated entirely
 *  2. Sort remaining by timestamp descending (most recent first)
 *  3. If two activities share the same timestamp (within 1 second),
 *     prefer the higher-priority type using ACTIVITY_PRIORITY order
 *  4. Return null if no meaningful activities exist
 */
export function resolveLastActivity(activities) {
    if (!activities || activities.length === 0)
        return null;
    // Filter out excluded types
    const meaningful = activities.filter((a) => !EXCLUDED_ACTIVITY_TYPES.has(a.type));
    if (meaningful.length === 0)
        return null;
    // Sort: most recent first, then by priority for same-timestamp ties
    meaningful.sort((a, b) => {
        const tsA = new Date(a.timestamp || a.created_at).getTime();
        const tsB = new Date(b.timestamp || b.created_at).getTime();
        // Primary sort: most recent first (descending)
        if (Math.abs(tsA - tsB) > 1000) {
            return tsB - tsA;
        }
        // Secondary sort: higher priority first (lower index = higher priority)
        const priA = ACTIVITY_PRIORITY.indexOf(a.type);
        const priB = ACTIVITY_PRIORITY.indexOf(b.type);
        // Unknown types get lowest priority
        const effPriA = priA === -1 ? ACTIVITY_PRIORITY.length : priA;
        const effPriB = priB === -1 ? ACTIVITY_PRIORITY.length : priB;
        return effPriA - effPriB;
    });
    const best = meaningful[0];
    const label = ACTIVITY_LABELS[best.type] || best.type;
    // Extract replyIntent if present on an intent-carrying type
    let replyIntent;
    if (INTENT_CARRYING_TYPES.has(best.type) && best.reply_intent && VALID_REPLY_INTENTS.has(best.reply_intent)) {
        replyIntent = best.reply_intent;
    }
    return {
        label,
        timestamp: new Date(best.timestamp || best.created_at),
        ...(replyIntent ? { replyIntent } : {}),
    };
}
// Exported for testing
export { ACTIVITY_PRIORITY, EXCLUDED_ACTIVITY_TYPES, ACTIVITY_LABELS };
//# sourceMappingURL=resolveLastActivity.js.map