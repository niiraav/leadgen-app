// Apply migration 025 via direct Postgres connection
// Uses the pg Pool with the Supabase pooler connection string
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.join(process.cwd(), '.env') });

import { Pool } from 'pg';

async function main() {
  // Try common pooler connection string patterns
  const projectRef = (process.env.SUPABASE_URL ?? '')
    .replace('https://', '')
    .replace('.supabase.co', '');

  const dbPassword = process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? '';
  
  if (!dbPassword) {
    console.log('No database password found in env (SUPABASE_DB_PASSWORD or POSTGRES_PASSWORD).');
    console.log('');
    console.log('To apply this migration, run the SQL below in the Supabase Dashboard SQL Editor:');
    console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql`);
    console.log('');
    console.log('--- BEGIN SQL ---');
    console.log('ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS field text;');
    console.log("ALTER TABLE lead_activities ADD CONSTRAINT lead_activities_field_check CHECK (field IS NULL OR field IN ('engagement_status', 'pipeline_stage', 'lifecycle_state', 'do_not_contact'));");
    console.log('--- END SQL ---');
    
    // Verify if column already exists
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.from('lead_activities').select('id, field').limit(1);
    if (!error) {
      console.log('\nColumn `field` already exists! Migration already applied.');
    } else {
      console.log('\nColumn `field` does NOT exist. Please apply manually.');
    }
    return;
  }

  const connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-[region].pooler.supabase.com:6543/postgres`;
  
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  
  try {
    await pool.query('ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS field text');
    console.log('Column `field` added.');
    
    // Add CHECK constraint (ignore error if already exists)
    try {
      await pool.query("ALTER TABLE lead_activities ADD CONSTRAINT lead_activities_field_check CHECK (field IS NULL OR field IN ('engagement_status', 'pipeline_stage', 'lifecycle_state', 'do_not_contact'))");
      console.log('CHECK constraint added.');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log('CHECK constraint already exists.');
      } else {
        console.log('CHECK constraint warning:', e.message);
      }
    }
    
    console.log('Migration 025 applied successfully!');
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
