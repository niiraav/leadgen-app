import { useState, useEffect, useCallback } from "react";
import { KPICard } from "@/components/ui/card";
import { Users, Mail, MessageSquare, ArrowRight, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { api } from "@/lib/api";
import { mockDashboardStats } from "@/lib/mock-data";
import Link from "next/link";

interface DashboardData {
  totalLeads: number;
  contacted: number;
  replied: number;
  openSequences: number;
  weeklyData: { day: string; leads: number; replied: number }[];
  monthlyTrend: { month: string; leads: number; contacted: number; replied: number }[];
  recentLeads: { id: string; name: string; company: string; status: string; score: number; date: string }[];
  loading: boolean;
  error: string | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    totalLeads: mockDashboardStats.totalLeads,
    contacted: mockDashboardStats.contacted,
    replied: mockDashboardStats.replied,
    openSequences: mockDashboardStats.openSequences,
    weeklyData: mockDashboardStats.weeklyData,
    monthlyTrend: mockDashboardStats.monthlyTrend,
    recentLeads: [
      { name: "Sarah Chen", company: "TechFlow Inc", status: "new", score: 92, date: "Jan 15", id: "" },
      { name: "Marcus Rivera", company: "GrowthLab", status: "contacted", score: 78, date: "Jan 14", id: "" },
      { name: "Emily Park", company: "BrightPath", status: "replied", score: 85, date: "Jan 13", id: "" },
      { name: "James O'Brien", company: "DataScale", status: "meeting", score: 97, date: "Jan 12", id: "" },
    ],
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    try {
      // Fetch KPI from real API
      const kpi = await api.kpi.get();
      
      // Fetch recent leads for the table
      const leadsResult = await api.leads.list({ limit: 4 });
      const mappedLeads = leadsResult.data.map((l) => ({
        id: l.id,
        name: l.business_name,
        company: l.city || l.country || "",
        status: l.status,
        score: l.hot_score || 0,
        date: l.created_at ? new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—",
      }));

      setData({
        totalLeads: kpi.total_leads,
        contacted: kpi.contacted_this_week,
        replied: kpi.replies,
        openSequences: kpi.open_sequences,
        weeklyData: mockDashboardStats.weeklyData, // keep mock until backend provides time-series
        monthlyTrend: mockDashboardStats.monthlyTrend, // keep mock until backend provides time-series
        recentLeads: mappedLeads.length > 0 ? mappedLeads : [
          { name: "No leads yet", company: "—", status: "new", score: 0, date: "—", id: "" },
        ],
        loading: false,
        error: null,
      });
    } catch (err: any) {
      console.warn("[Dashboard] API unreachable, showing mock data:", err.message);
      // Fall back to mock data
      setData({
        totalLeads: mockDashboardStats.totalLeads,
        contacted: mockDashboardStats.contacted,
        replied: mockDashboardStats.replied,
        openSequences: mockDashboardStats.openSequences,
        weeklyData: mockDashboardStats.weeklyData,
        monthlyTrend: mockDashboardStats.monthlyTrend,
        recentLeads: [
          { name: "Sarah Chen", company: "TechFlow Inc", status: "new", score: 92, date: "Jan 15", id: "" },
          { name: "Marcus Rivera", company: "GrowthLab", status: "contacted", score: 78, date: "Jan 14", id: "" },
          { name: "Emily Park", company: "BrightPath", status: "replied", score: 85, date: "Jan 13", id: "" },
          { name: "James O'Brien", company: "DataScale", status: "meeting", score: 97, date: "Jan 12", id: "" },
        ],
        loading: false,
        error: null,
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (data.loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div className="flex animate-pulse items-center gap-3">
          <div className="h-8 w-40 bg-surface-2 rounded" />
          <div className="h-4 w-64 bg-surface-2 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">
          Overview of your lead pipeline and activity
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Leads"
          value={data.totalLeads.toLocaleString()}
          change="+18.5%"
          changeType="positive"
          icon={<Users className="w-5 h-5" />}
        />
        <KPICard
          title="Contacted"
          value={data.contacted.toLocaleString()}
          change="+12.3%"
          changeType="positive"
          icon={<Mail className="w-5 h-5" />}
        />
        <KPICard
          title="Replies"
          value={data.replied.toLocaleString()}
          change="-2.1%"
          changeType="negative"
          icon={<MessageSquare className="w-5 h-5" />}
        />
        <KPICard
          title="Open Sequences"
          value={data.openSequences}
          change="+3"
          changeType="positive"
          icon={<ArrowRight className="w-5 h-5" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity */}
        <div className="rounded-xl border border-border/60 bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">Weekly Activity</h3>
            <TrendingUp className="w-4 h-4 text-green" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              />
              <Bar dataKey="leads" fill="var(--blue)" radius={[4, 4, 0, 0]} name="Leads" />
              <Bar dataKey="replied" fill="var(--green)" radius={[4, 4, 0, 0]} name="Replied" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Trend */}
        <div className="rounded-xl border border-border/60 bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">Monthly Trend</h3>
            <TrendingUp className="w-4 h-4 text-green" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Line type="monotone" dataKey="leads" stroke="var(--blue)" strokeWidth={2} dot={{ r: 3 }} name="Leads" />
              <Line type="monotone" dataKey="contacted" stroke="var(--amber)" strokeWidth={2} dot={{ r: 3 }} name="Contacted" />
              <Line type="monotone" dataKey="replied" stroke="var(--green)" strokeWidth={2} dot={{ r: 3 }} name="Replied" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-border/60 bg-surface p-5">
        <h3 className="text-sm font-semibold text-text mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <a href="/search/google-maps" className="btn btn-primary text-sm">
            Search Leads
          </a>
          <a href="/leads/import" className="btn btn-secondary text-sm">
            Import CSV
          </a>
          <a href="/sequences" className="btn btn-secondary text-sm">
            View Sequences
          </a>
          <a href="/pipeline" className="btn btn-secondary text-sm">
            Open Pipeline
          </a>
        </div>
      </div>

      {/* Recent Leads Preview */}
      <div className="rounded-xl border border-border/60 bg-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text">Recent Leads</h3>
          <a href="/leads" className="text-xs text-blue hover:underline">
            View all →
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 text-text-muted">
                <th className="text-left py-2 pr-4 font-medium">Name</th>
                <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Company</th>
                <th className="text-left py-2 pr-4 font-medium hidden md:table-cell">Status</th>
                <th className="text-left py-2 pr-4 font-medium">Score</th>
                <th className="text-left py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {data.recentLeads.map((lead, i) => (
                <tr key={i} className="border-b border-border/30 text-text hover:bg-surface-2/40 transition-colors">
                  <td className="py-2.5 pr-4 font-medium">
                    {lead.id ? (
                      <Link href={`/leads/${lead.id}`} className="hover:text-blue transition-colors">
                        {lead.name}
                      </Link>
                    ) : lead.name}
                  </td>
                  <td className="py-2.5 pr-4 hidden sm:table-cell">{lead.company}</td>
                  <td className="py-2.5 pr-4 hidden md:table-cell">
                    <span
                      className={
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " +
                        (lead.status === "new"
                          ? "bg-blue/10 text-blue"
                          : lead.status === "contacted"
                          ? "bg-amber/10 text-amber"
                          : lead.status === "replied"
                          ? "bg-green/10 text-green"
                          : "bg-accent/10 text-text")
                      }
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`font-semibold ${
                        lead.score >= 80
                          ? "text-green"
                          : lead.score >= 50
                          ? "text-amber"
                          : "text-red"
                      }`}
                    >
                      {lead.score}
                    </span>
                  </td>
                  <td className="py-2.5 text-text-muted">{lead.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
