/**
 * One-time backfill script: creates a "created" activity entry for every lead
 * that has zero activity log entries.
 *
 * Usage:  npx tsx scripts/backfillLeadCreatedActivity.ts
 *
 * Do NOT run this automatically on server start.
 */

import { config as loadEnv } from 'dotenv';
import * as path from 'path';
loadEnv({ path: path.join(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BATCH_SIZE = 100;

async function main() {
  console.log('Starting backfill of "created" activities for leads with no activity log...\n');

  let offset = 0;
  let totalBackfilled = 0;

  while (true) {
    // Fetch a batch of leads
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, user_id, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (leadsError) {
      console.error('Failed to fetch leads:', leadsError);
      process.exit(1);
    }

    if (!leads || leads.length === 0) break;

    const leadIds = leads.map((l: any) => l.id);

    // Fetch existing activities for these leads in one query
    const { data: activities, error: actError } = await supabase
      .from('lead_activities')
      .select('lead_id')
      .in('lead_id', leadIds);

    if (actError) {
      console.error('Failed to fetch activities:', actError);
      process.exit(1);
    }

    // Build set of lead IDs that already have at least one activity
    const leadsWithActivity = new Set(
      (activities ?? []).map((a: any) => a.lead_id)
    );

    // Filter to leads with zero activity entries
    const leadsNeedingBackfill = leads.filter(
      (l: any) => !leadsWithActivity.has(l.id)
    );

    if (leadsNeedingBackfill.length > 0) {
      // Insert "created" activities for these leads
      const inserts = leadsNeedingBackfill.map((l: any) => ({
        lead_id: l.id,
        user_id: l.user_id,
        type: 'created',
        description: 'Lead saved',
        label: 'Lead saved',
        timestamp: l.created_at,
        triggered_by: 'backfill',
      }));

      const { error: insertError } = await supabase
        .from('lead_activities')
        .insert(inserts);

      if (insertError) {
        console.error('Failed to insert activities:', insertError);
        // Continue rather than exit — partial progress is better than none
      } else {
        totalBackfilled += leadsNeedingBackfill.length;
        console.log(
          `  Batch starting at offset ${offset}: backfilled ${leadsNeedingBackfill.length} leads (total: ${totalBackfilled})`
        );
      }
    }

    offset += BATCH_SIZE;

    // If we got fewer leads than the batch size, we're done
    if (leads.length < BATCH_SIZE) break;
  }

  console.log(`\nBackfill complete. Total leads backfilled: ${totalBackfilled}`);
}

main().catch((err) => {
  console.error('Backfill script failed:', err);
  process.exit(1);
});
