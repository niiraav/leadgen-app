import { Hono } from 'hono';
import { z } from 'zod';
import { serpApiSearch } from '../services/serpapi';

const router = new Hono();

const searchSchema = z.object({
  query: z.string().min(1),
  location: z.string().min(1),
  maxResults: z.number().min(1).max(100).default(20),
  no_website: z.boolean().optional(),
  noWebsite: z.boolean().optional(),
  min_rating: z.number().optional(),
  max_reviews: z.number().optional(),
  no_social: z.boolean().optional(),
});

// ─── POST /search/google-maps ────────────────────────────────────────────────
// IMPORTANT: Route path must stay /search/google-maps. The frontend api.ts
// posts to "/search/google-maps" and expects { leads: Lead[], total: number }
// in the response (SearchResults interface).

router.post('/google-maps', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = searchSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { query, location, maxResults, no_website, noWebsite, min_rating, max_reviews, no_social } = parsed.data;
    const filterNoWebsite = no_website ?? noWebsite ?? false;

    console.log(`[Search] Searching for "${query}" in "${location}" (${maxResults} results)`);

    const rawResults = await serpApiSearch({
      businessType: query,
      location,
      maxResults,
    });

    // Map raw SerpAPI results + compute hot_score
    let leads = rawResults.map((lead) => {
      const now = new Date().toISOString();
      const readinessFlags: string[] = [];
      let score = 50;
      if (!lead.website_url) { score += 20; readinessFlags.push('no_website'); }
      if (!lead.phone) { score += 10; readinessFlags.push('no_phone'); }
      if (lead.rating && lead.rating < 3.5) { score += 15; readinessFlags.push('low_rating'); }
      else if (lead.rating && lead.rating >= 4.5) score += 15;
      else if (lead.rating && lead.rating >= 4) score += 10;
      if (lead.reviews_count == null || lead.reviews_count === 0) { score += 15; }
      else if (lead.reviews_count < 10) { score += 10; }
      else if (lead.reviews_count < 30) { score += 5; }
      if (!lead.email) { score += 5; readinessFlags.push('no_email'); }
      if (!lead.social_profiles || (Array.isArray(lead.social_profiles) && lead.social_profiles.length === 0)) score += 10;
      score = Math.min(100, Math.max(0, score));

      return {
        ...lead,
        country: lead.country ?? '',
        has_website: !!lead.website_url,
        hot_score: score,
        readiness_flags: readinessFlags,
        status: 'new' as const,
        source: 'serpapi' as const,
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
    if (max_reviews) leads = leads.filter((l) => (l.reviews_count || 0) <= max_reviews);
    if (no_social) leads = leads.filter((l) => !l.social_profiles || (Array.isArray(l.social_profiles) && l.social_profiles.length === 0));

    // Sort by hot_score descending
    leads.sort((a, b) => b.hot_score - a.hot_score);

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
