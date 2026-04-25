"use client";

import { useState } from "react";
import { Loader2, X, Check, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { UpgradeRequiredError } from "@/lib/api";
import { Portal } from "@/components/ui/portal";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface VerifyEmailButtonProps {
  leadId: string;
  email?: string | null;
  emailStatus?: string | null;
  onVerified?: (status: string) => void;
  onUpgradeRequired?: (err: Error | string) => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string; icon?: typeof Check }> = {
  valid:       { label: "Valid",       className: "text-green",  icon: Check },
  invalid:     { label: "Invalid",     className: "text-red",    icon: X },
  "catch-all": { label: "Catch-all",   className: "text-amber",  icon: AlertTriangle },
  accept_all:  { label: "Accept-all",  className: "text-amber",  icon: AlertTriangle },
  disposable:  { label: "Disposable",  className: "text-orange",  icon: ShieldAlert },
  unknown:     { label: "Unknown",     className: "text-text-faint", icon: AlertTriangle },
};

export function VerifyEmailButton({
  leadId,
  email,
  emailStatus,
  onVerified,
  onUpgradeRequired,
}: VerifyEmailButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<Error | string | null>(null);

  // Already verified — show badge
  if (emailStatus && emailStatus !== "unverified" && emailStatus !== "enriching") {
    const badge = STATUS_BADGE[emailStatus];
    if (badge) {
      const Icon = badge.icon ?? Check;
      return (
        <span className={cn("inline-flex items-center gap-1 text-xs", badge.className)}>
          <Icon className="w-3 h-3" />
          {badge.label}
        </span>
      );
    }
  }

  // Just verified — show result badge
  if (result) {
    const badge = STATUS_BADGE[result];
    if (badge) {
      const Icon = badge.icon ?? Check;
      return (
        <span className={cn("inline-flex items-center gap-1 text-xs", badge.className)}>
          <Icon className="w-3 h-3" />
          {badge.label}
        </span>
      );
    }
  }

  if (!email) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setShowConfirm(false);
    setError(null);
    try {
      const res = await fetch(`${API}/leads/${leadId}/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const status = data.email_status ?? data.status ?? "unknown";
        setResult(status);
        onVerified?.(status);
      } else if (res.status === 402 && data?.upgrade_required) {
        const err = new UpgradeRequiredError(data.error || "Upgrade required to verify emails");
        setUpgradeError(err);
        onUpgradeRequired?.(err);
      } else {
        const msg = data?.error || data?.details || `HTTP ${res.status}`;
        console.error("[VerifyEmail] failed:", res.status, data);
        setError(msg);
        setResult("unknown");
        onVerified?.("unknown");
      }
    } catch (err) {
      console.error("[VerifyEmail] network error:", err);
      setError("Network error");
      setResult("unknown");
      onVerified?.("unknown");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={loading}
        className="flex items-center gap-1 text-xs bg-blue/10 text-blue border border-blue/20 rounded-full px-2 py-1 hover:bg-blue/20 transition-colors disabled:opacity-50"
        title="Verify email address"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <span>📧 Verify — 1cr</span>
        )}
      </button>

      {error && !showConfirm && !upgradeError && (
        <span className="text-xs text-red ml-1">{error}</span>
      )}

      {upgradeError && (
        <span className="text-xs text-amber ml-1 cursor-pointer hover:underline" onClick={() => { window.location.href = "/billing"; }}>
          Upgrade to verify emails →
        </span>
      )}

      {showConfirm && (
        <Portal>
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirm(false)}>
          <div
            className="bg-surface border border-border/60 rounded-xl w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 text-center">
              <p className="text-sm text-text font-medium">Use 1 verification credit?</p>
              <p className="text-xs text-text-faint mt-1 break-all">Email: {email}</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="btn btn-ghost text-xs flex-1 h-8"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="btn btn-primary text-xs flex-1 h-8 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Confirm"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
