// apps/api/src/services/search-filter.ts

/**
 * Post-process SerpAPI results: filter + compute hot_score
 */
export function filterAndScoreResults(
  results: Array<Record<string, unknown>>,
  filters?: Record<string, boolean | number>
): Array<Record<string, unknown> & { hot_score: number }> {
  let filtered = [...results];

  // Apply filters
  if (filters?.no_website) {
    filtered = filtered.filter((r) => !r.website);
  }
  if (filters?.min_rating) {
    const min = Number(filters.min_rating);
    filtered = filtered.filter((r) => (Number(r.rating) || 0) >= min);
  }
  if (filters?.max_reviews) {
    const max = Number(filters.max_reviews);
    filtered = filtered.filter((r) => (Number(r.reviews) || 0) <= max);
  }
  if (filters?.no_social) {
    filtered = filtered.filter(
      (r) => !r.social_profiles || (Array.isArray(r.social_profiles) && r.social_profiles.length === 0)
    );
  }

  // Compute hot_score
  return filtered.map((r) => {
    let score = 50;
    const rating = Number(r.rating) || 0;
    const reviews = Number(r.reviews) || 0;
    if (!r.website) score += 20;
    if (rating >= 4.5) score += 15;
    else if (rating >= 4) score += 10;
    if (reviews === 0) score += 15;
    else if (reviews < 10) score += 10;
    else if (reviews < 30) score += 5;
    if (!r.social_profiles || (Array.isArray(r.social_profiles) && r.social_profiles.length === 0)) score += 10;
    return { ...r, hot_score: Math.min(100, Math.max(0, score)) };
  }).sort((a, b) => b.hot_score - a.hot_score);
}