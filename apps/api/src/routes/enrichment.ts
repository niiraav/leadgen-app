import { Hono } from 'hono';
import { supabaseAdmin, getUserId } from '../db';
import { extractOwnerNameFromReviews } from '../services/owner-name-extractor';
import { buildGmbUrl } from '../lib/gmb-urls';
import { enforceCredits, EnforcementError } from '../lib/billing/enforce';

const router = new Hono();

// POST /leads/:id/enrich
router.post('/:id/enrich', async (c) => {
  const userId = getUserId(c);
  const leadId = c.req.param('id');

  // ── Credit enforcement: check enrichment limit ──
  try {
    await enforceCredits(userId, 'enrichment');
  } catch (err) {
    if (err instanceof EnforcementError) {
      const status = err.upgradeRequired ? 402 : 403;
      return c.json({ error: err.message, upgrade_required: err.upgradeRequired, limit: err.limit, remaining: err.remaining }, status);
    }
    throw err;
  }

  const { data: lead, error } = await supabaseAdmin
    .from('leads').select('*').eq('id', leadId).single();
  if (error || !lead) return c.json({ error: 'Not found' }, 404);
  if (lead.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  // If enrichment previously found no owner, allow immediate retry
  if (lead.enrichment_attempted_at && !lead.owner_name) {
    await supabaseAdmin.from('leads').update({
      enrichment_attempted_at: null,
    }).eq('id', leadId);
  } else if (lead.enrichment_attempted_at) {
    const daysSince = (Date.now() - new Date(lead.enrichment_attempted_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) {
      const nextAvailable = new Date(new Date(lead.enrichment_attempted_at).getTime() + 7 * 86400000);
      return c.json({
        error: `Already enriched recently. Try again after ${nextAvailable.toLocaleDateString()}.`,
        next_available: nextAvailable.toISOString(),
      }, 429);
    }
  }

  // Mark attempt immediately
  await supabaseAdmin.from('leads').update({
    enrichment_attempted_at: new Date().toISOString(),
  }).eq('id', leadId);

  const updates: Record<string, unknown> = {};

  // Owner name from GMB reviews
  if (lead.data_id && !lead.owner_name) {
    try {
      const result = await extractOwnerNameFromReviews(lead.data_id, lead.business_name);
      if (result.owner_name) {
        updates.owner_name = result.owner_name;
        updates.owner_first_name = result.first_name || null;
        updates.owner_name_source = 'gmb_reviews';
      }
    } catch (e) {
      console.error(`[Enrichment] Owner extraction failed for lead ${leadId}:`, e);
    }
  }

  // Ensure GMB URL
  if (!lead.gmb_url) {
    updates.gmb_url = buildGmbUrl(lead);
  }

  updates.enriched_at = new Date().toISOString();
  await supabaseAdmin.from('leads').update(updates).eq('id', leadId);

  return c.json({
    success: true,
    owner_name: updates.owner_name || null,
    owner_first_name: updates.owner_first_name || null,
    enriched_at: updates.enriched_at,
  });
});

// PATCH /leads/:id/social-links
router.patch('/:id/social-links', async (c) => {
  const userId = getUserId(c);
  const leadId = c.req.param('id');
  const body = await c.req.json();

  const { data: lead } = await supabaseAdmin.from('leads').select('*').eq('id', leadId).single();
  if (!lead) return c.json({ error: 'Not found' }, 404);
  if (lead.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  const updates: Record<string, unknown> = {};

  if (body.facebook_url !== undefined) {
    if (body.facebook_url === '' || body.facebook_url === null) {
      updates.facebook_url = null;
    } else if (!body.facebook_url.startsWith('https://') || (!body.facebook_url.includes('facebook.com') && !body.facebook_url.includes('fb.com'))) {
      return c.json({ error: 'Must be a valid Facebook URL' }, 400);
    } else {
      updates.facebook_url = body.facebook_url;
    }
  } else if (body.linkedin_url !== undefined) {
    if (body.linkedin_url === '' || body.linkedin_url === null) {
      updates.linkedin_url = null;
    } else if (!body.linkedin_url.startsWith('https://') || !body.linkedin_url.includes('linkedin.com')) {
      return c.json({ error: 'Must be a valid LinkedIn URL' }, 400);
    } else {
      updates.linkedin_url = body.linkedin_url;
    }
  }
  if (body.instagram_url !== undefined) {
    if (body.instagram_url === '' || body.instagram_url === null) {
      updates.instagram_url = null;
    } else if (!body.instagram_url.startsWith('https://') || !body.instagram_url.includes('instagram.com')) {
      return c.json({ error: 'Must be a valid Instagram URL' }, 400);
    } else {
      updates.instagram_url = body.instagram_url;
    }
  }
  if (body.twitter_handle !== undefined) {
    if (body.twitter_handle === '' || body.twitter_handle === null) {
      updates.twitter_handle = null;
    } else if (!body.twitter_handle.startsWith('https://') || (!body.twitter_handle.includes('twitter.com') && !body.twitter_handle.includes('x.com'))) {
      return c.json({ error: 'Must be a valid Twitter/X URL' }, 400);
    } else {
      updates.twitter_handle = body.twitter_handle;
    }
  }
  if (body.owner_name !== undefined) {
    updates.owner_name = body.owner_name || null;
    if (body.owner_name) updates.owner_name_source = 'manual';
  }
  if (body.owner_first_name !== undefined) {
    updates.owner_first_name = body.owner_first_name || null;
  }

  const { data: updated } = await supabaseAdmin.from('leads').update(updates).eq('id', leadId).select().single();
  return c.json({
    facebook_url: updated?.facebook_url,
    linkedin_url: updated?.linkedin_url,
    instagram_url: updated?.instagram_url,
    twitter_handle: updated?.twitter_handle,
    owner_name: updated?.owner_name,
    owner_first_name: updated?.owner_first_name,
    owner_name_source: updated?.owner_name_source,
  });
});

// POST /admin/backfill-gmb-urls
router.post('/admin/backfill-gmb-urls', async (c) => {
  try {
    const { data: leads } = await supabaseAdmin.from('leads').select('id, place_id, business_name, address, gmb_url');
    if (!leads) return c.json({ error: 'No leads' }, 404);
    let updated = 0, skipped = 0, fallbackUsed = 0;
    for (const lead of leads) {
      if (lead.gmb_url) { skipped++; continue; }
      const url = buildGmbUrl(lead);
      await supabaseAdmin.from('leads').update({ gmb_url: url }).eq('id', lead.id);
      updated++;
      if (!lead.place_id) fallbackUsed++;
    }
    return c.json({ updated, skipped, fallback_used: fallbackUsed });
  } catch (err: any) {
    return c.json({ error: 'Backfill failed', details: err.message }, 500);
  }
});

export default router;
