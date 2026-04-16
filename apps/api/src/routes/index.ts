import { Hono } from 'hono';
import leadsRouter from './leads';
import searchRouter from './search';
import aiEmailRouter from './ai-email';
import pipelineRouter from './pipeline';
import sequencesRouter from './sequences';
import importRouter from './import';
import listsRouter from './lists';
import savedFiltersRouter from './saved-filters';
import profileRouter from './profile';
import billingRouter from './billing';
import analyticsRouter from './analytics';
import deadLeadsRouter from './dead-leads';
import enrichmentRouter from './enrichment';
import repliesRouter from './replies';
import notificationsRouter from './notifications';
import reviewsRouter from './reviews';

const app = new Hono();

// Mount route modules
app.route('/', listsRouter);
app.route('/', savedFiltersRouter);
app.route('/leads', leadsRouter);
app.route('/search', searchRouter);
app.route('/leads', aiEmailRouter);
app.route('/pipeline', pipelineRouter);
app.route('/sequences', sequencesRouter);
app.route('/import', importRouter);
app.route('/profile', profileRouter);
app.route('/billing', billingRouter);
app.route('/analytics', analyticsRouter);
app.route('/dead-leads', deadLeadsRouter);
app.route('/enrichment', enrichmentRouter);
app.route('/leads', reviewsRouter);
app.route('/', repliesRouter);
app.route('/notifications', notificationsRouter);

// Root — basic info so hitting port directly doesn't 404
app.get('/', (c) => c.json({ name: 'LeadGen API', status: 'ok', version: '0.1.0' }));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default app;
