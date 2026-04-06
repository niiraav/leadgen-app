import { Hono } from 'hono';
import { getUserId, supabaseAdmin } from '../db';

const router = new Hono();

// ─── GET /analytics/dashboard ────────────────────────────────────────────────

router.get('/dashboard', async (c) => {
  try {
    const userId = getUserId(c);

    // KPIs
    const [{ count: totalLeads }, { count: contacted }, { count: replied }] = await Promise.all([
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'contacted'),
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['replied', 'interested']),
    ]);

    const { count: activeSequences } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    // Weekly leads (last 7 days, fill gaps with 0)
    const weekStart = new Date(Date.now() - 6 * 86400000);
    weekStart.setHours(0, 0, 0, 0);
    const { data: recentLeads } = await supabaseAdmin
      .from('leads')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', weekStart.toISOString());

    const countMap = new Map<string, number>();
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      countMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const lead of recentLeads || []) {
      const key = lead.created_at.slice(0, 10);
      if (countMap.has(key)) countMap.set(key, (countMap.get(key) || 0) + 1);
    }
    const weekly_leads = Array.from(countMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Pipeline funnel
    const { data: leadStatuses } = await supabaseAdmin
      .from('leads')
      .select('status')
      .eq('user_id', userId);

    const statusCount = new Map<string, number>();
    for (const l of leadStatuses || []) statusCount.set(l.status, (statusCount.get(l.status) || 0) + 1);

    const allStages = ['new', 'contacted', 'qualified', 'proposal_sent', 'replied', 'interested', 'won', 'lost', 'archived'];
    const pipeline_funnel = allStages
      .filter(s => statusCount.has(s))
      .map(status => ({ status, count: statusCount.get(status) || 0 }));

    // Top categories
    const { data: categoryData } = await supabaseAdmin
      .from('leads')
      .select('category')
      .eq('user_id', userId)
      .not('category', 'is', null);

    const catCount = new Map<string, number>();
    for (const l of categoryData || []) {
      const cat = (l.category || '').trim();
      if (cat) catCount.set(cat, (catCount.get(cat) || 0) + 1);
    }
    const top_categories = Array.from(catCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // Sequence stats
    const { data: enrollStats } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('status')
      .eq('user_id', userId);

    const enrollCount = new Map<string, number>();
    for (const e of enrollStats || []) enrollCount.set(e.status, (enrollCount.get(e.status) || 0) + 1);

    return c.json({
      kpis: { total_leads: totalLeads ?? 0, contacted: contacted ?? 0, replied: replied ?? 0, active_sequences: enrollCount.get('active') ?? 0 },
      weekly_leads,
      pipeline_funnel,
      top_categories,
      sequence_stats: { total_enrolled: enrollStats?.length ?? 0, completed: enrollCount.get('completed') ?? 0, replied: enrollCount.get('replied') ?? 0, dead_leads_pending: 0 },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch dashboard analytics', details: err.message }, 500);
  }
});

// ─── GET /analytics/dead-leads ───────────────────────────────────────────────

router.get('/dead-leads', async (c) => {
  try {
    const userId = getUserId(c);

    const { data: activities } = await supabaseAdmin
      .from('lead_activities')
      .select('id, lead_id, created_at, description')
      .eq('user_id', userId)
      .eq('type', 'dead_lead_prompt')
      .order('created_at', { ascending: false });

    if (!activities || activities.length === 0) return c.json({ leads: [] });

    const leadIds = activities.map((a: any) => a.lead_id);
    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, email, status')
      .in('id', leadIds)
      .eq('user_id', userId)
      .in('status', ['new', 'contacted', 'qualified']);

    if (!leads || leads.length === 0) return c.json({ leads: [] });

    const leadMap = new Map(leads.map((l: any) => [l.id, l]));

    const result = activities
      .filter((a: any) => leadMap.has(a.lead_id))
      .map((a: any) => ({
        id: leadMap.get(a.lead_id)!.id,
        business_name: leadMap.get(a.lead_id)!.business_name,
        email: leadMap.get(a.lead_id)!.email,
        status: leadMap.get(a.lead_id)!.status,
        activity_id: a.id,
        completed_at: a.created_at,
        sequence_name: 'Sequence',
      }));

    return c.json({ leads: result });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch dead leads', details: err.message }, 500);
  }
});

export default router;
