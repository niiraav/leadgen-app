import { useState, useEffect } from "react";
import Link from "next/link";
import { SCORE_THRESHOLDS } from "@leadgen/shared";
import { MessageSquare, ArrowRight, Loader2, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createBrowserSupabaseClient } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────────

interface ReplyEvent {
  id: string;
  intent_label: string;
  user_corrected_label: string | null;
  key_phrase: string | null;
  hot_score: number;
  received_at: string;
  needs_review: boolean;
  lead: {
    business_name: string;
    email: string | null;
    city: string | null;
  } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────────

const intentEmoji: Record<string, string> = {
  interested: "✉️",
  question: "❓",
  objection: "🚧",
  "not_interested": "👋",
  "not_now": "⏰",
  "out_of_office": "🏖️",
};

function intentColor(intent: string) {
  const map: Record<string, string> = {
    interested: "bg-success/10 text-success",
    question: "bg-primary/10 text-primary",
    objection: "bg-warning/10 text-warning",
    "not_interested": "bg-destructive/10 text-destructive",
    "not_now": "bg-purple/10 text-purple",
  };
  return map[intent] || "bg-secondary text-muted-foreground";
}

function hotScoreColor(score: number) {
  if (score >= SCORE_THRESHOLDS.GREEN) return "bg-success";
  if (score >= SCORE_THRESHOLDS.AMBER) return "bg-warning";
  return "bg-destructive";
}

function relativeTime(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

async function fetchAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Component ──────────────────────────────────────────────────────────────────────

export default function HotLeadsWidget() {
  const [replies, setReplies] = useState<ReplyEvent[]>([]);
  const [unactionedCount, setUnactionedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchReplies = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await fetchAuthHeaders();
        const res = await fetch(
          `${API_BASE}/replies?intent=interested,question&limit=50`,
          { headers }
        );
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json = await res.json();
        const all: ReplyEvent[] = json.replies ?? [];

        if (cancelled) return;

        // Filter unactioned = no user_corrected_label
        const unactioned = all.filter((r) => !r.user_corrected_label);
        setUnactionedCount(unactioned.length);

        // Sort by hot_score DESC, take top 3
        const top = [...all]
          .sort((a, b) => b.hot_score - a.hot_score)
          .slice(0, 3);

        setReplies(top);
      } catch (err: any) {
        console.error("[HotLeadsWidget] Failed:", err.message);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchReplies();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Hot Leads</h3>
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="w-8 h-8 bg-secondary rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 bg-secondary rounded" />
                <div className="h-2 w-24 bg-secondary rounded" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Hot Leads</h3>
          <Flame className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-xs text-destructive">Failed to load replies.</p>
      </Card>
    );
  }

  if (replies.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Hot Leads</h3>
          <Flame className="w-4 h-4 text-warning" />
        </div>
        <EmptyState
          icon={MessageSquare}
          title="No replies yet"
          description="Your sequences are running. Hot leads will appear here when replies come in."
          className="py-4"
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      {/* Header with count badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Hot Leads</h3>
          {unactionedCount > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-warning/10 text-warning text-micro font-bold px-2 py-0.5">
              {unactionedCount} need{unactionedCount === 1 ? "" : "s"} attention
            </span>
          )}
        </div>
        <Flame className="w-4 h-4 text-warning" />
      </div>

      {/* Leads list */}
      <div className="space-y-3">
        {replies.map((reply) => {
          const businessName = reply.lead?.business_name || "Unknown";
          const intent = reply.user_corrected_label || reply.intent_label;

          return (
            <div
              key={reply.id}
              className="flex items-start gap-3 py-2 px-1 rounded-lg hover:bg-secondary/50 transition-colors"
            >
              {/* Intent emoji */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm ${intentColor(intent)} border border-current/10`}
              >
                {intentEmoji[intent] || "📩"}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {businessName}
                  </span>
                  <span className="text-micro text-muted-foreground shrink-0">
                    {relativeTime(reply.received_at)}
                  </span>
                </div>

                {reply.key_phrase && (
                  <p className="text-xs text-muted-foreground italic mt-0.5 truncate">
                    "{reply.key_phrase}"
                  </p>
                )}

                {/* Hot score bar */}
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${hotScoreColor(reply.hot_score)}`}
                      style={{ width: `${Math.max(reply.hot_score, 4)}%` }}
                    />
                  </div>
                  <span className="text-micro font-bold text-muted-foreground w-6 text-right">
                    {reply.hot_score}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-3 mt-3 border-t border-border/40">
        <Link
          href="/replies"
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          View all replies
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </Card>
  );
}
