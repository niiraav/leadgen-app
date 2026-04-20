import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

async function run() {
  const resp = await fetch(process.env.SUPABASE_URL! + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'smoke-2026@leadgenapp.com',
      password: 'Sm0keTest!2026',
    }),
  });
  const result = await resp.json();
  if (result.access_token) {
    process.stdout.write(result.access_token);
  } else {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
}
run().catch(e => { console.error(e.message); process.exit(1); });
