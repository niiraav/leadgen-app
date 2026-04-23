import type { EmailDeliverabilityState } from '../types';
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
export declare function toEmailDeliverabilityState(vendorStatus: string | null | undefined): EmailDeliverabilityState;
//# sourceMappingURL=emailDeliverability.d.ts.map