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
  const columns = ['field', 'triggered_by', 'reply_intent', 'label', 'timestamp', 'user_id'];

  for (const col of columns) {
    const { error } = await supabase
      .from('lead_activities')
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
