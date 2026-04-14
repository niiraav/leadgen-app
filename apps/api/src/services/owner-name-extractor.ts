import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: { 'HTTP-Referer': 'https://leadgen-app.local', 'X-Title': 'LeadGen App' },
});

/**
 * Extract owner name from GMB reviews via SerpAPI.
 * Supports both SerpAPI data_id (0x...:0x... format) and Google place_id (ChIJ... format).
 * SerpAPI google_maps_reviews engine accepts either parameter.
 */
export async function extractOwnerNameFromReviews(
  dataId: string | null,
  placeId: string | null,
  businessName: string
): Promise<{ owner_name: string | null; first_name: string | null; confidence: 'high' | 'low' }> {
  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  if (!SERPAPI_KEY) {
    console.warn('[OwnerExtractor] No SERPAPI_KEY configured, skipping extraction');
    return { owner_name: null, first_name: null, confidence: 'low' };
  }

  // Prefer data_id (native SerpAPI identifier); fall back to place_id
  const identifier = dataId || placeId;
  if (!identifier) {
    console.warn('[OwnerExtractor] No data_id or place_id provided, skipping extraction');
    return { owner_name: null, first_name: null, confidence: 'low' };
  }

  try {
    const params = new URLSearchParams({
      engine: 'google_maps_reviews',
      hl: 'en',
      sort_by: 'qualityScore',
      api_key: SERPAPI_KEY,
    });

    if (dataId) {
      params.set('data_id', dataId);
    } else if (placeId) {
      params.set('place_id', placeId);
    }

    console.log(`[OwnerExtractor] Fetching reviews via ${dataId ? 'data_id' : 'place_id'} for "${businessName}"...`);
    const resp = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    const data = await resp.json();
    if (data.error) {
      console.error('[OwnerExtractor] SerpAPI error:', data.error);
      return { owner_name: null, first_name: null, confidence: 'low' };
    }
    const reviews = data.reviews || [];
    console.log(`[OwnerExtractor] Fetched ${reviews.length} reviews`);
    const ownerAnswers: string[] = [];
    for (const review of reviews) {
      if (review.owner_answer?.name) ownerAnswers.push(review.owner_answer.name);
    }
    console.log(`[OwnerExtractor] Found ${ownerAnswers.length} owner name(s) in replies`);
    if (!ownerAnswers.length) return { owner_name: null, first_name: null, confidence: 'low' };
    const counts: Record<string, number> = {};
    for (const n of ownerAnswers) counts[n] = (counts[n] || 0) + 1;
    const topEntry = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const topName = topEntry[0][0];
    const isGeneric = ['owner', 'manager', 'management', 'team', 'staff', 'admin', 'business']
      .some(w => topName.toLowerCase().includes(w));
    if (isGeneric) return { owner_name: topName, first_name: null, confidence: 'low' };
    try {
      const aiResp = await openai.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: `Extract ONLY the first name from: "${topName}". Business: "${businessName}". Return just the first name or "null".` }],
        max_tokens: 20, temperature: 0,
      });
      const firstName = aiResp.choices[0]?.message?.content?.trim();
      const isValid = firstName && firstName !== 'null' && firstName.length > 1 && firstName.length < 30;
      return { owner_name: topName, first_name: isValid ? firstName : null, confidence: isValid ? 'high' : 'low' };
    } catch { return { owner_name: topName, first_name: null, confidence: 'low' }; }
  } catch { return { owner_name: null, first_name: null, confidence: 'low' }; }
}
