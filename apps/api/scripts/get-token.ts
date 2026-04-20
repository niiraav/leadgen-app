import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });
import { createClient } from '@supabase/supabase-js';

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
if (!anonKey) { console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL || '', anonKey);

sb.auth.signInWithPassword({
  email: 'smoke-2026@leadgenapp.com',
  password: 'Sm0keTest!2026',
}).then(({ data, error }) => {
  if (error) { console.error(error.message); process.exit(1); }
  const token = data.session?.access_token;
  if (token) process.stdout.write(token);
  else { console.error('No token'); process.exit(1); }
}).catch(e => { console.error(e.message); process.exit(1); });
