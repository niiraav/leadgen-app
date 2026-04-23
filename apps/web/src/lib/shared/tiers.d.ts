/**
 * Plan tiers — the single source of truth for billing limits.
 * All prices in GBP (£). Product called Gapr throughout.
 *
 * Tiers: free / outreach / growth
 * outreach = £29/mo, growth = £59/mo
 *
 * CONSTRAINTS:
 * - No hardcoded plan strings in components — use TIERS map
 * - Custom pipeline stages: "Coming soon on Growth" — no functionality built
 */
export interface PlanTier {
    id: string;
    label: string;
    priceMonthly: number;
    priceAnnual: number;
    annualSavings: number;
    leadLimit: number;
    searchesPerMonth: number;
    emailVerificationsPerMonth: number;
    aiEmailsPerMonth: number;
    sequenceContactLimit: number;
    customStages: boolean;
    features: string[];
}
export declare const TIERS: Record<string, PlanTier>;
export type PlanId = keyof typeof TIERS;
/** Canonical plan IDs only (excludes legacy aliases) */
export declare const CANONICAL_PLANS: readonly ["free", "outreach", "growth"];
export type CanonicalPlanId = typeof CANONICAL_PLANS[number];
export declare function getTier(plan: string | null | undefined): PlanTier;
/** Resolve plan names to canonical IDs */
export declare function canonicalPlan(plan: string | null | undefined): CanonicalPlanId;
export declare function getUserLimits(profile: {
    plan?: string | null;
    subscription_status?: string | null;
}): {
    leadLimit: number;
    searchesPerMonth: number;
    emailVerificationsPerMonth: number;
    aiEmailsPerMonth: number;
    sequenceContactLimit: number;
    customStages: boolean;
    features: string[];
    isPaid: boolean;
};
//# sourceMappingURL=tiers.d.ts.map