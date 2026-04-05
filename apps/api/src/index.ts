// Load .env file first
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Create the main app and apply CORS BEFORE any routes
const app = new Hono();

// CORS middleware - applied FIRST, before all routes
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Mount route modules
import leadsRouter from './routes/leads';
import searchRouter from './routes/search';
import aiEmailRouter from './routes/ai-email';
import pipelineRouter from './routes/pipeline';
import sequencesRouter from './routes/sequences';
import importRouter from './routes/import';

app.route('/leads', leadsRouter);
app.route('/search', searchRouter);
app.route('/leads', aiEmailRouter);
app.route('/pipeline', pipelineRouter);
app.route('/sequences', sequencesRouter);
app.route('/import', importRouter);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Error handler
app.onError((err, c) => {
  console.error('[API] Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Not found handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
}, (info) => {
  console.log(`[LeadGen API] Listening on http://${HOST}:${info.port}`);
});

export default app;
