/**
 * Owner name extraction from GMB reviews.
 *
 * Previously used SerpAPI google_maps_reviews engine to fetch reviews
 * and extract owner names from owner_answer replies. SerpAPI has been
 * removed — owner names can now only be set manually via the
 * PATCH /leads/:id/social-links endpoint.
 *
 * This stub preserves the interface so the enrichment route doesn't
 * need refactoring. It always returns null (no automated extraction).
 */

export async function extractOwnerNameFromReviews(
  _dataId: string | null,
  _placeId: string | null,
  _businessName: string
): Promise<{ owner_name: string | null; first_name: string | null; confidence: 'high' | 'low' }> {
  return { owner_name: null, first_name: null, confidence: 'low' };
}
