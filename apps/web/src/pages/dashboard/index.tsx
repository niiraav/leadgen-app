import { withAuth } from "@/lib/auth";
import { KPICard, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import OnboardingModal from "@/components/onboarding/onboarding-modal";
import { api } from "@/lib/api";
import {
  Users,
  Mail,
  MessageSquare,
  TrendingUp,
  Loader2,
  AlertTriangle,
  Archive,
  Trash2,
  RefreshCw,
  ArrowRight,
  Check,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────────

interface DashboardData {
  kpis: {
    total_leads: number;
    contacted: number;
    replied: number;
    active_sequences: number;
  };
  weekly_leads: { date: string; count: number }[];
  pipeline_funnel: { status: string; count: number }[];
  top_categories: { category: string; count: number }[];
  sequence_stats: {
    total_enrolled: number;
    completed: number;
    replied: number;
    dead_leads_pending: number;
  };
}

interface DeadLead {
  id: string;
  business_name: string;
  email: string | null;
  status: string;
  activity_id: string;
  completed_at: string;
  sequence_name: string;
}

// ─── Skeleton components ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-5 animate-pulse">
      <div className="h-4 w-20 bg-surface-2 rounded mb-3" />
      <div className="h-8 w-16 bg-surface-2 rounded mb-2" />
      <div className="h-3 w-32 bg-surface-2 rounded" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-5 animate-pulse">
      <div className="h-4 w-32 bg-surface-2 rounded mb-4" />
      <div className="h-48 bg-surface-2 rounded" />
    </div>
  );
}

function DeadLeadCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4 animate-pulse">
      <div className="h-4 w-48 bg-surface-2 rounded mb-2" />
      <div className="h-3 w-64 bg-surface-2 rounded mb-4" />
      <div className="flex gap-2">
        <div className="h-8 w-20 bg-surface-2 rounded" />
        <div className="h-8 w-24 bg-surface-2 rounded" />
        <div className="h-8 w-16 bg-surface-2 rounded" />
      </div>
    </div>
  );
}

// ─── BarChart (simple horizontal, no Recharts needed for funnel) ────────────────

const STATUS_COLORS: Record<string, string> = {
  new: "text-blue",
  contacted: "text-amber",
  qualified: "text-amber",
  proposal_sent: "text-purple",
  replied: "text-green",
  interested: "text-green",
  won: "text-green",
  lost: "text-red",
  archived: "text-text-faint",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal",
  replied: "Replied",
  interested: "Interested",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
};

function SimpleBarChart({ data }: { data: { status: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.status} className="flex items-center gap-3">
          <span className="text-xs text-text-muted w-24 text-right capitalize shrink-0">
            {STATUS_LABELS[item.status] || item.status}
          </span>
          <div className="flex-1 bg-surface-2 rounded-full h-6 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${STATUS_COLORS[item.status] || "text-blue"}`}
              style={{
                width: `${Math.max((item.count / maxCount) * 100, 8)}%`,
                backgroundColor: "currentColor",
                opacity: 0.7,
              }}
            />
          </div>
          <span className="text-xs text-text w-8 shrink-0">{item.count}</span>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-center text-xs text-text-faint py-8">No data yet</p>
      )}
    </div>
  );
}

// ─── AreaChart (simple SVG) ──────────────────────────────────────────────────────

function WeeklyLeadsChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-xs text-text-faint">No data this week</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const width = 500;
  const height = 160;
  const padding = { top: 10, right: 10, bottom: 30, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.count / maxCount) * chartH,
    label: new Date(d.date).toLocaleDateString("en-US", { weekday: "short" }),
    count: d.count,
    date: d.date,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={padding.left}
          y1={padding.top + chartH * (1 - pct)}
          x2={padding.left + chartW}
          y2={padding.top + chartH * (1 - pct)}
          stroke="currentColor"
          className="text-border/40"
          strokeWidth="1"
        />
      ))}

      {/* Area fill */}
      <path d={areaPath} fill="currentColor" className="text-blue" opacity="0.15" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="currentColor" className="text-blue" strokeWidth="2" />

      {/* Dots */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="currentColor" className="text-blue" />
          {/* Day label */}
          <text
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            className="text-text-faint"
            fill="currentColor"
            fontSize="11"
          >
            {p.label}
          </text>
          {/* Count label on hover area */}
          <text
            x={p.x}
            y={p.y - 10}
            textAnchor="middle"
            fill="currentColor"
            className="text-text"
            fontSize="12"
            fontWeight="500"
          >
            {p.count}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Dead lead actions ──────────────────────────────────────────────────────────

function DeadLeadActionCard({ lead, onAction }: { lead: DeadLead; onAction: (id: string, action: "archive" | "recontact" | "delete") => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (showDeleteConfirm) {
    return (
      <div className="rounded-xl border border-red/20 bg-red/5 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-text">Delete &quot;{lead.business_name}&quot;?</p>
          <p className="text-xs text-text-muted mt-0.5">This cannot be undone.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onAction(lead.id, "delete")}
              className="btn text-xs py-1.5 h-7 bg-red hover:bg-red/90 text-white"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="btn btn-ghost text-xs py-1.5 h-7"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <h4 className="text-sm font-medium text-text truncate">{lead.business_name}</h4>
            <span className="text-xs text-text-faint capitalize">{lead.status}</span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Completed {lead.sequence_name}. No reply received.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onAction(lead.id, "archive")}
              className="btn btn-ghost text-xs py-1 h-7"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </button>
            <button
              onClick={() => onAction(lead.id, "recontact")}
              className="btn btn-ghost text-xs py-1 h-7 text-blue"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-contact
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn btn-ghost text-xs py-1 h-7 text-red"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

export default function DashboardPage({ user }: { user?: { id: string; email: string } }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [deadLeads, setDeadLeads] = useState<DeadLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, deadRes] = await Promise.all([
        fetch("/api/analytics/dashboard", { credentials: "include" }),
        fetch("/api/analytics/dead-leads", { credentials: "include" }),
      ]);

      if (!dashRes.ok) throw new Error(`Dashboard API error: ${dashRes.status}`);
      const dashData = await dashRes.json();
      setData(dashData);

      if (deadRes.ok) {
        const deadData = await deadRes.json();
        setDeadLeads(deadData.leads ?? []);
      }
    } catch (err: any) {
      console.error("[Dashboard] Failed to load:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDeadLeadAction = async (leadId: string, action: "archive" | "recontact" | "delete") => {
    const lead = deadLeads.find((l) => l.id === leadId);
    if (!lead) return;

    try {
      if (action === "archive") {
        await fetch(`/api/dead-leads/${leadId}/archive`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_id: lead.activity_id }),
        });
      } else if (action === "recontact") {
        router.push(`/leads/${leadId}?action=compose`);
        return;
      } else if (action === "delete") {
        await fetch(`/api/dead-leads/${leadId}/delete`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_id: lead.activity_id }),
        });
      }

      // Refresh data
      fetchData();
    } catch (err) {
      console.error("Failed to handle dead lead action:", err);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-sm text-red mb-3">{error}</p>
          <button onClick={fetchData} className="btn btn-secondary text-sm">
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <KPICard
              title="Total Leads"
              value={data?.kpis.total_leads ?? 0}
              icon={<Users className="w-5 h-5" />}
              subtitle="All time"
              color="blue"
            />
            <KPICard
              title="Contacted"
              value={data?.kpis.contacted ?? 0}
              icon={<Mail className="w-5 h-5" />}
              subtitle="This month"
              color="amber"
            />
            <KPICard
              title="Replied"
              value={data?.kpis.replied ?? 0}
              icon={<MessageSquare className="w-5 h-5" />}
              subtitle="Positive responses"
              color="green"
            />
            <KPICard
              title="Active Sequences"
              value={data?.kpis.active_sequences ?? 0}
              icon={<TrendingUp className="w-5 h-5" />}
              subtitle="Currently running"
              color="blue"
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Leads */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-text mb-4">Weekly Leads</h3>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <WeeklyLeadsChart data={data?.weekly_leads ?? []} />
          )}
        </Card>

        {/* Pipeline Funnel */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-text mb-4">Pipeline Funnel</h3>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <SimpleBarChart data={data?.pipeline_funnel ?? []} />
          )}
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categories */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-text mb-4">Top Categories</h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between animate-pulse">
                  <div className="h-4 w-32 bg-surface-2 rounded" />
                  <div className="h-5 w-10 bg-surface-2 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {(data?.top_categories ?? []).map((cat, idx) => (
                <div key={cat.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-text-faint w-4">{idx + 1}</span>
                    <span className="text-sm text-text capitalize">{cat.category}</span>
                  </div>
                  <span className="text-xs font-medium text-text-muted bg-surface-2 px-2.5 py-0.5 rounded-full">
                    {cat.count}
                  </span>
                </div>
              ))}
              {!data?.top_categories?.length && (
                <p className="text-center text-xs text-text-faint py-4">No categories yet</p>
              )}
            </div>
          )}
        </Card>

        {/* Sequence Stats */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-text mb-4">Sequence Stats</h3>
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-surface-2 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Enrolled */}
              <div className="rounded-lg bg-blue/5 border border-blue/10 p-3">
                <p className="text-xs text-text-faint mb-1">Enrolled</p>
                <p className="text-lg font-bold text-blue">{data?.sequence_stats.total_enrolled ?? 0}</p>
              </div>
              {/* Completed */}
              <div className="rounded-lg bg-green/5 border border-green/10 p-3">
                <p className="text-xs text-text-faint mb-1">Completed</p>
                <p className="text-lg font-bold text-green">{data?.sequence_stats.completed ?? 0}</p>
              </div>
              {/* Replied */}
              <div className="rounded-lg bg-green/5 border border-green/10 p-3">
                <p className="text-xs text-text-faint mb-1">Replied</p>
                <p className="text-lg font-bold text-green">{data?.sequence_stats.replied ?? 0}</p>
              </div>
              {/* Dead Leads */}
              <button
                onClick={() => {
                  const el = document.getElementById("dead-leads-section");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
                className="rounded-lg bg-amber/5 border border-amber/10 p-3 text-left hover:bg-amber/10 transition-colors cursor-pointer"
              >
                <p className="text-xs text-text-faint mb-1">Dead Leads Pending</p>
                <p className="text-lg font-bold text-amber">{data?.sequence_stats.dead_leads_pending ?? 0}</p>
              </button>
            </div>
          )}
        </Card>
      </div>

      {/* Dead Leads / Actions Required */}
      <div id="dead-leads-section">
        {loading ? (
          <div className="space-y-3 mt-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="space-y-4 mt-6">
            {deadLeads.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber" />
                    Actions Required
                  </h3>
                  <Badge variant="secondary">{deadLeads.length} pending</Badge>
                </div>
                <div className="space-y-2">
                  {deadLeads.map((lead) => (
                    <DeadLeadActionCard
                      key={lead.id}
                      lead={lead}
                      onAction={handleDeadLeadAction}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
