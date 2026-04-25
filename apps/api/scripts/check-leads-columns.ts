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
  const columns = [
    'converted_at',
    'follow_up_date',
    'follow_up_source',
    'loss_reason',
    'loss_reason_notes',
    'deal_value',
    'engagement_status',
    'pipeline_stage',
    'lifecycle_state',
    'do_not_contact',
    'user_id',
  ];

  for (const col of columns) {
    const { error } = await supabase
      .from('leads')
      .select(col)
      .limit(0);

    if (error) {
      console.log(`MISSING [${col}]:`, error.message);
    } else {
      console.log(`OK [${col}]`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
