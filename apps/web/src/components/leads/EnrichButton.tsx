"use client";

import { useState } from "react";
import { Loader2, X, Check } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import FocusTrap from "focus-trap-react";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useEscapeKey } from "@/hooks/useEscapeKey";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface EnrichButtonProps {
  leadId: string;
  enriched?: boolean;
  onEnriched?: () => void;
}

export function EnrichButton({ leadId, enriched = false, onEnriched }: EnrichButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useScrollLock(showConfirm);
  useEscapeKey(showConfirm, () => setShowConfirm(false));

  if (enriched) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setShowConfirm(false);
    try {
      const res = await fetch(`${API}/leads/${leadId}/enrich-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (res.ok) {
        onEnriched?.();
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-1 hover:bg-primary/20 transition-colors"
        title="Enrich contact details"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <span>🔍 Enrich — 1cr</span>
        )}
      </button>

      {showConfirm && (
        <Portal>
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4" onClick={() => setShowConfirm(false)}>
          <FocusTrap active={showConfirm} focusTrapOptions={{ returnFocusOnDeactivate: true, escapeDeactivates: true, onDeactivate: () => setShowConfirm(false) }}>
          <div
            className="bg-card border border-border/60 rounded-xl w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm enrichment"
          >
            <div className="p-4 text-center">
              <p className="text-sm text-foreground font-medium">Use 1 enrichment credit?</p>
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
                      Enriching...
                    </>
                  ) : (
                    "Confirm"
                  )}
                </button>
              </div>
            </div>
          </div>
          </FocusTrap>
        </div>
        </Portal>
      )}
    </>
  );
}
