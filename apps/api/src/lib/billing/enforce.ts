/**
 * Credit enforcement middleware and feature gates.
 * Used by route handlers to check if a user is allowed to perform an action.
 *
 * Post-consolidation: only 2 tiers (free / outreach = LeadGen Pro).
 * Enforcement is simple: free users get 25 leads, 5 searches, nothing else.
 * Paid users get everything.
 */
import { supabaseAdmin } from '../../db';
import { getTier, canonicalPlan, type CanonicalPlan } from '@leadgen/shared';
import { getUsage } from '../usage';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnforcementResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export interface FeatureGateResult {
  allowed: boolean;
  upgradeRequired: string | null;
}

export class EnforcementError extends Error {
  public upgradeRequired: boolean;
  public limit: number;
  public remaining: number;

  constructor(message: string, opts: { upgradeRequired?: boolean; limit?: number; remaining?: number } = {}) {
    super(message);
    this.name = 'EnforcementError';
    this.upgradeRequired = opts.upgradeRequired ?? false;
    this.limit = opts.limit ?? 0;
    this.remaining = opts.remaining ?? 0;
  }
}

// ─── Action → usage_tracking field mapping ──────────────────────────────────

type CreditAction = 'search' | 'lead' | 'email_verification' | 'ai_email' | 'enrichment' | 'sequence_contact';

const ACTION_FIELD_MAP: Record<CreditAction, { usageField: string; limitField: string; label: string }> = {
  search: { usageField: 'searches_count', limitField: 'searchesPerMonth', label: 'Searches' },
  lead: { usageField: 'leads_count', limitField: 'leadsLimit', label: 'Leads' },
  email_verification: { usageField: 'email_verifications_count', limitField: 'emailVerificationsPerMonth', label: 'Email verifications' },
  ai_email: { usageField: 'ai_emails_count', limitField: 'aiEmailsPerMonth', label: 'AI emails' },
  enrichment: { usageField: 'enrichment_count', limitField: 'searchesPerMonth', label: 'Enrichments' },
  sequence_contact: { usageField: 'leads_count', limitField: 'sequencesLimit', label: 'Sequence contacts' },
};

// ─── Feature gate tiers ─────────────────────────────────────────────────────

/**
 * Minimum plan tier required for each feature.
 * Post-consolidation: only 'outreach' (paid) or 'free' gates remain.
 */
const FEATURE_GATES: Record<string, CanonicalPlan> = {
  sequences: 'outreach',
  custom_stages: 'outreach',
  email_verifications: 'outreach',
  bulk_export: 'outreach',
  api_access: 'outreach',
  team_members: 'outreach',
};

const TIER_HIERARCHY: Record<CanonicalPlan, number> = {
  free: 0,
  outreach: 1,
};

// ─── enforceCredits ───────────────────────────────────────────────────────────

/**
 * Check if a user has enough credits remaining for the given action.
 * Returns { allowed, remaining, limit }.
 * If not allowed, throws EnforcementError with upgrade_required flag.
 */
export async function enforceCredits(
  userId: string,
  action: CreditAction,
  amount: number = 1
): Promise<EnforcementResult> {
  const mapping = ACTION_FIELD_MAP[action];
  if (!mapping) {
    throw new EnforcementError(`Unknown action: ${action}`);
  }

  // 1. Look up user's subscription — prefer active/trialing, fall back to profiles
  let plan: string = 'free';
  let subscriptionStatus: string | null = null;

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const activeSub = (subs || []).find((s: any) => s.status === 'active' || s.status === 'trialing');
  const sub = activeSub || (subs || [])[0];

  if (sub) {
    plan = (sub as any).plan || 'free';
    subscriptionStatus = (sub as any).status || null;
  } else {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('plan, subscription_status')
      .eq('id', userId)
      .maybeSingle();

    plan = (profile as any)?.plan || 'free';
    subscriptionStatus = (profile as any)?.subscription_status || null;
  }

  // 2. Get tier limits
  const tier = getTier(plan);
  const limit = (tier as any)[mapping.limitField] as number;

  // If the limit is 0, the feature is not available on this tier
  if (limit === 0) {
    throw new EnforcementError(
      `${mapping.label} not available on ${tier.label} plan. Upgrade to LeadGen Pro to use this feature.`,
      { upgradeRequired: true, limit: 0, remaining: 0 }
    );
  }

  // 3. Check subscription status — deny if not active/trialing
  const HARD_DENY_STATES = ['paused', 'unpaid', 'incomplete', 'incomplete_expired', 'cancelled', 'canceled'];
  const SOFT_DENY_STATES = ['past_due', 'grace_period'];

  if (HARD_DENY_STATES.includes(subscriptionStatus || '')) {
    throw new EnforcementError(
      `Subscription is ${subscriptionStatus}. Please update your payment method or resubscribe.`,
      { upgradeRequired: false, limit, remaining: 0 }
    );
  }

  if (SOFT_DENY_STATES.includes(subscriptionStatus || '')) {
    throw new EnforcementError(
      `Subscription is ${subscriptionStatus}. Please update your payment method to restore access.`,
      { upgradeRequired: false, limit, remaining: 0 }
    );
  }

  // 4. Get current month usage
  const usage = await getUsage(userId);
  const used = (usage as any)[mapping.usageField] as number ?? 0;
  const remaining = Math.max(0, limit - used);

  // 5. Check if enough credits
  const allowed = remaining >= amount;

  if (!allowed) {
    throw new EnforcementError(
      `${mapping.label} limit reached (${used}/${limit}). Upgrade your plan for more credits.`,
      { upgradeRequired: true, limit, remaining }
    );
  }

  return { allowed, remaining, limit };
}

// ─── enforceFeatureGate ──────────────────────────────────────────────────────

/**
 * Check if the user's plan supports a specific feature.
 * Returns { allowed, upgradeRequired } where upgradeRequired is the plan needed or null.
 */
export async function enforceFeatureGate(
  userId: string,
  feature: string
): Promise<FeatureGateResult> {
  const requiredTier = FEATURE_GATES[feature];

  // If no gate defined for this feature, it's available to all
  if (!requiredTier) {
    return { allowed: true, upgradeRequired: null };
  }

  // Look up user's plan and subscription status
  let plan: string = 'free';
  let subscriptionStatus: string | null = null;

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const activeSub = (subs || []).find((s: any) => s.status === 'active' || s.status === 'trialing');
  const sub = activeSub || (subs || [])[0];

  if (sub) {
    plan = (sub as any).plan || 'free';
    subscriptionStatus = (sub as any).status || null;
  } else {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('plan, subscription_status')
      .eq('id', userId)
      .maybeSingle();

    plan = (profile as any)?.plan || 'free';
    subscriptionStatus = (profile as any)?.subscription_status || null;
  }

  // If subscription is in a bad state, deny regardless of plan
  const HARD_DENY_STATES = ['paused', 'unpaid', 'incomplete', 'incomplete_expired', 'cancelled', 'canceled'];
  const SOFT_DENY_STATES = ['past_due', 'grace_period'];

  if (HARD_DENY_STATES.includes(subscriptionStatus || '') || SOFT_DENY_STATES.includes(subscriptionStatus || '')) {
    const tierInfo = getTier(requiredTier);
    return {
      allowed: false,
      upgradeRequired: `Subscription is ${subscriptionStatus}. Please update your payment method or resubscribe to ${tierInfo.label} (£${tierInfo.monthlyPrice}/mo).`,
    };
  }

  const userTier = canonicalPlan(plan) as CanonicalPlan;
  const userLevel = TIER_HIERARCHY[userTier] ?? 0;
  const requiredLevel = TIER_HIERARCHY[requiredTier] ?? 0;

  if (userLevel >= requiredLevel) {
    return { allowed: true, upgradeRequired: null };
  }

  // Format the required tier label
  const tierInfo = getTier(requiredTier);
  return {
    allowed: false,
    upgradeRequired: `${tierInfo.label} plan required (${tierInfo.label} — £${tierInfo.monthlyPrice}/mo)`,
  };
}
