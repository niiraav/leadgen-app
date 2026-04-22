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
      : error.message || "Upgrade required to use this feature";
  const remaining = isUpgradeErr ? error.remaining : 0;
  const limit = isUpgradeErr ? error.limit : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber/30 bg-amber/15 text-amber text-sm shadow-sm">
        <Lock className="w-4 h-4 shrink-0" />
        <span className="truncate">{message}</span>
        <button
          onClick={() => router.push("/billing/upgrade")}
          className="ml-auto flex items-center gap-1 font-medium hover:underline shrink-0"
        >
          Upgrade <ArrowUpRight className="w-3 h-3" />
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-0.5 rounded hover:bg-amber/10 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber/20 bg-surface p-5 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber/10">
        <Lock className="h-5 w-5 text-amber" />
      </div>
      <h3 className="text-base font-semibold text-text mb-1">
        Upgrade Required
      </h3>
      <p className="text-sm text-text-muted mb-4 max-w-sm mx-auto">
        {message}
      </p>
      {limit > 0 && (
        <p className="text-xs text-text-muted mb-3">
          {remaining} / {limit} remaining this month
        </p>
      )}
      <button
        onClick={() => router.push("/billing/upgrade")}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
      >
        View Plans <ArrowUpRight className="w-4 h-4" />
      </button>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="block mx-auto mt-3 text-xs text-text-muted hover:text-text transition-colors"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
