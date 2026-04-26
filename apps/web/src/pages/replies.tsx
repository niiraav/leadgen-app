import { withAuth } from "@/lib/auth";
import { SCORE_THRESHOLDS } from "@leadgen/shared";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import { ReplyDrawer } from '@/components/replies/ReplyDrawer';
import { EmptyState } from "@/components/ui/empty-state";
import {
  Flame,
  Clock,
  Eye,
  Loader2,
  MessageSquare,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const PAGE_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────────

interface ReplyEvent {
  id: string;
  intent_label: string;
  user_corrected_label: string | null;
  confidence: number | null;
  key_phrase: string | null;
  hot_score: number;
  received_at: string;
  needs_review: boolean;
  reply_status: string;
  lead: {
    business_name: string;
    email: string | null;
    city: string | null;
  } | null;
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
    interested: "bg-success/10 text-success",
    question: "bg-primary/10 text-primary",
    objection: "bg-warning/10 text-warning",
    "not_interested": "bg-destructive/10 text-destructive",
    "not_now": "bg-purple/10 text-purple",
    "out_of_office": "bg-cyan/10 text-cyan",
  };
  return map[intent] || "bg-secondary text-muted-foreground";
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

function hotScoreColor(score: number) {
  if (score >= SCORE_THRESHOLDS.GREEN) return "bg-success";
  if (score >= SCORE_THRESHOLDS.AMBER) return "bg-warning";
  return "bg-destructive";
}

function relativeTime(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffM = Math.floor(diffMs / (1000 * 60));
  if (diffM < 1) return "just now";
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const INTENT_FILTERS = [
  { label: "All", value: "" },
  { label: "Interested", value: "interested" },
  { label: "Question", value: "question" },
  { label: "Objection", value: "objection" },
  { label: "Not Now", value: "not_now" },
  { label: "Not Interested", value: "not_interested" },
];

// ─── Page ──────────────────────────────────────────────────────────────────────────

export const getServerSideProps = withAuth();

export default function RepliesPage() {
  const [replies, setReplies] = useState<ReplyEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [intentFilter, setIntentFilter] = useState("");
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"hot_score" | "recent">("hot_score");
  const [page, setPage] = useState(0);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerReplyId, setDrawerReplyId] = useState<string | null>(null);

  // Local read tracking (optimistic)
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const fetchReplies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await fetchAuthHeaders();
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (intentFilter) params.set("intent", intentFilter);
      if (needsReviewOnly) params.set("needsReview", "true");
      if (unreadOnly) params.set("unread", "true");

      const res = await fetch(`${API_BASE}/replies?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      const data: ReplyEvent[] = json.replies ?? [];
      setTotal(json.total ?? 0);

      // Sort client-side
      if (sortBy === "hot_score") {
        data.sort((a, b) => b.hot_score - a.hot_score);
      } else {
        data.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
      }

      setReplies(data);
    } catch (err: any) {
      console.error("[Replies] Failed:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [intentFilter, needsReviewOnly, unreadOnly, sortBy, page]);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openDrawer = async (id: string) => {
    setDrawerReplyId(id);
    setDrawerOpen(true);
    // Optimistically mark as read
    setReadIds((prev) => new Set(prev).add(id));
    try {
      await api.replies.read(id);
    } catch {
      // Non-critical: ReplyDrawer will also attempt markRead on mount
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    // Refresh data on close in case intent was changed
    fetchReplies();
  };

  // Empty state messages
  const emptyMessage = useMemo(() => {
    if (intentFilter === "" && !needsReviewOnly && !unreadOnly)
      return "No replies yet — your sequences are running";
    if (needsReviewOnly)
      return "No replies need review right now";
    if (unreadOnly)
      return "No unread replies";
    return `No ${intentFilter} replies found`;
  }, [intentFilter, needsReviewOnly, unreadOnly]);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" aria-hidden="true" />
            Replies
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} total repl{total !== 1 ? "ies" : "y"} detected
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
        {/* Intent tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" aria-hidden="true" />
          {INTENT_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setIntentFilter(f.value); setPage(0); }}
              aria-pressed={intentFilter === f.value}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                intentFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Toggles row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setNeedsReviewOnly(!needsReviewOnly); setPage(0); }}
              aria-pressed={needsReviewOnly}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                needsReviewOnly
                  ? "bg-warning/10 text-warning border border-amber/20"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {needsReviewOnly && <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />}
              Needs Review only
            </button>
            <button
              onClick={() => { setUnreadOnly(!unreadOnly); setPage(0); }}
              aria-pressed={unreadOnly}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                unreadOnly
                  ? "bg-destructive/10 text-destructive border border-destructive/20"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {unreadOnly && <span className="w-1.5 h-1.5 rounded-full bg-destructive" aria-hidden="true" />}
              Unread only
            </button>
          </div>

          <button
            onClick={() => setSortBy(sortBy === "hot_score" ? "recent" : "hot_score")}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-secondary text-muted-foreground hover:bg-secondary/80 transition-colors"
          >
            <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
            {sortBy === "hot_score" ? "Hot Score" : "Most Recent"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && replies.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title={emptyMessage}
          description="Replies from your email sequences will appear here."
          className="py-16"
        />
      )}

      {/* Results table */}
      {replies.length > 0 && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-secondary/60 text-micro font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40">
              <div className="col-span-2">Hot Score</div>
              <div className="col-span-3">Business</div>
              <div className="col-span-1">Intent</div>
              <div className="col-span-3">Key Phrase</div>
              <div className="col-span-2">Time</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

            {/* Rows */}
            {loading ? (
              <div className="p-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span className="text-sm">Loading replies...</span>
                </div>
              </div>
            ) : (
              replies.map((reply) => {
                const businessName = reply.lead?.business_name || "Unknown";
                const intent = reply.user_corrected_label || reply.intent_label;
                const truncatedKey = reply.key_phrase
                  ? reply.key_phrase.length > 60
                    ? reply.key_phrase.slice(0, 60) + "..."
                    : reply.key_phrase
                  : "—";

                const isUnread = reply.reply_status === 'new' && !readIds.has(reply.id);

                return (
                  <div
                    key={reply.id}
                    className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/30 last:border-b-0 hover:bg-secondary/30 transition-colors items-center ${isUnread ? "bg-destructive/5" : ""}`}
                  >
                    {/* Hot score bar */}
                    <div className="col-span-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${hotScoreColor(reply.hot_score)}`}
                          style={{ width: `${Math.max(reply.hot_score, 4)}%` }}
                        />
                      </div>
                      <span className="text-micro font-bold text-muted-foreground w-6">{reply.hot_score}</span>
                    </div>

                    {/* Business */}
                    <div className="col-span-3 text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      {businessName}
                      {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" aria-label="Unread" />}
                    </div>

                    {/* Intent */}
                    <div className="col-span-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-semibold ${intentColor(intent)}`}
                      >
                        <span aria-hidden="true">{intentEmoji(intent)}</span>
                      </span>
                    </div>

                    {/* Key phrase */}
                    <div className="col-span-3 text-xs text-muted-foreground italic truncate">{truncatedKey}</div>

                    {/* Time */}
                    <div className="col-span-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {relativeTime(reply.received_at)}
                    </div>

                    {/* Action */}
                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={() => openDrawer(reply.id)}
                        className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="View details"
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>

                    {/* Needs review dot */}
                    {reply.needs_review && (
                      <div
                        className="absolute"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Mobile list */}
          <div className="md:hidden">
            {loading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : (
              replies.map((reply) => {
                const businessName = reply.lead?.business_name || "Unknown";
                const intent = reply.user_corrected_label || reply.intent_label;
                const isUnread = reply.reply_status === 'new' && !readIds.has(reply.id);

                return (
                  <div
                    key={reply.id}
                    className={`p-4 border-b border-border/30 last:border-b-0 flex items-start gap-3 ${isUnread ? "bg-destructive/5" : ""}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-sm ${intentColor(intent)} border border-current/10`}
                    >
                      <span aria-hidden="true">{intentEmoji(intent)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                          {businessName}
                          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" aria-label="Unread" />}
                        </span>
                        <span className="text-micro font-bold text-muted-foreground">{reply.hot_score}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{relativeTime(reply.received_at)}</span>
                        {reply.needs_review && (
                          <span className="text-micro bg-warning/10 text-warning px-1.5 py-0.5 rounded">Review</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => openDrawer(reply.id)}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} ({total} total)
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              // Show a window of 5 pages
              let p: number;
              if (totalPages <= 5) {
                p = i;
              } else if (page < 3) {
                p = i;
              } else if (page > totalPages - 4) {
                p = totalPages - 5 + i;
              } else {
                p = page - 2 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    p === page
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary text-muted-foreground"
                  }`}
                >
                  {p + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Reply Drawer */}
      <ReplyDrawer isOpen={drawerOpen} replyId={drawerReplyId} onClose={closeDrawer} />
    </div>
  );
}
