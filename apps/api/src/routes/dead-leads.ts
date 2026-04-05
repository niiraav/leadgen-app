import { Hono } from 'hono';
import { getUserId, supabaseAdmin } from '../db';

const router = new Hono();

// ─── GET /dead-leads/prompts ─────────────────────────────────────────────────

router.get('/prompts', async (c) => {
  try {
    const userId = getUserId(c);

    // Get dead_lead_prompt activities for this user
    const { data: activities } = await supabaseAdmin
      .from('lead_activities')
      .select('id, lead_id, type, description, created_at')
      .eq('user_id', userId)
      .eq('type', 'dead_lead_prompt')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!activities || activities.length === 0) {
      return c.json([]);
    }

    // Fetch the leads for these activities
    const leadIds = activities.map((a) => a.lead_id);
    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, city, email, status')
      .in('id', leadIds)
      .eq('user_id', userId);

    const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));

    const filtered = activities
      .filter((a) => {
        const lead = leadMap.get(a.lead_id);
        return lead && ['new', 'contacted'].includes(lead.status);
      })
      .map((a) => ({
        id: a.id,
        lead_id: a.lead_id,
        description: a.description,
        created_at: a.created_at,
        lead: leadMap.get(a.lead_id),
      }));

    return c.json(filtered);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch dead lead prompts', details: err.message }, 500);
  }
});

export default router;
