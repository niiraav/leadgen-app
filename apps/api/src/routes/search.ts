import { Hono } from 'hono';
import { z } from 'zod';
import { searchGoogleMaps } from '../services/outscraper';
import { getUserId, supabaseAdmin } from '../db';
import { incrementSearches } from '../lib/usage';
import { enforceCredits, EnforcementError } from '../lib/billing/enforce';

const router = new Hono();

const searchSchema = z.object({
  query: z.string().min(1),
  location: z.string().min(1),
  maxResults: z.coerce.number().min(1).max(100).default(20),
  no_website: z.boolean().optional(),
  noWebsite: z.boolean().optional(),
});

// ─── POST /search/google-maps ────────────────────────────────────────────────
// IMPORTANT: Route path must stay /search/google-maps. The frontend api.ts
// posts to "/search/google-maps" and expects { leads: Lead[], total: number }
// in the response (SearchResults interface).

router.post('/google-maps', async (c) => {
  try {
    const userId = getUserId(c);

    // ── Credit enforcement: check search limit ──
    try {
      await enforceCredits(userId, 'search');
    } catch (err) {
      if (err instanceof EnforcementError) {
        const status = err.upgradeRequired ? 402 : 403;
        return c.json({ error: err.message, upgrade_required: err.upgradeRequired, limit: err.limit, remaining: err.remaining }, status);
      }
      throw err;
    }

    const body = await c.req.json();
    const parsed = searchSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { query, location, maxResults, no_website, noWebsite } = parsed.data;
    const filterNoWebsite = no_website ?? noWebsite ?? false;

    // ── Outscraper search ──
    console.log(`[Search] Outscraper: "${query}" in "${location}" (${maxResults} results)`);

    let results: Array<Record<string, any>> = [];
    try {
      results = await searchGoogleMaps(query, location, maxResults);
    } catch (searchErr: any) {
      console.error(`[Search] Outscraper failed: ${searchErr.message}`);
      return c.json({ error: 'Search failed', details: searchErr.message }, 502);
    }

    // Filter out permanently closed businesses
    const filtered = results.filter((r: any) => (r.business_status || 'OPERATIONAL') !== 'CLOSED_PERMANENTLY');

    // Map results + compute hot_score
    // Hot = businesses most likely to respond to cold outreach
    let leads = filtered.map((r: any) => {
      const now = new Date().toISOString();
      const readinessFlags: string[] = [];

      // Base at 40, scale by negative signals (things that make them HOT)
      let score = 40;

      // No website = they need digital help the most (+25)
      const hasWebsite = !!r.site;
      if (!hasWebsite) { score += 25; readinessFlags.push('no_website'); }

      // No phone = lower quality lead (-10)
      if (!r.phone) { score -= 10; readinessFlags.push('no_phone'); }

      // Rating: good businesses (3.5+) worth contacting
      if (r.rating && r.rating < 3.0) { score -= 15; readinessFlags.push('low_rating'); }
      else if (r.rating && r.rating >= 4.5) score += 10;
      else if (r.rating && r.rating >= 4.0) score += 5;

      // Review count: low reviews = smaller business = more receptive
      const reviews = r.reviews || 0;
      if (reviews === 0) { score += 15; }
      else if (reviews < 10) { score += 10; }
      else if (reviews < 30) { score += 5; }
      else if (reviews >= 100) { score -= 5; }

      // No social = not digitally active (+10)
      // (Outscraper doesn't return social profiles directly; use absence of website presence)
      if (!hasWebsite) score += 10;

      score = Math.min(100, Math.max(0, score));

      return {
        business_name: r.name,
        phone: r.phone || undefined,
        website_url: r.site || undefined,
        full_address: r.full_address,
        street: r.street,
        city: r.city,
        postal_code: r.postal_code,
        latitude: r.latitude,
        longitude: r.longitude,
        address: r.full_address || undefined,
        country: 'GB',
        category: r.category,
        subtypes: r.subtypes || [],
        description: r.description,
        business_status: r.business_status || 'OPERATIONAL',
        verified: r.verified || false,
        price_range: r.price_range,
        working_hours: r.working_hours,
        photo_count: r.photo_count,
        logo: r.logo,
        gmb_reviews_url: r.reviews_link || undefined,
        rating: r.rating || undefined,
        review_count: reviews,
        place_id: r.place_id || null,
        data_id: null,
        email: undefined,
        hot_score: score,
        readiness_flags: readinessFlags,
        status: 'new' as const,
        source: 'outscraper' as const,
        tags: [] as string[],
        metadata: {} as Record<string, unknown>,
        created_at: now,
        updated_at: now,
        id: Math.random().toString(36).substring(2),
      };
    });

    // Apply filters
    if (filterNoWebsite) leads = leads.filter((l) => !l.website_url);

    // Sort by hot_score descending
    leads.sort((a, b) => b.hot_score - a.hot_score);

    // Track search usage
    try {
      await incrementSearches(userId);
    } catch { /* best effort */ }

    // Record search history (store structured fields for correct re-run)
    try {
      const historyPayload: Record<string, unknown> = {
        query: query,
        location: location,
        user_id: userId,
        limit_count: maxResults,
        result_count: leads.length,
        params: parsed.data,
        created_at: new Date().toISOString(),
      };
      await supabaseAdmin.from('search_history').insert(historyPayload);
    } catch (err) {
      console.warn('[Search] Failed to record search history:', err);
    }

    return c.json({
      query: `${query} in ${location}`,
      count: leads.length,
      results: leads,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during search';
    console.error(`[Search] Error: ${message}`);
    return c.json({ error: 'Search failed', details: message }, 502);
  }
});

// ─── GET /search/history ─────────────────────────────────────────────────────
// Returns recent search history for the authenticated user

router.get('/history', async (c) => {
  try {
    const userId = getUserId(c);

    const { data, error } = await supabaseAdmin
      .from('search_history')
      .select('id, query, location, limit_count, result_count, params, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return c.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Search] GET /history Error:', message);
    return c.json({ error: 'Failed to fetch search history', details: message }, 500);
  }
});

// ─── DELETE /search/history/:id ────────────────────────────────────────────────

router.delete('/history/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    const { error } = await supabaseAdmin
      .from('search_history')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return c.json({ message: 'Search history entry deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Search] DELETE /history/:id Error:', message);
    return c.json({ error: 'Failed to delete search history entry', details: message }, 500);
  }
});

export default router;
