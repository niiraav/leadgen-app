import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../drizzle';
import { leads, leadActivities } from '../db/schema';

const router = new Hono();

const statusUpdateSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'proposal_sent', 'converted', 'lost', 'archived']),
  notes: z.string().optional(),
});

// ─── POST /pipeline/:id/status ───────────────────────────────────────────────

router.post('/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = statusUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: 'Lead not found' }, 404);
  }

  const { status, notes } = parsed.data;
  const now = new Date().toISOString();

  const updateData: Record<string, any> = {
    status,
    updatedAt: now,
  };

  // Auto-set last_contacted when moving to 'contacted' or beyond
  if (['contacted', 'qualified', 'proposal_sent', 'converted'].includes(status)) {
    updateData.lastContacted = now;
  }

  if (notes !== undefined) {
    updateData.notes = notes;
  }

  await db.update(leads).set(updateData).where(eq(leads.id, id));

  // Log activity
  await db.insert(leadActivities).values({
    id: uuidv4(),
    leadId: id,
    type: 'status_change',
    description: `Status changed to: ${status}${notes ? ` - ${notes}` : ''}`,
    createdAt: now,
  });

  return c.json({ message: 'Status updated', lead_id: id, status });
});

// ─── GET /pipeline/:id/activity ──────────────────────────────────────────────

router.get('/:id/activity', async (c) => {
  const id = c.req.param('id');

  const existing = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (existing.length === 0) {
    return c.json({ error: 'Lead not found' }, 404);
  }

  const activities = await db
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.leadId, id))
    .orderBy(leadActivities.createdAt);

  return c.json({ lead_id: id, activities });
});

export default router;
