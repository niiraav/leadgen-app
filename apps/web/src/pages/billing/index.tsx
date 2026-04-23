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
  Zap,
  Mail,
  Users,
  Search,
  Settings,
  Clock,
  AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Billing & Plan Page                                                */
/* ------------------------------------------------------------------ */

// Tier definitions (must match tiers.ts in shared package)
const PLANS = [
  {
    id: "outreach",
    name: "Outreach",
    monthly: "£29",
    annual: "£24",
    annualNote: "per month, billed £288/year — saves £60/year",
    features: [
      "1,000 leads",
      "Up to 100 lead searches/month",
      "200 email verifications/month",
      "100 AI emails/month",
      "Up to 3 active sequences (3 steps each)",
      "Basic analytics",
      "Email support (48hr)",
    ],
    priceKey: "outreach",
  },
  {
    id: "growth",
    name: "Growth",
    monthly: "£59",
    annual: "£48",
    annualNote: "per month, billed £576/year — saves £132/year",
    features: [
      "10,000 leads",
      "Up to 500 lead searches/month",
      "1,000 email verifications/month",
      "500 AI emails/month",
      "Up to 20 active sequences (5 steps each)",
      "Full analytics",
      "Custom pipeline stages (coming soon)",
      "Priority support (24hr)",
    ],
    priceKey: "growth",
    popular: true,
  },
];

const FREE_PLAN_NOTE = "25 leads · 5 lead searches · 0 AI emails / month";

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

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber">
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

function ProgressBar({
  used,
  limit,
  label,
  icon,
}: {
  used: number;
  limit: number;
  label: string;
  icon: React.ReactNode;
}) {
  const isUnlimited = limit < 0;
  const pct = isUnlimited
    ? 0
    : limit > 0
    ? Math.min(100, (used / limit) * 100)
    : 0;
  const over = !isUnlimited && used > limit;
  const color = over ? "bg-red" : pct > 80 ? "bg-amber" : "bg-blue";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-text-muted">
          {icon}
          {label}
        </span>
        <span className={over ? "text-red font-medium" : "text-text-muted"}>
          {isUnlimited
            ? `${used} / ∞`
            : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
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

  const fetchAll = useCallback(async () => {
    try {
      await api.billing.sync().catch(() => {});
      const [s, u] = await Promise.all([
        api.billing.status() as unknown as Promise<BillingStatus>,
        api.billing.usage() as unknown as Promise<UsageData>,
      ]);
      setStatus(s);
      setUsage(u);
    } catch (err: any) {
      console.error("[Billing] Load failed:", err.message);
    } finally {
      setLoading(false);
    }
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

  const handleSubscribe = async (planId: string) => {
    setBusy(planId);
    try {
      const { url } = await api.billing.checkout(
        planId,
        annual ? "annual" : "monthly"
      );
      window.location.href = url;
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

  const handleTopUp = async (tier: "100" | "500") => {
    setBusy(`topup-${tier}`);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/billing/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Top-up failed");
        setBusy(null);
      }
    } catch {
      toast.error("Top-up failed");
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue" />
      </div>
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
    <div className="max-w-5xl mx-auto pb-20 md:pb-8 space-y-8">
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

      {/* --- Current Plan Summary --- */}
      {status && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-text-faint uppercase tracking-wide">
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
          <div className="flex items-center gap-2">
            <span
              className={`text-xs ${
                !annual ? "text-text" : "text-text-faint"
              }`}
            >
              Monthly
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                annual ? "bg-blue" : "bg-surface-2"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  annual ? "translate-x-5" : ""
                }`}
              />
            </button>
            <span
              className={`text-xs ${
                annual ? "text-text" : "text-text-faint"
              }`}
            >
              Annual <span className="text-green font-medium">Save £60/£132</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLANS.map((plan) => {
            const isCurrentPlan = status?.plan === plan.id && isSubscribed;
            const price = annual ? plan.annual : plan.monthly;
            const note = annual ? plan.annualNote : "/month";

            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-5 transition-all relative ${
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
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={busy === plan.id}
                    className="w-full rounded-lg bg-blue text-white text-xs font-medium py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-blue/90 transition-colors"
                  >
                    {busy === plan.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    )}
                    Upgrade to {plan.name}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={busy === plan.id}
                    className="w-full rounded-lg border border-blue text-blue text-xs font-medium py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-blue/5 transition-colors"
                  >
                    {busy === plan.id ? (
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
        <div className="rounded-xl border border-border/60 bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-text">Free</h3>
              <p className="text-xs text-text-muted mt-0.5">
                {FREE_PLAN_NOTE}
              </p>
            </div>
            <span className="text-xs text-text-faint">Current</span>
          </div>
        </div>
      )}

      {/* --- Top-up credits --- */}
      {isSubscribed && (
        <div className="rounded-xl border border-border/60 bg-surface p-5">
          <h3 className="text-sm font-medium text-text mb-3 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber" />
            Top-up credits
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Need extra email verifications this month?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleTopUp("100")}
              disabled={busy === "topup-100"}
              className="rounded-lg border border-border/60 bg-surface-2 text-xs font-medium px-4 py-2 text-text hover:border-blue/40 hover:text-blue transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === "topup-100" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                "+"
              )}
              100 credits — £5
            </button>
            <button
              onClick={() => handleTopUp("500")}
              disabled={busy === "topup-500"}
              className="rounded-lg border border-border/60 bg-surface-2 text-xs font-medium px-4 py-2 text-text hover:border-blue/40 hover:text-blue transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === "topup-500" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                "+"
              )}
              500 credits — £20
            </button>
          </div>
        </div>
      )}

      {/* --- Coming Soon --- */}
      <div className="rounded-xl border border-border/40 bg-surface/50 p-5">
        <h3 className="text-sm font-medium text-text-faint mb-2">
          Coming soon on Growth tier
        </h3>
        <ul className="space-y-1.5">
          {[
            "Custom pipeline stages",
            "Team collaboration",
            "API access",
            "CRM integrations",
          ].map((f) => (
            <li key={f} className="text-xs text-text-faint flex items-center gap-2">
              <Settings className="w-3 h-3 opacity-40" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
