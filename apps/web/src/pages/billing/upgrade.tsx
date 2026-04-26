"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { withAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  Check,
  Loader2,
  ArrowUpRight,
  ArrowLeft,
  Clock,
  Zap,
  Users,
  Search,
  Mail,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { TIERS, FREE_TIER, OUTREACH_TIER } from "@leadgen/shared";
import { BillingErrorState } from "@/components/billing/BillingErrorState";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

/* ------------------------------------------------------------------ */
/*  Pricing / Upgrade Page                                             */
/* ------------------------------------------------------------------ */

const PLANS = Object.values(TIERS)
  .filter((t) => t.id !== "free")
  .map((t) => ({
    id: t.id,
    name: t.label,
    monthly: `£${t.monthlyPrice}`,
    annual: `£${Math.round(t.annualPrice / 12)}`,
    annualNote: `per month, billed £${t.annualPrice}/year — saves £${t.annualSavings}/year`,
    annualSaving: `£${t.annualSavings}`,
    popular: true, // single paid plan — always highlight
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
    featureDetails: {
      leads: t.leadsLimit.toLocaleString(),
      searches: t.searchesPerMonth.toLocaleString(),
      verifications: t.emailVerificationsPerMonth.toLocaleString(),
      aiEmails: t.aiEmailsPerMonth.toLocaleString(),
      sequences: `${t.sequencesLimit} (${t.stepsPerSequence} steps)`,
    },
  }));

const FREE_FEATURES = {
  leads: FREE_TIER.leadsLimit.toLocaleString(),
  searches: FREE_TIER.searchesPerMonth.toLocaleString(),
  verifications: FREE_TIER.emailVerificationsPerMonth.toLocaleString(),
  aiEmails: FREE_TIER.aiEmailsPerMonth.toLocaleString(),
  sequences: FREE_TIER.sequencesLimit.toString(),
};

export default function BillingUpgradePage() {
  const router = useRouter();
  const [status, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [annual, setAnnual] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchStatus = useCallback(async () => {
    let cancelled = false;
    try {
      const s = (await api.billing.status()) as any;
      if (!cancelled) {
        setPlan(s.plan);
        setHasError(false);
      }
    } catch (err: any) {
      if (!cancelled) {
        if (err?.message?.includes("Session expired") || err?.message?.includes("Unauthorized")) {
          return;
        }
        setHasError(true);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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

  return (
    <div className="max-w-4xl mx-auto pb-8 space-y-8">
      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-blue" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <BillingErrorState
          onRetry={() => {
            setIsRetrying(true);
            setLoading(true);
            fetchStatus().finally(() => setIsRetrying(false));
          }}
          isRetrying={isRetrying}
        />
      )}

      {!loading && !hasError && (
        <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/billing")}
          className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-text-muted hover:text-text"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue" />
            Upgrade Your Plan
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Get more leads, searches, and AI emails
          </p>
        </div>
      </div>

      {/* Monthly / Annual toggle */}
      <div className="flex items-center justify-center gap-3">
        <ToggleSwitch
          size="md"
          checked={annual}
          onChange={setAnnual}
          labelLeft="Monthly"
          labelRight={
            <span className="flex items-center gap-2">
              Annual
              {annual && (
                <span className="text-xs font-medium text-green bg-green/10 px-2 py-0.5 rounded-full">
                  Save £{OUTREACH_TIER.annualSavings}
                </span>
              )}
            </span>
          }
        />
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {PLANS.map((plan) => {
          const isCurrent = status === plan.id;
          const price = annual ? plan.annual : plan.monthly;
          const note = annual ? plan.annualNote : "/month";

          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 relative ${
                plan.popular
                  ? "border-blue/40 bg-blue/5"
                  : "border-border/60 bg-surface"
              } ${isCurrent ? "ring-2 ring-blue/20" : ""}`}
            >
              {plan.popular && (
                <span className="absolute -top-2.5 left-4 bg-blue text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                  Most Popular
                </span>
              )}

              {/* Trial badge */}
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-lg font-bold text-text">{plan.name}</h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue/10 text-blue uppercase tracking-wide">
                  <Clock className="w-3 h-3" />
                  14-day free trial
                </span>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-1 mb-5">
                <span className="text-3xl font-bold text-text">{price}</span>
                <span className="text-sm text-text-muted">{note}</span>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 mb-6">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-text-muted"
                  >
                    <Check className="w-4 h-4 text-green shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <div className="w-full rounded-lg bg-green/10 text-green text-sm font-medium py-3 text-center flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" />
                  Current plan
                </div>
              ) : (
                <button
                  onClick={() => handleSubscribe()}
                  disabled={busy === "subscribe"}
                  className={`w-full rounded-lg text-sm font-medium py-3 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${
                    plan.popular
                      ? "bg-blue text-white hover:bg-blue/90"
                      : "border border-blue text-blue hover:bg-blue/5"
                  }`}
                >
                  {busy === "subscribe" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4" />
                  )}
                  {status === "free" ? "Start Free Trial" : `Switch to ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue" />
            Feature Comparison
          </h3>
        </div>
        {/* Desktop table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left px-5 py-3 text-xs text-text-muted font-medium">Feature</th>
                <th className="text-center px-4 py-3 text-xs text-text-muted font-medium">Free</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-text">Outreach</th>
              </tr>
            </thead>
            <tbody>
              <Row icon={<Users className="w-3.5 h-3.5" />} label="Leads" free={FREE_FEATURES.leads} outreach={PLANS[0].featureDetails.leads} />
              <Row icon={<Search className="w-3.5 h-3.5" />} label="Lead searches" free={FREE_FEATURES.searches} outreach={PLANS[0].featureDetails.searches} />
              <Row icon={<Mail className="w-3.5 h-3.5" />} label="Email verifications" free={FREE_FEATURES.verifications} outreach={PLANS[0].featureDetails.verifications} />
              <Row icon={<Sparkles className="w-3.5 h-3.5" />} label="AI emails" free={FREE_FEATURES.aiEmails} outreach={PLANS[0].featureDetails.aiEmails} />
              <Row icon={<GitBranch className="w-3.5 h-3.5" />} label="Active sequences" free={FREE_FEATURES.sequences} outreach={PLANS[0].featureDetails.sequences} />
              <Row icon={<Zap className="w-3.5 h-3.5" />} label="Pipeline stages" free="—" outreach="Basic" />
              <Row icon={<Mail className="w-3.5 h-3.5" />} label="Support" free="—" outreach="Email (48hr)" />
            </tbody>
          </table>
        </div>
        {/* Mobile stacked cards */}
        <div className="md:hidden divide-y divide-border/30">
          {[
            { icon: <Users className="w-3.5 h-3.5" />, label: "Leads", free: FREE_FEATURES.leads, outreach: PLANS[0].featureDetails.leads },
            { icon: <Search className="w-3.5 h-3.5" />, label: "Lead searches", free: FREE_FEATURES.searches, outreach: PLANS[0].featureDetails.searches },
            { icon: <Mail className="w-3.5 h-3.5" />, label: "Email verifications", free: FREE_FEATURES.verifications, outreach: PLANS[0].featureDetails.verifications },
            { icon: <Sparkles className="w-3.5 h-3.5" />, label: "AI emails", free: FREE_FEATURES.aiEmails, outreach: PLANS[0].featureDetails.aiEmails },
            { icon: <GitBranch className="w-3.5 h-3.5" />, label: "Active sequences", free: FREE_FEATURES.sequences, outreach: PLANS[0].featureDetails.sequences },
            { icon: <Zap className="w-3.5 h-3.5" />, label: "Pipeline stages", free: "—", outreach: "Basic" },
            { icon: <Mail className="w-3.5 h-3.5" />, label: "Support", free: "—", outreach: "Email (48hr)" },
          ].map((row) => (
            <div key={row.label} className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-text">
                <span className="text-text-muted">{row.icon}</span>
                {row.label}
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-text-muted">{row.free}</span>
                <span className="text-text font-medium">{row.outreach}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ / Trial info */}
      <div className="rounded-xl border border-border/40 bg-surface/50 p-5 space-y-3">
        <h3 className="text-sm font-medium text-text">About the 14-day trial</h3>
        <ul className="space-y-2 text-xs text-text-muted">
          <li className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-green shrink-0 mt-0.5" />
            Start with full access to all plan features for 14 days
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-green shrink-0 mt-0.5" />
            No charge during the trial period
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-green shrink-0 mt-0.5" />
            Cancel anytime before the trial ends with no cost
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-green shrink-0 mt-0.5" />
            Annual plans save you £{OUTREACH_TIER.annualSavings}/year compared to monthly billing
          </li>
        </ul>
      </div>
      </>
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  free,
  outreach,
}: {
  icon: React.ReactNode;
  label: string;
  free: string;
  outreach: string;
}) {
  return (
    <tr className="border-b border-border/20 last:border-0">
      <td className="px-5 py-3 text-text flex items-center gap-2">
        <span className="text-text-muted">{icon}</span>
        {label}
      </td>
      <td className="text-center px-4 py-3 text-text-muted">{free}</td>
      <td className="text-center px-4 py-3 text-text font-medium">{outreach}</td>
    </tr>
  );
}

export const getServerSideProps = withAuth();
