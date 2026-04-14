import { Hono } from 'hono';
import { z } from 'zod';
import {
  createLead,
  batchCreateLeads,
  createActivity,
  getUserId,
  type JsonValue,
} from '../db';
import { enforceCredits, EnforcementError } from '../lib/billing/enforce';
import { incrementUsage } from '../lib/usage';

const router = new Hono();

// ─── POST /import/csv ────────────────────────────────────────────────────────

router.post('/csv', async (c) => {
  try {
    const userId = getUserId(c);
    const contentType = c.req.header('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      return c.json({ imported: 0, message: 'CSV file not yet implemented, use JSON body' });
    }

    const body = await c.req.json();
    const leads = (body.leads || body) as Record<string, unknown>[];

    if (!Array.isArray(leads)) {
      return c.json({ error: 'leads array is required' }, 400);
    }

    // ── Credit enforcement: check lead limit for batch import ──
    try {
      await enforceCredits(userId, 'lead', leads.length);
    } catch (err) {
      if (err instanceof EnforcementError) {
        const status = err.upgradeRequired ? 402 : 403;
        return c.json({ error: err.message, upgrade_required: err.upgradeRequired, limit: err.limit, remaining: err.remaining }, status);
      }
      throw err;
    }

    let imported = 0;
    for (const rawLead of leads) {
      const businessName =
        rawLead.business_name ||
        rawLead.businessName ||
        rawLead.name ||
        rawLead.company ||
        null;

      if (!businessName) continue;

      const email = rawLead.email ? String(rawLead.email) : null;
      const phone = rawLead.phone ? String(rawLead.phone) : null;
      const website = rawLead.website_url || rawLead.website_url ? String(rawLead.website_url) : null;
      const address = rawLead.address ? String(rawLead.address) : null;
      const city = rawLead.city ? String(rawLead.city) : null;
      const country = rawLead.country ? String(rawLead.country) : null;
      const category = rawLead.category ? String(rawLead.category) : null;
      const rating = rawLead.rating ? Number(rawLead.rating) : null;
      const reviewCount = rawLead.review_count ? Number(rawLead.review_count) : 0;

      try {
        const result = await createLead(userId, {
          business_name: String(businessName),
          email,
          phone,
          website_url: website,
          address,
          city,
          country,
          category,
          rating,
          review_count: reviewCount,
          hot_score: 0,
          readiness_flags: [],
          status: 'new',
          source: 'csv',
          notes: null,
          tags: [],
          metadata: {},
        });

        await createActivity(userId, {
          lead_id: result.id,
          type: 'imported',
          description: 'Lead imported via CSV',
        });

        imported++;
      } catch (err) {
        console.warn('[Import] Failed to insert lead:', err);
      }
    }

    // ── Increment usage for successfully imported leads ──
    if (imported > 0) {
      try { await incrementUsage(userId, 'leads_count', imported); } catch {}
    }

    return c.json({ imported }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Import] Error:', message);
    return c.json({ error: 'Import failed', details: message }, 500);
  }
});

export default router;
