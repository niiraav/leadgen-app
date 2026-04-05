import { Hono } from 'hono';
import { z } from 'zod';
import { getLeadById, updateLead, createActivity, getActivitiesForLead } from '../db';

const router = new Hono();

const statusUpdateSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'proposal_sent', 'converted', 'lost', 'archived']),
  notes: z.string().optional(),
});

// ─── POST /pipeline/:id/status ───────────────────────────────────────────────

router.post('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = statusUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const existing = await getLeadById(id);
    if (!existing) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    const { status, notes } = parsed.data;
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      status,
      updated_at: now,
    };

    // Auto-set last_contacted when moving to 'contacted' or beyond
    if (['contacted', 'qualified', 'proposal_sent', 'converted'].includes(status)) {
      updateData.last_contacted = now;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await updateLead(id, updateData);

    // Log activity
    await createActivity({
      lead_id: id,
      type: 'status_change',
      description: `Status changed to: ${status}${notes ? ` - ${notes}` : ''}`,
    });

    return c.json({ message: 'Status updated', lead_id: id, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Pipeline POST /:id/status] Error:', message);
    return c.json({ error: 'Failed to update status', details: message }, 500);
  }
});

// ─── GET /pipeline/:id/activity ──────────────────────────────────────────────

router.get('/:id/activity', async (c) => {
  try {
    const id = c.req.param('id');

    const existing = await getLeadById(id);
    if (!existing) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    const activities = await getActivitiesForLead(id);

    return c.json({ lead_id: id, activities });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Pipeline GET /:id/activity] Error:', message);
    return c.json({ error: 'Failed to fetch activities', details: message }, 500);
  }
});

export default router;
