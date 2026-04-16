import { Hono } from 'hono';
import { supabaseAdmin, getUserId } from '../db';

const router = new Hono();

/* ── helpers ────────────────────────────────────────────────────── */

function calcCompleteness(profile: Record<string, unknown>) {
  let score = 0;
  const missing: string[] = [];

  if (profile.full_name) score += 10;            else missing.push('Your full name');
  if (profile.company_name) score += 10;          else missing.push('Company name');
  if (profile.role) score += 10;                  else missing.push('Your role');
  const svcs = (profile.services as string[]) || [];
  if (svcs.length > 0) score += 15;              else missing.push('At least one service');
  if (profile.usp) score += 15;                  else missing.push('Your one-liner pitch');
  if (profile.tone) score += 10;                  else missing.push('Email tone');
  if (profile.target_geography) score += 10;      else missing.push('Target geography');
  const cats = (profile.target_categories as string[]) || [];
  if (cats.length > 0) score += 10;              else missing.push('Target business categories');
  score += 5;                                     // working hours always defaults
  if (profile.sales_cycle_days && (profile.sales_cycle_days as number) !== 14) score += 5;
  if (profile.cta_preference) score += 5;
  if (profile.signoff_style && (profile.signoff_style as string) !== 'Best regards') score += 5;

  return { score: Math.min(100, score), missing };
}

function isProfileComplete(profile: Record<string, unknown>): boolean {
  return !!(
    profile.full_name &&
    profile.company_name &&
    profile.role &&
    ((profile.services as string[]) ?? []).length > 0 &&
    profile.usp &&
    profile.tone
  );
}

/* ── GET /profile ───────────────────────────────────────────────── */

router.get('/', async (c) => {
  try {
    const userId = getUserId(c);
    const { data: profile, error } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single();
    if (error || !profile) return c.json({ error: 'Profile not found' }, 404);

    const { score, missing } = calcCompleteness(profile);
    (profile as any).profile_score = score;
    (profile as any).profile_complete = isProfileComplete(profile);

    return c.json(profile);
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch profile', details: err.message }, 500);
  }
});

/* ── PATCH /profile ─────────────────────────────────────────────── */

router.patch('/', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();

    const allowed = [
      'full_name','company_name','role','services','custom_services',
      'usp','tone','signoff_style','cta_preference','target_geography',
      'target_categories','working_days','working_hours_start','working_hours_end',
      'sales_cycle_days','onboarding_step','profile_complete',
      'average_deal_value','calendly_link','linkedin_url',
    ];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single();
    if (error || !profile) return c.json({ error: 'Profile not found' }, 404);

    // Merge defaults so completeness calc works
    const merged = { ...profile, ...updates };
    updates.profile_complete = isProfileComplete(merged);
    const { score } = calcCompleteness(merged);

    const { data: updated } = await supabaseAdmin
      .from('profiles').update(updates).eq('id', userId).select().single();

    (updated as any).profile_score = score;
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: 'Failed to update profile', details: err.message }, 500);
  }
});

/* ── GET /profile/completeness ──────────────────────────────────── */

router.get('/completeness', async (c) => {
  try {
    const userId = getUserId(c);
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single();
    if (!profile) return c.json({ error: 'Not found' }, 404);

    const { score, missing } = calcCompleteness(profile);

    // Determine the next prompt based on triggers
    const nextPrompt: unknown = null; // computed on frontend based on context

    return c.json({ score, missing, next_prompt: nextPrompt });
  } catch (err: any) {
    return c.json({ error: 'Failed', details: err.message }, 500);
  }
});

/* ── POST /profile/generate-usp ─────────────────────────────────── */

router.post('/generate-usp', async (c) => {
  try {
    const body = await c.req.json() as Record<string, unknown>;
    const { company_name, role, services = [], custom_services = [], tone, target_categories, target_geography } = body;

    // Map service keys to labels
    const SERVICE_LABELS: Record<string,string> = {
      website_design:'Website Design', seo:'SEO', social_media:'Social Media',
      paid_ads:'Paid Ads', branding:'Branding', email_marketing:'Email Marketing',
      photography:'Photography/Video', copywriting:'Copywriting', it_support:'IT Support',
      accounting:'Accounting', legal:'Legal', recruitment:'Recruitment',
      consulting:'Consulting', trades:'Trades/Construction', cleaning:'Cleaning',
    };
    const svcLabels = (services as string[]).map((k) => SERVICE_LABELS[k] || k);
    const allServices = [...svcLabels, ...(custom_services as string[])];

    const llmKey = process.env.FIREWORKS_API_KEY || process.env.OPENROUTER_API_KEY || '';
    const llmBase = process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1';
    const llmModel = process.env.FIREWORKS_MODEL || 'fireworks/minimax-m2p7';
    const systemMsg = `You are a sales copywriter. Write punchy one-liner pitches for sales professionals. Keep each under 20 words. Be specific, not vague. Never use words: 'leverage', 'synergy', 'empower', 'solutions', 'cutting-edge', 'best-in-class', 'holistic', 'seamless'. Return only valid JSON, no markdown.`;
    const userMsg = `Generate 3 different one-liner pitches for a ${role || 'sales professional'} at ${company_name || 'a company'} who sells: ${allServices.length > 0 ? allServices.join(', ') : 'services'}.
Tone: ${tone || 'professional'}.
Target clients: ${(target_categories as string[])?.length ? (target_categories as string[]).join(', ') : 'local businesses'}.
Location context: ${(target_geography as string) || 'UK'}.

Each pitch should take a different angle:
1. Lead with the problem they solve
2. Lead with the outcome/result
3. Lead with a specific, bold claim

Return JSON: {"pitches":["string","string","string"]}`;

    const resp = await fetch(llmBase + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${llmKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadgen.app',
        'X-Title': 'LeadGen App',
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return c.json({ error: 'OpenRouter failed', details: errText.slice(0, 200) }, 502 as any);
    }

    const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
    let content = data.choices?.[0]?.message?.content || '{}';
    // Strip markdown code fences
    content = content.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
    const result = JSON.parse(content) as { pitches: string[] };
    return c.json({ pitches: result.pitches || [] });
  } catch (err: any) {
    return c.json({ error: 'Failed to generate pitches', details: err.message }, 500);
  }
});

export default router;
