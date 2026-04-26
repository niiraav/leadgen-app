"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { withAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { CheckCircle, Loader2, ArrowRight, Clock, Sparkles } from "lucide-react";
import { BillingErrorState } from "@/components/billing/BillingErrorState";

/* ------------------------------------------------------------------ */
/*  Checkout Success Page                                              */
/* ------------------------------------------------------------------ */

interface BillingStatus {
  plan: string;
  label: string;
  subscription_status: string;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  subscription_ends_at: string | null;
}

export default function BillingSuccessPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadStatus = useCallback(async () => {
    let cancelled = false;
    try {
      setLoading(true);
      setHasError(false);
      await api.billing.sync().catch(() => {});
      const s = (await api.billing.status()) as unknown as BillingStatus;
      if (!cancelled) setStatus(s);
    } catch (err: any) {
      if (!cancelled) {
        console.error("[BillingSuccess] Load failed:", err.message);
        setHasError(true);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cleanup = loadStatus();
    return () => { cleanup.then((fn) => fn?.()); };
  }, [loadStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue" />
      </div>
    );
  }

  if (hasError) {
    return (
      <BillingErrorState
        title="Unable to confirm your subscription"
        message="We couldn't verify your plan details. Please try again or contact support if the issue persists."
        onRetry={() => {
          setHasError(false);
          setLoading(true);
          loadStatus();
        }}
        showBack
        onBack={() => router.push("/billing")}
      />
    );
  }

  const planName = status?.label ?? "your new";
  const isTrialing = status?.subscription_status === "trialing" && !!status?.trial_ends_at;

  return (
    <div className="max-w-md mx-auto py-20 flex flex-col items-center text-center space-y-6">
      {/* Animated checkmark */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-green/10 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green" />
        </div>
        {/* Decorative sparkles */}
        <Sparkles className="w-4 h-4 text-amber absolute -top-1 -right-1 animate-pulse" />
        <Sparkles className="w-3 h-3 text-blue absolute -bottom-1 -left-1 animate-pulse delay-500" />
      </div>

      {/* Success message */}
      <div>
        <h1 className="text-2xl font-bold text-text">
          Payment successful!
        </h1>
        <p className="text-sm text-text-muted mt-2">
          Your <span className="capitalize font-medium text-text">{planName}</span> plan is now active.
        </p>
      </div>

      {/* Trial notice */}
      {isTrialing && (
        <div className="w-full rounded-xl border border-blue/20 bg-blue/5 px-4 py-3 flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-blue shrink-0" />
          <div className="text-left">
            <p className="text-xs font-medium text-text">
              Your 14-day free trial starts now
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              You won&apos;t be charged until the trial ends
            </p>
          </div>
        </div>
      )}

      {/* Go to dashboard */}
      <button
        onClick={() => router.push("/dashboard")}
        className="w-full rounded-lg bg-blue text-white text-sm font-medium py-3 flex items-center justify-center gap-2 hover:bg-blue/90 transition-colors"
      >
        Go to Dashboard
        <ArrowRight className="w-4 h-4" />
      </button>

      {/* Subtle link to manage subscription */}
      <button
        onClick={() => router.push("/billing/manage")}
        className="text-xs text-text-muted hover:text-text underline"
      >
        Manage subscription
      </button>
    </div>
  );
}

export const getServerSideProps = withAuth();
