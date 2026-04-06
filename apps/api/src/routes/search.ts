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
    // Hot = businesses most likely to respond to cold outreach
    let leads = rawResults.map((lead) => {
      const now = new Date().toISOString();
      const readinessFlags: string[] = [];

      // Base at 40, scale by negative signals (things that make them HOT)
      let score = 40;

      // No website = they need digital help the most (+25)
      // Only if website is explicitly absent, not just unknown
      const hasWebsite = lead.website_url !== undefined && lead.website_url !== null && lead.website_url !== '';
      if (!hasWebsite) { score += 25; readinessFlags.push('no_website'); }

      // No phone = lower quality lead (harder to verify reach) (-10)
      if (!lead.phone) { score -= 10; readinessFlags.push('no_phone'); }

      // Rating: good businesses (3.5+) worth contacting, bad ones less so
      if (lead.rating && lead.rating < 3.0) { score -= 15; readinessFlags.push('low_rating'); }
      else if (lead.rating && lead.rating >= 4.5) score += 10;
      else if (lead.rating && lead.rating >= 4.0) score += 5;

      // Review count: low reviews = smaller business = more receptive to outreach
      if (lead.review_count == null || lead.review_count === 0) { score += 15; }
      else if (lead.review_count < 10) { score += 10; }
      else if (lead.review_count < 30) { score += 5; }
      else if (lead.review_count >= 100) { score -= 5; } // Established, less likely to respond

      // No email = they're not actively doing email marketing (+5)
      if (!lead.email) { score += 5; readinessFlags.push('no_email'); }

      // No social = not digitally active (+10)
      const hasSocial = Array.isArray((lead as any).social_profiles) && (lead as any).social_profiles.length > 0;
      if (!hasSocial) score += 10;

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
    if (max_reviews) leads = leads.filter((l) => (l.review_count || 0) <= max_reviews);
    if (no_social) leads = leads.filter((l) => !(l as any).social_profiles || (Array.isArray((l as any).social_profiles) && (l as any).social_profiles.length === 0));

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
