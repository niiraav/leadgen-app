import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId, supabaseAdmin } from '../db';

const router = new Hono();

const reorderSchema = z.object({
  lead_id: z.string().uuid(),
  column_id: z.string().min(1),
  prev_lead_id: z.string().uuid().nullable().optional(),
  next_lead_id: z.string().uuid().nullable().optional(),
});

// ─── GET /board/positions ────────────────────────────────────────────────────

router.get('/positions', async (c) => {
  try {
    const userId = getUserId(c);

    const { data, error } = await supabaseAdmin
      .from('lead_board_positions')
      .select('lead_id, column_id, position')
      .eq('user_id', userId);

    if (error) throw error;

    const positions: Record<string, { lead_id: string; position: number }[]> = {};
    for (const row of (data ?? []) as any[]) {
      const col = row.column_id;
      if (!positions[col]) positions[col] = [];
      positions[col].push({ lead_id: row.lead_id, position: row.position });
    }

    // Sort each column's positions ascending
    for (const col of Object.keys(positions)) {
      positions[col].sort((a, b) => a.position - b.position);
    }

    return c.json({ positions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Board GET /positions] Error:', message);
    return c.json({ error: 'Failed to fetch board positions', details: message }, 500);
  }
});

// ─── POST /board/reorder ────────────────────────────────────────────────────

router.post('/reorder', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = reorderSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { lead_id, column_id, prev_lead_id } = parsed.data;

    // Fetch all position rows for this user + column, ordered by position ASC
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from('lead_board_positions')
      .select('id, lead_id, position')
      .eq('user_id', userId)
      .eq('column_id', column_id)
      .order('position', { ascending: true });

    if (fetchError) throw fetchError;

    const columnRows = (rows ?? []).map((r: any) => ({
      id: r.id,
      leadId: r.lead_id,
      position: r.position,
    }));

    // Splice the moved lead from its old position into the new position
    const movedIdx = columnRows.findIndex((r) => r.leadId === lead_id);

    // Cross-column move: lead doesn't exist in target column yet, nothing to splice out
    const movedRow = movedIdx !== -1
      ? columnRows.splice(movedIdx, 1)[0]
      : { leadId: lead_id, position: 0, id: '' }; // placeholder

    // Compute target index: after prev_lead_id, or at top if null
    const targetIdx = prev_lead_id
      ? columnRows.findIndex((r) => r.leadId === prev_lead_id) + 1
      : 0;
    columnRows.splice(targetIdx, 0, movedRow);

    // Check gap at the target index
    const prevPos = columnRows[targetIdx - 1]?.position ?? -1000;
    const nextPos = columnRows[targetIdx + 1]?.position ?? (columnRows.length + 1) * 1000;
    const gap = nextPos - prevPos;

    let finalPosition: number;

    if (gap < 0.001) {
      // Rebalance: rewrite all positions as 0, 1000, 2000...
      for (let i = 0; i < columnRows.length; i++) {
        const row = columnRows[i];
        if (!row.id) continue; // skip placeholder rows (cross-column moves)
        const { error: updErr } = await supabaseAdmin
          .from('lead_board_positions')
          .update({ position: i * 1000 })
          .eq('id', row.id);
        if (updErr) throw updErr;
      }
      finalPosition = targetIdx * 1000;
    } else {
      finalPosition = (prevPos + nextPos) / 2;
    }

    // Upsert the moved lead's position (its column may also have changed)
    const { error: upsertErr } = await supabaseAdmin
      .from('lead_board_positions')
      .upsert(
        {
          user_id: userId,
          lead_id: lead_id,
          column_id: column_id,
          position: finalPosition,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lead_id,column_id' }
      );

    if (upsertErr) throw upsertErr;

    return c.json({ success: true, position: finalPosition });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Board POST /reorder] Error:', message);
    return c.json({ error: 'Failed to reorder lead', details: message }, 500);
  }
});

export default router;
