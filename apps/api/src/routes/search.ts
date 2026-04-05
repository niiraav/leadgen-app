import { Hono } from 'hono';
import { z } from 'zod';
import { serpApiSearch } from '../services/serpapi';

const router = new Hono();

const searchSchema = z.object({
  query: z.string().min(1),
  location: z.string().min(1),
  maxResults: z.number().min(1).max(50).default(20),
  noWebsite: z.boolean().default(false),
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

    const { query, location, maxResults, noWebsite } = parsed.data;

    console.log(`[Search] Searching for "${query}" in "${location}" (${maxResults} results)`);

    const rawResults = await serpApiSearch({
      businessType: query,
      location,
      maxResults,
    });

    // Map raw SerpAPI results to lead objects
    let leads = rawResults.map((lead) => {
      const now = new Date().toISOString();
      // Compute hot score
      const readinessFlags: string[] = [];
      let score = 0;
      if (!lead.website_url) { score += 20; readinessFlags.push('no_website'); }
      if (!lead.phone) { score += 10; readinessFlags.push('no_phone'); }
      if (lead.rating && lead.rating < 3.5) { score += 15; readinessFlags.push('low_rating'); }
      if (!lead.email) { score += 5; readinessFlags.push('no_email'); }

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

    if (noWebsite) {
      leads = leads.filter((l) => !l.website_url);
    }

    const response: { leads: typeof leads; total: number } = {
      leads,
      total: leads.length,
    };

    return c.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during search';
    console.error(`[Search] Error: ${message}`);
    return c.json({ error: 'Search failed', details: message }, 502);
  }
});

export default router;
