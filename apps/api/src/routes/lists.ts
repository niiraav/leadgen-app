import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId, supabaseAdmin } from '../db';

const router = new Hono();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createListSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
});

const updateListSchema = createListSchema.partial();

const assignListSchema = z.object({
  list_id: z.string().uuid().nullable(),
});

const bulkListSchema = z.object({
  leadIds: z.array(z.string().uuid()),
  list_id: z.string().uuid().nullable(),
});

// ─── GET /lists ──────────────────────────────────────────────────────────────

router.get('/', async (c) => {
  try {
    const userId = getUserId(c);

    const { data: lists, error } = await supabaseAdmin
      .from('lead_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Attach lead count per list
    const listsWithCount = await Promise.all(
      (lists ?? []).map(async (list: any) => {
        const { count } = await supabaseAdmin
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('list_id', list.id);
        return { ...list, lead_count: count ?? 0 };
      })
    );

    return c.json(listsWithCount);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Lists GET /] Error:', message);
    return c.json({ error: 'Failed to fetch lists', details: message }, 500);
  }
});

// ─── POST /lists ─────────────────────────────────────────────────────────────

router.post('/', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = createListSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('lead_lists')
      .insert({
        user_id: userId,
        name: parsed.data.name,
        color: parsed.data.color,
      })
      .select()
      .single();

    if (error) throw error;

    return c.json(data, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Lists POST /] Error:', message);
    return c.json({ error: 'Failed to create list', details: message }, 500);
  }
});

// ─── PATCH /lists/:id ────────────────────────────────────────────────────────

router.patch('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateListSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    // Verify list belongs to user
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('lead_lists')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) {
      return c.json({ error: 'List not found' }, 404);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.color !== undefined) updateData.color = parsed.data.color;

    const { data, error } = await supabaseAdmin
      .from('lead_lists')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return c.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Lists PATCH /:id] Error:', message);
    return c.json({ error: 'Failed to update list', details: message }, 500);
  }
});

// ─── DELETE /lists/:id ───────────────────────────────────────────────────────

router.delete('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    // Verify list belongs to user
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('lead_lists')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) {
      return c.json({ error: 'List not found' }, 404);
    }

    // Unset list_id on all leads in this list instead of deleting them
    await supabaseAdmin
      .from('leads')
      .update({ list_id: null })
      .eq('list_id', id)
      .eq('user_id', userId);

    const { error } = await supabaseAdmin
      .from('lead_lists')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return c.json({ message: 'List deleted, leads unassigned' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Lists DELETE /:id] Error:', message);
    return c.json({ error: 'Failed to delete list', details: message }, 500);
  }
});

// ─── PATCH /leads/:id/list ───────────────────────────────────────────────────

router.patch('/leads/:id/list', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = assignListSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    // Verify lead belongs to user
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    // If assigning to a list, verify the list belongs to user
    if (parsed.data.list_id) {
      const { data: list } = await supabaseAdmin
        .from('lead_lists')
        .select('id')
        .eq('id', parsed.data.list_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!list) {
        return c.json({ error: 'List not found' }, 404);
      }
    }

    const { error } = await supabaseAdmin
      .from('leads')
      .update({ list_id: parsed.data.list_id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return c.json({ message: 'Lead list assignment updated' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Lists PATCH /leads/:id/list] Error:', message);
    return c.json({ error: 'Failed to update lead list', details: message }, 500);
  }
});

// ─── POST /leads/bulk-list ───────────────────────────────────────────────────

router.post('/leads/bulk-list', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = bulkListSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    // If assigning to a list, verify the list belongs to user
    if (parsed.data.list_id) {
      const { data: list } = await supabaseAdmin
        .from('lead_lists')
        .select('id')
        .eq('id', parsed.data.list_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!list) {
        return c.json({ error: 'List not found' }, 404);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({ list_id: parsed.data.list_id, updated_at: new Date().toISOString() })
      .in('id', parsed.data.leadIds)
      .eq('user_id', userId)
      .select('id');

    if (error) throw error;

    return c.json({
      message: `${(data ?? []).length} leads updated`,
      updated: (data ?? []).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Lists POST /leads/bulk-list] Error:', message);
    return c.json({ error: 'Failed to bulk assign leads', details: message }, 500);
  }
});

export default router;
