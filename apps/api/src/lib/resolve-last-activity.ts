/**
 * Activity Priority Resolver — resolves the most meaningful last activity.
 *
 * This is a local copy of packages/shared/src/utils/resolveLastActivity
 * because cross-package TS imports don't work with tsx ESM at runtime.
 * Keep in sync with the shared version.
 */

// ── Priority order for activity types ──────────────────────────────────────
const ACTIVITY_PRIORITY: string[] = [
  'replied',          // highest — reply received
  'reply_classified', // reply with intent classification
  'emailed',          // outbound email sent
  'whatsapp_sent',    // outbound WhatsApp sent
  'email_logged',     // manually logged external email
  'status_changed',   // pipeline or engagement status change
  'enriched',         // enrichment that added contact data
  'email_verified',   // email verification completed
  'email_drafted',    // draft saved
  'created',          // lead saved (lowest meaningful)
];

const EXCLUDED_ACTIVITY_TYPES: Set<string> = new Set([
  'bio_generated',
  'imported',
  'updated',
]);

const ACTIVITY_LABELS: Record<string, string> = {
  replied:          'Replied',
  reply_classified: 'Replied',
  emailed:          'Email sent',
  whatsapp_sent:    'WhatsApp sent',
  email_logged:     'Email logged',
  status_changed:   'Status changed',
  enriched:         'Enriched',
  email_verified:   'Enriched',
  email_drafted:    'Email drafted',
  created:          'Lead saved',
  bio_generated:    '',
  imported:         '',
  updated:          '',
};

const INTENT_CARRYING_TYPES: Set<string> = new Set([
  'replied',
  'reply_classified',
]);

const VALID_REPLY_INTENTS: Set<string> = new Set([
  'interested',
  'question',
  'objection',
  'not_now',
  'not_interested',
]);

export interface ActivityEntry {
  label: string;
  timestamp: Date;
  replyIntent?: string;
}

/**
 * Resolve the most meaningful recent activity from a list of activity records.
 */
export function resolveLastActivity(activities: any[]): ActivityEntry | null {
  if (!activities || activities.length === 0) return null;

  const meaningful = activities.filter(
    (a: any) => !EXCLUDED_ACTIVITY_TYPES.has(a.type)
  );
  if (meaningful.length === 0) return null;

  meaningful.sort((a: any, b: any) => {
    const tsA = new Date(a.timestamp || a.created_at).getTime();
    const tsB = new Date(b.timestamp || b.created_at).getTime();
    if (Math.abs(tsA - tsB) > 1000) return tsB - tsA;
    const priA = ACTIVITY_PRIORITY.indexOf(a.type);
    const priB = ACTIVITY_PRIORITY.indexOf(b.type);
    const effA = priA === -1 ? ACTIVITY_PRIORITY.length : priA;
    const effB = priB === -1 ? ACTIVITY_PRIORITY.length : priB;
    return effA - effB;
  });

  const best = meaningful[0];
  const label = ACTIVITY_LABELS[best.type] || best.type;

  let replyIntent: string | undefined;
  if (
    INTENT_CARRYING_TYPES.has(best.type) &&
    best.reply_intent &&
    VALID_REPLY_INTENTS.has(best.reply_intent)
  ) {
    replyIntent = best.reply_intent;
  }

  return {
    label,
    timestamp: new Date(best.timestamp || best.created_at),
    ...(replyIntent ? { replyIntent } : {}),
  };
}
