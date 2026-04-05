import type { RawLead } from './types';

/**
 * Hot Score computation — run on every lead import.
 * Scoring logic:
 *   No website       → +25 (strong signal they need the service)
 *   Low reviews (<10) → +10 (opportunity to build reputation)
 *   High rating (≥4.5) → +10 (established, likely has budget)
 *   No email         → -10 (harder to contact)
 */
export function computeHotScore(lead: RawLead): { score: number; flags: string[] } {
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
