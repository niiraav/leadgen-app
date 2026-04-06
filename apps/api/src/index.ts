// Load .env file first
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './db';

const app = new Hono();

// CORS first
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Public routes
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Auth routes require JWT
app.use('/leads/*', authMiddleware);
app.use('/search/*', authMiddleware);
app.use('/pipeline/*', authMiddleware);
app.use('/sequences/*', authMiddleware);
app.use('/import/*', authMiddleware);
app.use('/kpi/*', authMiddleware);
app.use('/dead-leads/*', authMiddleware);
app.use('/analytics/*', authMiddleware);
app.use('/profile/*', authMiddleware);

// Mount route modules
import leadsRouter from './routes/leads';
import searchRouter from './routes/search';
import pipelineRouter from './routes/pipeline';
import sequencesRouter from './routes/sequences';
import importRouter from './routes/import';
import analyticsRouter from './routes/analytics';
import profileRouter from './routes/profile';
import enrichmentRouter from './routes/enrichment';

app.route('/leads', leadsRouter);
app.route('/search', searchRouter);
app.route('/pipeline', pipelineRouter);
app.route('/sequences', sequencesRouter);
app.route('/import', importRouter);
app.route('/analytics', analyticsRouter);
app.route('/profile', profileRouter);
app.route('/leads', enrichmentRouter);

// KPI endpoint
import { getKPI, getUserId } from './db';
app.get('/kpi', async (c) => {
  const userId = getUserId(c);
  const kpi = await getKPI(userId);
  return c.json(kpi);
});



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
