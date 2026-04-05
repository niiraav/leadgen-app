import { Hono } from 'hono';
import { z } from 'zod';
import { z as zod } from 'zod';
import {
  getUserId,
  supabaseAdmin,
} from '../db';

const router = new Hono();

// ─── GET /sequences ─────────────────────────────────────────────────────
router.get('/', async (c) => {
  try {
    const userId = getUserId(c);
    const { data, error } = await supabaseAdmin
      .from('sequences')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return c.json(data ?? []);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch sequences', details: err.message }, 500);
  }
});

// ─── POST /sequences ────────────────────────────────────────────────────
const sequenceSchema = z.object({
  name: z.string().min(1),
  steps: z.number().min(1).default(1),
});

router.post('/', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = sequenceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from('sequences')
      .insert({
        user_id: userId,
        name: parsed.data.name,
        steps: parsed.data.steps,
        status: 'draft',
        leads_count: 0,
        sent_count: 0,
        reply_count: 0,
      })
      .select('id')
      .single();

    if (error) throw error;
    return c.json({ id: (data as any).id }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create sequence', details: err.message }, 500);
  }
});

export default router;
