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
export const TIERS = {
    free: {
        id: 'free',
        label: 'Free',
        priceMonthly: 0,
        priceAnnual: 0,
        annualSavings: 0,
        leadLimit: 50,
        searchesPerMonth: 50,
        emailVerificationsPerMonth: 0,
        aiEmailsPerMonth: 10,
        sequenceContactLimit: 0,
        customStages: false,
        features: ['search', 'leads'],
    },
    outreach: {
        id: 'outreach',
        label: 'Outreach',
        priceMonthly: 29,
        priceAnnual: 24, // billed £288/year, save £60
        annualSavings: 60,
        leadLimit: 1_000,
        searchesPerMonth: 1_000,
        emailVerificationsPerMonth: 200,
        aiEmailsPerMonth: 100,
        sequenceContactLimit: 0,
        customStages: false,
        features: ['search', 'leads', 'ai_emails', 'email_verifications'],
    },
    growth: {
        id: 'growth',
        label: 'Growth',
        priceMonthly: 59,
        priceAnnual: 48, // billed £576/year, save £132
        annualSavings: 132,
        leadLimit: 10_000,
        searchesPerMonth: 5_000,
        emailVerificationsPerMonth: 1_000,
        aiEmailsPerMonth: 500,
        sequenceContactLimit: 500,
        customStages: false,
        features: ['search', 'leads', 'ai_emails', 'email_verifications', 'sequences', 'custom_stages'],
    },
};
/** Canonical plan IDs only (excludes legacy aliases) */
export const CANONICAL_PLANS = ['free', 'outreach', 'growth'];
export function getTier(plan) {
    return (plan && TIERS[plan]) || TIERS.free;
}
/** Resolve plan names to canonical IDs */
export function canonicalPlan(plan) {
    if (!plan || plan === 'free')
        return 'free';
    if (plan === 'outreach')
        return 'outreach';
    if (plan === 'growth')
        return 'growth';
    return 'free';
}
export function getUserLimits(profile) {
    const tier = getTier(profile.plan);
    const isPaid = profile.subscription_status === 'active' || profile.subscription_status === 'trialing';
    return {
        leadLimit: tier.leadLimit,
        searchesPerMonth: tier.searchesPerMonth,
        emailVerificationsPerMonth: tier.emailVerificationsPerMonth,
        aiEmailsPerMonth: tier.aiEmailsPerMonth,
        sequenceContactLimit: tier.sequenceContactLimit,
        customStages: tier.customStages,
        features: [...tier.features],
        isPaid,
    };
}
//# sourceMappingURL=tiers.js.map