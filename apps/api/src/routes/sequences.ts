import { Hono } from 'hono';
import { z } from 'zod';
import { supabase, safeParseJson, createActivity } from '../db';

const router = new Hono();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const sequenceStepSchema = z.object({
  subject_template: z.string().min(1),
  body_template: z.string().min(1),
  delay_days: z.number().int().min(0).default(1),
  step_order: z.number().int().min(1),
});

const createSequenceSchema = z.object({
  name: z.string().min(1),
  status: z.string().default('draft'),
  steps: z.array(sequenceStepSchema).optional(),
  leads_count: z.number().int().min(0).default(0),
});

// ─── GET /sequences ──────────────────────────────────────────────────────────

router.get('/', async (c) => {
  try {
    // Get all sequences
    const { data: sequences, error } = await supabase
      .from('sequences')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch steps for each sequence and attach them
    const sequencesWithSteps = await Promise.all(
      (sequences ?? []).map(async (seq) => {
        const { data: steps } = await supabase
          .from('sequence_steps')
          .select('*')
          .eq('sequence_id', seq.id)
          .order('step_order', { ascending: true });

        return {
          ...seq,
          steps: (steps ?? []).map((s) => ({
            id: s.id,
            subject_template: s.subject_template,
            body_template: s.body_template,
            delay_days: s.delay_days ?? 1,
            step_order: s.step_order,
          })),
        };
      })
    );

    return c.json(sequencesWithSteps);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Sequences GET /] Error:', message);
    return c.json({ error: 'Failed to fetch sequences', details: message }, 500);
  }
});

// ─── POST /sequences ─────────────────────────────────────────────────────────

router.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createSequenceSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { name, status, steps: stepData, leads_count } = parsed.data;

    // Insert sequence
    const { data: seqData, error } = await supabase
      .from('sequences')
      .insert({
        name,
        status: status ?? 'draft',
        leads_count: leads_count ?? 0,
        steps: stepData?.length ?? 1,
      })
      .select('id')
      .single();

    if (error) throw error;
    if (!seqData) throw new Error('Failed to create sequence');

    const sequenceId = (seqData as { id: string }).id;

    // Insert steps if provided
    if (stepData && stepData.length > 0) {
      const stepRows = stepData.map((step) => ({
        sequence_id: sequenceId,
        subject_template: step.subject_template,
        body_template: step.body_template,
        delay_days: step.delay_days ?? 1,
        step_order: step.step_order,
      }));

      const { error: stepsError } = await supabase.from('sequence_steps').insert(stepRows);
      if (stepsError) throw stepsError;
    }

    return c.json({ id: sequenceId }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Sequences POST /] Error:', message);
    return c.json({ error: 'Failed to create sequence', details: message }, 500);
  }
});

// ─── GET /sequences/:id ──────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const { data: sequence, error } = await supabase
      .from('sequences')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !sequence) {
      return c.json({ error: 'Sequence not found' }, 404);
    }

    // Fetch steps
    const { data: steps } = await supabase
      .from('sequence_steps')
      .select('*')
      .eq('sequence_id', id)
      .order('step_order', { ascending: true });

    return c.json({
      ...sequence,
      steps: (steps ?? []).map((s) => ({
        id: s.id,
        subject_template: s.subject_template,
        body_template: s.body_template,
        delay_days: s.delay_days ?? 1,
        step_order: s.step_order,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Sequences GET /:id] Error:', message);
    return c.json({ error: 'Failed to fetch sequence', details: message }, 500);
  }
});

// ─── DELETE /sequences/:id ───────────────────────────────────────────────────

router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const { data, error } = await supabase
      .from('sequences')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;

    if (!data || data.length === 0) {
      return c.json({ error: 'Sequence not found' }, 404);
    }

    return c.json({ message: 'Sequence deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Sequences DELETE /:id] Error:', message);
    return c.json({ error: 'Failed to delete sequence', details: message }, 500);
  }
});

export default router;
