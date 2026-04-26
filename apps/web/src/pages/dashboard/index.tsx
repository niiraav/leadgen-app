import { withAuth } from "@/lib/auth";
import { KPICard, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import OnboardingModal from "@/components/onboarding/onboarding-modal";
import { useProfile } from "@/contexts/profile-context";
import { useCountUp } from "@/lib/useCountUp";
import { motion } from "framer-motion";
import { EmptyState } from "@/components/ui/empty-state";
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
  Tag,
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
    <div className="rounded-lg border border-border bg-card p-5 animate-pulse">
      <div className="h-4 w-20 bg-secondary rounded mb-3" />
      <div className="h-8 w-16 bg-secondary rounded mb-2" />
      <div className="h-3 w-32 bg-secondary rounded" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5 animate-pulse">
      <div className="h-4 w-32 bg-secondary rounded mb-4" />
      <div className="h-48 bg-secondary rounded" />
    </div>
  );
}

function DeadLeadCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
      <div className="h-4 w-48 bg-secondary rounded mb-2" />
      <div className="h-3 w-64 bg-secondary rounded mb-4" />
      <div className="flex gap-2">
        <div className="h-8 w-20 bg-secondary rounded" />
        <div className="h-8 w-24 bg-secondary rounded" />
        <div className="h-8 w-16 bg-secondary rounded" />
      </div>
    </div>
  );
}

// ─── BarChart (simple horizontal, no Recharts needed for funnel) ────────────────

const STATUS_COLORS: Record<string, string> = {
  new: "text-primary",
  contacted: "text-warning",
  responded: "text-success",
  interested: "text-success",
  not_interested: "text-destructive",
  qualified: "text-primary",
  proposal_sent: "text-primary",
  converted: "text-success",
  won: "text-success",
  closed: "text-muted-foreground",
  lost: "text-destructive",
  archived: "text-muted-foreground",
  out_of_office: "text-muted-foreground",
};

// ─── Animated KPI Card wrapper ────────────────────────────────────────────────────

function KPICardMotion({
  title,
  end,
  icon,
  subtitle,
  color,
  delay,
}: {
  title: string;
  end: number;
  icon: React.ReactNode;
  subtitle: string;
  color: string;
  delay: number;
}) {
  const value = useCountUp(end, 1200, delay);
  return (
    <motion.div variants={itemVariants}>
      <KPICard
        title={title}
        value={value}
        icon={icon}
        subtitle={subtitle}
        color={color}
      />
    </motion.div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  responded: "Responded",
  interested: "Interested",
  not_interested: "Not Interested",
  qualified: "Qualified",
  proposal_sent: "Proposal",
  converted: "Won",
  won: "Won",
  closed: "Closed",
  lost: "Lost",
  archived: "Archived",
  out_of_office: "Out of Office",
};

// ─── Motion variants ──────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

const fadeInDelayVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.3, ease: "easeOut" as const },
  },
};

const slideInLeftVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

function SimpleBarChart({ data }: { data: { status: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.status} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-24 text-right capitalize shrink-0">
            {STATUS_LABELS[item.status] || item.status}
          </span>
          <div className="flex-1 bg-secondary rounded-full h-6 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${STATUS_COLORS[item.status] || "text-primary"}`}
              style={{
                width: `${Math.max((item.count / maxCount) * 100, 8)}%`,
                backgroundColor: "currentColor",
                opacity: 0.7,
              }}
            />
          </div>
          <span className="text-xs text-foreground w-8 shrink-0">{item.count}</span>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">No data yet</p>
      )}
    </div>
  );
}

// ─── AreaChart (simple SVG) ──────────────────────────────────────────────────────

function WeeklyLeadsChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">No data this week</p>
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
      <path d={areaPath} fill="currentColor" className="text-primary" opacity="0.15" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" />

      {/* Dots */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="currentColor" className="text-primary" />
          {/* Day label */}
          <text
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            className="text-muted-foreground"
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
            className="text-foreground"
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
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Delete &quot;{lead.business_name}&quot;?</p>
          <p className="text-xs text-muted-foreground mt-0.5">This cannot be undone.</p>
          <div className="flex gap-2 mt-3">
            <Button variant="destructive" size="sm" onClick={() => onAction(lead.id, "delete")}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <h4 className="text-sm font-medium text-foreground truncate">{lead.business_name}</h4>
            <span className="text-xs text-muted-foreground capitalize">{(lead as any).pipelineStage || lead.status}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Completed {lead.sequence_name}. No reply received.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={() => onAction(lead.id, "archive")}>
              <Archive className="w-3.5 h-3.5" />
              Archive
            </Button>
            <Button variant="ghost" size="sm" className="text-primary" onClick={() => onAction(lead.id, "recontact")}>
              <RefreshCw className="w-3.5 h-3.5" />
              Re-contact
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setShowDeleteConfirm(true)} aria-label="Delete lead">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
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
  const [showOnboarding, setShowOnboarding] = useState(false);

  const { profile, refreshProfile, updateProfile, generateUsp } = useProfile();

  // Show onboarding on first visit (step 0), or if previously completed but no profile
  useEffect(() => {
    if (profile && profile.onboarding_step === 0) {
      setShowOnboarding(true);
    }
  }, [profile]);

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
      if (err.message?.includes("401")) {
        window.location.href = "/auth/login";
        return;
      }
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
          <p className="text-sm text-destructive mb-3">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* KPI Cards */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <KPICardMotion
              title="Total Leads"
              end={data?.kpis.total_leads ?? 0}
              icon={<Users className="w-5 h-5" />}
              subtitle="All time"
              color="blue"
              delay={0}
            />
            <KPICardMotion
              title="Contacted"
              end={data?.kpis.contacted ?? 0}
              icon={<Mail className="w-5 h-5" />}
              subtitle="This month"
              color="amber"
              delay={50}
            />
            <KPICardMotion
              title="Replied"
              end={data?.kpis.replied ?? 0}
              icon={<MessageSquare className="w-5 h-5" />}
              subtitle="Positive responses"
              color="green"
              delay={100}
            />
            <KPICardMotion
              title="Active Sequences"
              end={data?.kpis.active_sequences ?? 0}
              icon={<TrendingUp className="w-5 h-5" />}
              subtitle="Currently running"
              color="blue"
              delay={150}
            />
          </>
        )}
      </motion.div>

      {/* Charts Row */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={fadeInDelayVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Weekly Leads */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Weekly Leads</h3>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <WeeklyLeadsChart data={data?.weekly_leads ?? []} />
          )}
        </Card>

        {/* Pipeline Funnel */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline Funnel</h3>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <SimpleBarChart data={data?.pipeline_funnel ?? []} />
          )}
        </Card>
      </motion.div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categories */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top Categories</h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between animate-pulse">
                  <div className="h-4 w-32 bg-secondary rounded" />
                  <div className="h-5 w-10 bg-secondary rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {(data?.top_categories ?? []).map((cat, idx) => (
                <div key={cat.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                    <span className="text-sm text-foreground capitalize">{cat.category}</span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground bg-secondary px-2.5 py-0.5 rounded-full">
                    {cat.count}
                  </span>
                </div>
              ))}
              {!data?.top_categories?.length && (
                <EmptyState
                  icon={Tag}
                  title="No categories yet"
                  description="Save leads from search to see your top business categories."
                  action={{ label: "Run a Search", href: "/search/google-maps" }}
                  className="py-6"
                />
              )}
            </div>
          )}
        </Card>

        {/* Sequence Stats */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Sequence Stats</h3>
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-secondary rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Enrolled */}
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                <p className="text-xs text-muted-foreground mb-1">Enrolled</p>
                <p className="text-lg font-bold text-primary">{data?.sequence_stats.total_enrolled ?? 0}</p>
              </div>
              {/* Completed */}
              <div className="rounded-lg bg-success/5 border border-success/10 p-3">
                <p className="text-xs text-muted-foreground mb-1">Completed</p>
                <p className="text-lg font-bold text-success">{data?.sequence_stats.completed ?? 0}</p>
              </div>
              {/* Replied */}
              <div className="rounded-lg bg-success/5 border border-success/10 p-3">
                <p className="text-xs text-muted-foreground mb-1">Replied</p>
                <p className="text-lg font-bold text-success">{data?.sequence_stats.replied ?? 0}</p>
              </div>
              {/* Dead Leads */}
              <button
                onClick={() => {
                  const el = document.getElementById("dead-leads-section");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
                className="rounded-lg bg-warning/5 border border-warning/10 p-3 text-left hover:bg-warning/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <p className="text-xs text-muted-foreground mb-1">Dead Leads Pending</p>
                <p className="text-lg font-bold text-warning">{data?.sequence_stats.dead_leads_pending ?? 0}</p>
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
          <motion.div
            className="space-y-4 mt-6"
            variants={slideInLeftVariants}
            initial="hidden"
            animate="visible"
          >
            {deadLeads.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" />
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
          </motion.div>
        )}
      </div>

      {/* Onboarding Modal */}
      {showOnboarding && profile && (
        <OnboardingModal
          initialProfile={profile as unknown as Record<string, unknown>}
          onComplete={() => { setShowOnboarding(false); refreshProfile(); }}
          onSkip={() => { updateProfile({ onboarding_step: -1 }); setShowOnboarding(false); refreshProfile(); }}
        />
      )}
    </div>
  );
}

export const getServerSideProps = withAuth();
