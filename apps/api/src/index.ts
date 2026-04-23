// Load .env file first
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { createServer } from 'node:http';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getRequestListener } from '@hono/node-server';
import { authMiddleware } from './db';
import { getOrCreateSocketServer } from './lib/socket';
import { initQueues, startSequenceWorker } from './services/sequence-scheduler';

const app = new Hono();

// CORS first
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use('*', cors({
  origin: CORS_ORIGIN,
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
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
app.use('/lists/*', authMiddleware);
app.use('/saved-filters/*', authMiddleware);
app.use('/replies/*', authMiddleware);
app.use('/message-picker/*', authMiddleware);
app.use('/notifications/*', authMiddleware);
app.use('/board/*', authMiddleware);

// Billing routes need auth EXCEPT the webhook (Stripe sends its own signature)
app.use('/billing/*', async (c, next) => {
  // Skip auth for the webhook endpoint — Stripe calls it directly
  if (c.req.path.endsWith('/billing/webhook')) {
    return next();
  }
  return authMiddleware(c, next);
});

// Mount route modules
import leadsRouter from './routes/leads';
import searchRouter from './routes/search';
import pipelineRouter from './routes/pipeline';
import sequencesRouter from './routes/sequences';
import importRouter from './routes/import';
import analyticsRouter from './routes/analytics';
import profileRouter from './routes/profile';
import enrichmentRouter from './routes/enrichment';
import billingRouter from './routes/billing';
import listsRouter from './routes/lists';
import savedFiltersRouter from './routes/saved-filters';
import adminRouter from './routes/admin';

app.route('/leads', enrichmentRouter);
app.route('/leads/lists', listsRouter);
app.route('/leads/saved-filters', savedFiltersRouter);
app.route('/leads', leadsRouter);
app.route('/search', searchRouter);
app.route('/pipeline', pipelineRouter);
app.route('/sequences', sequencesRouter);
app.route('/import', importRouter);
app.route('/analytics', analyticsRouter);
app.route('/profile', profileRouter);
app.route('/billing', billingRouter);

// Admin routes — NOT under authMiddleware; protected by x-admin-key header
app.route('/admin', adminRouter);

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

// ─── Inngest serve handler ───────────────────────────────────────────────
import { createInngestHandler } from './lib/inngest/functions';
app.all('/api/inngest/*', createInngestHandler());

// ─── Webhook routers ─────────────────────────────────────────────────────
import inboundReplyRouter from './routes/webhooks/inbound-reply';
app.route('/webhooks/inbound-reply', inboundReplyRouter);

import deadLeadsRouter from './routes/dead-leads';
import aiEmailRouter from './routes/ai-email';
import repliesRouter from './routes/replies';
import messagePickerRouter from './routes/message-picker';
import reviewsRouter from './routes/reviews';
import notificationsRouter from './routes/notifications';
app.route('/dead-leads', deadLeadsRouter);
import boardRouter   from './routes/board';

// ─── Mount routers ────────────────────────────────────────────────────────────
app.route('/leads',     leadsRouter);
app.route('/pipeline',  pipelineRouter);
app.route('/board',     boardRouter);
app.route('/dead-leads', deadLeadsRouter);
app.route('/leads',     aiEmailRouter);
app.route('/leads',     reviewsRouter);
app.route('/replies',   repliesRouter);
app.route('/message-picker', messagePickerRouter);
app.route('/notifications',  notificationsRouter);

// ─── Server startup ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Initialize BullMQ queues & workers
initQueues();
startSequenceWorker();

// Create the Node HTTP server, attach Socket.io, then listen
const server = createServer(getRequestListener(app.fetch));

// Attach Socket.io to the same HTTP server
getOrCreateSocketServer(server);

server.listen(PORT, HOST, () => {
  console.log(`[LeadGen API] Listening on http://${HOST}:${PORT}`);
});

export default app;
