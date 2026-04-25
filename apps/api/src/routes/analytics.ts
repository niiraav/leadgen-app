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

// ─── GET /analytics/pipeline-health ─────────────────────────────────────

router.get('/pipeline-health', async (c) => {
  try {
    const userId = getUserId(c);

    const now = new Date();
    const todayIso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const weekStart = new Date(Date.now() - 6 * 86400000);
    weekStart.setHours(0, 0, 0, 0);
    const staleCutoff = new Date(Date.now() - 14 * 86400000).toISOString();

    // Parallel counts — corrected per v3.4 PRD
    const [
      { count: totalLeads },
      { count: uncontactedCount },
      { count: activeSequences },
      { count: wonThisMonth },
      { count: committedLeads },
      { count: overdueFollowUps },
      { data: pipelineValues },
      { count: staleCountUpdated },
      { count: staleCountNull },
      { count: proposalsOutCount },
      { data: proposalsOutValues },
      { data: wonThisMonthValues },
      { count: repliesThisWeek },
    ] = await Promise.all([
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'new').lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
      supabaseAdmin.from('sequence_enrollments').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('pipeline_stage', 'converted').gte('converted_at', monthStart),
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('pipeline_stage', ['proposal_sent', 'interested', 'qualified']),
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('follow_up_date', 'is', null).lte('follow_up_date', todayIso).not('pipeline_stage', 'in', '(won,lost)'),
      supabaseAdmin.from('leads').select('deal_value').eq('user_id', userId).not('deal_value', 'is', null).not('pipeline_stage', 'in', '(won,lost)'),
      // Stale: updated_at older than 14 days (not won/lost)
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('pipeline_stage', 'in', '(won,lost)').lt('updated_at', staleCutoff),
      // Stale: never updated but created > 14 days ago
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('pipeline_stage', 'in', '(won,lost)').is('updated_at', null).lt('created_at', staleCutoff),
      // Proposals out count
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('pipeline_stage', 'proposal_sent'),
      // Proposals out value
      supabaseAdmin.from('leads').select('deal_value').eq('user_id', userId).eq('pipeline_stage', 'proposal_sent').not('deal_value', 'is', null),
      // Won this month value
      supabaseAdmin.from('leads').select('deal_value').eq('user_id', userId).eq('pipeline_stage', 'converted').gte('converted_at', monthStart).not('deal_value', 'is', null),
      // Replies this week
      supabaseAdmin.from('reply_events').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('received_at', weekStart.toISOString()),
    ]);

    const totalPipelineValue = (pipelineValues || []).reduce((sum: number, l: any) => sum + (l.deal_value || 0), 0);
    const avgDealSize = pipelineValues && pipelineValues.length > 0 ? Math.round(totalPipelineValue / pipelineValues.length) : 0;
    const conversionRate = totalLeads && totalLeads > 0 ? ((wonThisMonth ?? 0) / totalLeads * 100) : 0;
    const staleCount = (staleCountUpdated ?? 0) + (staleCountNull ?? 0);
    const proposalsOutValue = (proposalsOutValues || []).reduce((sum: number, l: any) => sum + (l.deal_value || 0), 0);
    const wonThisMonthValue = (wonThisMonthValues || []).reduce((sum: number, l: any) => sum + (l.deal_value || 0), 0);

    let score = 100;
    score -= Math.min((staleCount) * 2, 30);
    score -= Math.min((uncontactedCount ?? 0) * 3, 20);
    score += Math.min((activeSequences ?? 0) * 5, 20);

    const insights: string[] = [];
    if (overdueFollowUps && overdueFollowUps > 0) insights.push(`${overdueFollowUps} follow-ups are overdue today`);
    if (uncontactedCount && uncontactedCount > 0) insights.push(`${uncontactedCount} leads are awaiting initial contact`);
    if (conversionRate > 0) insights.push(`Your win rate this month is ${conversionRate.toFixed(1)}%`);
    if (insights.length === 0) insights.push('Your pipeline looks healthy — keep it up!');

    return c.json({
      health_score: Math.max(0, Math.min(100, score)),
      stale_count: staleCount,
      uncontacted_count: uncontactedCount ?? 0,
      active_sequences: activeSequences ?? 0,
      won_this_month: wonThisMonth ?? 0,
      conversion_rate: parseFloat(conversionRate.toFixed(1)),
      total_pipeline_value: totalPipelineValue,
      avg_deal_size: avgDealSize,
      overdue_follow_ups: overdueFollowUps ?? 0,
      committed_leads: committedLeads ?? 0,
      proposals_out_count: proposalsOutCount ?? 0,
      proposals_out_value: proposalsOutValue,
      won_this_month_value: wonThisMonthValue,
      replies_this_week: repliesThisWeek ?? 0,
      insights,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to compute health', details: err.message }, 500);
  }
});

export default router;
