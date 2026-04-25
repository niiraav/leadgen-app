import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
config({ path: path.join(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const sql = fs.readFileSync(
    path.join(process.cwd(), '../../apps/api/migrations/028_reply_enhancement.sql'),
    'utf8'
  );

  // Try exec_sql RPC if available
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.log('exec_sql RPC failed:', error.message);
    console.log('You need to apply the migration manually via Supabase Dashboard SQL Editor.');
    console.log('File: apps/api/migrations/028_reply_enhancement.sql');
    process.exit(1);
  }
  console.log('Migration applied via exec_sql:', data);
}

main().catch(console.error);
