/**
 * Stripe client singleton for the Hono API.
 */
import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not set');
    stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' as any });
  }
  return stripe;
}

/** Price IDs from env */
export const PRICES: Record<string, string> = {
  outreach_monthly: process.env.STRIPE_PRICE_OUTREACH_MONTHLY || '',
  outreach_annual:  process.env.STRIPE_PRICE_OUTREACH_ANNUAL  || '',
  growth_monthly:   process.env.STRIPE_PRICE_GROWTH_MONTHLY   || '',
  growth_annual:    process.env.STRIPE_PRICE_GROWTH_ANNUAL     || '',
  credits_100:      process.env.STRIPE_PRICE_CREDITS_100 || '',
  credits_500:      process.env.STRIPE_PRICE_CREDITS_500 || '',
};

export type PriceKey = keyof typeof PRICES;

/** Map plan + billing period to Stripe price ID */
export function getPriceId(plan: 'outreach' | 'growth', period: 'monthly' | 'annual'): string {
  const key = `${plan}_${period}` as PriceKey;
  return PRICES[key] || '';
}
