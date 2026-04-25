import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // Find a real lead
  const { data: leads, error: leadErr } = await supabase
    .from('leads')
    .select('id, user_id, status')
    .limit(1);

  if (leadErr || !leads || leads.length === 0) {
    console.error('No leads found:', leadErr);
    process.exit(1);
  }

  const lead = leads[0];
  const userId = lead.user_id;
  const leadId = lead.id;
  console.log('Using lead:', leadId, 'user:', userId, 'status:', lead.status);

  // Step 1: updateLead with status change
  const updateData = {
    updated_at: new Date().toISOString(),
    status: 'contacted',
    engagement_status: 'contacted',
  };

  const { error: updErr } = await supabase
    .from('leads')
    .update(updateData)
    .eq('id', leadId)
    .eq('user_id', userId);

  if (updErr) {
    console.error('updateLead FAILED:', updErr.message || JSON.stringify(updErr));
    process.exit(1);
  }
  console.log('updateLead OK');

  // Step 2: createActivity generic
  const { error: act1Err } = await supabase
    .from('lead_activities')
    .insert({ lead_id: leadId, user_id: userId, type: 'updated', description: 'Lead updated: status' });

  if (act1Err) {
    console.error('createActivity (updated) FAILED:', act1Err.message || JSON.stringify(act1Err));
    process.exit(1);
  }
  console.log('createActivity (updated) OK');

  // Step 3: createActivity with field
  const { error: act2Err } = await supabase
    .from('lead_activities')
    .insert({ lead_id: leadId, user_id: userId, type: 'status_changed', description: 'Status changed', field: 'engagement_status' });

  if (act2Err) {
    console.error('createActivity (field) FAILED:', act2Err.message || JSON.stringify(act2Err));
    process.exit(1);
  }
  console.log('createActivity (field) OK');

  // Step 4: setFollowUp
  const { error: fuErr } = await supabase
    .from('leads')
    .update({ follow_up_date: new Date().toISOString(), follow_up_source: 'column_default' })
    .eq('id', leadId)
    .eq('user_id', userId);

  if (fuErr) {
    console.error('setFollowUp FAILED:', fuErr.message || JSON.stringify(fuErr));
    process.exit(1);
  }
  console.log('setFollowUp OK');

  // Revert status
  await supabase.from('leads').update({ status: lead.status, engagement_status: lead.status }).eq('id', leadId).eq('user_id', userId);
  console.log('Reverted status');

  console.log('\nAll PATCH steps succeeded!');
}

main().catch((e) => { console.error('Script error:', e); process.exit(1); });
