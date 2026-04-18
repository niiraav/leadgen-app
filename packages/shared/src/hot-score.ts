/**
 * Hot Score computation — run on every lead import.
 * Scoring logic:
 *   No website       → +25 (strong signal they need the service)
 *   Low reviews (<10) → +10 (opportunity to build reputation)
 *   High rating (≥4.5) → +10 (established, likely has budget)
 *   No phone         → flag only (neutral — may be enrichable)
 */

interface HotScoreInput {
  business_name: string;
  phone?: string | null;
  website_url?: string | null;
  address?: string | null;
  rating?: number | null;
  review_count?: number | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function computeHotScore(lead: HotScoreInput): { score: number; flags: string[] } {
  let score = 50;
  const flags: string[] = [];

  if (!lead.website_url) {
    score += 25;
    flags.push('no_website');
  }
  if ((lead.review_count ?? 0) < 10) {
    score += 10;
    flags.push('low_reviews');
  }
  if ((lead.rating ?? 0) >= 4.5) {
    score += 10;
  }
  if (!lead.phone) {
    flags.push('no_phone');
  }

  // Cap at 0-100
  score = Math.min(100, Math.max(0, score));
  return { score, flags };
}
