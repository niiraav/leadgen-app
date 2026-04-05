// Load .env file
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import app from './routes/index';

const PORT = parseInt(process.env.PORT || '3002', 10);
const HOST = process.env.HOST || '0.0.0.0';

// CORS middleware
app.use('/*', cors({
  origin: process.env.CORS_ORIGIN || '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Error handler
app.onError((err, c) => {
  console.error('[API] Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Not found handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
}, (info) => {
  console.log(`[LeadGen API] Listening on http://${HOST}:${info.port}`);
});

export default app;
