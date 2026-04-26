/**
 * Plan tiers — single source of truth for LeadGen monorepo.
 *
 * Free  → 25 leads, 5 searches, 5 verifications, 5 AI emails, 1 sequence
 * Pro   → 1,000 leads, 200 searches, 200 verifications, 100 AI emails, 50 sequences
 */

export interface PlanTier {
  id: string;
  label: string;
  monthlyPrice: number;
  annualPrice: number;
  annualSavings: number;
  leadsLimit: number;
  searchesPerMonth: number;
  emailVerificationsPerMonth: number;
  aiEmailsPerMonth: number;
  sequencesLimit: number;
  stepsPerSequence: number;
  customStages: boolean;
  features: string[];
}

export const FREE_TIER: PlanTier = {
  id: 'free',
  label: 'Free',
  monthlyPrice: 0,
  annualPrice: 0,
  annualSavings: 0,
  leadsLimit: 25,
  searchesPerMonth: 5,
  emailVerificationsPerMonth: 5,
  aiEmailsPerMonth: 5,
  sequencesLimit: 1,
  stepsPerSequence: 1,
  customStages: false,
  features: ['search', 'leads', 'ai_emails', 'email_verifications', 'sequences'],
} as const;

export const OUTREACH_TIER: PlanTier = {
  id: 'outreach',
  label: 'LeadGen Pro',
  monthlyPrice: 29,
  annualPrice: 290,
  annualSavings: 58,
  leadsLimit: 1000,
  searchesPerMonth: 200,
  emailVerificationsPerMonth: 200,
  aiEmailsPerMonth: 100,
  sequencesLimit: 50,
  stepsPerSequence: 3,
  customStages: false,
  features: ['search', 'leads', 'ai_emails', 'email_verifications', 'sequences'],
} as const;

export const TIERS: Record<string, PlanTier> = {
  free: FREE_TIER,
  outreach: OUTREACH_TIER,
} as const;

export type PlanId = keyof typeof TIERS;

export const CANONICAL_PLANS = ['free', 'outreach'] as const;
export type CanonicalPlanId = (typeof CANONICAL_PLANS)[number];
export type CanonicalPlan = CanonicalPlanId; // backward-compat alias

export function getTier(plan: string | null | undefined): PlanTier {
  if (!plan) return FREE_TIER;
  const p = plan.toLowerCase().trim();
  if (p === 'outreach' || p === 'leadgen pro' || p === 'pro' || p === 'paid') {
    return OUTREACH_TIER;
  }
  return FREE_TIER;
}

export function canonicalPlan(plan: string | null | undefined): CanonicalPlanId {
  if (!plan) return 'free';
  const p = plan.toLowerCase().trim();
  if (p === 'outreach' || p === 'leadgen pro' || p === 'pro' || p === 'paid') return 'outreach';
  return 'free';
}

export function isPaidTier(plan: string | null | undefined): boolean {
  return getTier(plan).id !== 'free';
}

export function getPlanLimits(plan: string | null | undefined) {
  const tier = getTier(plan);
  return {
    leadsLimit: tier.leadsLimit,
    searchesPerMonth: tier.searchesPerMonth,
    emailVerificationsPerMonth: tier.emailVerificationsPerMonth,
    aiEmailsPerMonth: tier.aiEmailsPerMonth,
    sequencesLimit: tier.sequencesLimit,
    stepsPerSequence: tier.stepsPerSequence,
    customStages: tier.customStages,
    features: [...tier.features],
  };
}

export function getUserLimits(profile: {
  plan?: string | null;
  subscription_status?: string | null;
}): {
  leadsLimit: number;
  searchesPerMonth: number;
  emailVerificationsPerMonth: number;
  aiEmailsPerMonth: number;
  sequencesLimit: number;
  stepsPerSequence: number;
  customStages: boolean;
  features: string[];
  isPaid: boolean;
} {
  const tier = getTier(profile.plan);
  const isPaid =
    profile.subscription_status === 'active' ||
    profile.subscription_status === 'trialing';
  return {
    leadsLimit: tier.leadsLimit,
    searchesPerMonth: tier.searchesPerMonth,
    emailVerificationsPerMonth: tier.emailVerificationsPerMonth,
    aiEmailsPerMonth: tier.aiEmailsPerMonth,
    sequencesLimit: tier.sequencesLimit,
    stepsPerSequence: tier.stepsPerSequence,
    customStages: tier.customStages,
    features: [...tier.features],
    isPaid,
  };
}
