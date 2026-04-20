import { Hono } from 'hono';
import { z } from 'zod';
import { leadStatusSchema } from '@leadgen/shared';
import { getUserId, getLeadById, updateLead, createActivity, getActivitiesForLead } from '../db';

const router = new Hono();

const statusUpdateSchema = z.object({
  status: leadStatusSchema,
  notes: z.string().optional(),
});

// ─── POST /pipeline/:id/status ───────────────────────────────────────────────

router.post('/:id/status', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = statusUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const existing = await getLeadById(userId, id);
    if (!existing) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    const { status, notes } = parsed.data;
    const now = new Date().toISOString();

    // Phase 3: Map legacy status to the correct domain column(s)
    const ENGAGEMENT_STATUSES = ['new', 'contacted', 'replied', 'interested', 'not_interested', 'out_of_office'];
    const PIPELINE_STAGES = ['qualified', 'proposal_sent', 'converted', 'lost'];
    const LIFECYCLE_STATES = ['active', 'closed', 'archived'];

    const updateData: Record<string, unknown> = {
      status,    // legacy column — still written during dual-write
      updated_at: now,
    };

    // Dual-write: route the value to the correct domain column
    if (ENGAGEMENT_STATUSES.includes(status)) {
      updateData.engagement_status = status;
    } else if (PIPELINE_STAGES.includes(status)) {
      updateData.pipeline_stage = status;
    } else if (LIFECYCLE_STATES.includes(status)) {
      updateData.lifecycle_state = status;
    }
    // 'do_not_contact' is handled by the do_not_contact boolean — not set here

    // last_contacted only triggers on engagement events, NOT pipeline stages
    if (status === 'contacted') {
      updateData.last_contacted = now;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await updateLead(userId, id, updateData);

    // Determine which domain field changed for field-aware activity label
    let activityField = 'engagement_status';
    if (PIPELINE_STAGES.includes(status)) activityField = 'pipeline_stage';
    else if (LIFECYCLE_STATES.includes(status)) activityField = 'lifecycle_state';

    await createActivity(userId, {
      lead_id: id,
      type: 'status_changed',
      description: `Status changed to: ${status}${notes ? ` - ${notes}` : ''}`,
      field: activityField,
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
    const userId = getUserId(c);
    const id = c.req.param('id');

    const existing = await getLeadById(userId, id);
    if (!existing) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    const activities = await getActivitiesForLead(userId, id);

    return c.json({ lead_id: id, activities });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Pipeline GET /:id/activity] Error:', message);
    return c.json({ error: 'Failed to fetch activities', details: message }, 500);
  }
});

export default router;
