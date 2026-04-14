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
import { incrementLeads, incrementEnrichments, incrementEmailVerifications } from '../lib/usage';
import { mapAndMergeEnrichment, selectPrimaryContact, buildFailedEnrichmentUpdate, buildPartialEnrichmentUpdate, buildNoDataEnrichmentUpdate } from '../lib/enrichment-mapper';
import { enforceCredits, enforceFeatureGate, EnforcementError } from '../lib/billing/enforce';
import { enrichContact, contactsPreview, enrichmentMultiple, verifyEmail } from '../services/outscraper';

const router = new Hono();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createLeadSchema = z.object({
  business_name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().nullable().optional().or(z.literal('')),
  website_url: z.string().url().nullable().optional().or(z.literal('')),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  review_count: z.number().optional(),
  hot_score: z.number().optional(),
  readiness_flags: z.array(z.string()).optional(),
  status: z.string().default('new'),
  source: z.string().default('manual'),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  place_id: z.string().nullable().optional(),
  data_id: z.string().nullable().optional(),
  gmb_url: z.string().nullable().optional(),
  gmb_reviews_url: z.string().nullable().optional(),
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

    // ── Credit enforcement: check lead limit ──
    try {
      await enforceCredits(userId, 'lead');
    } catch (err) {
      if (err instanceof EnforcementError) {
        const status = err.upgradeRequired ? 402 : 403;
        return c.json({ error: err.message, upgrade_required: err.upgradeRequired, limit: err.limit, remaining: err.remaining }, status);
      }
      throw err;
    }

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
      place_id: data.place_id ?? null,
      data_id: data.data_id ?? null,
      gmb_reviews_url: data.gmb_reviews_url ?? null,
    });

    // Log activity
    await createActivity(userId, {
      lead_id: result.id,
      type: 'created',
      description: `Lead created via ${data.source}`,
    });

    // Track lead creation usage
    try {
      await incrementLeads(userId);
    } catch { /* best effort */ }

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
// Dedup on place_id. Returns { saved, duplicates, credits_used }

const batchLeadSchema = z.array(createLeadSchema);

router.post('/batch', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const leads = body.leads || body;

    console.log('[Batch] === START ===');
    console.log('[Batch] body keys:', Object.keys(body), 'leads type:', Array.isArray(leads) ? `array[${leads.length}]` : typeof leads);
    console.log('[Batch] userId:', userId);
    if (!Array.isArray(leads) || leads.length === 0) {
      console.log('[Batch] No leads array or empty');
      return c.json({ error: 'Expected array of leads or { leads: [...] }' }, 400);
    }

    // Dedup: find existing place_ids
    const incomingPlaceIds = leads
      .map((l: any) => l.place_id)
      .filter((pid: any): pid is string => !!pid);

    console.log('[Batch] incoming place_ids:', incomingPlaceIds);

    let existingPids = new Set<string>();
    if (incomingPlaceIds.length > 0) {
      const { data: existing, error: dedupErr } = await supabaseAdmin
        .from('leads')
        .select('place_id')
        .eq('user_id', userId)
        .in('place_id', incomingPlaceIds);
      if (dedupErr) console.error('[Batch] Dedup query error:', dedupErr);
      existingPids = new Set((existing ?? []).map((r: any) => r.place_id).filter(Boolean));
    }
    console.log('[Batch] existingPids:', [...existingPids]);

    let saved = 0;
    let duplicates = 0;

    for (let i = 0; i < leads.length; i++) {
      const raw = leads[i];
      console.log(`[Batch] lead[${i}] raw:`, JSON.stringify(raw).slice(0, 300));

      const parsed = createLeadSchema.safeParse(raw);
      if (!parsed.success) {
        console.log(`[Batch] lead[${i}] VALIDATION FAILED:`, JSON.stringify(parsed.error.flatten()));
        continue;
      }
      console.log(`[Batch] lead[${i}] PASSED validation`);

      const data = parsed.data;

      if (data.place_id && existingPids.has(data.place_id)) {
        console.log(`[Batch] lead[${i}] DUPLICATE place_id:`, data.place_id);
        duplicates++;
        continue;
      }

      // ── INSERT ──────────────────────────────────────────────────
      const insertData = {
        user_id: userId,
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
        metadata: data.metadata ?? {},
        place_id: data.place_id ?? null,
        data_id: data.data_id ?? null,
        gmb_reviews_url: data.gmb_reviews_url ?? null,
        reply_token: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8),
      };

      console.log(`[Batch] lead[${i}] INSERT data:`, JSON.stringify(insertData).slice(0, 500));

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('leads')
        .insert(insertData)
        .select('*')
        .single();

      if (insertErr) {
        console.error(`[Batch] lead[${i}] INSERT ERROR:`, JSON.stringify(insertErr));
        // Throw so caller knows it failed
        throw new Error(`Insert failed: ${insertErr.message || insertErr.code || 'unknown'}`);
      }

      console.log(`[Batch] lead[${i}] INSERTED OK, id:`, (inserted as any)?.id);
      saved++;
      if (data.place_id) existingPids.add(data.place_id);

      // Track activity
      try {
        await createActivity(userId, {
          lead_id: (inserted as any)!.id,
          type: 'created',
          description: `Lead created via ${data.source}`,
        });
      } catch (e: any) {
        console.warn(`[Batch] lead[${i}] createActivity failed:`, e.message);
      }
    }

    console.log(`[Batch] === END === saved=${saved}, dupes=${duplicates}, total=${leads.length}`);

    // Track usage
    for (let i = 0; i < saved; i++) {
      try { await incrementLeads(userId); } catch (incrErr: any) {
        console.error('[Batch] incrementLeads failed:', incrErr?.message || incrErr);
      }
    }

    return c.json({ saved, duplicates, credits_used: saved, total: leads.length });
  } catch (error: any) {
    console.error('[Batch] TOP-LEVEL ERROR:', error.message, JSON.stringify(error));
    return c.json({ error: 'Batch create failed', details: error.message || 'Unknown error' }, 500);
  }
});

// ─── GET /leads/:id/enrichment-preview ──────────────────────────────────────
// Free: returns contact count + masked sample, no credit spent

router.get('/:id/enrichment-preview', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);

    // If already enriched, return cached data
    if (lead.contact_enriched_at && (lead as any).contacts?.length) {
      return c.json({ already_enriched: true, contacts: (lead as any).contacts });
    }

    const domain = lead.website_url
      ? (() => { try { return new URL(lead.website_url).hostname.replace('www.', ''); } catch { return ''; } })()
      : lead.domain ?? '';

    if (!domain && !lead.business_name) {
      return c.json({ total_contacts: 0, direct_emails: 0, generic_emails: 0, first_name: null, first_email: null, contacts: [] });
    }

    const preview = await contactsPreview(lead.business_name, domain, lead.city ?? '');
    return c.json(preview);
  } catch (error: any) {
    console.error('[Enrichment Preview] Error:', error.message);
    return c.json({ error: 'Preview failed', details: error.message }, 500);
  }
});

// ─── POST /leads/:id/enrichment-unlock ──────────────────────────────────────
// Paid: spends 1 credit, fetches all contacts, persists via enrichment-mapper,
// returns updated canonical lead data (not raw Outscraper response)

router.post('/:id/enrichment-unlock', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);

    // Already enriched — return cached data + updated lead, don't charge again
    if (lead.contact_enriched_at) {
      // Re-fetch fresh lead to return canonical state
      const freshLead = await getLeadById(userId, id);
      return c.json({
        enriched: true,
        cached: true,
        contacts: (lead as any).contacts || [],
        lead: freshLead,
      });
    }

    const domain = lead.website_url
      ? (() => { try { return new URL(lead.website_url).hostname.replace('www.', ''); } catch { return ''; } })()
      : lead.domain ?? '';

    if (!domain) {
      // Persist failure status
      const failedUpdate = buildFailedEnrichmentUpdate('No domain available for contact enrichment');
      await supabaseAdmin.from('leads').update(failedUpdate).eq('id', id).eq('user_id', userId);
      return c.json({ error: 'No domain available for contact enrichment', enriched: false }, 400);
    }

    const contacts = await enrichmentMultiple(lead.business_name, domain, lead.city ?? '', 20);

    if (!contacts.length) {
      // No contacts found — this is NOT a technical failure, just no public data available
      const noDataUpdate = buildNoDataEnrichmentUpdate('No contacts found for this lead');
      const { error: failErr } = await supabaseAdmin
        .from('leads')
        .update(noDataUpdate)
        .eq('id', id)
        .eq('user_id', userId);
      if (failErr) {
        console.error('[Enrichment Unlock] No-data-status DB update error:', failErr.message);
      }
      return c.json({ enriched: false, contacts: [], message: 'No contacts found for this lead', enrichment_status: 'no_data' });
    }

    // Select best contact deterministically
    const primary = selectPrimaryContact(contacts);

    if (!primary) {
      // No useful contact — persist partial status
      const partialUpdate = buildPartialEnrichmentUpdate();
      await supabaseAdmin.from('leads').update(partialUpdate).eq('id', id).eq('user_id', userId);
      return c.json({ enriched: false, contacts: [], message: 'No useful contact data found' });
    }

    // Map and merge via centralized mapper
    const { updates, status, mergedFieldCount } = mapAndMergeEnrichment(
      primary,
      lead as any,
      contacts,
      domain
    );

    // If nothing useful merged, override status
    if (mergedFieldCount === 0 && !primary.email && !primary.phone && !primary.socials?.linkedin) {
      updates.contact_enrichment_status = 'partial';
    }

    // Persist to DB
    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Enrichment Unlock] DB persist failed:', updateError.message, updateError.details);
      // Still return enrichment data so frontend isn't broken, but flag the error
      return c.json({
        enriched: true,
        contacts,
        cached: false,
        persistence_error: updateError.message,
        lead: null,
      }, 207);  // 207 Multi-Status: enrichment succeeded but persist had issues
    }

    // Create activity log
    await createActivity(userId, {
      lead_id: id,
      type: 'contact_enriched',
      description: `Contact enriched: ${contacts.length} contacts found (${status})`,
    });

    // Increment usage counter
    try { await incrementEnrichments(userId); } catch {}

    // Re-fetch the updated lead to return canonical DB state
    const updatedLead = await getLeadById(userId, id);

    return c.json({
      enriched: true,
      contacts,
      cached: false,
      enrichment_status: status,
      lead: updatedLead,
    });
  } catch (error: any) {
    console.error('[Enrichment Unlock] Error:', error.message);

    // Attempt to persist failure status if we can identify the lead
    // (best-effort — don't throw from error handler)
    try {
      const id = c.req.param('id');
      const userId = getUserId(c);
      const failedUpdate = buildFailedEnrichmentUpdate(error.message || 'Unknown error');
      await supabaseAdmin.from('leads').update(failedUpdate).eq('id', id).eq('user_id', userId);
    } catch {}

    return c.json({ error: 'Unlock failed', details: error.message, enriched: false }, 500);
  }
});

// ─── POST /leads/:id/enrich-contact ──────────────────────────────────────────
// Legacy: alias to unlock for backward compat — also uses enrichment-mapper

router.post('/:id/enrich-contact', async (c) => {
  const unlockHandler = async () => {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);

    // Already enriched — return canonical state
    if (lead.contact_enriched_at) {
      const freshLead = await getLeadById(userId, id);
      return c.json({ enriched: true, cached: true, contact: null, lead: freshLead });
    }

    const domain = lead.website_url
      ? (() => { try { return new URL(lead.website_url).hostname.replace('www.', ''); } catch { return ''; } })()
      : lead.domain ?? '';

    if (!domain) {
      const failedUpdate = buildFailedEnrichmentUpdate('No domain available for contact enrichment');
      await supabaseAdmin.from('leads').update(failedUpdate).eq('id', id).eq('user_id', userId);
      return c.json({ error: 'No domain available for contact enrichment', enriched: false }, 400);
    }

    const contact = await enrichContact(lead.business_name, domain, lead.city ?? '');

    if (!contact) {
      const noDataUpdate = buildNoDataEnrichmentUpdate('No contact found');
      await supabaseAdmin.from('leads').update(noDataUpdate).eq('id', id).eq('user_id', userId);
      return c.json({ message: 'No contact found', enriched: false, enrichment_status: 'no_data' });
    }

    // Use mapper for consistent merge logic
    const { updates, status } = mapAndMergeEnrichment(contact, lead as any, [contact], domain);

    // Also persist technologies if present (legacy-specific field)
    if (contact.technologies?.length > 0) {
      updates.technologies = contact.technologies;
    }

    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Enrich Contact] DB persist failed:', updateError.message);
    }

    await createActivity(userId, {
      lead_id: id,
      type: 'contact_enriched',
      description: `Contact enriched: ${contact.full_name || 'Unknown'} (${status})`,
    });

    try { await incrementEnrichments(userId); } catch {}

    // Re-fetch canonical state
    const updatedLead = await getLeadById(userId, id);
    return c.json({ enriched: true, contact, enrichment_status: status, lead: updatedLead });
  };

  return await unlockHandler();
});

// ─── POST /leads/:id/verify-email ────────────────────────────────────────────

const emailSchema = z.object({
  email: z.string().email().optional(),
});

// Safe JSON parse — returns fallback instead of throwing on empty/malformed body
function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    if (!text || !text.trim()) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

router.post('/:id/verify-email', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    // ── Feature gate: email verifications require outreach+ plan ──
    const gate = await enforceFeatureGate(userId, 'email_verifications');
    if (!gate.allowed) {
      return c.json({ error: gate.upgradeRequired, upgrade_required: true }, 402);
    }

    // ── Credit enforcement: check email verification limit ──
    try {
      await enforceCredits(userId, 'email_verification');
    } catch (err) {
      if (err instanceof EnforcementError) {
        const status = err.upgradeRequired ? 402 : 403;
        return c.json({ error: err.message, upgrade_required: err.upgradeRequired, limit: err.limit, remaining: err.remaining }, status);
      }
      throw err;
    }

    // Parse body safely — callers may send no body (empty POST)
    const rawBody = await c.req.text();
    const body = safeJsonParse<Record<string, any>>(rawBody, {});
    const parsed = emailSchema.safeParse(body);

    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);

    const emailToVerify = parsed.data?.email || lead.email || lead.contact_email;
    if (!emailToVerify) {
      return c.json({ error: 'No email to verify' }, 400);
    }

    // ── Call Outscraper email verification service ──
    const result = await verifyEmail(emailToVerify);

    // ── Persist result to database ──
    await supabaseAdmin
      .from('leads')
      .update({
        email_status: result.email_status,
        email_verified_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId);

    await createActivity(userId, {
      lead_id: id,
      type: 'email_verified',
      description: `Email verified: ${emailToVerify} -> ${result.email_status} (${result.reason})`,
    });

    try { await incrementEmailVerifications(userId); } catch {}

    return c.json({
      verified: result.verified,
      email: result.email,
      email_status: result.email_status,
      status: result.email_status,            // backward compat
      confidence: result.confidence,
      reason: result.reason,
      source: result.source,
      status_details: result.status_details,
    });
  } catch (error: any) {
    console.error('[Verify Email] Error:', error.message);
    return c.json({
      error: 'Email verification failed',
      details: error.message,
      verified: false,
      email_status: 'unknown',
      reason: 'server_error',
    }, 500);
  }
});

// ─── POST /leads/:id/generate-bio ────────────────────────────────────────────

const bioSchema = z.object({
  maxLength: z.coerce.number().min(50).max(500).default(150),
});

router.post('/:id/generate-bio', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = bioSchema.safeParse(body);
    const maxLength = parsed.success ? parsed.data.maxLength : 200;

    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);

    const bioPrompt = `Write a concise business bio (max ${maxLength} characters) for:\n` +
      `Name: ${lead.business_name}\n` +
      `Category: ${lead.category || 'Unknown'}\n` +
      `Location: ${lead.city || 'Unknown'}\n` +
      `Description: ${lead.description || 'No description available'}\n` +
      `Rating: ${lead.rating || 'N/A'}\n` +
      `Website: ${lead.website_url || 'No website'}`;

    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';

    if (!openRouterKey) return c.json({ error: 'OPENROUTER_API_KEY not configured' }, 500);

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + openRouterKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://leadgen.app',
        'X-Title': 'LeadGen App',
      },
      body: JSON.stringify({
        model: 'google/gemma-2-9b-it',
        messages: [
          { role: 'system', content: 'Write concise, professional business bios. Max 200 chars.' },
          { role: 'user', content: bioPrompt },
        ],
        max_tokens: 300,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return c.json({ error: 'OpenRouter failed', details: errText.slice(0, 200) }, 502 as any);
    }

    const completion = await resp.json() as { choices?: { message?: { content?: string } }[] };
    const bio = completion.choices?.[0]?.message?.content?.trim() ?? '';
    if (!bio) return c.json({ error: 'Failed to generate bio' }, 500);

    await supabaseAdmin
      .from('leads')
      .update({ ai_bio: bio, ai_bio_generated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    await createActivity(userId, {
      lead_id: id,
      type: 'bio_generated',
      description: 'AI bio generated',
    });

    return c.json({ bio });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Generate Bio] Error:', message);
    return c.json({ error: 'Bio generation failed', details: message }, 500);
  }
});

// ─── PATCH /leads/:id/notes ──────────────────────────────────────────────────

const notesSchema = z.object({
  notes: z.string(),
});

router.patch('/:id/notes', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = notesSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);

    // Append to existing notes
    const existingNotes = lead.notes ?? '';
    const newNotes = existingNotes
      ? `${existingNotes}\n\n${parsed.data.notes}`
      : parsed.data.notes;

    await updateLead(userId, id, {
      notes: newNotes,
      updated_at: new Date().toISOString(),
    });

    await createActivity(userId, {
      lead_id: id,
      type: 'notes_updated',
      description: 'Notes updated',
    });

    return c.json({ message: 'Notes updated', notes: newNotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Notes PATCH] Error:', message);
    return c.json({ error: 'Failed to update notes', details: message }, 500);
  }
});

// ─── GET /leads/export/csv ───────────────────────────────────────────────────

router.get('/export/csv', async (c) => {
  try {
    const userId = getUserId(c);

    const { data: allLeads, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // CSV headers - all lead columns
    const headers = [
      'business_name', 'email', 'phone', 'website_url', 'address', 'city',
      'country', 'category', 'rating', 'review_count', 'hot_score', 'status',
      'source', 'notes', 'place_id', 'full_address', 'street', 'postal_code',
      'description', 'business_status', 'verified', 'contact_full_name',
      'contact_title', 'contact_email', 'contact_email_type', 'domain',
      'company_size', 'ai_bio', 'tags', 'created_at',
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = (allLeads ?? []).map((lead: any) => {
      return headers.map((h) => escapeCsv(lead[h])).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    c.header('Content-Disposition', `attachment; filename="leads_${Date.now()}.csv"`);
    c.header('Content-Type', 'text/csv; charset=utf-8');
    return c.body(csvContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Export CSV] Error:', message);
    return c.json({ error: 'CSV export failed', details: message }, 500);
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

    // ── Feature gate: AI emails require outreach+ plan ──
    const gate = await enforceFeatureGate(userId, 'ai_emails');
    if (!gate.allowed) {
      return c.json({ error: gate.upgradeRequired, upgrade_required: true }, 402);
    }

    // ── Credit enforcement: check AI email limit ──
    try {
      await enforceCredits(userId, 'ai_email');
    } catch (err) {
      if (err instanceof EnforcementError) {
        const status = err.upgradeRequired ? 402 : 403;
        return c.json({ error: err.message, upgrade_required: err.upgradeRequired, limit: err.limit, remaining: err.remaining }, status);
      }
      throw err;
    }

    const body = await c.req.json();
    const parsed = aiEmailSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    const lead = await getLeadById(userId, id);
    if (!lead) return c.json({ error: 'Lead not found' }, 404);

    // Auto-fetch or generate bio for LLM personalization (invisible to frontend)
    let bio: string | null = (lead as any).ai_bio ?? null;
    if (!bio) {
      try {
        const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
        if (openRouterKey) {
          const bioPrompt = 'Write a concise business bio (max 200 characters) for:\n'
            + 'Name: ' + (lead.business_name || 'Unknown') + '\n'
            + 'Category: ' + (lead.category || 'Unknown') + '\n'
            + 'Location: ' + (lead.city || 'Unknown') + '\n'
            + 'Description: ' + (lead.description || 'No description available') + '\n'
            + 'Rating: ' + (lead.rating || 'N/A') + '\n'
            + 'Website: ' + (lead.website_url || 'No website');
          const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + openRouterKey,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://leadgen.app',
              'X-Title': 'LeadGen App',
            },
            body: JSON.stringify({
              model: 'google/gemma-2-9b-it',
              messages: [
                { role: 'system', content: 'Write concise, professional business bios. Max 200 chars.' },
                { role: 'user', content: bioPrompt },
              ],
              max_tokens: 300,
            }),
          });
          if (resp.ok) {
            const completion = await resp.json() as { choices?: { message?: { content?: string } }[] };
            bio = completion.choices?.[0]?.message?.content?.trim() ?? null;
            if (bio) {
              // Cache bio for future use — no activity log (invisible operation)
              await supabaseAdmin
                .from('leads')
                .update({ ai_bio: bio, ai_bio_generated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', userId);
            }
          }
        }
      } catch (e) {
        console.warn('[AI Email] Bio generation failed, continuing without bio:', e instanceof Error ? e.message : e);
      }
    }

    const { generateEmailWithAI } = await import('../services/ai-email');
    const emailData = await generateEmailWithAI({
      lead: { business_name: lead.business_name, email: lead.email ?? undefined, phone: lead.phone ?? undefined, website_url: lead.website_url ?? undefined, category: lead.category ?? undefined, city: lead.city ?? undefined, country: lead.country ?? undefined, rating: lead.rating ?? undefined } as any,
      tone: parsed.data.tone, purpose: parsed.data.purpose, customInstructions: parsed.data.customInstructions, recontact: parsed.data.recontact,
      bio: bio || undefined,
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

// ─── GET /leads/credits/email-verifications ────────────────────────────────
// Returns the user's email verification usage count (from our DB, not a 3rd-party API)
router.get('/credits/email-verifications', async (c) => {
  try {
    const userId = getUserId(c);
    const { data: usage } = await supabaseAdmin
      .from('usage')
      .select('email_verifications_count')
      .eq('user_id', userId)
      .maybeSingle();
    return c.json({ used: usage?.email_verifications_count ?? 0 });
  } catch (e: any) { return c.json({ error: 'Usage fetch failed', details: e.message }, 500); }
});

// ─── POST /leads/verify-batch ───────────────────────────────────────────────
router.post('/verify-batch', async (c) => {
  try {
    const userId = getUserId(c);
    const rawBody = await c.req.text();
    const body = safeJsonParse<Record<string, any>>(rawBody, {});
    const leadIds = body.lead_ids as string[];
    if (!Array.isArray(leadIds)) return c.json({ error: 'lead_ids array required' }, 400);
    let queued = 0, skipped = 0;
    for (const leadId of leadIds) {
      try {
        const { data: lead } = await supabaseAdmin.from('leads').select('id, email, email_status').eq('id', leadId).eq('user_id', userId).maybeSingle();
        if (!lead?.email || lead.email_status === 'valid') { skipped++; continue; }
        const result = await verifyEmail(lead.email);
        await supabaseAdmin.from('leads').update({ email_status: result.email_status, email_verified_at: new Date().toISOString() }).eq('id', leadId);
        await createActivity(userId, { lead_id: leadId, type: 'email_verified', description: `Batch verify: ${lead.email} -> ${result.email_status}` });
        queued++;
      } catch { skipped++; }
      // Small delay to avoid hammering the API
      if (leadIds.indexOf(leadId) < leadIds.length - 1) await new Promise(r => setTimeout(r, 200));
    }
    return c.json({ queued, skipped });
  } catch (e: any) { return c.json({ error: 'Batch verify failed', details: e.message }, 500); }
});

// GET /leads/:id/replies — fetch reply events for a lead
router.get('/:id/replies', async (c) => {
  const userId = getUserId(c);
  const leadId = c.req.param('id');

  const { data, error } = await supabaseAdmin
    .from('reply_events')
    .select('id, type, sender_email, subject, body_plain, intent_label, sentiment_score, urgency, confidence, key_phrase, suggested_next_action, needs_review, received_at')
    .eq('lead_id', leadId)
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[GET /leads/:id/replies] Error:', error);
    return c.json({ error: 'Failed to fetch replies' }, 500);
  }

  return c.json({ replies: data ?? [] });
});

export default router;
