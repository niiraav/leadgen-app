import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { HotScoreBadge } from "@/components/ui/badge";
import { api, BackendPaginatedLeads } from "@/lib/api";
import { Plus, Loader2 } from "lucide-react";
import Link from "next/link";

const statusOptions = [
  { id: "new", title: "New Leads", color: "#1d6fa8" },
  { id: "contacted", title: "Contacted", color: "#996200" },
  { id: "qualified", title: "Qualified", color: "#6b21a8" },
  { id: "proposal_sent", title: "Proposal Sent", color: "#0f0f0e" },
  { id: "converted", title: "Won", color: "#1a7a45" },
  { id: "lost", title: "Lost", color: "#b83232" },
  { id: "archived", title: "Archived", color: "#6b7280" },
];

interface PipelineLead {
  id: string;
  businessName: string;
  email: string;
  category: string;
  city: string;
  country: string;
  hotScore: number;
  status: string;
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.leads.list({ limit: 500 });
      const mapped = result.data.map((l) => ({
        id: l.id,
        businessName: l.business_name,
        email: l.email || "",
        category: l.category || "",
        city: l.city || "",
        country: l.country || "",
        hotScore: l.hot_score,
        status: l.status,
      }));
      setLeads(mapped);
      setLoading(false);
    } catch (err: any) {
      console.warn("[Pipeline] API unreachable:", err.message);
      setLeads([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleMoveLead = async (leadId: string, newStatus: string) => {
    setMovingId(leadId);
    try {
      await api.pipeline.updateStatus(leadId, newStatus);
      // Update local state
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
    } catch (err: any) {
      console.error("[Pipeline] Failed to update status:", err.message);
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Pipeline</h1>
          <p className="text-sm text-text-muted mt-1">
            {loading ? "Loading..." : `${leads.length} leads in your pipeline`}
          </p>
        </div>
        <button className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" />
          Add Lead
        </button>
      </div>

      {loading ? (
        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-none">
          {statusOptions.map((col) => (
            <div key={col.id} className="min-w-[280px] md:min-w-[300px] max-w-[300px] flex-shrink-0">
              <div className="h-20 rounded-xl border border-border/40 animate-pulse mb-3" />
              <div className="h-32 rounded-xl bg-surface-2 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-none">
          {statusOptions.map((col) => {
            const leadsInCol = leads.filter((l) => l.status === col.id);

            return (
              <div
                key={col.id}
                className="min-w-[300px] max-w-[300px] flex-shrink-0"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                    <h3 className="text-sm font-semibold text-text">
                      {col.title}
                    </h3>
                    <span className="text-xs text-text-faint bg-surface-2 px-2 py-0.5 rounded-full">
                      {leadsInCol.length}
                    </span>
                  </div>
                  <button className="rounded-full p-1 text-text-faint hover:text-text hover:bg-surface-2 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Column Cards */}
                <div className="space-y-2">
                  {leadsInCol.map((lead) => (
                    <Card
                      key={lead.id}
                      className="p-4 group cursor-default"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-semibold text-text truncate flex-1 min-w-0">
                          {lead.businessName}
                        </h4>
                        <HotScoreBadge score={lead.hotScore} />
                      </div>
                      <p className="text-xs text-text-muted mb-0.5 truncate">
                        {lead.category}
                      </p>
                      <p className="text-xs text-text-faint truncate">
                        {lead.email}
                      </p>

                      {/* Status Dropdown */}
                      <div className="mt-3">
                        <select
                          value={lead.status}
                          disabled={movingId === lead.id}
                          onChange={(e) => handleMoveLead(lead.id, e.target.value)}
                          className="w-full h-7 px-2 text-[10px] font-medium rounded-md bg-surface-2 border border-border text-text-muted focus:outline-none focus:ring-1 focus:ring-blue/20 cursor-pointer uppercase tracking-wider disabled:opacity-50"
                        >
                          {statusOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-text-faint">
                          {lead.city || lead.country}
                        </span>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-[10px] text-blue hover:underline"
                        >
                          View profile →
                        </Link>
                      </div>
                    </Card>
                  ))}

                  {leadsInCol.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed border-border/40 p-6 text-center">
                      <p className="text-xs text-text-faint">
                        No leads in this stage
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const getServerSideProps = withAuth();
