import { Hono } from 'hono';
import { z } from 'zod';
import {
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  createActivity,
  getLeads,
  batchCreateLeads,
  type JsonValue,
  getUserId,
  supabaseAdmin,
} from '../db';

const router = new Hono();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createLeadSchema = z.object({
  business_name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  website_url: z.string().url().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  rating: z.number().nullable().optional(),
  review_count: z.number().optional(),
  hot_score: z.number().optional(),
  readiness_flags: z.array(z.string()).optional(),
  status: z.string().default('new'),
  source: z.string().default('manual'),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateLeadSchema = createLeadSchema.partial();

// ─── GET /leads - List with cursor pagination ────────────────────────────────

router.get('/', async (c) => {
  try {
    const userId = getUserId(c);
    const query = c.req.query();
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
    const cursor = query.cursor;
    const sortField = query.sortField ?? 'created_at';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const status = query.status;
    const search = query.search;

    const result = await getLeads(userId, {
      limit,
      cursor,
      sortField,
      sortOrder,
      status,
      search,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads GET /] Error:', message);
    return c.json({ error: 'Failed to fetch leads', details: message }, 500);
  }
});

// ─── GET /leads/:id ──────────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const lead = await getLeadById(userId, id);

    if (!lead) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    return c.json(lead);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads GET /:id] Error:', message);
    return c.json({ error: 'Failed to fetch lead', details: message }, 500);
  }
});

// ─── POST /leads ─────────────────────────────────────────────────────────────

router.post('/', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = createLeadSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const data = parsed.data;
    const result = await createLead(userId, {
      business_name: data.business_name,
      email: data.email || null,
      phone: data.phone || null,
      website_url: data.website_url || null,
      address: data.address || null,
      city: data.city || null,
      country: data.country || null,
      category: data.category || null,
      rating: data.rating ?? null,
      review_count: data.review_count ?? 0,
      hot_score: data.hot_score ?? 0,
      readiness_flags: data.readiness_flags ?? [],
      status: data.status,
      source: data.source,
      notes: data.notes || null,
      tags: data.tags ?? [],
      metadata: (data.metadata ?? {}) as Record<string, JsonValue>,
    });

    // Log activity
    await createActivity(userId, {
      lead_id: result.id,
      type: 'created',
      description: `Lead created via ${data.source}`,
    });

    return c.json({ id: result.id, message: 'Lead created' }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads POST /] Error:', message);
    return c.json({ error: 'Failed to create lead', details: message }, 500);
  }
});

// ─── PATCH /leads/:id ────────────────────────────────────────────────────────

router.patch('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateLeadSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const existing = await getLeadById(userId, id);
    if (!existing) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };

    if (parsed.data.business_name !== undefined) updateData.business_name = parsed.data.business_name;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email || null;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone || null;
    if (parsed.data.website_url !== undefined) updateData.website_url = parsed.data.website_url || null;
    if (parsed.data.address !== undefined) updateData.address = parsed.data.address || null;
    if (parsed.data.city !== undefined) updateData.city = parsed.data.city || null;
    if (parsed.data.country !== undefined) updateData.country = parsed.data.country || null;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category || null;
    if (parsed.data.rating !== undefined) updateData.rating = parsed.data.rating;
    if (parsed.data.review_count !== undefined) updateData.review_count = parsed.data.review_count;
    if (parsed.data.hot_score !== undefined) updateData.hot_score = parsed.data.hot_score;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.source !== undefined) updateData.source = parsed.data.source;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes || null;
    if (parsed.data.readiness_flags !== undefined) updateData.readiness_flags = parsed.data.readiness_flags;
    if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
    if (parsed.data.metadata !== undefined) updateData.metadata = parsed.data.metadata;

    await updateLead(userId, id, updateData);

    // Log activity
    const changedFields = Object.keys(updateData).filter((k) => k !== 'updated_at');
    await createActivity(userId, {
      lead_id: id,
      type: 'updated',
      description: `Lead updated: ${changedFields.join(', ')}`,
    });

    return c.json({ message: 'Lead updated' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads PATCH /:id] Error:', message);
    return c.json({ error: 'Failed to update lead', details: message }, 500);
  }
});

// ─── DELETE /leads/:id ───────────────────────────────────────────────────────

router.delete('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const deleted = await deleteLead(userId, id);

    if (!deleted) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    return c.json({ message: 'Lead deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads DELETE /:id] Error:', message);
    return c.json({ error: 'Failed to delete lead', details: message }, 500);
  }
});

// ─── POST /leads/batch ───────────────────────────────────────────────────────
// Used by the search page and CSV import to bulk-add leads

const batchLeadSchema = z.array(createLeadSchema);

router.post('/batch', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const leads = body.leads || body;
    
    if (!Array.isArray(leads)) {
      return c.json({ error: 'Expected array of leads or { leads: [...] }' }, 400);
    }

    let imported = 0;
    for (const raw of leads) {
      const parsed = createLeadSchema.safeParse(raw);
      if (!parsed.success) continue;
      
      const data = parsed.data;
      try {
        const result = await createLead(userId, {
          business_name: data.business_name,
          email: data.email || null,
          phone: data.phone || null,
          website_url: data.website_url || null,
          address: data.address || null,
          city: data.city || null,
          country: data.country || null,
          category: data.category || null,
          rating: data.rating ?? null,
          review_count: data.review_count ?? 0,
          hot_score: data.hot_score ?? 0,
          readiness_flags: data.readiness_flags ?? [],
          status: data.status,
          source: data.source,
          notes: data.notes || null,
          tags: data.tags ?? [],
          metadata: (data.metadata ?? {}) as Record<string, JsonValue>,
        });
        await createActivity(userId, {
          lead_id: result.id,
          type: 'created',
          description: `Lead created via ${data.source}`,
        });
        imported++;
      } catch (err) {
        console.warn('[Batch] Failed to insert lead:', err);
      }
    }

    return c.json({ imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Leads POST /batch] Error:', message);
    return c.json({ error: 'Batch create failed', details: message }, 500);
  }
});

// ─── POST /leads/:id/ai-email ─────────────────────────────────────────────
const aiEmailSchema = z.object({
  tone: z.enum(['professional', 'friendly', 'casual', 'persuasive']).default('professional'),
  purpose: z.string().min(1).max(200),
  customInstructions: z.string().max(500).optional(),
  recontact: z.boolean().optional(),
  profile_usp: z.string().optional(),
  profile_services: z.array(z.string()).optional(),
  profile_full_name: z.string().optional(),
  profile_signoff: z.string().optional(),
  profile_cta: z.string().optional(),
  profile_calendly: z.string().optional(),
  profile_linkedin: z.string().optional(),
  owner_first_name: z.string().optional(),
});

router.post('/:id/ai-email', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = aiEmailSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);
    const { generateEmailWithAI } = await import('../services/ai-email');
    const emailData = await generateEmailWithAI({
      lead: { business_name: lead.business_name, email: lead.email ?? undefined, phone: lead.phone ?? undefined, website_url: lead.website_url ?? undefined, category: lead.category ?? undefined, city: lead.city ?? undefined, country: lead.country ?? undefined, rating: lead.rating ?? undefined } as any,
      tone: parsed.data.tone, purpose: parsed.data.purpose, customInstructions: parsed.data.customInstructions, recontact: parsed.data.recontact,
      profile: {
        usp: parsed.data.profile_usp || null,
        services: parsed.data.profile_services || [],
        full_name: parsed.data.profile_full_name || null,
        signoff: parsed.data.profile_signoff || null,
        cta: parsed.data.profile_cta || null,
        calendly: parsed.data.profile_calendly || null,
        linkedin: parsed.data.profile_linkedin || null,
        owner_first_name: parsed.data.owner_first_name || null,
      } as any,
    });
    return c.json({ lead_id: id, email: emailData });
  } catch (e: any) { return c.json({ error: 'Failed to generate email', details: e.message }, 500); }
});

// ─── POST /leads/:id/classify-reply ────────────────────────────────────────
const classifySchema = z.object({ reply_text: z.string().min(1) });

router.post('/:id/classify-reply', async (c) => {
  try {
    const userId = getUserId(c); const id = c.req.param('id');
    const body = await c.req.json(); const parsed = classifySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed' }, 400);
    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);
    const { classifyReply } = await import('../services/ai-email');
    const { classification, reasoning } = await classifyReply(parsed.data.reply_text);
    const prevStatus = lead.status;
    let suggestedStage = 'replied', autoMoved = false, reEngageAfter: string | null = null;
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (classification === 'UNSUBSCRIBE') {
      updates.unsubscribed = true; suggestedStage = 'archived'; autoMoved = true;
      await supabaseAdmin.from('sequence_enrollments').update({ status: 'paused' }).eq('lead_id', id).eq('status', 'active');
    } else if (classification === 'NOT_NOW') {
      reEngageAfter = new Date(Date.now() + 60*86400000).toISOString(); updates.re_engage_after = reEngageAfter;
    } else if (classification === 'INTERESTED') { suggestedStage = 'interested'; if (prevStatus !== 'interested') autoMoved = true; }
    else if (classification === 'WARM') { suggestedStage = 'replied'; if (!['replied','interested'].includes(prevStatus)) autoMoved = true; }
    if (suggestedStage !== prevStatus && classification !== 'NOT_NOW') updates.status = suggestedStage;
    await supabaseAdmin.from('leads').update(updates).eq('id', id).eq('user_id', userId);
    await createActivity(userId, { lead_id: id, type: 'reply_classified', description: `Reply: ${classification}` });
    return c.json({ classification, suggested_stage: suggestedStage, reasoning, previous_status: prevStatus, auto_moved: autoMoved, re_engage_after: reEngageAfter });
  } catch (e: any) { return c.json({ error: 'Classify failed', details: e.message }, 500); }
});

// ─── POST /leads/:id/undo-status ────────────────────────────────────────────
router.post('/:id/undo-status', async (c) => {
  try {
    const userId = getUserId(c); const id = c.req.param('id');
    const body = await c.req.json(); const { revert_to } = body as { revert_to: string };
    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);
    await supabaseAdmin.from('leads').update({ status: revert_to, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
    await createActivity(userId, { lead_id: id, type: 'status_undo', description: `Reverted to ${revert_to}` });
    return c.json({ message: 'Reverted', status: revert_to });
  } catch (e: any) { return c.json({ error: 'Undo failed', details: e.message }, 500); }
});

// ─── GET /leads/stale ───────────────────────────────────────────────────────
router.get('/stale', async (c) => {
  try {
    const userId = getUserId(c); const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100);
    const daysAgo = new Date(Date.now() - 14*86400000).toISOString();
    const { data: allLeads } = await supabaseAdmin.from('leads').select('id, business_name, email, status, last_contacted, created_at').eq('user_id', userId).in('status', ['new', 'contacted']).or(`last_contacted.lt.${daysAgo},last_contacted.is.null`).order('created_at', { ascending: true }).limit(limit * 2);
    return c.json({ leads: allLeads ?? [], total: (allLeads ?? []).length });
  } catch (e: any) { return c.json({ error: 'Failed to fetch stale leads', details: e.message }, 500); }
});

// ─── POST /leads/:id/snooze-stale ───────────────────────────────────────────
router.post('/:id/snooze-stale', async (c) => {
  try {
    const userId = getUserId(c); const id = c.req.param('id'); const body = await c.req.json();
    const days = ([7, 14].includes((body as any).days)) ? (body as any).days : 7;
    const until = new Date(Date.now() + days*86400000).toISOString();
    await supabaseAdmin.from('leads').update({ is_stale: false, stale_snoozed_until: until, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
    return c.json({ message: 'Snoozed' });
  } catch (e: any) { return c.json({ error: 'Snooze failed', details: e.message }, 500); }
});

// ─── POST /leads/:id/archive ────────────────────────────────────────────────
router.post('/:id/archive', async (c) => {
  try {
    const userId = getUserId(c); const id = c.req.param('id');
    await supabaseAdmin.from('leads').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
    return c.json({ message: 'Lead archived' });
  } catch (e: any) { return c.json({ error: 'Archive failed', details: e.message }, 500); }
});

// ─── GET /leads/credits/zerobounce ──────────────────────────────────────────
router.get('/credits/zerobounce', async (c) => {
  try {
    const key = process.env.ZEROBOUNCE_API_KEY || 'c3065885f1404e199200f5dc49d0f757';
    const res = await fetch(`https://api.zerobounce.net/v2/getcredits?api_key=${key}`);
    const data = await res.json() as Record<string, any>;
    return c.json({ credits: parseInt(data.credits || '0', 10) });
  } catch (e: any) { return c.json({ error: 'Credits fetch failed', details: e.message }, 500); }
});

// ─── POST /leads/verify-batch ───────────────────────────────────────────────
router.post('/verify-batch', async (c) => {
  try {
    const userId = getUserId(c); const body = await c.req.json();
    const leadIds = body.lead_ids as string[];
    if (!Array.isArray(leadIds)) return c.json({ error: 'lead_ids array required' }, 400);
    let queued = 0, skipped = 0; const key = process.env.ZEROBOUNCE_API_KEY || 'c3065885f1404e199200f5dc49d0f757';
    for (const leadId of leadIds) {
      try {
        const { data: lead } = await supabaseAdmin.from('leads').select('id, email, email_status').eq('id', leadId).eq('user_id', userId).maybeSingle();
        if (!lead?.email || lead.email_status === 'valid') { skipped++; continue; }
        const res = await fetch(`https://api.zerobounce.net/v2/validate?api_key=${key}&email=${encodeURIComponent(lead.email)}&ip_address=`);
        const zb = await res.json() as Record<string, any>;
        await supabaseAdmin.from('leads').update({ email_status: zb.status || 'unknown', email_status_checked_at: new Date().toISOString() }).eq('id', leadId);
        queued++;
      } catch { skipped++; }
      if (leadIds.indexOf(leadId) < leadIds.length - 1) await new Promise(r => setTimeout(r, 50));
    }
    return c.json({ queued, skipped });
  } catch (e: any) { return c.json({ error: 'Batch verify failed', details: e.message }, 500); }
});

export default router;
