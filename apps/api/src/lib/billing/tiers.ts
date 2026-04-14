/**
 * Convenience re-export of tier data.
 * We inline the types and logic here to avoid the rootDir constraint
 * that prevents importing directly from @leadgen/shared in some TS configs.
 * The canonical source is packages/shared/src/tiers.ts.
 */

export interface PlanTier {
  id: string;
  label: string;
  priceMonthly: number;
  priceAnnual: number;
  leadLimit: number;
  searchesPerMonth: number;
  emailVerificationsPerMonth: number;
  aiEmailsPerMonth: number;
  sequenceContactLimit: number;
  customStages: boolean;
  features: string[];
}

export type CanonicalPlanId = 'free' | 'outreach' | 'growth';

export const CANONICAL_PLANS = ['free', 'outreach', 'growth'] as const;

export const TIERS: Record<string, PlanTier> = {
  free: {
    id: 'free',
    label: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
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
    priceAnnual: 24,
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
    priceAnnual: 48,
    leadLimit: 10_000,
    searchesPerMonth: 5_000,
    emailVerificationsPerMonth: 1_000,
    aiEmailsPerMonth: 500,
    sequenceContactLimit: 500,
    customStages: false,
    features: ['search', 'leads', 'ai_emails', 'email_verifications', 'sequences', 'custom_stages'],
  },
};

export type PlanId = keyof typeof TIERS;

export function getTier(plan: string | null | undefined): PlanTier {
  return (plan && TIERS[plan]) || TIERS.free;
}

export function canonicalPlan(plan: string | null | undefined): CanonicalPlanId {
  if (!plan || plan === 'free') return 'free';
  if (plan === 'outreach') return 'outreach';
  if (plan === 'growth') return 'growth';
  return 'free';
}

export function getUserLimits(profile: { plan?: string | null; subscription_status?: string | null }): {
  leadLimit: number;
  searchesPerMonth: number;
  emailVerificationsPerMonth: number;
  aiEmailsPerMonth: number;
  sequenceContactLimit: number;
  customStages: boolean;
  features: string[];
  isPaid: boolean;
} {
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
