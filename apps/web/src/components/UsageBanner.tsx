"use client";
import { Clock, AlertTriangle, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/router";

/* ------------------------------------------------------------------ */
/*  UsageBanner — compact one-line usage indicator                     */
/* ------------------------------------------------------------------ */

export interface UsageBannerProps {
  /** Current usage count */
  usage: number;
  /** Maximum allowed */
  limit: number;
  /** Label e.g. "leads" */
  label: string;
  /** Current plan id (optional, for upgrade link) */
  planId?: string;
  /** ISO date string for trial end (optional) */
  trialEndsAt?: string;
}

export default function UsageBanner({
  usage,
  limit,
  label,
  planId,
  trialEndsAt,
}: UsageBannerProps) {
  const router = useRouter();

  const isUnlimited = limit < 0;
  const pct = isUnlimited ? 0 : limit > 0 ? (usage / limit) * 100 : 0;
  const overLimit = !isUnlimited && usage > limit;

  // Color thresholds
  let colorClass: string;
  let dotClass: string;
  if (overLimit) {
    colorClass = "text-red";
    dotClass = "bg-red";
  } else if (pct > 80) {
    colorClass = "text-amber";
    dotClass = "bg-amber";
  } else if (pct > 50) {
    colorClass = "text-amber";
    dotClass = "bg-amber";
  } else {
    colorClass = "text-green";
    dotClass = "bg-green";
  }

  // Trial days remaining
  let trialDaysLeft: number | null = null;
  if (trialEndsAt) {
    const ends = new Date(trialEndsAt);
    trialDaysLeft = Math.max(
      0,
      Math.ceil((ends.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    );
  }

  // Build display text
  const usageText = isUnlimited
    ? `${usage.toLocaleString()} ${label} used`
    : `${usage.toLocaleString()}/${limit.toLocaleString()} ${label} used this month`;

  return (
    <div
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
        overLimit
          ? "border-red/30 bg-red/5 text-red"
          : "border-border/40 bg-surface/80 text-text-muted"
      }`}
    >
      {/* Status dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />

      {/* Usage text */}
      <span className={overLimit ? "text-red font-medium" : colorClass}>
        {usageText}
      </span>

      {/* Over-limit upgrade prompt */}
      {overLimit && (
        <button
          onClick={() => router.push("/billing/upgrade")}
          className="ml-auto flex items-center gap-1 text-red font-medium hover:underline shrink-0"
        >
          Limit reached — upgrade for more credits
          <ArrowUpRight className="w-3 h-3" />
        </button>
      )}

      {/* Near-limit warning (not over) */}
      {!overLimit && pct > 80 && !isUnlimited && (
        <button
          onClick={() => router.push("/billing/upgrade")}
          className="ml-auto flex items-center gap-1 text-amber hover:underline shrink-0"
        >
          Nearing limit
          <ArrowUpRight className="w-3 h-3" />
        </button>
      )}

      {/* Trial badge */}
      {trialDaysLeft !== null && trialDaysLeft > 0 && (
        <span className="ml-auto flex items-center gap-1 text-blue shrink-0">
          <Clock className="w-3 h-3" />
          {trialDaysLeft}d trial left
        </span>
      )}

      {/* If both trial and near-limit, show both (trial first, limit second) */}
      {trialDaysLeft !== null && trialDaysLeft > 0 && overLimit && (
        <span className="flex items-center gap-1 text-blue shrink-0">
          <Clock className="w-3 h-3" />
          {trialDaysLeft}d trial left
        </span>
      )}
    </div>
  );
}
