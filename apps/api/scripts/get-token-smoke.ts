import { createClient } from '@supabase/supabase-js';

const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwY2R0b3RsZnNqZ29uY2ZoeWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDEwMzEsImV4cCI6MjA5MDk3NzAzMX0.UnMTxed9Ns5OAEI3K_gAAurE26dERBQPVF-4Bq5bBpQ';
const sb = createClient('https://cpcdtotlfsjgoncfhyks.supabase.co', anonKey);

sb.auth.signInWithPassword({
  email: 'smoke-2026@leadgenapp.com',
  password: 'Sm0keTest!2026',
}).then(({ data, error }) => {
  if (error) { console.error(error.message); process.exit(1); }
  const token = data.session?.access_token;
  if (token) process.stdout.write(token);
  else { console.error('No token'); process.exit(1); }
}).catch(e => { console.error(e.message); process.exit(1); });
