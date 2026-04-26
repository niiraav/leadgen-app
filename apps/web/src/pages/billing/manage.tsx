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
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Settings,
  Shield,
} from "lucide-react";
import { BillingErrorState } from "@/components/billing/BillingErrorState";

/* ------------------------------------------------------------------ */
/*  Subscription Management Page                                       */
/* ------------------------------------------------------------------ */

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

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  outreach: "Outreach",
};

const PLAN_ORDER = ["free", "outreach"];

export default function BillingManagePage() {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchStatus = useCallback(async () => {
    let cancelled = false;
    try {
      await api.billing.sync().catch(() => {});
      const s = (await api.billing.status()) as unknown as BillingStatus;
      if (!cancelled) {
        setStatus(s);
        setHasError(false);
      }
    } catch (err: any) {
      if (!cancelled) {
        console.error("[BillingManage] Load failed:", err.message);
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

  const handleCancel = async () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setBusy("cancel");
    try {
      await api.billing.cancel();
      toast.success("Subscription will cancel at the end of the billing period.");
      setConfirmCancel(false);
      await fetchStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel subscription");
    } finally {
      setBusy(null);
    }
  };

  const handleReactivate = async () => {
    setBusy("reactivate");
    try {
      await api.billing.reactivate();
      toast.success("Subscription reactivated! You're all set.");
      await fetchStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate subscription");
    } finally {
      setBusy(null);
    }
  };

  const handlePortal = async () => {
    setBusy("portal");
    try {
      const { url } = await api.billing.portal();
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || "Failed to open billing portal");
      setBusy(null);
    }
  };

  const handleChangePlan = (direction: "upgrade" | "downgrade") => {
    router.push(`/billing/upgrade?action=${direction}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue" />
      </div>
    );
  }

  if (hasError || !status) {
    return (
      <BillingErrorState
        onRetry={() => {
          setHasError(false);
          setLoading(true);
          fetchStatus();
        }}
        isRetrying={loading}
        showBack
        onBack={() => router.push("/billing")}
      />
    );
  }

  const isSubscribed =
    status.subscription_status === "active" ||
    status.subscription_status === "trialing";
  const isFree = status.plan === "free" || !isSubscribed;
  const isTrialing = status.subscription_status === "trialing" && !!status.trial_ends_at;
  const isCancelling = status.cancel_at_period_end && !!status.subscription_ends_at;
  const currentPlanIndex = PLAN_ORDER.indexOf(status.plan);
  const canUpgrade = currentPlanIndex < PLAN_ORDER.length - 1;
  const canDowngrade = currentPlanIndex > 1; // can't downgrade to free from paid
  const trialDaysLeft = isTrialing && status.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(status.trial_ends_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  return (
    <div className="max-w-2xl mx-auto pb-8 space-y-6">
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
            <Settings className="w-5 h-5 text-blue" />
            Manage Subscription
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Cancel, reactivate, or change your plan
          </p>
        </div>
      </div>

      {/* --- Current Plan Card --- */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
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
                  £{status.price_monthly}/mo
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-1">
              Status: <span className="capitalize">{status.subscription_status}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isTrialing && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue/10 text-blue">
                <Clock className="w-3 h-3" />
                Trial: {trialDaysLeft}d left
              </span>
            )}
            {isCancelling && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber/10 text-amber">
                <AlertTriangle className="w-3 h-3" />
                Cancelling
              </span>
            )}
            {isSubscribed && !isCancelling && !isTrialing && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green/10 text-green">
                <CheckCircle className="w-3 h-3" />
                Active
              </span>
            )}
          </div>
        </div>

        {/* Renewal / Cancel date */}
        {status.subscription_ends_at && (
          <div className="text-xs text-text-muted border-t border-border/40 pt-3">
            {isCancelling
              ? `Cancels on ${new Date(status.subscription_ends_at).toLocaleDateString()} — you'll retain access until then`
              : `Renews on ${new Date(status.subscription_ends_at).toLocaleDateString()}`}
          </div>
        )}

        {/* Trial notice */}
        {isTrialing && (
          <div className="rounded-lg border border-blue/20 bg-blue/5 px-3 py-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue shrink-0" />
            <div className="text-xs text-text">
              <span className="font-medium">Trial active</span> — {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining.
              You won&apos;t be charged until the trial ends.
            </div>
          </div>
        )}
      </div>

      {/* --- Plan Change --- */}
      {!isFree && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h3 className="text-sm font-medium text-text">Change Plan</h3>

          <div className="flex gap-3">
            {canUpgrade && (
              <button
                onClick={() => handleChangePlan("upgrade")}
                className="flex-1 rounded-lg border border-blue text-blue text-xs font-medium py-2.5 flex items-center justify-center gap-1.5 hover:bg-blue/5 transition-colors"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Upgrade
              </button>
            )}
            {canDowngrade && (
              <button
                onClick={() => handleChangePlan("downgrade")}
                className="flex-1 rounded-lg border border-border text-text-muted text-xs font-medium py-2.5 flex items-center justify-center gap-1.5 hover:bg-surface-2 transition-colors"
              >
                <TrendingDown className="w-3.5 h-3.5" />
                Downgrade
              </button>
            )}
          </div>

          {!canUpgrade && !canDowngrade && (
            <p className="text-xs text-text-muted">
              You&apos;re on the highest available plan.
            </p>
          )}
        </div>
      )}

      {/* --- Cancel / Reactivate --- */}
      {!isFree && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h3 className="text-sm font-medium text-text">
            {isTrialing ? "End Trial" : "Cancel Subscription"}
          </h3>

          {isCancelling ? (
            <>
              <p className="text-xs text-text-muted">
                {isTrialing
                  ? "Your trial will end immediately and you will lose Pro access."
                  : "Your subscription is set to cancel at the end of the current billing period. You can reactivate it anytime before then."}
              </p>
              <button
                onClick={handleReactivate}
                disabled={busy === "reactivate"}
                className="rounded-lg bg-green/10 text-green text-xs font-medium px-4 py-2.5 flex items-center gap-1.5 hover:bg-green/20 transition-colors disabled:opacity-50"
              >
                {busy === "reactivate" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" />
                )}
                Reactivate Subscription
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-text-muted">
                {isTrialing
                  ? "Ending your trial will downgrade you to Free immediately. You won't be charged."
                  : "Your subscription will remain active until the end of the current billing period. You won't lose access immediately."}
              </p>
              {confirmCancel ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-red/30 bg-red/5 px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red shrink-0" />
                    <span className="text-xs text-text">
                      Are you sure? Click again to confirm cancellation.
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancel}
                      disabled={busy === "cancel"}
                      className="rounded-lg bg-red/10 text-red text-xs font-medium px-4 py-2.5 flex items-center gap-1.5 hover:bg-red/20 transition-colors disabled:opacity-50"
                    >
                      {busy === "cancel" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      Confirm Cancel
                    </button>
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className="rounded-lg border border-border text-text-muted text-xs font-medium px-4 py-2.5 hover:bg-surface-2 transition-colors"
                    >
                      Go Back
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleCancel}
                  className="rounded-lg border border-red/30 text-red text-xs font-medium px-4 py-2.5 flex items-center gap-1.5 hover:bg-red/5 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {isTrialing ? "End Trial" : "Cancel Subscription"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* --- Billing History (Stripe Portal) --- */}
      {isSubscribed && status.stripe_customer_id && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h3 className="text-sm font-medium text-text flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-text-muted" />
            Billing History & Invoices
          </h3>
          <p className="text-xs text-text-muted">
            View past invoices, update payment methods, and download receipts via the Stripe portal.
          </p>
          <button
            onClick={handlePortal}
            disabled={busy === "portal"}
            className="rounded-lg border border-border text-text-muted text-xs font-medium px-4 py-2.5 flex items-center gap-1.5 hover:border-blue/40 hover:text-blue transition-colors disabled:opacity-50"
          >
            {busy === "portal" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5" />
            )}
            Open Stripe Portal
          </button>
        </div>
      )}

      {/* --- Security note --- */}
      <div className="rounded-xl border border-border/40 bg-surface/50 p-4 flex items-start gap-2.5">
        <Shield className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
        <div className="text-xs text-text-muted">
          All payments are securely processed through Stripe. We never store your
          card details. Cancelled subscriptions remain active until the end of
          the billing period — no immediate access revocation.
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
