"use client";

import { Lock, ArrowUpRight, X } from "lucide-react";
import { useRouter } from "next/router";
import { UpgradeRequiredError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  UpgradePrompt — shown when a 402/upgrade_required error occurs     */
/* ------------------------------------------------------------------ */

export interface UpgradePromptProps {
  /** The caught error (UpgradeRequiredError or raw message) */
  error: Error | string | null;
  /** Optional: close/dismiss callback */
  onDismiss?: () => void;
  /** Compact inline mode vs full card */
  compact?: boolean;
}

export default function UpgradePrompt({
  error,
  onDismiss,
  compact = false,
}: UpgradePromptProps) {
  const router = useRouter();

  if (!error) return null;

  const isUpgradeErr = error instanceof UpgradeRequiredError;
  const message =
    typeof error === "string"
      ? error
      : error.message || "You've reached your free limit";
  const remaining = isUpgradeErr ? error.remaining : 0;
  const limit = isUpgradeErr ? error.limit : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-warning/30 bg-warning/15 text-warning text-sm shadow-sm">
        <Lock className="w-4 h-4 shrink-0" />
        <span className="truncate">{message}</span>
        <button
          onClick={() => router.push("/billing/upgrade")}
          className="ml-auto flex items-center gap-1 font-medium hover:underline shrink-0"
        >
          Start Free Trial <ArrowUpRight className="w-3 h-3" />
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-0.5 rounded hover:bg-warning/10 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warning/20 bg-card p-5 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
        <Lock className="h-5 w-5 text-warning" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        Free Limit Reached
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
        {message}
      </p>
      {limit > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          {remaining} / {limit} remaining this month
        </p>
      )}
      <button
        onClick={() => router.push("/billing/upgrade")}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Start Free Trial <ArrowUpRight className="w-4 h-4" />
      </button>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="block mx-auto mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
