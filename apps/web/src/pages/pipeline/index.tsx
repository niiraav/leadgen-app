import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { HotScoreBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { Plus } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { spring, staggerContainer, staggerItem } from "@/lib/animation";

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const statusOptions = [
  { id: "new", title: "New Leads", color: "#1d6fa8" },
  { id: "contacted", title: "Contacted", color: "#996200" },
  { id: "qualified", title: "Qualified", color: "#6b21a8" },
  { id: "proposal_sent", title: "Proposal Sent", color: "#0f0f0e" },
  { id: "converted", title: "Won", color: "#1a7a45" },
  { id: "lost", title: "Lost", color: "#b83232" },
];

const engagementColors: Record<string, string> = {
  new: "#1d6fa8",
  contacted: "#d97706",
  responded: "#16a34a",
  not_interested: "#dc2626",
  interested: "#16a34a",
  out_of_office: "#6b7280",
};

const engagementLabels: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  responded: "Responded",
  not_interested: "Not Interested",
  interested: "Interested",
  out_of_office: "Out of Office",
};

interface PipelineLead {
  id: string;
  businessName: string;
  email: string;
  category: string;
  city: string;
  country: string;
  hotScore: number;
  status: string;
  engagementStatus: string | null;
  pipelineStage: string | null;
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
        // Phase 4: use domain fields directly (mapBackendLead already maps them)
        engagementStatus: l.engagement_status ?? null,
        pipelineStage: l.pipeline_stage ?? null,
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

  const PIPELINE_STAGES = ['qualified', 'proposal_sent', 'converted', 'lost'] as const;

  const handleMoveLead = async (leadId: string, newStatus: string) => {
    setMovingId(leadId);
    try {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) throw new Error("Lead not found in local state");

      const isPipelineStage = (PIPELINE_STAGES as readonly string[]).includes(newStatus);

      // Build flat-kanban patch: set target domain, clear the other domain so
      // column filters (engagement requires !pipelineStage) work correctly.
      const patch: Record<string, unknown> = { status: newStatus };
      if (isPipelineStage) {
        patch.pipeline_stage = newStatus;
        patch.engagement_status = null;
      } else {
        patch.engagement_status = newStatus;
        patch.pipeline_stage = null;
      }

      await api.leads.update(leadId, patch);

      // Optimistic local update — mirror the patch exactly
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          return {
            ...l,
            status: newStatus,
            pipelineStage: isPipelineStage ? newStatus : null,
            engagementStatus: isPipelineStage ? null : newStatus,
          };
        })
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
            const leadsInCol = leads.filter((l) => {
              if (['qualified', 'proposal_sent', 'converted', 'lost'].includes(col.id)) {
                return l.pipelineStage === col.id;
              }
              // Phase 4: use engagementStatus first, fallback to legacy status
              const effectiveEngagement = l.engagementStatus ?? l.status;
              return effectiveEngagement === col.id && !l.pipelineStage;
            });

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
                <motion.div
                  className="space-y-2"
                  variants={prefersReducedMotion ? undefined : staggerContainer}
                  initial="initial"
                  animate="animate"
                >
                  <AnimatePresence mode="popLayout">
                    {leadsInCol.map((lead) => (
                      <motion.div
                        key={lead.id}
                        layout={!prefersReducedMotion}
                        variants={prefersReducedMotion ? undefined : staggerItem}
                        initial={prefersReducedMotion ? false : "initial"}
                        animate={prefersReducedMotion ? undefined : "animate"}
                        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      >
                        <Card
                          className="p-4 group cursor-default"
                        >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-text truncate">
                            {lead.businessName}
                          </h4>
                          {lead.engagementStatus && (
                            <span
                              className="inline-block mt-1 text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{
                                color: engagementColors[lead.engagementStatus] || "#6b7280",
                                backgroundColor: `${engagementColors[lead.engagementStatus] || "#6b7280"}18`,
                              }}
                            >
                              {engagementLabels[lead.engagementStatus] || lead.engagementStatus}
                            </span>
                          )}
                        </div>
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
                          value={lead.pipelineStage || lead.engagementStatus || lead.status}
                          disabled={movingId === lead.id}
                          onChange={(e) => handleMoveLead(lead.id, e.target.value)}
                          className="w-full h-7 px-2 text-sm font-medium rounded-md bg-surface-2 border border-border text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer uppercase tracking-wider disabled:opacity-50"
                        >
                          {statusOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-text-faint">
                          {lead.city || lead.country}
                        </span>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-xs text-blue hover:underline"
                        >
                          View profile →
                        </Link>
                      </div>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {leadsInCol.length === 0 && (
                    <motion.div
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReducedMotion ? undefined : spring}
                      className="rounded-xl border-2 border-dashed border-border/40 p-6 text-center"
                    >
                      <p className="text-sm text-text-faint">
                        No leads in this stage
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const getServerSideProps = withAuth();
