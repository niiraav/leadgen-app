/**
 * Migration runner for Message Templates + Message Sends tables.
 * 
 * USAGE: Provide your Supabase DB password as an argument:
 *   node run-migration-016.js <your-db-password>
 * 
 * You can find your DB password in Supabase Dashboard > Settings > Database > Database password
 * 
 * Or just run the SQL manually in the Supabase Dashboard SQL Editor:
 *   https://supabase.com/dashboard/project/cpcdtotlfsjgoncfhyks/sql/new
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_PASSWORD = process.argv[2];
if (!DB_PASSWORD) {
  console.error('Usage: node run-migration-016.js <db-password>');
  console.error('Get your DB password from: https://supabase.com/dashboard/project/cpcdtotlfsjgoncfhyks/settings/database');
  process.exit(1);
}

const PROJECT_REF = 'cpcdtotlfsjgoncfhyks';

async function run() {
  const pool = new Pool({
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '016_message_templates_and_sends.sql'),
    'utf8'
  );

  console.log('Running migration 016_message_templates_and_sends...');
  
  try {
    await pool.query(sql);
    console.log('✅ Migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
