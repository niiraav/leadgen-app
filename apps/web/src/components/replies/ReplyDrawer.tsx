import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { SCORE_THRESHOLDS } from "@leadgen/shared";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  X,
  Clock,
  Flame,
  AlertTriangle,
  MessageSquare,
  Sparkles,
  Check,
  PauseCircle,
  Ban,
  Loader2,
  Edit3,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────────

interface ReplyEvent {
  id: string;
  intent_label: string;
  user_corrected_label: string | null;
  confidence: number | null;
  body_plain: string | null;
  key_phrase: string | null;
  suggested_next_action: string | null;
  suggested_reply_draft: string | null;
  hot_score: number;
  received_at: string;
  needs_review: boolean;
  lead_id: string;
  lead: {
    business_name: string;
    email: string | null;
    city: string | null;
    suggested_reply_draft?: string | null;
  } | null;
}

interface LeadActivity {
  id: string;
  type: string;
  description: string;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────────

async function fetchAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function intentColor(intent: string) {
  const map: Record<string, string> = {
    interested: "bg-green/10 text-green border-green/20",
    question: "bg-blue/10 text-blue border-blue/20",
    objection: "bg-amber/10 text-amber border-amber/20",
    "not_interested": "bg-red/10 text-red border-red/20",
    "not_now": "bg-purple/10 text-purple border-purple/20",
    "out_of_office": "bg-cyan/10 text-cyan border-cyan/20",
  };
  return map[intent] || "bg-surface-2 text-text-muted border-border";
}

function intentEmoji(intent: string) {
  const map: Record<string, string> = {
    interested: "✉️",
    question: "❓",
    objection: "🚧",
    "not_interested": "👋",
    "not_now": "⏰",
    "out_of_office": "🏖️",
  };
  return map[intent] || "📩";
}

function urgencyLabel(score: number) {
  if (score >= SCORE_THRESHOLDS.GREEN) return { text: "Urgent", cls: "bg-red/10 text-red border-red/20" };
  if (score >= SCORE_THRESHOLDS.AMBER) return { text: "Warm", cls: "bg-amber/10 text-amber border-amber/20" };
  return { text: "Low", cls: "bg-surface-2 text-text-muted border-border" };
}

function relativeTime(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffM = Math.floor(diffMs / (1000 * 60));
  if (diffM < 1) return "just now";
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString();
}

function highlightKeyPhrase(text: string, keyPhrase: string | null) {
  if (!keyPhrase || !text) return text;
  const idx = text.toLowerCase().indexOf(keyPhrase.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + keyPhrase.length);
  const after = text.slice(idx + keyPhrase.length);
  return (
    <>
      {before}
      <span className="bg-amber/20 text-amber px-0.5 rounded">{match}</span>
      {after}
    </>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────────

interface ReplyDrawerProps {
  isOpen: boolean;
  replyId: string | null;
  onClose: () => void;
}

export default function ReplyDrawer({ isOpen, replyId, onClose }: ReplyDrawerProps) {
  const [reply, setReply] = useState<ReplyEvent | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dismissReview, setDismissReview] = useState(false);

  const fetchData = useCallback(async (id: string) => {
    setLoading(true);
    setDismissReview(false);
    try {
      const headers = await fetchAuthHeaders();

      const res = await fetch(`${API_BASE}/replies/${id}`, { headers });
      if (!res.ok) throw new Error(`Failed to fetch reply`);
      const data = await res.json();
      setReply(data);

      // Fetch lead activities
      const actRes = await fetch(`${API_BASE}/pipeline/${data.lead_id}/activity`, { headers });
      if (actRes.ok) {
        const actData = await actRes.json();
        setActivities(actData.activities ?? []);
      }
    } catch (err: any) {
      console.error("[ReplyDrawer] Failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && replyId) {
      fetchData(replyId);
    } else {
      setReply(null);
      setActivities([]);
    }
  }, [isOpen, replyId, fetchData]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleIntentChange = async (newIntent: string) => {
    if (!reply) return;
    setSaving(true);
    try {
      const headers = await fetchAuthHeaders();
      const res = await fetch(`${API_BASE}/replies/${reply.id}/intent`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ intent: newIntent }),
      });
      if (!res.ok) throw new Error("Failed to update intent");
      const updated = await res.json();
      setReply(updated);
      toast.success("Intent updated");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action: "interested" | "snooze" | "not_interested") => {
    if (!reply) return;
    setSaving(true);
    try {
      const headers = await fetchAuthHeaders();

      if (action === "interested") {
        await fetch(`${API_BASE}/replies/${reply.id}/intent`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ intent: "interested" }),
        });
        toast.success("Marked as Interested");
      } else if (action === "snooze") {
        await fetch(`${API_BASE}/replies/${reply.id}/snooze`, {
          method: "POST",
          headers,
          body: JSON.stringify({ days: 30 }),
        });
        toast.success("Snoozed for 30 days");
      } else if (action === "not_interested") {
        await fetch(`${API_BASE}/replies/${reply.id}/intent`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ intent: "not_interested" }),
        });
        toast.success("Marked as Not Interested");
      }
      // Refresh reply data
      fetchData(reply.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────────

  if (!isOpen || !replyId) return null;

  const effectiveIntent = reply?.user_corrected_label || reply?.intent_label || "";
  const urgency = reply ? urgencyLabel(reply.hot_score) : null;
  const needsReview = reply?.needs_review && reply.confidence != null && reply.confidence < 70;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-bg border-l border-border/60 z-50 flex flex-col shadow-2xl overflow-hidden animate-slide-in-right">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between p-5 border-b border-border/40">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-text truncate">
              {reply ? reply.lead?.business_name || "Unknown" : "Loading..."}
            </h2>
            {reply && (
              <p className="text-xs text-text-muted mt-0.5">
                {reply.lead?.email || "No email"} · {reply.lead?.city || ""}
              </p>
            )}
            {reply && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${intentColor(effectiveIntent)}`}
                >
                  {intentEmoji(effectiveIntent)} {effectiveIntent?.replace("_", " ") || "unknown"}
                </span>
                {urgency && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${urgency.cls}`}
                  >
                    {urgency.text}
                  </span>
                )}
                {reply && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-text-muted">
                    <Flame className="w-3 h-3" /> {reply.hot_score}
                  </span>
                )}
                {reply && (
                  <span className="inline-flex items-center gap-1 text-xs text-text-faint">
                    <Clock className="w-3 h-3" /> {relativeTime(reply.received_at)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="space-y-4">
              <div className="animate-pulse h-4 w-24 bg-surface-2 rounded" />
              <div className="animate-pulse h-20 bg-surface-2 rounded-lg" />
              <div className="animate-pulse h-16 bg-surface-2 rounded-lg" />
            </div>
          ) : reply ? (
            <>
              {/* Needs Review Banner */}
              {needsReview && !dismissReview && (
                <div className="flex items-start gap-2 bg-amber/5 border border-amber/20 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber">Needs Review</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      AI confidence is {Math.round(reply.confidence || 0)}%. Verify the intent below.
                    </p>
                  </div>
                  <button
                    onClick={() => setDismissReview(true)}
                    className="p-0.5 text-amber/60 hover:text-amber"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Reply Body */}
              <div>
                <h4 className="text-xs font-semibold text-text-uppercase text-text-faint uppercase tracking-wider mb-2">
                  Reply
                </h4>
                <div className="bg-surface rounded-lg p-3 text-sm text-text whitespace-pre-wrap leading-relaxed border border-border/40">
                  {reply.body_plain
                    ? highlightKeyPhrase(reply.body_plain, reply.key_phrase)
                    : <span className="text-text-faint italic">No message body</span>}
                </div>
                {reply.key_phrase && (
                  <p className="text-[10px] text-text-faint mt-1.5">
                    Key phrase: <span className="text-amber italic">"{reply.key_phrase}"</span>
                  </p>
                )}
              </div>

              {/* AI Suggested Action */}
              {(reply.suggested_next_action || reply.suggested_reply_draft) && (
                <div>
                  <h4 className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue" />
                    AI Suggested Action
                  </h4>
                  {reply.suggested_next_action && (
                    <p className="text-xs text-text bg-blue/5 border border-blue/20 rounded-lg px-3 py-2 mb-2">
                      {reply.suggested_next_action}
                    </p>
                  )}
                  {reply.suggested_reply_draft && (
                    <div className="bg-surface rounded-lg p-3 text-xs text-text-muted leading-relaxed border border-border/40">
                      <p className="text-[10px] text-text-faint uppercase tracking-wider mb-1">
                        Suggested Reply
                      </p>
                      {reply.suggested_reply_draft}
                    </div>
                  )}
                </div>
              )}

              {/* Intent Label Editable */}
              <div>
                <h4 className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" />
                  Intent Label
                </h4>
                <select
                  value={effectiveIntent}
                  onChange={(e) => handleIntentChange(e.target.value)}
                  disabled={saving}
                  className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                >
                  {["", "interested", "question", "objection", "not_now", "not_interested", "out_of_office"].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === "" ? "unknown" : opt.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lead Timeline */}
              <div>
                <h4 className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Lead Timeline
                </h4>
                {activities.length > 0 ? (
                  <div className="space-y-2">
                    {activities.slice(0, 8).map((act) => (
                      <div key={act.id} className="flex items-start gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue shrink-0 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-text truncate">{act.description}</p>
                          <p className="text-text-faint">{relativeTime(act.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-faint italic">No activity recorded</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-text-faint text-center py-8">Reply not found</p>
          )}
        </div>

        {/* ── Footer Actions ─────────────────────────────────────────────────── */}
        {!loading && reply && (
          <div className="border-t border-border/40 p-4 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => handleAction("interested")}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 btn text-xs py-2 bg-green hover:bg-green/90 text-white disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                Mark Interested
              </button>
              <button
                onClick={() => handleAction("snooze")}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 btn btn-ghost text-xs py-2 disabled:opacity-50"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                Snooze 30d
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAction("not_interested")}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 btn btn-ghost text-xs py-2 text-red disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" />
                Do Not Contact
              </button>
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 btn btn-secondary text-xs py-2 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
