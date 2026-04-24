// One-shot migration script: verifies 028_reply_enhancement.sql status
// Usage: npx tsx scripts/apply-migration-028.ts
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.join(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase
    .from('reply_events')
    .select('id, sender_name, reply_status, read_at, handled_at, original_step_execution_id, suggested_reply_draft')
    .limit(1);

  if (error && error.message.includes('sender_name')) {
    console.log('Migration 028 NOT YET APPLIED — new columns missing.');
    console.log('');
    console.log('APPLY: Open Supabase Dashboard SQL Editor and run the full contents of:');
    console.log('  apps/api/migrations/028_reply_enhancement.sql');
    console.log('');
    process.exit(1);
  } else if (error) {
    console.error('Unexpected error checking migration status:', error.message);
    process.exit(1);
  } else {
    console.log('Migration 028 APPLIED — reply_events has new columns.');
    console.log('Sample row fields:', Object.keys(data?.[0] ?? {}).filter(k =>
      ['sender_name','reply_status','read_at','handled_at','original_step_execution_id','suggested_reply_draft'].includes(k)
    ).join(', ') || 'all new columns present');
  }
}

main().catch(console.error);
