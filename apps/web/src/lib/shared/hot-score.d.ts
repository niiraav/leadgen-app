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
export declare function computeHotScore(lead: HotScoreInput): {
    score: number;
    flags: string[];
};
export {};
//# sourceMappingURL=hot-score.d.ts.map