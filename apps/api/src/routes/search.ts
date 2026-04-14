import { Hono } from 'hono';
import { z } from 'zod';
import { searchGoogleMaps } from '../services/outscraper';
import { serpApiSearch } from '../services/serpapi';
import { getUserId, supabaseAdmin } from '../db';
import { incrementSearches } from '../lib/usage';
import { enforceCredits, EnforcementError } from '../lib/billing/enforce';

const router = new Hono();

// ── Search provider feature flag ──────────────────────────────────────────
// SEARCH_PROVIDER env var controls which provider is tried first.
// Values: 'outscraper' (default) | 'serpapi'
// If the primary provider fails or returns 0 results, the other is tried as fallback.
const SEARCH_PROVIDER = (process.env.SEARCH_PROVIDER || 'outscraper').toLowerCase() as 'outscraper' | 'serpapi';
type SearchProvider = 'outscraper' | 'serpapi';

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

    // ── Provider selection + fallback logic ──────────────────────────────────
    // Primary provider determined by SEARCH_PROVIDER env var (default: 'outscraper').
    // If primary fails (error) or returns 0 results, fallback provider is tried.
    // Rollback: set SEARCH_PROVIDER=serpapi to restore old behaviour.
    const primary: SearchProvider = SEARCH_PROVIDER;
    const fallback: SearchProvider = primary === 'outscraper' ? 'serpapi' : 'outscraper';

    interface UnifiedSearchResult {
      name: string;
      phone: string | undefined;
      site: string | undefined;
      full_address: string | undefined;
      street: string | undefined;
      city: string | undefined;
      postal_code: string | undefined;
      latitude: number | undefined;
      longitude: number | undefined;
      category: string | undefined;
      subtypes: string[];
      description: string | undefined;
      business_status: string;
      verified: boolean;
      price_range: string | undefined;
      working_hours: Record<string, string> | undefined;
      photo_count: number | undefined;
      logo: string | undefined;
      reviews_link: string | undefined;
      rating: number | undefined;
      reviews: number | undefined;
      place_id: string | null;
      data_id: string | null;
    }

    const mapSerpResult = (r: any): UnifiedSearchResult => ({
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
        reviews_link: r.gmb_reviews_url || undefined,
        rating: r.rating,
        reviews: r.review_count,
        place_id: r.place_id || null,
        data_id: r.data_id || null,
    });

    const mapOutscraperResult = (r: any): UnifiedSearchResult => ({
        name: r.name,
        phone: r.phone || undefined,
        site: r.site || undefined,
        full_address: r.full_address || undefined,
        street: r.street || undefined,
        city: r.city || undefined,
        postal_code: r.postal_code || undefined,
        latitude: r.latitude,
        longitude: r.longitude,
        category: r.category,
        subtypes: r.subtypes || [],
        description: r.description || undefined,
        business_status: r.business_status || 'OPERATIONAL',
        verified: r.verified || false,
        price_range: r.price_range || undefined,
        working_hours: r.working_hours || undefined,
        photo_count: r.photo_count,
        logo: r.logo || undefined,
        reviews_link: r.reviews_link || undefined,
        rating: r.rating || undefined,
        reviews: r.reviews || undefined,
        place_id: r.place_id || null,
        data_id: null,  // Outscraper does not provide data_id
    });

    let results: UnifiedSearchResult[] = [];
    let usedProvider: SearchProvider = primary;

    // ── Try primary provider ──
    try {
      if (primary === 'outscraper') {
        console.log(`[Search] Outscraper (primary): "${query}" in "${location}" (${maxResults} results)`);
        const outResults = await searchGoogleMaps(query, location, maxResults);
        if (outResults.length > 0) {
          results = outResults.map(mapOutscraperResult);
        }
      } else {
        console.log(`[Search] SerpAPI (primary): "${query}" in "${location}" (${maxResults} results)`);
        const serpResults = await serpApiSearch({ businessType: query, location, maxResults });
        if (serpResults.length > 0) {
          results = serpResults.map(mapSerpResult);
        }
      }
    } catch (primaryErr: any) {
      console.warn(`[Search] ${primary} failed: ${primaryErr.message}, trying ${fallback}...`);
      usedProvider = fallback;
    }

    // ── Fallback if primary returned 0 results or errored ──
    if (results.length === 0 && usedProvider === primary) {
      console.log(`[Search] ${primary} returned 0 results, trying ${fallback}...`);
      usedProvider = fallback;
    }

    if (results.length === 0) {
      try {
        if (usedProvider === 'outscraper') {
          console.log(`[Search] Outscraper (fallback): "${query}" in "${location}" (${maxResults} results)`);
          const outResults = await searchGoogleMaps(query, location, maxResults);
          results = outResults.map(mapOutscraperResult);
        } else {
          console.log(`[Search] SerpAPI (fallback): "${query}" in "${location}" (${maxResults} results)`);
          const serpResults = await serpApiSearch({ businessType: query, location, maxResults });
          results = serpResults.map(mapSerpResult);
        }
      } catch (fallbackErr: any) {
        console.error(`[Search] ${fallback} also failed: ${fallbackErr.message}`);
      }
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
        gmb_reviews_url: lead.reviews_link,
        rating: lead.rating || undefined,
        review_count: lead.reviews || 0,
        place_id: lead.place_id || null,
        data_id: lead.data_id,
        email: undefined,
        hot_score: score,
        readiness_flags: readinessFlags,
        status: 'new' as const,
        source: usedProvider as 'serpapi' | 'outscraper' | 'csv' | 'apollo',
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
