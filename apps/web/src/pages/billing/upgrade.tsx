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

/* ------------------------------------------------------------------ */
/*  Pricing / Upgrade Page                                             */
/* ------------------------------------------------------------------ */

const PLANS = [
  {
    id: "outreach",
    name: "Outreach",
    monthly: "£29",
    annual: "£24",
    annualNote: "per month, billed £288/year — saves £60/year",
    annualSaving: "£60",
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
    featureDetails: {
      leads: "1,000",
      searches: "100",
      verifications: "200",
      aiEmails: "100",
      sequences: "3 (3 steps)",
    },
  },
  {
    id: "growth",
    name: "Growth",
    monthly: "£59",
    annual: "£48",
    annualNote: "per month, billed £576/year — saves £132/year",
    annualSaving: "£132",
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
    featureDetails: {
      leads: "10,000",
      searches: "500",
      verifications: "1,000",
      aiEmails: "500",
      sequences: "20 (5 steps)",
    },
  },
];

const FREE_FEATURES = {
  leads: "25",
  searches: "5",
  verifications: "—",
  aiEmails: "0",
  sequences: "—",
};

export default function BillingUpgradePage() {
  const router = useRouter();
  const [status, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [annual, setAnnual] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const s = (await api.billing.status()) as any;
      setPlan(s.plan);
    } catch {
      // not logged in or error — that's fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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

  return (
    <div className="max-w-4xl mx-auto pb-20 md:pb-8 space-y-8">
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
        <span
          className={`text-sm ${
            !annual ? "text-text font-medium" : "text-text-faint"
          }`}
        >
          Monthly
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            annual ? "bg-blue" : "bg-surface-2"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
              annual ? "translate-x-5" : ""
            }`}
          />
        </button>
        <span
          className={`text-sm ${
            annual ? "text-text font-medium" : "text-text-faint"
          }`}
        >
          Annual
        </span>
        {annual && (
          <span className="text-xs font-medium text-green bg-green/10 px-2 py-0.5 rounded-full">
            Save £60/£132
          </span>
        )}
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
              className={`rounded-xl border p-6 transition-all relative ${
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
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={busy === plan.id}
                  className={`w-full rounded-lg text-sm font-medium py-3 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${
                    plan.popular
                      ? "bg-blue text-white hover:bg-blue/90"
                      : "border border-blue text-blue hover:bg-blue/5"
                  }`}
                >
                  {busy === plan.id ? (
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left px-5 py-3 text-xs text-text-muted font-medium">Feature</th>
                <th className="text-center px-4 py-3 text-xs text-text-muted font-medium">Free</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-text">Outreach</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-blue">Growth</th>
              </tr>
            </thead>
            <tbody>
              <Row icon={<Users className="w-3.5 h-3.5" />} label="Leads" free={FREE_FEATURES.leads} outreach={PLANS[0].featureDetails.leads} growth={PLANS[1].featureDetails.leads} />
              <Row icon={<Search className="w-3.5 h-3.5" />} label="Lead searches" free={FREE_FEATURES.searches} outreach={PLANS[0].featureDetails.searches} growth={PLANS[1].featureDetails.searches} />
              <Row icon={<Mail className="w-3.5 h-3.5" />} label="Email verifications" free={FREE_FEATURES.verifications} outreach={PLANS[0].featureDetails.verifications} growth={PLANS[1].featureDetails.verifications} />
              <Row icon={<Sparkles className="w-3.5 h-3.5" />} label="AI emails" free={FREE_FEATURES.aiEmails} outreach={PLANS[0].featureDetails.aiEmails} growth={PLANS[1].featureDetails.aiEmails} />
              <Row icon={<GitBranch className="w-3.5 h-3.5" />} label="Active sequences" free={FREE_FEATURES.sequences} outreach={PLANS[0].featureDetails.sequences} growth={PLANS[1].featureDetails.sequences} />
              <Row icon={<Zap className="w-3.5 h-3.5" />} label="Pipeline stages" free="—" outreach="Basic" growth="Custom (soon)" />
              <Row icon={<Mail className="w-3.5 h-3.5" />} label="Support" free="—" outreach="Email (48hr)" growth="Priority (24hr)" />
            </tbody>
          </table>
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
            Annual plans save you £60 (Outreach) or £132 (Growth) per year
          </li>
        </ul>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  free,
  outreach,
  growth,
}: {
  icon: React.ReactNode;
  label: string;
  free: string;
  outreach: string;
  growth: string;
}) {
  return (
    <tr className="border-b border-border/20 last:border-0">
      <td className="px-5 py-2.5 text-sm text-text-muted flex items-center gap-1.5">
        {icon}
        {label}
      </td>
      <td className="text-center px-4 py-2.5 text-sm text-text-faint">{free}</td>
      <td className="text-center px-4 py-2.5 text-sm text-text">{outreach}</td>
      <td className="text-center px-4 py-2.5 text-sm text-text font-medium">{growth}</td>
    </tr>
  );
}

export const getServerSideProps = withAuth();
