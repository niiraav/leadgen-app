// One-shot migration script: applies 024_status_model_refactor.sql
// Usage: npx tsx scripts/apply-migration-024.ts
import { config } from 'dotenv';
import * as path from 'path';
config({ path: path.join(process.cwd(), '.env') });

import { Pool } from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Derive the Postgres connection string from the Supabase URL
// Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
// But we don't have the DB password in .env, so use the Supabase REST approach.
// Actually, let's use the pooler connection if available.
// Alternative: use the Supabase SQL API via REST.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Use Supabase RPC to execute raw SQL.
  // We need to call a function that runs our DDL.
  // Since there's no built-in exec_sql function, we'll apply via direct pg connection.
  
  // Try connecting via the Supabase pooler URL
  const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
  
  // Direct DB connection (password required — not in .env)
  // Fallback: use the Supabase Management API's /sql endpoint
  // That requires a personal access token though.
  
  console.log('Project ref:', projectRef);
  console.log('URL:', SUPABASE_URL);
  
  // Check if columns already exist
  const { data, error } = await supabase
    .from('leads')
    .select('id, engagement_status, pipeline_stage, lifecycle_state, do_not_contact')
    .limit(1);
  
  if (error) {
    console.log('Columns not yet present (expected):', error.message);
    console.log('');
    console.log('To apply this migration, run the SQL in Supabase Dashboard SQL Editor:');
    console.log(`  ${SUPABASE_URL}/project/${projectRef}/sql`);
    console.log('');
    console.log('Or use: psql with the direct connection string from Supabase Dashboard > Settings > Database');
  } else {
    console.log('Columns already exist! Migration 024 appears already applied.');
    console.log('Sample row:', JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
