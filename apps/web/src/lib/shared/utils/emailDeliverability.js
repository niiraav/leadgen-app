/**
 * Map raw vendor email_status to provider-agnostic EmailDeliverabilityState.
 *
 * Active provider: Outscraper Email Validator.
 * Vendor statuses come from apps/api/src/services/outscraper.ts EMAIL_STATUS_MAP.
 *
 * Additional statuses from inbound reply handler (handleInboundReply.ts):
 *   'bounced', 'bounced_soft' → undeliverable (hard) / risky (soft)
 *
 * Frontend-only status:
 *   'enriching' → verifying
 */
export function toEmailDeliverabilityState(vendorStatus) {
    if (!vendorStatus || vendorStatus === 'unverified') {
        // No email or never checked
        // Note: 'none' should only be used when there is NO email address on the lead.
        // If email field exists but status is null/unverified, use 'verifying' fallback.
        // Caller should check lead.email first — if no email, pass null explicitly.
        return 'none';
    }
    const s = vendorStatus.toLowerCase().replace(/[-_]/g, '');
    // Deliverable: Outscraper 'valid'
    if (s === 'valid')
        return 'deliverable';
    // Undeliverable: 'invalid', 'bounced' (hard), 'disposable', 'spamtrap'
    if (s === 'invalid' ||
        s === 'bounced' ||
        s === 'bouncedhard' ||
        s === 'disposable' ||
        s === 'spamtrap')
        return 'undeliverable';
    // Risky: 'catchall', 'acceptall', 'unknown', 'bounced_soft'
    if (s === 'catchall' ||
        s === 'acceptall' ||
        s === 'unknown' ||
        s === 'bouncedsoft')
        return 'risky';
    // Verifying: 'enriching', 'verifying', 'pending'
    if (s === 'enriching' || s === 'verifying' || s === 'pending')
        return 'verifying';
    // Fallback: unknown vendor status → risky (safe default)
    return 'risky';
}
//# sourceMappingURL=emailDeliverability.js.map