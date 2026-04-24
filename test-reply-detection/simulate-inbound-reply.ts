/**
 * Simulate Inbound Reply — direct DB script
 *
 * Inserts a reply_event, updates the lead status/follow-up,
 * and creates an activity — all without Mailgun or Inngest.
 *
 * Run from repo root:
 *   npx tsx test-reply-detection/simulate-inbound-reply.ts LEAD_ID [INTENT]
 *
 * Example:
 *   npx tsx test-reply-detection/simulate-inbound-reply.ts 4e1e61b1-7e33-4ffa-916b-90b068efcb67 interested
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: 'apps/api/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const INTENTS = ['interested', 'question', 'objection', 'not_now', 'not_interested', 'referral', 'other'] as const;
type Intent = (typeof INTENTS)[number];

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function simulate(leadId: string, intent: Intent = 'interested') {
  console.log(`\nSimulating inbound reply for lead ${leadId}…\n`);

  // 1. Fetch the lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, user_id, business_name, email, reply_token')
    .eq('id', leadId)
    .single();

  if (leadErr || !lead) {
    console.error('❌ Lead not found:', leadErr?.message);
    process.exit(1);
  }

  console.log(`  Found lead: ${lead.business_name || lead.email}`);
  console.log(`  reply_token: ${lead.reply_token ?? 'NULL — will generate one'}`);

  // 1b. Ensure reply_token exists (backfill if missing)
  let replyToken = lead.reply_token;
  if (!replyToken) {
    replyToken = crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).slice(2, 8);
    const { error: tokenErr } = await supabase
      .from('leads')
      .update({ reply_token: replyToken })
      .eq('id', leadId);
    if (tokenErr) {
      console.error('❌ Failed to set reply_token:', tokenErr.message);
      process.exit(1);
    }
    console.log(`  Generated reply_token: ${replyToken}`);
  }

  const now = new Date().toISOString();

  // 2. Insert reply_events row
  const { data: replyEvent, error: replyErr } = await supabase
    .from('reply_events')
    .insert({
      lead_id: leadId,
      user_id: lead.user_id,
      sender_email: 'prospect@example.com',
      subject: 'Re: Outreach',
      body_plain: `Simulated ${intent} reply for testing.`,
      received_at: now,
      type: 'reply',
      intent_label: intent,
      needs_review: false,
      processed_at: now,
    })
    .select('id')
    .single();

  if (replyErr || !replyEvent) {
    console.error('❌ Failed to insert reply_event:', replyErr?.message);
    process.exit(1);
  }
  console.log(`  ✓ reply_events row: ${replyEvent.id}`);

  // 3. Update lead — status, engagement_status, follow-up
  const followUpDate = intent === 'not_interested' ? null : daysFromNow(1);
  const followUpSource = intent === 'not_interested' ? null : 'reply_received';

  const leadUpdate: Record<string, unknown> = {
    status: 'replied',
    engagement_status: 'replied',
    hot_score: 75,
    last_reply_at: now,
    last_reply_intent: intent,
    follow_up_date: followUpDate?.toISOString() ?? null,
    follow_up_source: followUpSource,
  };

  const { error: updErr } = await supabase
    .from('leads')
    .update(leadUpdate)
    .eq('id', leadId);

  if (updErr) {
    console.error('❌ Failed to update lead:', updErr.message);
    process.exit(1);
  }
  console.log(`  ✓ lead updated: status=replied, engagement_status=replied`);
  console.log(`    follow_up_date: ${followUpDate?.toISOString() ?? 'null'}`);
  console.log(`    follow_up_source: ${followUpSource ?? 'null'}`);

  // 4. Insert activity
  const { error: actErr } = await supabase.from('lead_activities').insert({
    lead_id: leadId,
    user_id: lead.user_id,
    type: 'replied',
    description: 'Inbound reply received',
    timestamp: now,
    reply_intent: intent,
    triggered_by: 'inbound_reply',
  });

  if (actErr) {
    console.error('⚠️ Activity insert failed:', actErr.message);
  } else {
    console.log(`  ✓ activity created: type=replied`);
  }

  console.log(`\n✅ Simulation complete. Go to /pipeline and look for the lead in the "Replied" column.`);
  console.log(`   Expected red dot: ${followUpDate ? (followUpDate <= daysFromNow(0) ? 'YES (due today)' : 'NO (due tomorrow)') : 'NO (cleared for not_interested)'}`);
  console.log(`   Activity tab should show: "Inbound reply received"`);
}

const leadId = process.argv[2];
const intent = (process.argv[3] as Intent) || 'interested';

if (!leadId) {
  console.error('Usage: npx tsx test-reply-detection/simulate-inbound-reply.ts <lead_id> [intent]');
  console.error('Intents:', INTENTS.join(', '));
  process.exit(1);
}

if (!INTENTS.includes(intent)) {
  console.error(`Invalid intent "${intent}". Choose one of: ${INTENTS.join(', ')}`);
  process.exit(1);
}

simulate(leadId, intent).catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
