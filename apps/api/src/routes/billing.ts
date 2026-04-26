/**
 * Billing routes — Stripe checkout, customer portal, usage stats, webhook
 * All prices in GBP (£). Product called Gapr throughout.
 *
 * Tiers: free / outreach (£29) — single paid plan (LeadGen Pro)
 * Checkout includes 14-day trial with pause-on-missing-payment.
 * Full webhook handlers: trial_will_end, payment_failed, grace period,
 * subscription lifecycle, downgrade via runDowngrade().
 */
import Stripe from 'stripe';
import { Hono } from 'hono';
import { supabaseAdmin, getUserId } from '../db';
import { getTier, canonicalPlan } from '@leadgen/shared';
import { runDowngrade } from '../lib/billing/downgrade';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

const ORIGIN = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── Price IDs ──────────────────────────────────────────────────────────────
// Single plan: LeadGen Pro (outreach). No growth, no top-up credits.
const PRICES = {
  outreach_monthly: process.env.STRIPE_PRICE_OUTREACH_MONTHLY,
  outreach_annual:  process.env.STRIPE_PRICE_OUTREACH_ANNUAL,
};

// ─── BullMQ billing queue (shared Redis connection) ──────────────────────────
let billingQueue: any = null;

async function getBillingQueue() {
  if (billingQueue) return billingQueue;

  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) {
    console.warn('[Billing] Redis not configured — grace period jobs disabled');
    return null;
  }

  try {
    const { Queue } = await import('bullmq');
    const IORedis = (await import('ioredis')).default;

    const conn = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(redisUrl.includes('upstash') ? { tls: { rejectUnauthorized: false } } : {}),
    });

    billingQueue = new Queue('billing-jobs', {
      connection: conn,
      defaultJobOptions: { removeOnComplete: { count: 100 } },
    });

    return billingQueue;
  } catch (err: any) {
    console.warn('[Billing] BullMQ import failed:', err.message);
    return null;
  }
}

// ─── Plan name helpers ──────────────────────────────────────────────────────

/** Resolve a user ID from a Stripe subscription ID — checks profiles first, then subscriptions table */
async function lookupUserIdBySubscriptionId(subId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_subscription_id', subId)
    .maybeSingle();
  if (profile) return profile.id;

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subId)
    .maybeSingle();
  return sub?.user_id ?? null;
}

/** Map from any plan name (including legacy) to the canonical Stripe price key */
function planToPriceKey(plan: string, period: 'monthly' | 'annual'): string | undefined {
  const c = canonicalPlan(plan);
  if (c === 'free') return undefined;
  return `${c}_${period}`;
}

/** Human-readable plan name for metadata */
function planLabel(plan: string): string {
  const tier = getTier(plan);
  return tier.label;
}

// ═══════════════════════════════════════════════════════════════════════════
const router = new Hono();

// ─── GET /billing/status ─────────────────────────────────────────────────────
router.get('/status', async (c) => {
  const userId = getUserId(c);

  // Query profiles table
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('plan, subscription_status, subscription_ends_at, stripe_customer_id')
    .eq('id', userId)
    .single();

  // Also query subscriptions table (if it exists)
  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = profile?.plan || 'free';
  const tier = getTier(plan);
  const status = profile?.subscription_status || 'none';

  // Derive trial / grace period info from subscription row
  const trialEndsAt = (subscription as any)?.trial_ends_at || null;
  const cancelAtPeriodEnd = (subscription as any)?.cancel_at_period_end || false;
  const gracePeriodEndsAt = (subscription as any)?.grace_period_ends_at || null;
  const isGracePeriod = status === 'past_due' && gracePeriodEndsAt != null;

  return c.json({
    plan,
    subscription_status: status,
    label: tier.label,
    limit: tier.leadsLimit,
    searches_per_month: tier.searchesPerMonth,
    email_verifications: tier.emailVerificationsPerMonth,
    ai_emails_per_month: tier.aiEmailsPerMonth,
    sequence_limit: tier.sequencesLimit,
    subscription_ends_at: profile?.subscription_ends_at,
    trial_ends_at: trialEndsAt,
    cancel_at_period_end: cancelAtPeriodEnd,
    grace_period: isGracePeriod
      ? { active: true, ends_at: gracePeriodEndsAt }
      : { active: false, ends_at: null },
    stripe_customer_id: profile?.stripe_customer_id,
    price_monthly: tier.monthlyPrice,
    price_annual: tier.annualPrice,
  });
});

// ─── POST /billing/sync ──────────────────────────────────────────────────
// Force-sync subscription status from Stripe into the local DB.
// Called by the frontend after a successful checkout redirect when the
// webhook may not have arrived yet (e.g. local dev without stripe listen).
router.post('/sync', async (c) => {
  const userId = getUserId(c);

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return c.json({ plan: 'free', subscription_status: 'none' });
  }

  // Look up ALL subscriptions for this customer, find the best active one
  const subs = await stripe.subscriptions.list({
    customer: profile.stripe_customer_id,
    status: 'all',
    limit: 100,
  });

  if (subs.data.length === 0) {
    // No subscription on Stripe side — keep local as-is
    const { data: p } = await supabaseAdmin
      .from('profiles')
      .select('plan, subscription_status')
      .eq('id', userId)
      .maybeSingle();
    return c.json({ plan: p?.plan || 'free', subscription_status: p?.subscription_status || 'none' });
  }

  // Pick the active/trialing subscription with the highest-tier plan.
  // If multiple active subs exist (shouldn't with our guard), cancel the extras.
  const activeSubs = subs.data.filter(s => s.status === 'active' || s.status === 'trialing');
  const planOrder = ['free', 'outreach']; // ascending

  let sub: any;
  if (activeSubs.length === 0) {
    // No active sub — pick the most recent one (might be cancelled/past_due)
    sub = subs.data.sort((a, b) => b.created - a.created)[0];
  } else if (activeSubs.length === 1) {
    sub = activeSubs[0];
  } else {
    // Multiple active subs — pick highest tier, cancel the rest
    activeSubs.sort((a, b) => {
      const planA = planOrder.indexOf(canonicalPlan(a.metadata?.plan || 'outreach'));
      const planB = planOrder.indexOf(canonicalPlan(b.metadata?.plan || 'outreach'));
      return planB - planA; // highest tier first
    });
    sub = activeSubs[0];

    // Cancel duplicate active subscriptions
    for (let i = 1; i < activeSubs.length; i++) {
      const dup = activeSubs[i];
      console.warn(`[Sync] Cancelling duplicate subscription ${dup.id} for customer ${profile.stripe_customer_id}`);
      try {
        await stripe.subscriptions.cancel(dup.id, { prorate: true });
        await supabaseAdmin.from('subscriptions').update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', dup.id);
      } catch (cancelErr: any) {
        console.warn(`[Sync] Failed to cancel dup sub ${dup.id}:`, cancelErr.message);
      }
    }
  }

  const plan = (sub.metadata?.plan as string) || canonicalPlan('outreach');
  const subStatus = sub.status; // 'trialing', 'active', 'past_due', etc.
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

  // If subscription is fully canceled/past_due with no active sub, run downgrade
  const inactiveStatuses = ['canceled', 'unpaid', 'incomplete_expired'];
  if (inactiveStatuses.includes(subStatus) && activeSubs.length === 0) {
    console.log(`[Sync] Subscription ${subStatus} with no active subs — running downgrade for ${userId}`);
    const result = await runDowngrade(userId);
    return c.json({
      plan: result.plan,
      subscription_status: result.status,
      label: 'Free',
    });
  }

  // Update profiles table
  await supabaseAdmin.from('profiles').update({
    plan,
    subscription_status: subStatus,
    subscription_ends_at: periodEnd,
    stripe_subscription_id: sub.id,
  }).eq('id', userId);

  // Update subscriptions table
  await supabaseAdmin.from('subscriptions').upsert({
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: profile.stripe_customer_id,
    plan,
    status: subStatus,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: periodEnd,
    trial_starts_at: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
    trial_ends_at: trialEnd,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' });

  const tier = getTier(plan);
  return c.json({
    plan,
    subscription_status: subStatus,
    label: tier.label,
    trial_ends_at: trialEnd,
    subscription_ends_at: periodEnd,
  });
});

// ─── GET /billing/usage ──────────────────────────────────────────────────────
router.get('/usage', async (c) => {
  const userId = getUserId(c);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  return c.json(usage || {
    month,
    searches_count: 0,
    email_verifications_count: 0,
    ai_emails_count: 0,
    leads_count: 0,
    enrichment_count: 0,
  });
});

// ─── POST /billing/checkout ──────────────────────────────────────────────────
// One-subscription guard: if the user already has an active/trialing Stripe
// subscription, we upgrade it via proration instead of creating a new one.
router.post('/checkout', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const { plan, period } = body as { plan: string; period: 'monthly' | 'annual' };

  // ── Trial guard ────────────────────────────────────────────────────────
  const { data: profileTrial } = await supabaseAdmin
    .from('profiles')
    .select('trial_used')
    .eq('id', userId)
    .single();

  if (profileTrial?.trial_used === true) {
    return c.json({ error: 'Trial already used. Please contact support to reactivate.', code: 'TRIAL_USED' }, 403);
  }

  const priceKey = planToPriceKey(plan, period);
  const priceId = priceKey ? (PRICES as any)[priceKey] : undefined;

  if (!priceId) {
    console.error('[Checkout] No price ID configured for', priceKey);
    return c.json({ error: `No price configured for ${priceKey}. Contact support.`, code: 'NO_PRICE' }, 400);
  }

  // Get or create Stripe customer
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id, user_email, plan')
    .eq('id', userId)
    .single();

  let customerId = profile?.stripe_customer_id;
  // Verify the customer exists in the current Stripe mode (test vs live).
  if (customerId) {
    try {
      await stripe.customers.retrieve(customerId);
    } catch (retrieveErr: any) {
      console.warn('[Checkout] Customer not found in current Stripe mode, re-creating:', retrieveErr.message);
      customerId = null;
    }
  }
  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: profile?.user_email || undefined,
        metadata: { userId, app: 'gapr' },
      });
      customerId = customer.id;
      await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId);
    } catch (stripeErr: any) {
      console.error('[Checkout] Failed to create Stripe customer:', stripeErr.message);
      return c.json({ error: 'Failed to create billing account. Please try again.', code: 'CUSTOMER_CREATE_FAILED' }, 500);
    }
  }

  const canonical = canonicalPlan(plan);

  // ── One-subscription guard ──────────────────────────────────────────────
  // If the user already has an active or trialing subscription, upgrade it
  // via Stripe's proration instead of creating a second one.
  const existingSubId = profile?.stripe_subscription_id;
  if (existingSubId) {
    try {
      const existingSub = await stripe.subscriptions.retrieve(existingSubId);

      if (existingSub.status === 'active' || existingSub.status === 'trialing') {
        // Upgrade the existing subscription to the new price
        const currentItemId = existingSub.items.data[0]?.id;
        if (!currentItemId) {
          console.warn('[Checkout] Existing subscription has no items, falling back to new checkout');
        } else {
          console.log(`[Checkout] Upgrading existing subscription ${existingSubId} from ${(existingSub as any).metadata?.plan || 'unknown'} to ${canonical}`);

          const updatedSub: any = await stripe.subscriptions.update(existingSubId, {
            items: [{ id: currentItemId, price: priceId }],
            metadata: { userId, plan: canonical },
            proration_behavior: 'create_prorations',
          });

          // Update local DB immediately
          const periodEnd = new Date(updatedSub.current_period_end * 1000).toISOString();
          await supabaseAdmin.from('profiles').update({
            plan: canonical,
            subscription_status: updatedSub.status,
            subscription_ends_at: periodEnd,
          }).eq('id', userId);

          await supabaseAdmin.from('subscriptions').upsert({
            user_id: userId,
            stripe_subscription_id: existingSubId,
            stripe_customer_id: customerId,
            plan: canonical,
            status: updatedSub.status,
            current_period_start: new Date(updatedSub.current_period_start * 1000).toISOString(),
            current_period_end: periodEnd,
            trial_starts_at: updatedSub.trial_start ? new Date(updatedSub.trial_start * 1000).toISOString() : null,
            trial_ends_at: updatedSub.trial_end ? new Date(updatedSub.trial_end * 1000).toISOString() : null,
            cancel_at_period_end: updatedSub.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'stripe_subscription_id' });

          // Return a special response so the frontend knows it was an upgrade, not a new checkout
          return c.json({ upgraded: true, url: `${ORIGIN}/billing?checkout=success`, plan: canonical, subscription_status: updatedSub.status });
        }
      }

      // If subscription is past_due, paused, or unpaid — cancel it and create fresh
      if (['past_due', 'paused', 'unpaid'].includes(existingSub.status)) {
        console.log(`[Checkout] Existing subscription ${existingSubId} is ${existingSub.status}, cancelling before new checkout`);
        try {
          await stripe.subscriptions.cancel(existingSubId, { prorate: true });
        } catch (cancelErr: any) {
          console.warn('[Checkout] Failed to cancel old subscription:', cancelErr.message);
        }
        // Mark old sub as cancelled locally
        await supabaseAdmin.from('subscriptions').update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', existingSubId);
      }
    } catch (retrieveErr: any) {
      // Subscription not found in Stripe — clear stale reference
      console.warn('[Checkout] Existing subscription not found in Stripe, clearing:', retrieveErr.message);
      await supabaseAdmin.from('profiles').update({
        stripe_subscription_id: null,
      }).eq('id', userId);
    }
  }

  // Also check for any OTHER active subscriptions for this customer (edge case:
  // profile.stripe_subscription_id was cleared but Stripe still has one)
  try {
    const allSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    });

    const activeSubs = allSubs.data.filter(
      (s) => s.status === 'active' || s.status === 'trialing'
    );

    if (activeSubs.length > 0 && !profile?.stripe_subscription_id) {
      // Found an active subscription the profile doesn't know about — adopt it
      const sub: any = activeSubs[0];
      console.warn(`[Checkout] Found orphan subscription ${sub.id} for customer ${customerId}, adopting`);
      const subPlan = (sub.metadata?.plan as string) || 'outreach';
      const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

      await supabaseAdmin.from('profiles').update({
        plan: subPlan,
        subscription_status: sub.status,
        subscription_ends_at: periodEnd,
        stripe_subscription_id: sub.id,
      }).eq('id', userId);

      // If the requested plan matches the existing one, just return success
      if (canonicalPlan(subPlan) === canonical) {
        return c.json({ upgraded: true, url: `${ORIGIN}/billing?checkout=success`, plan: subPlan, subscription_status: sub.status });
      }

      // Otherwise upgrade via proration (same logic as above)
      const currentItemId = sub.items.data[0]?.id;
      if (currentItemId) {
        const updatedSub: any = await stripe.subscriptions.update(sub.id, {
          items: [{ id: currentItemId, price: priceId }],
          metadata: { userId, plan: canonical },
          proration_behavior: 'create_prorations',
        });

        const updatedPeriodEnd = new Date(updatedSub.current_period_end * 1000).toISOString();
        await supabaseAdmin.from('profiles').update({
          plan: canonical,
          subscription_status: updatedSub.status,
          subscription_ends_at: updatedPeriodEnd,
        }).eq('id', userId);

        await supabaseAdmin.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: customerId,
          plan: canonical,
          status: updatedSub.status,
          current_period_start: new Date(updatedSub.current_period_start * 1000).toISOString(),
          current_period_end: updatedPeriodEnd,
          cancel_at_period_end: updatedSub.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'stripe_subscription_id' });

        return c.json({ upgraded: true, url: `${ORIGIN}/billing?checkout=success`, plan: canonical, subscription_status: updatedSub.status });
      }
    }
  } catch (listErr: any) {
    console.warn('[Checkout] Failed to list customer subscriptions:', listErr.message);
  }

  // ── First-time buyer: create new checkout session ──────────────────────
  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        trial_settings: {
          end_behavior: { missing_payment_method: 'pause' },
        },
        metadata: { userId, plan: canonical },
      },
      success_url: `${ORIGIN}/billing?checkout=success`,
      cancel_url: `${ORIGIN}/billing?checkout=cancelled`,
      metadata: { userId, plan: canonical, plan_label: planLabel(plan) },
    });

    return c.json({ url: session.url as string });
  } catch (stripeErr: any) {
    console.error('[Checkout] Stripe session creation failed:', stripeErr.message);
    return c.json({ error: 'Checkout session failed. Please try again.', code: 'SESSION_FAILED', detail: stripeErr.message }, 500);
  }
});

// ─── POST /billing/portal ────────────────────────────────────────────────────
router.post('/portal', async (c) => {
  const userId = getUserId(c);

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_customer_id) {
    return c.json({ error: 'No subscription found' }, 404);
  }

  // Create or reuse a portal configuration that only allows cancellation
  // and payment method updates — upgrades go through our /billing/checkout
  // which handles the one-subscription guard.
  let configuration: string | undefined;
  try {
    const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
    const gaprConfig = configs.data.find((cfg: any) => cfg.metadata?.app === 'gapr');
    if (gaprConfig) {
      configuration = gaprConfig.id;
    } else {
      // Create a restricted portal config
      const newConfig = await stripe.billingPortal.configurations.create({
        metadata: { app: 'gapr' },
        features: {
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: 'at_period_end' },
          subscription_update: { enabled: false }, // upgrades via our checkout
          invoice_history: { enabled: true },
        } as any,
        business_profile: {
          headline: 'Gapr — Manage your subscription',
        },
      });
      configuration = newConfig.id;
      console.log('[Portal] Created new portal configuration:', configuration);
    }
  } catch (cfgErr: any) {
    console.warn('[Portal] Could not set portal configuration, using default:', cfgErr.message);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${ORIGIN}/billing`,
    configuration,
  });

  return c.json({ url: session.url });
});

// ─── POST /billing/cancel ────────────────────────────────────────────────────
// Cancel subscription. Trialing users are cancelled immediately (immediate downgrade).
// Paid users cancel at period end by default, unless body.immediate is true.
router.post('/cancel', async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_subscription_id, plan, subscription_status')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_subscription_id) {
    return c.json({ error: 'No active subscription to cancel' }, 404);
  }

  // Trial users always cancel immediately. Paid users default to period end.
  const isTrialing = profile.subscription_status === 'trialing';
  const cancelAtPeriodEnd = isTrialing
    ? false
    : (body.cancel_at_period_end !== false); // default true for paid

  try {
    const sub: any = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

    // Update local DB
    await supabaseAdmin.from('profiles').update({
      subscription_status: sub.status,
      subscription_ends_at: periodEnd,
    }).eq('id', userId);

    const { error: subUpdateErr } = await supabaseAdmin.from('subscriptions').update({
      cancel_at_period_end: cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    }).eq('stripe_subscription_id', profile.stripe_subscription_id);

    if (subUpdateErr) {
      console.error('[Cancel] DB update failed:', subUpdateErr.message);
    }

    console.log(`[Cancel] User ${userId} subscription ${cancelAtPeriodEnd ? 'will cancel at' : 'cancelled immediately (trial)'} period end: ${periodEnd}`);

    return c.json({
      message: cancelAtPeriodEnd
        ? `Subscription will cancel at end of billing period (${periodEnd})`
        : 'Subscription cancelled immediately. You have been downgraded to Free.',
    });
  } catch (stripeErr: any) {
    console.error('[Cancel] Stripe error:', stripeErr.message);
    return c.json({ error: 'Failed to cancel subscription', detail: stripeErr.message }, 500);
  }
});

// ─── POST /billing/reactivate ────────────────────────────────────────────────
// Removes cancel_at_period_end flag — subscription continues as normal.
router.post('/reactivate', async (c) => {
  const userId = getUserId(c);

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_subscription_id, plan')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_subscription_id) {
    return c.json({ error: 'No subscription to reactivate' }, 404);
  }

  try {
    const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);

    // Fully canceled subscription cannot be reactivated — user must re-subscribe
    if (sub.status === 'canceled') {
      return c.json({ error: 'This subscription has fully expired. Please start a new subscription via checkout.', resubscribe: true }, 400);
    }

    if (!sub.cancel_at_period_end) {
      return c.json({ message: 'Subscription is already active — not scheduled for cancellation' });
    }

    // Remove the cancel_at_period_end flag
    const updatedSub: any = await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: false,
    });

    const periodEnd = new Date(updatedSub.current_period_end * 1000).toISOString();

    // Update local DB
    await supabaseAdmin.from('profiles').update({
      subscription_status: updatedSub.status,
      subscription_ends_at: periodEnd,
    }).eq('id', userId);

    const { error: subUpdateErr } = await supabaseAdmin.from('subscriptions').update({
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    }).eq('stripe_subscription_id', profile.stripe_subscription_id);

    if (subUpdateErr) {
      console.error('[Reactivate] DB update failed:', subUpdateErr.message);
    }

    console.log(`[Reactivate] User ${userId} subscription reactivated — next billing: ${periodEnd}`);

    return c.json({ message: `Subscription reactivated! Next billing date: ${periodEnd}` });
  } catch (stripeErr: any) {
    console.error('[Reactivate] Stripe error:', stripeErr.message);
    return c.json({ error: 'Failed to reactivate subscription', detail: stripeErr.message }, 500);
  }
});

// ─── POST /billing/webhook ───────────────────────────────────────────────────
// IMPORTANT: Raw body required for Stripe signature verification.
// This route is NOT behind authMiddleware — Stripe sends its own signature.
router.post('/webhook', async (c) => {
  const sig = c.req.header('stripe-signature') || '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!secret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET not set');
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  const rawBody = await c.req.raw.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  console.log(`[Webhook] ${event.type}`, event.data.object.id);

  try {
    switch (event.type) {
      // ─── checkout.session.completed ────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const uid = session.metadata?.userId;
        if (!uid) break;

        const plan = session.metadata?.plan || 'outreach';
        const subId = session.subscription as string;

        if (subId) {
          // ── One-subscription guard: cancel any OTHER active subs for this user ──
          // before recording the new one. This prevents duplicates when Stripe
          // creates a fresh sub via checkout (our checkout route usually upgrades
          // in-place, but this covers edge cases like double-clicks or portal).
          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('stripe_subscription_id')
            .eq('id', uid)
            .single();

          if (existingProfile?.stripe_subscription_id && existingProfile.stripe_subscription_id !== subId) {
            try {
              const oldSub = await stripe.subscriptions.retrieve(existingProfile.stripe_subscription_id);
              if (oldSub.status === 'active' || oldSub.status === 'trialing') {
                console.warn(`[Webhook] Cancelling old subscription ${existingProfile.stripe_subscription_id} — new sub ${subId} taking over`);
                await stripe.subscriptions.cancel(existingProfile.stripe_subscription_id, { prorate: true });
                // Mark old sub as cancelled locally
                await supabaseAdmin.from('subscriptions').update({
                  status: 'cancelled',
                  updated_at: new Date().toISOString(),
                }).eq('stripe_subscription_id', existingProfile.stripe_subscription_id);
              }
            } catch (oldSubErr: any) {
              console.warn('[Webhook] Could not cancel old subscription:', oldSubErr.message);
            }
          }

          const sub = (await stripe.subscriptions.retrieve(subId)) as any;
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

          // Determine trial end date
          const trialEnd = sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null;

          // Update profiles table (including stripe_subscription_id for later webhook lookups)
          // If trialing, lock trial immediately so user can't restart trial later.
          const profileUpdate: any = {
            plan,
            subscription_status: sub.status,
            subscription_ends_at: periodEnd,
            stripe_subscription_id: subId,
          };
          if (sub.status === 'trialing' && sub.trial_start) {
            profileUpdate.trial_used = true;
            profileUpdate.trial_started_at = new Date(sub.trial_start * 1000).toISOString();
          }
          await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', uid);

          // Create / update subscription row in subscriptions table
          await supabaseAdmin.from('subscriptions').upsert({
            user_id: uid,
            stripe_subscription_id: subId,
            stripe_customer_id: sub.customer as string,
            plan,
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: periodEnd,
            trial_starts_at: sub.trial_start
              ? new Date(sub.trial_start * 1000).toISOString()
              : null,
            trial_ends_at: trialEnd,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'stripe_subscription_id' });

          console.log(`[Webhook] User ${uid} → ${plan} (${sub.status})${trialEnd ? ` trial ends ${trialEnd}` : ''}`);
        }
        break;
      }

      // ─── invoice.payment_succeeded ─────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;

        const profileId = await lookupUserIdBySubscriptionId(subId as string);

        if (profileId) {
          // Reset monthly usage counters on successful renewal
          // Use the subscription period end (UTC) to align with billing cycle
          const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : new Date();
          const month = `${periodEnd.getUTCFullYear()}-${String(periodEnd.getUTCMonth() + 1).padStart(2, '0')}`;
          await supabaseAdmin.from('usage_tracking').upsert({
            user_id: profileId,
            month,
            searches_count: 0,
            email_verifications_count: 0,
            ai_emails_count: 0,
            leads_count: 0,
            enrichment_count: 0,
          }, { onConflict: 'user_id,month' });

          // Also update subscription row
          await supabaseAdmin.from('subscriptions').update({
            status: 'active',
            grace_period_ends_at: null,
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', subId);

          console.log(`[Webhook] Reset usage for ${profileId}, subscription active`);
        }
        break;
      }

      // ─── customer.subscription.trial_will_end ────────────────────────────
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as any;
        const uid = await lookupUserIdBySubscriptionId(sub.id);

        if (uid) {
          const trialEnd = sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : 'unknown';

          console.warn(
            `[Webhook] TRIAL ENDING: User ${uid} — ` +
            `trial ends at ${trialEnd}. Payment method required.`
          );

          console.log(`[Notification] Trial ending soon for user ${uid}`);

          // Update subscriptions table
          await supabaseAdmin.from('subscriptions').update({
            trial_ends_at: trialEnd,
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id);
        }
        break;
      }

      // ─── invoice.payment_failed ──────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (!subId) break;

        const uid = await lookupUserIdBySubscriptionId(subId as string);

        if (uid) {
          // Set subscription_status to 'past_due'
          await supabaseAdmin.from('profiles').update({
            subscription_status: 'past_due',
          }).eq('id', uid);

          // Start 7-day grace period
          const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

          // Update subscriptions table with grace period info
          await supabaseAdmin.from('subscriptions').update({
            status: 'past_due',
            grace_period_ends_at: gracePeriodEnd,
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', subId);

          console.warn(
            `[Webhook] PAYMENT FAILED: User ${uid} — ` +
            `7-day grace period until ${gracePeriodEnd}`
          );

          // Schedule BullMQ grace-period-downgrade job (7 days from now)
          const queue = await getBillingQueue();
          if (queue) {
            await queue.add(
              `grace-period-downgrade-${uid}`,
              { userId: uid, reason: 'payment_failed', subscriptionId: subId },
              { delay: 7 * 24 * 60 * 60 * 1000, jobId: `grace-${uid}-${subId}` }
            );
            console.log(`[Webhook] Scheduled grace-period-downgrade job for ${uid}`);
          }

          // Log credit transaction
          await supabaseAdmin.from('credit_transactions').insert({
            user_id: uid,
            action: 'payment_failed_grace_period',
            amount: 0,
            metadata: {
              subscription_id: subId,
              grace_period_ends_at: gracePeriodEnd,
              invoice_id: invoice.id,
            },
          });
        }
        break;
      }

      // ─── customer.subscription.updated ──────────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        const uid = await lookupUserIdBySubscriptionId(sub.id);

        if (uid) {
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          // Read plan from Stripe metadata (set during checkout/upgrade)
          const newPlan = sub.metadata?.plan;

          // Update profiles — include plan if we got it from metadata
          const profileUpdate: Record<string, any> = {
            subscription_status: sub.status,
            subscription_ends_at: periodEnd,
          };
          if (newPlan) {
            profileUpdate.plan = newPlan;
          }
          await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', uid);

          // Update subscriptions table
          const subUpdate: Record<string, any> = {
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: periodEnd,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          };
          if (newPlan) {
            subUpdate.plan = newPlan;
          }
          await supabaseAdmin.from('subscriptions').update(subUpdate).eq('stripe_subscription_id', sub.id);

          // If subscription is now trialing, unlock AI emails
          // NOTE: ai_emails_locked column doesn't exist yet — skip this update.
          // Feature gates check subscription status directly.

          // If cancel_at_period_end, log for visibility
          if (sub.cancel_at_period_end) {
            console.log(`[Webhook] User ${uid} will be downgraded at period end: ${periodEnd}`);
          }

          // Clear grace period if subscription is active again
          if (sub.status === 'active') {
            // NOTE: ai_emails_locked column doesn't exist yet — skip that update.
            // Feature gates check subscription status directly.

            await supabaseAdmin.from('subscriptions').update({
              grace_period_ends_at: null,
            }).eq('stripe_subscription_id', sub.id);
          }
        }
        break;
      }

      // ─── customer.subscription.deleted / canceled ───────────────────────
      case 'customer.subscription.deleted':
      case 'customer.subscription.canceled': {
        const sub = event.data.object as any;
        const uid = await lookupUserIdBySubscriptionId(sub.id);

        if (uid) {
          // Run full downgrade logic instead of just setting plan='free'
          const result = await runDowngrade(uid);
          console.log(`[Webhook] User ${uid} subscription deleted — downgrade complete:`, JSON.stringify(result));

          // Update subscriptions table
          await supabaseAdmin.from('subscriptions').update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id);

          // Remove any pending grace-period-downgrade jobs
          const queue = await getBillingQueue();
          if (queue) {
            try {
              await queue.remove(`grace-${uid}-${sub.id}`);
            } catch {
              // Job may not exist, ignore
            }
          }
        }
        break;
      }
    }
  } catch (err: any) {
    console.error('[Webhook] Handler error:', err.message);
  }

  return c.json({ received: true });
});

export default router;
