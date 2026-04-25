import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId, supabaseAdmin, createActivity } from '../db';
import { schedulerQueue, deadLeadQueue } from '../services/sequence-scheduler';
import { enforceFeatureGate, enforceCredits, EnforcementError } from '../lib/billing/enforce';
import { incrementUsage } from '../lib/usage';

const router = new Hono();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const stepSchema = z.object({
  step_order: z.number().min(1),
  subject_template: z.string().min(1, 'Subject is required'),
  body_template: z.string().min(1, 'Body is required'),
  delay_days: z.number().min(0).default(0),
});

const createSequenceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  steps: z.array(stepSchema).min(1, 'At least one step is required'),
});

const updateSequenceSchema = z.object({
  name: z.string().optional(),
  status: z.enum(['active', 'paused', 'draft']).optional(),
});

const enrollSchema = z.object({
  lead_ids: z.array(z.string().uuid().or(z.string())).min(1, 'At least one lead ID required'),
});

// ─── GET /sequences ──────────────────────────────────────────────────────────

router.get('/', async (c) => {
  try {
    const userId = getUserId(c);

    const { data: sequences } = await supabaseAdmin
      .from('sequences')
      .select(`
        *,
        steps:sequence_steps(count),
        enrollments:sequence_enrollments(count)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const result = (sequences ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      step_count: s.steps?.[0]?.count ?? 0,
      enrolled_count: s.enrollments?.[0]?.count ?? 0,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));

    return c.json(result);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch sequences', details: err.message }, 500);
  }
});

// ─── GET /sequences/:id ──────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    const { data: sequence } = await supabaseAdmin
      .from('sequences')
      .select(`
        *,
        steps:sequence_steps(*),
        leads_count:sequence_enrollments(count)
      `)
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!sequence) {
      return c.json({ error: 'Sequence not found' }, 404);
    }

    return c.json({
      ...sequence,
      steps: (sequence.steps ?? []).sort((a: any, b: any) => a.step_order - b.step_order),
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch sequence', details: err.message }, 500);
  }
});

// ─── POST /sequences ─────────────────────────────────────────────────────────

router.post('/', async (c) => {
  try {
    const userId = getUserId(c);

    // ── Feature gate: sequences require growth plan ──
    const gate = await enforceFeatureGate(userId, 'sequences');
    if (!gate.allowed) {
      return c.json({ error: gate.upgradeRequired, upgrade_required: true }, 402);
    }

    const body = await c.req.json();
    const parsed = createSequenceSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { name, steps } = parsed.data;

    // Create sequence
    const { data: sequence, error: seqError } = await supabaseAdmin
      .from('sequences')
      .insert({
        user_id: userId,
        name,
        status: 'draft',
      })
      .select('id')
      .single();

    if (seqError) throw seqError;

    // Create steps
    if (steps.length > 0) {
      const stepsData = steps.map((s) => ({
        sequence_id: sequence.id,
        step_order: s.step_order,
        subject_template: s.subject_template,
        body_template: s.body_template,
        delay_days: s.delay_days,
      }));

      const { error: stepError } = await supabaseAdmin
        .from('sequence_steps')
        .insert(stepsData);

      if (stepError) throw stepError;
    }

    return c.json({ id: sequence.id }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create sequence', details: err.message }, 500);
  }
});

// ─── PATCH /sequences/:id ────────────────────────────────────────────────────

router.patch('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateSequenceSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { data: existing } = await supabaseAdmin
      .from('sequences')
      .select('id, status, steps:sequence_steps(count)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return c.json({ error: 'Sequence not found' }, 404);
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    // Guard: require at least 1 step to activate
    if (updates.status === 'active') {
      const stepCount = (existing as any).steps?.[0]?.count ?? 0;
      if (stepCount === 0) {
        return c.json({ error: 'Sequence must have at least one step to activate' }, 400);
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin
        .from('sequences')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
    }

    return c.json({ message: 'Sequence updated' });
  } catch (err: any) {
    return c.json({ error: 'Failed to update sequence', details: err.message }, 500);
  }
});

// ─── POST /sequences/:id/enroll ──────────────────────────────────────────────

router.post('/:id/enroll', async (c) => {
  try {
    const userId = getUserId(c);
    const sequenceId = c.req.param('id');

    // ── Feature gate: sequences require growth plan ──
    const gate = await enforceFeatureGate(userId, 'sequences');
    if (!gate.allowed) {
      return c.json({ error: gate.upgradeRequired, upgrade_required: true }, 402);
    }

    const body = await c.req.json();
    const parsed = enrollSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    // ── Credit enforcement: check sequence contact limit ──
    try {
      await enforceCredits(userId, 'sequence_contact', parsed.data.lead_ids.length);
    } catch (err) {
      if (err instanceof EnforcementError) {
        const status = err.upgradeRequired ? 402 : 403;
        return c.json({ error: err.message, upgrade_required: err.upgradeRequired, limit: err.limit, remaining: err.remaining }, status);
      }
      throw err;
    }

    // Verify sequence exists and is active
    const { data: sequence } = await supabaseAdmin
      .from('sequences')
      .select('id, status, steps:sequence_steps(count)')
      .eq('id', sequenceId)
      .eq('user_id', userId)
      .single();

    if (!sequence) {
      return c.json({ error: 'Sequence not found' }, 404);
    }

    if ((sequence as any).status === 'draft') {
      return c.json({ error: 'Sequence must be active before enrolling leads.' }, 400);
    }
    if ((sequence as any).status === 'paused') {
      return c.json({ error: 'Sequence is paused. Resume first.' }, 400);
    }

    const stepCount = (sequence as any).steps?.[0]?.count ?? 0;
    if (stepCount === 0) {
      return c.json({ error: 'Sequence has no steps.' }, 400);
    }

    let enrolled = 0;
    for (const leadId of parsed.data.lead_ids) {
      // Skip if already enrolled
      const { data: existing } = await supabaseAdmin
        .from('sequence_enrollments')
        .select('id')
        .eq('lead_id', leadId)
        .eq('sequence_id', sequenceId)
        .in('status', ['active', 'completed'])
        .maybeSingle();

      if (existing) continue;

      // Create enrollment
      const now = new Date().toISOString();
      const { data: enrollment } = await supabaseAdmin
        .from('sequence_enrollments')
        .insert({
          lead_id: leadId,
          sequence_id: sequenceId,
          user_id: userId,
          current_step: 1,
          status: 'active',
          enrolled_at: now,
          next_step_at: now,
        })
        .select('id')
        .single();

      if (enrollment && schedulerQueue) {
        // Queue first step (delay = 0, so immediate processing)
        await schedulerQueue.add(
          `${enrollment.id}-1`,
          { enrollment_id: enrollment.id, step_order: 1 },
          { delay: 0, jobId: `${enrollment.id}-1` }
        );
      }

      // Update lead status to 'sequence'
      await supabaseAdmin
        .from('leads')
        .update({ status: 'sequence' })
        .eq('id', leadId)
        .eq('user_id', userId);

      enrolled++;

      // Log activity
      await createActivity(userId, {
        lead_id: leadId,
        type: 'sequence_enrolled',
        description: 'Enrolled in sequence',
      });
    }

    // ── Increment usage for enrolled contacts ──
    if (enrolled > 0) {
      try { await incrementUsage(userId, 'leads_count', enrolled); } catch {}
    }

    return c.json({ enrolled });
  } catch (err: any) {
    return c.json({ error: 'Failed to enroll leads', details: err.message }, 500);
  }
});

// ─── POST /enrollments/:id/reply ─────────────────────────────────────────────

router.post('/enrollments/:id/reply', async (c) => {
  try {
    const userId = getUserId(c);
    const enrollmentId = c.req.param('id');

    const { data: enrollment } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!enrollment) {
      return c.json({ error: 'Enrollment not found' }, 404);
    }

    // Mark as replied
    await supabaseAdmin
      .from('sequence_enrollments')
      .update({ status: 'replied', completed_at: new Date().toISOString() })
      .eq('id', enrollmentId);

    if (schedulerQueue) {
      // Cancel any pending jobs for this enrollment
      const jobs = await schedulerQueue.getJobs(['delayed', 'waiting']);
      for (const job of jobs) {
        if (job.data?.enrollment_id === enrollmentId) {
          await job.remove();
        }
      }
    }

    await createActivity(userId, {
      lead_id: enrollment.lead_id,
      type: 'lead_replied',
      description: 'Lead replied — sequence paused',
    });

    return c.json({ message: 'Marked as replied' });
  } catch (err: any) {
    return c.json({ error: 'Failed to update enrollment', details: err.message }, 500);
  }
});

// ─── POST /sequences/:id/pause ───────────────────────────────────────────────

router.post('/:id/pause', async (c) => {
  try {
    const userId = getUserId(c);
    const sequenceId = c.req.param('id');

    await supabaseAdmin
      .from('sequences')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', sequenceId)
      .eq('user_id', userId);

    // Pause active enrollments
    await supabaseAdmin
      .from('sequence_enrollments')
      .update({ status: 'paused' })
      .eq('sequence_id', sequenceId)
      .in('status', ['active']);

    // Cancel pending jobs for THIS sequence only
    if (schedulerQueue) {
      // Look up enrollment IDs for this sequence so we only cancel matching jobs
      const { data: enrollments } = await supabaseAdmin
        .from('sequence_enrollments')
        .select('id')
        .eq('sequence_id', sequenceId);
      const enrollmentIds = new Set((enrollments ?? []).map((e: any) => e.id));

      if (enrollmentIds.size > 0) {
        const jobs = await schedulerQueue.getJobs(['delayed', 'waiting']);
        for (const job of jobs) {
          if (enrollmentIds.has(job.data?.enrollment_id)) {
            await job.remove();
          }
        }
      }
    }

    return c.json({ message: 'Sequence paused' });
  } catch (err: any) {
    return c.json({ error: 'Failed to pause sequence', details: err.message }, 500);
  }
});

// ─── POST /sequences/:id/resume ──────────────────────────────────────────────

router.post('/:id/resume', async (c) => {
  try {
    const userId = getUserId(c);
    const sequenceId = c.req.param('id');

    await supabaseAdmin
      .from('sequences')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', sequenceId)
      .eq('user_id', userId);

    // Resume paused enrollments
    const { data: pausedEnrollments } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('*')
      .eq('sequence_id', sequenceId)
      .eq('status', 'paused');

    for (const enrollment of pausedEnrollments ?? []) {
      await supabaseAdmin
        .from('sequence_enrollments')
        .update({ status: 'active' })
        .eq('id', enrollment.id);

      // Re-queue next step
      if (schedulerQueue) {
        const stepOrder = enrollment.current_step;
        // Fetch the step to get delay
        const { data: step } = await supabaseAdmin
          .from('sequence_steps')
          .select('*')
          .eq('sequence_id', sequenceId)
          .eq('step_order', stepOrder)
          .maybeSingle();

        const delayMs = step ? step.delay_days * 86400000 : 3600000;
        await schedulerQueue.add(
          `${enrollment.id}-${stepOrder}`,
          { enrollment_id: enrollment.id, step_order: stepOrder },
          { delay: Math.max(delayMs, 100), jobId: `${enrollment.id}-${stepOrder}` }
        );
      }
    }

    return c.json({ message: 'Sequence resumed' });
  } catch (err: any) {
    return c.json({ error: 'Failed to resume sequence', details: err.message }, 500);
  }
});


// ─── DELETE /sequences/:id ─────────────────────────────────────────────────

router.delete('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    // Delete enrollments first (cascade should handle steps)
    await supabaseAdmin.from('sequence_enrollments').delete().eq('sequence_id', id);
    await supabaseAdmin.from('sequence_steps').delete().eq('sequence_id', id);

    const { error } = await supabaseAdmin
      .from('sequences')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return c.json({ message: 'Sequence deleted' });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete sequence', details: err.message }, 500);
  }
});

export default router;
