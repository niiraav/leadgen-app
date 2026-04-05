import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, asc, like, or, and, count, lt, gt, gte, sql } from 'drizzle-orm';
import { db } from '../drizzle';
import { leads, leadActivities } from '../db/schema';
import type { Lead } from '../db/schema';

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
  rating: z.number().optional(),
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
  const query = c.req.query();
  const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
  const cursor = query.cursor;
  const sortField = query.sortField ?? 'created_at';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const status = query.status;
  const search = query.search;

  // Build conditions
  const conditions = [];

  if (status) {
    conditions.push(eq(leads.status, status));
  }

  if (search) {
    conditions.push(
      or(
        like(leads.businessName, `%${search}%`),
        like(leads.email, `%${search}%`),
        like(leads.city, `%${search}%`),
      )
    );
  }

  // Cursor condition
  if (cursor) {
    const cursorLead = await db.select().from(leads).where(eq(leads.id, cursor)).limit(1);
    if (cursorLead.length === 0) {
      return c.json({ error: 'Invalid cursor' }, 400);
    }
    const cursorValue = cursorLead[0][sortField as keyof Lead] as string | number;

    if (sortOrder === 'desc') {
      conditions.push(lt(leads[sortField as keyof Lead] as any, cursorValue));
    } else {
      conditions.push(gt(leads[sortField as keyof Lead] as any, cursorValue));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [{ total }] = await db.select({ total: count() }).from(leads).where(whereClause);

  // Fetch leads
  const orderBy = sortOrder === 'desc'
    ? desc(leads[sortField as keyof Lead] as any)
    : asc(leads[sortField as keyof Lead] as any);

  const results = await db
    .select()
    .from(leads)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const items = results.slice(0, limit);

  // Parse JSON/text fields
  const parsedItems = items.map((lead) => ({
    ...lead,
    readiness_flags: safeJsonParse(lead.readinessFlags, []),
    tags: safeJsonParse(lead.tags, []),
    metadata: safeJsonParse(lead.metadata, {}),
  }));

  const nextCursor = hasMore ? items[limit - 1].id : null;

  return c.json({
    data: parsedItems,
    pagination: {
      limit,
      hasMore,
      nextCursor,
      total,
    },
  });
});

// ─── GET /leads/:id ──────────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);

  if (result.length === 0) {
    return c.json({ error: 'Lead not found' }, 404);
  }

  const lead = result[0];
  return c.json({
    ...lead,
    readiness_flags: safeJsonParse(lead.readinessFlags, []),
    tags: safeJsonParse(lead.tags, []),
    metadata: safeJsonParse(lead.metadata, {}),
  });
});

// ─── POST /leads ─────────────────────────────────────────────────────────────

router.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createLeadSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;
  const now = new Date().toISOString();
  const id = uuidv4();

  await db.insert(leads).values({
    id,
    businessName: data.business_name,
    email: data.email || null,
    phone: data.phone || null,
    websiteUrl: data.website_url || null,
    address: data.address || null,
    city: data.city || null,
    country: data.country || null,
    category: data.category || null,
    rating: data.rating ?? null,
    reviewCount: data.review_count ?? 0,
    hotScore: data.hot_score ?? 0,
    readinessFlags: JSON.stringify(data.readiness_flags ?? []),
    status: data.status,
    source: data.source,
    notes: data.notes || null,
    tags: JSON.stringify(data.tags ?? []),
    metadata: JSON.stringify(data.metadata ?? {}),
    createdAt: now,
    updatedAt: now,
    lastContacted: null,
  });

  // Log activity
  await db.insert(leadActivities).values({
    id: uuidv4(),
    leadId: id,
    type: 'created',
    description: `Lead created via ${data.source}`,
    createdAt: now,
  });

  return c.json({ id, message: 'Lead created' }, 201);
});

// ─── PATCH /leads/:id ────────────────────────────────────────────────────────

router.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateLeadSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: 'Lead not found' }, 404);
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = { updatedAt: now };

  if (parsed.data.business_name !== undefined) updateData.businessName = parsed.data.business_name;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email || null;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone || null;
  if (parsed.data.website_url !== undefined) updateData.websiteUrl = parsed.data.website_url || null;
  if (parsed.data.address !== undefined) updateData.address = parsed.data.address || null;
  if (parsed.data.city !== undefined) updateData.city = parsed.data.city || null;
  if (parsed.data.country !== undefined) updateData.country = parsed.data.country || null;
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category || null;
  if (parsed.data.rating !== undefined) updateData.rating = parsed.data.rating;
  if (parsed.data.review_count !== undefined) updateData.reviewCount = parsed.data.review_count;
  if (parsed.data.hot_score !== undefined) updateData.hotScore = parsed.data.hot_score;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.source !== undefined) updateData.source = parsed.data.source;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes || null;
  if (parsed.data.readiness_flags !== undefined) updateData.readinessFlags = JSON.stringify(parsed.data.readiness_flags);
  if (parsed.data.tags !== undefined) updateData.tags = JSON.stringify(parsed.data.tags);
  if (parsed.data.metadata !== undefined) updateData.metadata = JSON.stringify(parsed.data.metadata);

  await db.update(leads).set(updateData).where(eq(leads.id, id));

  // Log activity
  await db.insert(leadActivities).values({
    id: uuidv4(),
    leadId: id,
    type: 'updated',
    description: `Lead updated: ${Object.keys(updateData).filter((k) => k !== 'updatedAt').join(', ')}`,
    createdAt: now,
  });

  return c.json({ message: 'Lead updated' });
});

// ─── DELETE /leads/:id ───────────────────────────────────────────────────────

router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.delete(leads).where(eq(leads.id, id));

  // drizzle sqlite returns changes object
  if (result && 'changes' in result && (result as any).changes === 0) {
    return c.json({ error: 'Lead not found' }, 404);
  }

  return c.json({ message: 'Lead deleted' });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeJsonParse(value: string | null | undefined, fallback: any) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default router;
