import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId, supabaseAdmin } from '../db';

const router = new Hono();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createFilterSchema = z.object({
  name: z.string().min(1),
  filters: z.record(z.unknown()),
});

// ─── GET /saved-filters ──────────────────────────────────────────────────────

router.get('/', async (c) => {
  try {
    const userId = getUserId(c);

    const { data, error } = await supabaseAdmin
      .from('saved_filters')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return c.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Saved Filters GET /] Error:', message);
    return c.json({ error: 'Failed to fetch saved filters', details: message }, 500);
  }
});

// ─── POST /saved-filters ─────────────────────────────────────────────────────

router.post('/', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = createFilterSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('saved_filters')
      .insert({
        user_id: userId,
        name: parsed.data.name,
        filters: parsed.data.filters,
      })
      .select()
      .single();

    if (error) throw error;

    return c.json(data, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Saved Filters POST /] Error:', message);
    return c.json({ error: 'Failed to save filter', details: message }, 500);
  }
});

// ─── DELETE /saved-filters/:id ───────────────────────────────────────────────

router.delete('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    const { error } = await supabaseAdmin
      .from('saved_filters')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return c.json({ message: 'Filter deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Saved Filters DELETE /:id] Error:', message);
    return c.json({ error: 'Failed to delete filter', details: message }, 500);
  }
});

export default router;
