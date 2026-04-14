import { Hono } from 'hono';
import { z } from 'zod';
import { searchGoogleMaps } from '../services/outscraper';
import { serpApiSearch } from '../services/serpapi';
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
  min_rating: z.coerce.number().optional(),
  max_reviews: z.coerce.number().optional(),
  no_social: z.boolean().optional(),
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

    const { query, location, maxResults, no_website, noWebsite, min_rating, max_reviews, no_social } = parsed.data;
    const filterNoWebsite = no_website ?? noWebsite ?? false;

    // Try SerpAPI first, fall back to Outscraper
    let results: any[] = [];
    let usedProvider = 'serpapi';

    try {
      console.log(`[Search] SerpAPI: "${query}" in "${location}" (${maxResults} results)`);
      const serpResults = await serpApiSearch({ businessType: query, location, maxResults });
      if (serpResults.length > 0) {
        results = serpResults.map((r: any) => ({
          name: r.business_name,
          phone: r.phone,
          site: r.website_url,
          full_address: r.address,
          street: undefined,
          city: r.city,
          postal_code: undefined,
          latitude: undefined,
          longitude: undefined,
          category: r.category,
          subtypes: [],
          description: undefined,
          business_status: 'OPERATIONAL',
          verified: false,
          price_range: undefined,
          working_hours: undefined,
          photo_count: undefined,
          logo: undefined,
          reviews_link: r.gmb_reviews_url,
          rating: r.rating,
          reviews: r.review_count,
          place_id: r.place_id,
        }));
      }
    } catch (serpErr: any) {
      console.warn(`[Search] SerpAPI failed: ${serpErr.message}, trying Outscraper...`);
      usedProvider = 'outscraper';
    }

    if (results.length === 0 && usedProvider === 'outscraper') {
      console.log(`[Search] Outscraper: "${query}" in "${location}" (${maxResults} results)`);
      results = await searchGoogleMaps(query, location, maxResults);
    }

    // Filter out permanently closed businesses
    let filtered = results.filter((r) => r.business_status !== 'CLOSED_PERMANENTLY');

    // Map results + compute hot_score
    // Hot = businesses most likely to respond to cold outreach
    let leads = filtered.map((lead) => {
      const now = new Date().toISOString();
      const readinessFlags: string[] = [];

      // Base at 40, scale by negative signals (things that make them HOT)
      let score = 40;

      // No website = they need digital help the most (+25)
      const hasWebsite = lead.site !== undefined && lead.site !== null && lead.site !== '';
      if (!hasWebsite) { score += 25; readinessFlags.push('no_website'); }

      // No phone = lower quality lead (-10)
      if (!lead.phone) { score -= 10; readinessFlags.push('no_phone'); }

      // Rating: good businesses (3.5+) worth contacting
      if (lead.rating && lead.rating < 3.0) { score -= 15; readinessFlags.push('low_rating'); }
      else if (lead.rating && lead.rating >= 4.5) score += 10;
      else if (lead.rating && lead.rating >= 4.0) score += 5;

      // Review count: low reviews = smaller business = more receptive
      if (lead.reviews == null || lead.reviews === 0) { score += 15; }
      else if (lead.reviews < 10) { score += 10; }
      else if (lead.reviews < 30) { score += 5; }
      else if (lead.reviews >= 100) { score -= 5; }

      // No social = not digitally active (+10)
      // (Outscraper doesn't return social profiles directly; use absence of website presence)
      if (!hasWebsite) score += 10;

      score = Math.min(100, Math.max(0, score));

      return {
        business_name: lead.name,
        phone: lead.phone || undefined,
        website_url: lead.site || undefined,
        full_address: lead.full_address,
        street: lead.street,
        city: lead.city,
        postal_code: lead.postal_code,
        latitude: lead.latitude,
        longitude: lead.longitude,
        address: lead.full_address || undefined,
        country: 'GB',
        category: lead.category,
        subtypes: lead.subtypes,
        description: lead.description,
        business_status: lead.business_status,
        verified: lead.verified,
        price_range: lead.price_range,
        working_hours: lead.working_hours,
        photo_count: lead.photo_count,
        logo: lead.logo,
        reviews_link: lead.reviews_link,
        rating: lead.rating || undefined,
        review_count: lead.reviews || 0,
        place_id: lead.place_id || null,
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
    if (min_rating) leads = leads.filter((l) => (l.rating || 0) >= min_rating);
    if (max_reviews) leads = leads.filter((l) => (l.review_count || 0) <= max_reviews);
    if (no_social) leads = leads.filter((l) => !l.website_url);

    // Sort by hot_score descending
    leads.sort((a, b) => b.hot_score - a.hot_score);

    // Track search usage
    try {
      await incrementSearches(userId);
    } catch { /* best effort */ }

    // Record search history
    try {
      const historyPayload: Record<string, unknown> = {
        query: `${query} in ${location}`,
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

export default router;
