/**
 * Reviews enrichment route — POST /leads/:id/fetch-reviews
 *
 * Fetches Google Maps reviews via Outscraper, extracts AI insights via LLM,
 * caches the result for 7 days. Follows the same pattern as enrichment.ts
 * and ai-email.ts (credit enforcement + usage increment).
 */

import { Hono } from 'hono';
import { supabaseAdmin, getUserId } from '../db';
import { fetchReviewsForPlace } from '../services/outscraper';
import { extractReviewInsights } from '../services/review-insights';
import { enforceCredits, EnforcementError } from '../lib/billing/enforce';
import { incrementEnrichments } from '../lib/usage';

const router = new Hono();

// POST /:id/fetch-reviews
router.post('/:id/fetch-reviews', async (c) => {
  try {
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

    // ── Fetch lead from Supabase ──
    const { data: lead, error } = await supabaseAdmin
      .from('leads').select('*').eq('id', leadId).single();
    if (error || !lead) return c.json({ error: 'Not found' }, 404);
    if (lead.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

    // ── 7-day cache check: if reviews_fetched_at exists and is < 7 days old ──
    const reviewsFetchedAt = lead.reviews_fetched_at;
    if (reviewsFetchedAt) {
      const daysSince = (Date.now() - new Date(reviewsFetchedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        console.log(`[Fetch Reviews] Returning cached insights for lead ${leadId}`);
        return c.json({ success: true, cached: true, review_summary: lead.review_summary });
      }
    }

    // ── We need either a place_id or a business name to query reviews ──
    const placeId = lead.place_id || '';
    const businessName = lead.business_name;
    const location = [lead.city, lead.postal_code].filter(Boolean).join(', ');

    if (!placeId && !businessName) {
      return c.json({ error: 'Lead has no place_id or business name — cannot fetch reviews' }, 400);
    }

    // ── Step 1: Fetch reviews from Outscraper ──
    console.log(`[Fetch Reviews] Fetching reviews for lead ${leadId} (name: "${businessName}", place_id: ${placeId})`);
    let reviews;
    try {
      reviews = await fetchReviewsForPlace(placeId, businessName, location);
    } catch (outscraperErr: any) {
      console.error('[Fetch Reviews] Outscraper error:', outscraperErr.message);
      return c.json({ error: 'Failed to fetch reviews from Google Maps', details: outscraperErr.message }, 502);
    }

    if (reviews.length === 0) {
      return c.json({ error: 'No reviews found for this business' }, 404);
    }

    // ── Step 2: Extract insights via LLM ──
    console.log(`[Fetch Reviews] Extracting insights from ${reviews.length} reviews for lead ${leadId}`);
    let insights;
    try {
      insights = await extractReviewInsights(
        reviews,
        lead.rating ?? null,
        lead.review_count ?? 0,
      );
    } catch (llmErr: any) {
      console.error('[Fetch Reviews] LLM error:', llmErr.message);
      return c.json({ error: 'Failed to extract insights from reviews', details: llmErr.message }, 502);
    }

    // ── Step 3: Persist review_summary + reviews_fetched_at ──
    const updates: Record<string, unknown> = {
      review_summary: insights,
      reviews_fetched_at: new Date().toISOString(),
    };

    // ── Step 4: If owner_confidence >= 0.7 and owner_name found, write to lead ──
    if (insights.owner_confidence >= 0.7 && insights.owner_name) {
      const existingOwnerName = lead.owner_name;
      // Only write if owner_name is currently null/empty
      if (!existingOwnerName) {
        updates.owner_name = insights.owner_name;
        // Derive first name (up to first space)
        const parts = insights.owner_name.trim().split(/\s+/);
        updates.owner_first_name = parts[0] || null;
        updates.owner_name_source = 'reviews';
        console.log(`[Fetch Reviews] Writing owner_name "${insights.owner_name}" to lead ${leadId}`);
      } else {
        console.log(`[Fetch Reviews] Owner name already set ("${existingOwnerName}") — not overwriting`);
      }
    }

    const { error: updateError } = await supabaseAdmin.from('leads').update(updates).eq('id', leadId);
    if (updateError) {
      console.error('[Fetch Reviews] DB persist failed:', updateError.message);
      return c.json({ error: 'Failed to persist review insights', details: updateError.message }, 500);
    }

    // ── Increment enrichment usage (wrapped in try/catch like ai-email.ts) ──
    try { await incrementEnrichments(userId); } catch (e) { console.warn('[Fetch Reviews] Usage increment failed:', e); }

    return c.json({ success: true, cached: false, review_summary: insights });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Fetch Reviews] Error: ${message}`);
    return c.json({ error: 'Failed to fetch review insights', details: message }, 500);
  }
});

export default router;
