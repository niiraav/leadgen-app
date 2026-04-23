import { resolveLastActivity } from './resolveLastActivity';
import type { LeadActivity } from '../types';

// Helper to create a LeadActivity with sensible defaults
function makeActivity(overrides: Partial<LeadActivity> & { type: LeadActivity['type'] }): LeadActivity {
  const ts = overrides.timestamp ?? overrides.created_at ?? new Date().toISOString();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    lead_id: overrides.lead_id ?? 'lead-1',
    description: overrides.description ?? '',
    created_at: overrides.created_at ?? ts,
    timestamp: ts,
    ...overrides,
  };
}

// ── Test: Returns null for empty array ─────────────────────────────────────
console.log('Test 1: Returns null for empty array');
const r1 = resolveLastActivity([]);
console.assert(r1 === null, `Expected null, got ${JSON.stringify(r1)}`);

// ── Test: Returns null if all activities are excluded types ─────────────────
console.log('Test 2: Returns null if all activities are excluded types');
const r2 = resolveLastActivity([
  makeActivity({ type: 'bio_generated', timestamp: '2026-04-19T10:00:00Z' }),
  makeActivity({ type: 'imported', timestamp: '2026-04-19T09:00:00Z' }),
  makeActivity({ type: 'updated', timestamp: '2026-04-19T08:00:00Z' }),
]);
console.assert(r2 === null, `Expected null, got ${JSON.stringify(r2)}`);

// ── Test: Prefers replied over emailed at same timestamp ───────────────────
console.log('Test 3: Prefers replied over emailed at same timestamp');
const ts3 = '2026-04-19T10:00:00Z';
const r3 = resolveLastActivity([
  makeActivity({ type: 'emailed', timestamp: ts3 }),
  makeActivity({ type: 'replied', timestamp: ts3 }),
]);
console.assert(r3 !== null, 'Expected non-null');
console.assert(r3!.label === 'Replied', `Expected "Replied", got "${r3!.label}"`);

// ── Test: Returns emailed correctly with label "Email sent" ────────────────
console.log('Test 4: Returns emailed correctly with label "Email sent"');
const r4 = resolveLastActivity([
  makeActivity({ type: 'emailed', timestamp: '2026-04-19T09:00:00Z' }),
  makeActivity({ type: 'created', timestamp: '2026-04-18T10:00:00Z' }),
]);
console.assert(r4 !== null, 'Expected non-null');
console.assert(r4!.label === 'Email sent', `Expected "Email sent", got "${r4!.label}"`);

// ── Test: Returns replied with replyIntent when present ────────────────────
console.log('Test 5: Returns replied with replyIntent when present');
const r5 = resolveLastActivity([
  makeActivity({
    type: 'replied',
    timestamp: '2026-04-19T10:00:00Z',
    reply_intent: 'interested',
  }),
]);
console.assert(r5 !== null, 'Expected non-null');
console.assert(r5!.label === 'Replied', `Expected "Replied", got "${r5!.label}"`);
console.assert(r5!.replyIntent === 'interested', `Expected "interested", got "${r5!.replyIntent}"`);

// ── Test: Excludes bio_generated even if most recent ───────────────────────
console.log('Test 6: Excludes bio_generated even if most recent');
const r6 = resolveLastActivity([
  makeActivity({ type: 'bio_generated', timestamp: '2026-04-19T12:00:00Z' }),
  makeActivity({ type: 'emailed', timestamp: '2026-04-19T10:00:00Z' }),
]);
console.assert(r6 !== null, 'Expected non-null');
console.assert(r6!.label === 'Email sent', `Expected "Email sent", got "${r6!.label}"`);

// ── Test: Most recent activity wins when timestamps differ ─────────────────
console.log('Test 7: Most recent activity wins when timestamps differ');
const r7 = resolveLastActivity([
  makeActivity({ type: 'created', timestamp: '2026-04-17T10:00:00Z' }),
  makeActivity({ type: 'emailed', timestamp: '2026-04-19T10:00:00Z' }),
]);
console.assert(r7 !== null, 'Expected non-null');
console.assert(r7!.label === 'Email sent', `Expected "Email sent" (most recent), got "${r7!.label}"`);

// ── Test: reply_classified with replyIntent ────────────────────────────────
console.log('Test 8: reply_classified with replyIntent');
const r8 = resolveLastActivity([
  makeActivity({
    type: 'reply_classified',
    timestamp: '2026-04-19T10:00:00Z',
    reply_intent: 'objection',
  }),
]);
console.assert(r8 !== null, 'Expected non-null');
console.assert(r8!.label === 'Replied', `Expected "Replied", got "${r8!.label}"`);
console.assert(r8!.replyIntent === 'objection', `Expected "objection", got "${r8!.replyIntent}"`);

// ── Test: Non-intent type ignores reply_intent ─────────────────────────────
console.log('Test 9: Non-intent type ignores reply_intent');
const r9 = resolveLastActivity([
  makeActivity({
    type: 'emailed',
    timestamp: '2026-04-19T10:00:00Z',
    reply_intent: 'interested', // should be ignored — not an intent-carrying type
  }),
]);
console.assert(r9 !== null, 'Expected non-null');
console.assert(r9!.replyIntent === undefined, `Expected undefined, got "${r9!.replyIntent}"`);

// ── Test: Legacy alias email_sent normalizes to emailed ──────────────────────
console.log('Test 10: Legacy alias email_sent normalizes to emailed');
const r10 = resolveLastActivity([
  makeActivity({ type: 'email_sent' as any, timestamp: '2026-04-19T10:00:00Z' }),
  makeActivity({ type: 'created', timestamp: '2026-04-18T10:00:00Z' }),
]);
console.assert(r10 !== null, 'Expected non-null');
console.assert(r10!.label === 'Email sent', `Expected "Email sent", got "${r10!.label}"`);

// ── Test: Legacy alias lead_updated normalizes to excluded updated ───────────
console.log('Test 11: Legacy alias lead_updated normalizes to excluded updated');
const r11 = resolveLastActivity([
  makeActivity({ type: 'lead_updated' as any, timestamp: '2026-04-19T10:00:00Z' }),
  makeActivity({ type: 'emailed', timestamp: '2026-04-18T10:00:00Z' }),
]);
console.assert(r11 !== null, 'Expected non-null');
console.assert(r11!.label === 'Email sent', `Expected "Email sent", got "${r11!.label}"`);

// ── Test: Legacy alias status_change normalizes to status_changed ─────────────
console.log('Test 12: Legacy alias status_change normalizes to status_changed');
const r12 = resolveLastActivity([
  makeActivity({ type: 'status_change' as any, timestamp: '2026-04-19T10:00:00Z', field: 'pipeline_stage' }),
]);
console.assert(r12 !== null, 'Expected non-null');
console.assert(r12!.label === 'Pipeline stage changed', `Expected "Pipeline stage changed", got "${r12!.label}"`);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\nAll resolveLastActivity tests passed ✓');
