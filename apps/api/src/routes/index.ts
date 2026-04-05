import { Hono } from 'hono';
import leadsRouter from './leads';
import searchRouter from './search';
import aiEmailRouter from './ai-email';
import pipelineRouter from './pipeline';
import sequencesRouter from './sequences';
import importRouter from './import';

const app = new Hono();

// Mount route modules
app.route('/leads', leadsRouter);
app.route('/search', searchRouter);
app.route('/leads', aiEmailRouter);
app.route('/pipeline', pipelineRouter);
app.route('/sequences', sequencesRouter);
app.route('/import', importRouter);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default app;
