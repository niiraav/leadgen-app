"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { withAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  CreditCard,
  Check,
  Loader2,
  ExternalLink,
  TrendingUp,
  ArrowUpRight,
  Mail,
  Users,
  Search,
  Settings,
  Clock,
  AlertTriangle,
  X,
} from "lucide-react";
import { TIERS, FREE_TIER, OUTREACH_TIER } from "@leadgen/shared";
import { BillingErrorState } from "@/components/billing/BillingErrorState";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { ProgressBar } from "@/components/billing/ProgressBar";

/* ------------------------------------------------------------------ */
/*  Billing & Plan Page                                                */
/* ------------------------------------------------------------------ */

const PLANS = Object.values(TIERS)
  .filter((t) => t.id !== "free")
  .map((t) => ({
    id: t.id,
    name: t.label,
    monthly: `£${t.monthlyPrice}`,
    annual: `£${Math.round(t.annualPrice / 12)}`,
    annualNote: `per month, billed £${t.annualPrice}/year — saves £${t.annualSavings}/year`,
    features: [
      `${t.leadsLimit.toLocaleString()} leads`,
      `Up to ${t.searchesPerMonth.toLocaleString()} lead searches/month`,
      `${t.emailVerificationsPerMonth.toLocaleString()} email verifications/month`,
      `${t.aiEmailsPerMonth.toLocaleString()} AI emails/month`,
      `Up to ${t.sequencesLimit} active sequences (${t.stepsPerSequence} steps each)`,
      "Basic analytics",
      "Email support (48hr)",
    ],
    priceKey: t.id,
    popular: false,
  }));

const FREE_PLAN_NOTE = `${FREE_TIER.leadsLimit} leads · ${FREE_TIER.searchesPerMonth} lead searches · ${FREE_TIER.aiEmailsPerMonth} AI emails / month`;

interface BillingStatus {
  plan: string;
  label: string;
  subscription_status: string;
  subscription_ends_at: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  limit: number;
  searches_per_month: number;
  email_verifications: number;
  ai_emails_per_month: number;
  sequence_limit: number;
  price_monthly: number | undefined;
  price_annual: number | undefined;
}

interface UsageData {
  month: string;
  searches_count: number;
  email_verifications_count: number;
  ai_emails_count: number;
  leads_count: number;
}

function TrialBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue/10 text-blue uppercase tracking-wide">
      <Clock className="w-3 h-3" />
      14-day free trial
    </span>
  );
}

function TrialCountdown({ trialEndsAt }: { trialEndsAt: string }) {
  const endsAt = new Date(trialEndsAt);
  const now = new Date();
  const daysLeft = Math.max(
    0,
    Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  if (daysLeft <= 0) return null;

  const urgent = daysLeft <= 3;

  return (
    <div className={`flex items-center gap-1.5 text-xs ${urgent ? "text-red font-medium" : "text-amber"}`}>
      <Clock className="w-3.5 h-3.5" />
      Trial: {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
    </div>
  );
}

function CancelNotice({ endsAt }: { endsAt: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber">
      <AlertTriangle className="w-3.5 h-3.5" />
      Cancels on {new Date(endsAt).toLocaleDateString()}
    </div>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [annual, setAnnual] = useState(false);
  const [showFirstLoginBanner, setShowFirstLoginBanner] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("billing_first_login_banner_dismissed");
    if (!dismissed) setShowFirstLoginBanner(true);
  }, []);

  const dismissFirstLoginBanner = () => {
    localStorage.setItem("billing_first_login_banner_dismissed", "1");
    setShowFirstLoginBanner(false);
  };

  const fetchAll = useCallback(async () => {
    let cancelled = false;
    try {
      await api.billing.sync().catch(() => {});
      const [s, u] = await Promise.all([
        api.billing.status() as unknown as Promise<BillingStatus>,
        api.billing.usage() as unknown as Promise<UsageData>,
      ]);
      if (!cancelled) {
        setStatus(s);
        setUsage(u);
        setHasError(false);
      }
    } catch (err: any) {
      if (!cancelled) {
        console.error("[Billing] Load failed:", err.message);
        setHasError(true);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (router.query.checkout === "success") {
      toast.success("Payment successful! Your plan is active.");
      // Sync from Stripe first (webhook may not have arrived yet), then refresh
      api.billing.sync().catch(() => {}).finally(() => {
        fetchAll();
        router.replace("/billing");
      });
    } else if (router.query.checkout === "cancelled") {
      toast("Checkout cancelled — no changes made.");
      router.replace("/billing");
    }
  }, [router.query]);

  const handleSubscribe = async () => {
    setBusy("subscribe");
    try {
      const data = await api.billing.checkout(
        annual ? "annual" : "monthly"
      );
      if (data.upgraded) {
        toast.success("Subscription upgraded successfully!");
        router.push("/billing?checkout=success");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast.error(err.message || "Checkout failed");
      setBusy(null);
    }
  };

  const handleManage = async () => {
    setBusy("manage");
    try {
      const { url } = await api.billing.portal();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || "Failed to open billing portal");
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto pb-8 space-y-8">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-surface-2 rounded animate-pulse" />
          <div className="h-4 w-72 bg-surface-2 rounded animate-pulse" />
        </div>
        <div className="rounded-xl border border-border/40 bg-surface/50 p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-3 w-24 bg-surface-2 rounded animate-pulse" />
              <div className="h-7 w-32 bg-surface-2 rounded animate-pulse" />
            </div>
            <div className="h-3 w-16 bg-surface-2 rounded animate-pulse" />
          </div>
          <div className="space-y-3 pt-3 border-t border-border/30">
            <div className="h-6 bg-surface-2 rounded animate-pulse" />
            <div className="h-6 bg-surface-2 rounded animate-pulse" />
            <div className="h-6 bg-surface-2 rounded animate-pulse" />
            <div className="h-6 bg-surface-2 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/40 bg-surface/50 p-5 space-y-3 animate-pulse">
            <div className="h-5 w-24 bg-surface-2 rounded" />
            <div className="h-8 w-16 bg-surface-2 rounded" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-surface-2 rounded" />
              <div className="h-3 w-full bg-surface-2 rounded" />
              <div className="h-3 w-full bg-surface-2 rounded" />
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-surface/50 p-5 space-y-3 animate-pulse">
            <div className="h-5 w-24 bg-surface-2 rounded" />
            <div className="h-8 w-16 bg-surface-2 rounded" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-surface-2 rounded" />
              <div className="h-3 w-full bg-surface-2 rounded" />
              <div className="h-3 w-full bg-surface-2 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <BillingErrorState
        onRetry={() => {
          setHasError(false);
          setLoading(true);
          fetchAll();
        }}
        isRetrying={loading}
      />
    );
  }

  const isSubscribed =
    status?.subscription_status === "active" ||
    status?.subscription_status === "trialing";
  const isFree = status?.plan === "free" || !isSubscribed;
  const isTrialing = status?.subscription_status === "trialing" && !!status?.trial_ends_at;
  const isCancelling = status?.cancel_at_period_end === true && !!status?.subscription_ends_at;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
      <div className="max-w-5xl mx-auto pb-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue" />
          Billing & Plan
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Manage your subscription and view monthly usage
        </p>
      </div>

      {/* --- First-login dismissible trial banner --- */}
      {isFree && showFirstLoginBanner && (
        <div className="rounded-xl border border-blue/20 bg-blue/5 p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text">
              Start your free 14-day trial
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Get full access to all Pro features. No credit card required to start — cancel anytime.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => router.push("/billing/upgrade")}
                className="text-xs font-medium text-blue hover:underline"
              >
                Learn more →
              </button>
            </div>
          </div>
          <button
            onClick={dismissFirstLoginBanner}
            className="p-1 rounded hover:bg-blue/10 text-text-muted hover:text-text shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* --- Current Plan Summary --- */}
      {status && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">
                Current plan
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-text capitalize">
                  {status.label}
                </span>
                {status.price_monthly && (
                  <span className="text-sm text-text-muted">
                    {annual
                      ? `£${status.price_annual}/mo`
                      : `£${status.price_monthly}/mo`}
                  </span>
                )}
              </div>
              {/* Trial countdown */}
              {isTrialing && (
                <div className="mt-1.5">
                  <TrialCountdown trialEndsAt={status.trial_ends_at!} />
                </div>
              )}
              {/* Cancel notice */}
              {isCancelling && (
                <div className="mt-1.5">
                  <CancelNotice endsAt={status.subscription_ends_at!} />
                </div>
              )}
              {/* Renewal / expiry date */}
              {status.subscription_ends_at && !isCancelling && (
                <p className="text-xs text-text-muted mt-1">
                  {status.subscription_status === "active"
                    ? `Renews ${new Date(status.subscription_ends_at).toLocaleDateString()}`
                    : status.subscription_status === "cancelled"
                    ? `Access until ${new Date(status.subscription_ends_at).toLocaleDateString()}`
                    : ""}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isSubscribed && status.stripe_customer_id && (
                <button
                  onClick={() => router.push("/billing/manage")}
                  className="flex items-center gap-1.5 text-xs text-blue hover:underline"
                >
                  <Settings className="w-3 h-3" />
                  Manage
                </button>
              )}
              {isSubscribed && status.stripe_customer_id && (
                <button
                  onClick={handleManage}
                  disabled={busy === "manage"}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text"
                >
                  {busy === "manage" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3 h-3" />
                  )}
                  Stripe Portal
                </button>
              )}
            </div>
          </div>

          {/* Usage bars */}
          {usage && (
            <div className="space-y-3">
              <ProgressBar
                label="Leads"
                icon={<Users className="w-3.5 h-3.5" />}
                used={usage.leads_count}
                limit={status.limit}
              />
              <ProgressBar
                label="Searches"
                icon={<Search className="w-3.5 h-3.5" />}
                used={usage.searches_count}
                limit={status.searches_per_month}
              />
              <ProgressBar
                label="Email verifications"
                icon={<Check className="w-3.5 h-3.5" />}
                used={usage.email_verifications_count}
                limit={status.email_verifications}
              />
              <ProgressBar
                label="AI emails"
                icon={<Mail className="w-3.5 h-3.5" />}
                used={usage.ai_emails_count}
                limit={status.ai_emails_per_month}
              />
            </div>
          )}
        </div>
      )}

      {/* --- Plan Comparison --- */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text">
            {isFree ? "Choose a plan" : "Compare plans"}
          </h2>
          {/* Monthly / Annual toggle */}
          <ToggleSwitch
            size="sm"
            checked={annual}
            onChange={setAnnual}
            labelLeft="Monthly"
            labelRight={
              <span>
                Annual{" "}
                <span className="text-green font-medium">
                  Save £{OUTREACH_TIER.annualSavings}/yr
                </span>
              </span>
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLANS.map((plan) => {
            const isCurrentPlan = status?.plan === plan.id && isSubscribed;
            const price = annual ? plan.annual : plan.monthly;
            const note = annual ? plan.annualNote : "/month";

            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 relative ${
                  plan.popular
                    ? "border-blue/40 bg-blue/5"
                    : "border-border/60 bg-surface"
                } ${isCurrentPlan ? "ring-2 ring-blue/20" : ""}`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 left-4 bg-blue text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Popular
                  </span>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text">{plan.name}</h3>
                    <TrialBadge />
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold text-text">
                      {price}
                    </span>
                    <span className="text-sm text-text-muted">{note}</span>
                  </div>
                </div>

                <ul className="space-y-2 mb-5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs text-text-muted"
                    >
                      <Check className="w-3.5 h-3.5 text-green shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrentPlan ? (
                  <div className="w-full rounded-lg bg-green/10 text-green text-xs font-medium py-2.5 text-center flex items-center justify-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Current plan
                  </div>
                ) : isFree ? (
                  <button
                    onClick={() => handleSubscribe()}
                    disabled={busy === "subscribe"}
                    className="w-full rounded-lg bg-blue text-white text-xs font-medium py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-blue/90 transition-colors"
                  >
                    {busy === "subscribe" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    )}
                    Start Free Trial
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe()}
                    disabled={busy === "subscribe"}
                    className="w-full rounded-lg border border-blue text-blue text-xs font-medium py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-blue/5 transition-colors"
                  >
                    {busy === "subscribe" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5" />
                    )}
                    Switch to {plan.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Free plan --- */}
      {isFree && (
        <div className="rounded-xl border border-border/60 bg-surface p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-text">Free</h3>
              <p className="text-xs text-text-muted mt-0.5">
                {FREE_PLAN_NOTE}
              </p>
            </div>
            <span className="text-xs text-text-muted">Current</span>
          </div>
        </div>
      )}

      {/* --- Coming Soon --- */}
      <div className="rounded-xl border border-border/40 bg-surface/50 p-5">
        <h3 className="text-sm font-medium text-text-muted mb-2">
          Coming soon on Gapr Pro
        </h3>
        <ul className="space-y-1.5">
          {[
            "Custom pipeline stages",
            "Team collaboration",
            "API access",
            "CRM integrations",
          ].map((f) => (
            <li key={f} className="text-xs text-text-muted flex items-center gap-2">
              <Settings className="w-3 h-3 opacity-50" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
