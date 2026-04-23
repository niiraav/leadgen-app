import type { LeadActivity, ActivityEntry } from '../types';
declare const ACTIVITY_PRIORITY: LeadActivity['type'][];
declare const EXCLUDED_ACTIVITY_TYPES: Set<LeadActivity['type']>;
declare const ACTIVITY_LABELS: Record<LeadActivity['type'], string>;
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
export declare function resolveLastActivity(activities: LeadActivity[]): ActivityEntry | null;
export { ACTIVITY_PRIORITY, EXCLUDED_ACTIVITY_TYPES, ACTIVITY_LABELS };
//# sourceMappingURL=resolveLastActivity.d.ts.map