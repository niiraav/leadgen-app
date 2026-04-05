import { Hono } from 'hono';
import { z } from 'zod';
import {
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  createActivity,
  getLeads,
  batchCreateLeads,
  type JsonValue,
  getUserId,
} from '../db';

const router = new Hono();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createLeadSchema = z.object({
  business_name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  website_url: z.string().url().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  rating: z.number().nullable().optional(),
  review_count: z.number().optional(),
  hot_score: z.number().optional(),
  readiness_flags: z.array(z.string()).optional(),
  status: z.string().default('new'),
  source: z.string().default('manual'),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateLeadSchema = createLeadSchema.partial();

// ─── GET /leads - List with cursor pagination ────────────────────────────────

router.get('/', async (c) => {
  try {
    const userId = getUserId(c);
    const query = c.req.query();
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
    const cursor = query.cursor;
    const sortField = query.sortField ?? 'created_at';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const status = query.status;
    const search = query.search;

    const result = await getLeads(userId, {
      limit,
      cursor,
      sortField,
      sortOrder,
      status,
      search,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads GET /] Error:', message);
    return c.json({ error: 'Failed to fetch leads', details: message }, 500);
  }
});

// ─── GET /leads/:id ──────────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const lead = await getLeadById(userId, id);

    if (!lead) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    return c.json(lead);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads GET /:id] Error:', message);
    return c.json({ error: 'Failed to fetch lead', details: message }, 500);
  }
});

// ─── POST /leads ─────────────────────────────────────────────────────────────

router.post('/', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = createLeadSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const data = parsed.data;
    const result = await createLead(userId, {
      business_name: data.business_name,
      email: data.email || null,
      phone: data.phone || null,
      website_url: data.website_url || null,
      address: data.address || null,
      city: data.city || null,
      country: data.country || null,
      category: data.category || null,
      rating: data.rating ?? null,
      review_count: data.review_count ?? 0,
      hot_score: data.hot_score ?? 0,
      readiness_flags: data.readiness_flags ?? [],
      status: data.status,
      source: data.source,
      notes: data.notes || null,
      tags: data.tags ?? [],
      metadata: (data.metadata ?? {}) as Record<string, JsonValue>,
    });

    // Log activity
    await createActivity(userId, {
      lead_id: result.id,
      type: 'created',
      description: `Lead created via ${data.source}`,
    });

    return c.json({ id: result.id, message: 'Lead created' }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads POST /] Error:', message);
    return c.json({ error: 'Failed to create lead', details: message }, 500);
  }
});

// ─── PATCH /leads/:id ────────────────────────────────────────────────────────

router.patch('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateLeadSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const existing = await getLeadById(userId, id);
    if (!existing) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (parsed.data.business_name !== undefined) updateData.business_name = parsed.data.business_name;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email || null;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone || null;
    if (parsed.data.website_url !== undefined) updateData.website_url = parsed.data.website_url || null;
    if (parsed.data.address !== undefined) updateData.address = parsed.data.address || null;
    if (parsed.data.city !== undefined) updateData.city = parsed.data.city || null;
    if (parsed.data.country !== undefined) updateData.country = parsed.data.country || null;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category || null;
    if (parsed.data.rating !== undefined) updateData.rating = parsed.data.rating;
    if (parsed.data.review_count !== undefined) updateData.review_count = parsed.data.review_count;
    if (parsed.data.hot_score !== undefined) updateData.hot_score = parsed.data.hot_score;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.source !== undefined) updateData.source = parsed.data.source;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes || null;
    if (parsed.data.readiness_flags !== undefined) updateData.readiness_flags = parsed.data.readiness_flags;
    if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
    if (parsed.data.metadata !== undefined) updateData.metadata = parsed.data.metadata;

    await updateLead(userId, id, updateData);

    // Log activity
    const changedFields = Object.keys(updateData).filter((k) => k !== 'updated_at');
    await createActivity(userId, {
      lead_id: id,
      type: 'updated',
      description: `Lead updated: ${changedFields.join(', ')}`,
    });

    return c.json({ message: 'Lead updated' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads PATCH /:id] Error:', message);
    return c.json({ error: 'Failed to update lead', details: message }, 500);
  }
});

// ─── DELETE /leads/:id ───────────────────────────────────────────────────────

router.delete('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const deleted = await deleteLead(userId, id);

    if (!deleted) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    return c.json({ message: 'Lead deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads DELETE /:id] Error:', message);
    return c.json({ error: 'Failed to delete lead', details: message }, 500);
  }
});

// ─── POST /leads/batch ───────────────────────────────────────────────────────
// Used by the search page and CSV import to bulk-add leads

const batchLeadSchema = z.array(createLeadSchema);

router.post('/batch', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const leads = body.leads || body;
    
    if (!Array.isArray(leads)) {
      return c.json({ error: 'Expected array of leads or { leads: [...] }' }, 400);
    }

    let imported = 0;
    for (const raw of leads) {
      const parsed = createLeadSchema.safeParse(raw);
      if (!parsed.success) continue;
      
      const data = parsed.data;
      try {
        const result = await createLead(userId, {
          business_name: data.business_name,
          email: data.email || null,
          phone: data.phone || null,
          website_url: data.website_url || null,
          address: data.address || null,
          city: data.city || null,
          country: data.country || null,
          category: data.category || null,
          rating: data.rating ?? null,
          review_count: data.review_count ?? 0,
          hot_score: data.hot_score ?? 0,
          readiness_flags: data.readiness_flags ?? [],
          status: data.status,
          source: data.source,
          notes: data.notes || null,
          tags: data.tags ?? [],
          metadata: (data.metadata ?? {}) as Record<string, JsonValue>,
        });
        await createActivity(userId, {
          lead_id: result.id,
          type: 'created',
          description: `Lead created via ${data.source}`,
        });
        imported++;
      } catch (err) {
        console.warn('[Batch] Failed to insert lead:', err);
      }
    }

    return c.json({ imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads POST /batch] Error:', message);
    return c.json({ error: 'Batch create failed', details: message }, 500);
  }
});

export default router;
