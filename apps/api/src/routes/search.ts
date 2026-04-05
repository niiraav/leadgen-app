import { Hono } from 'hono';
import { z } from 'zod';
import { serpApiSearch } from '../services/serpapi';

const router = new Hono();

const searchSchema = z.object({
  businessType: z.string().min(1),
  location: z.string().min(1),
  maxResults: z.number().min(1).max(50).default(20),
});

// ─── POST /search/google-maps ────────────────────────────────────────────────

router.post('/google-maps', async (c) => {
  const body = await c.req.json();
  const parsed = searchSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  const { businessType, location, maxResults } = parsed.data;

  console.log(`[Search] Searching for "${businessType}" in "${location}" (${maxResults} results)`);

  try {
    const results = await serpApiSearch({
      businessType,
      location,
      maxResults,
    });

    return c.json({
      query: `${businessType} in ${location}`,
      count: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during search';
    console.error(`[Search] Error: ${message}`);
    return c.json({ error: 'Search failed', details: message }, 502);
  }
});

export default router;
