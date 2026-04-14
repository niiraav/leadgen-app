"use client";

import { useState } from "react";
import { Loader2, X, Check } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface EnrichButtonProps {
  leadId: string;
  enriched?: boolean;
  onEnriched?: () => void;
}

export function EnrichButton({ leadId, enriched = false, onEnriched }: EnrichButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
        className="flex items-center gap-1 text-xs bg-blue/10 text-blue border border-blue/20 rounded-full px-2 py-1 hover:bg-blue/20 transition-colors"
        title="Enrich contact details"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <span>🔍 Enrich — 1cr</span>
        )}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirm(false)}>
          <div
            className="bg-surface border border-border/60 rounded-xl w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 text-center">
              <p className="text-sm text-text font-medium">Use 1 enrichment credit?</p>
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
        </div>
      )}
    </>
  );
}
