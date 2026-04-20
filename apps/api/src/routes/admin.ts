/**
 * Admin Routes
 * Protected by x-admin-key header (ADMIN_API_KEY env var).
 * NOT under authMiddleware — admin key is the sole auth mechanism.
 */
import { Hono } from 'hono';
import { supabaseAdmin } from '../db';
import { buildGmbUrl } from '../lib/gmb-urls';

const router = new Hono();

// ── Admin key guard (applied to all /admin/* routes) ──────────────────────────
router.use('*', async (c, next) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return c.json({ error: 'Admin endpoints disabled (no ADMIN_API_KEY configured)' }, 503);
  const provided = c.req.header('x-admin-key');
  if (provided !== adminKey) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

// POST /admin/backfill-gmb-urls
router.post('/backfill-gmb-urls', async (c) => {
  try {
    const { data: leads } = await supabaseAdmin.from('leads').select('id, place_id, business_name, address, gmb_url');
    if (!leads) return c.json({ error: 'No leads' }, 404);
    let updated = 0, skipped = 0, fallbackUsed = 0;
    for (const lead of leads) {
      if (lead.gmb_url) { skipped++; continue; }
      const url = buildGmbUrl(lead);
      await supabaseAdmin.from('leads').update({ gmb_url: url }).eq('id', lead.id);
      updated++;
      if (!lead.place_id) fallbackUsed++;
    }
    return c.json({ updated, skipped, fallback_used: fallbackUsed });
  } catch (err: any) {
    return c.json({ error: 'Backfill failed', details: err.message }, 500);
  }
});

export default router;
