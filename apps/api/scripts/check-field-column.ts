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
  const { data, error } = await supabase
    .from('lead_activities')
    .select('field')
    .limit(1);

  if (error) {
    console.log('ERROR:', error.message || JSON.stringify(error));
    process.exit(1);
  }
  console.log('OK: field column exists');
}

main();
