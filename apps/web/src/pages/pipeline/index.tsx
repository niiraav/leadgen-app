import { withAuth } from "@/lib/auth";
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { api, Lead } from "@/lib/api";
import { Plus, Search, X, Clock, AlertTriangle, PoundSterling, Eye, BarChart3, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { followUpHealth, formatCompactDealValue, PIPELINE_COLUMNS, getColumnDef } from "@leadgen/shared";
import { usePipelineBoard, PipelineLead } from "@/hooks/usePipelineBoard";
import { usePipelineGates } from "@/hooks/usePipelineGates";
import PipelineBoardDesktop from "@/components/pipeline/PipelineBoardDesktop";
import PipelineBoardMobile from "@/components/pipeline/PipelineBoardMobile";
import SelectionToolbar from "@/components/pipeline/SelectionToolbar";
import BulkFollowUpModal from "@/components/pipeline/BulkFollowUpModal";
import BulkLossModal from "@/components/pipeline/BulkLossModal";
import LeadQuickDrawer from "@/components/pipeline/LeadQuickDrawer";

type FilterType = "all" | "due_today" | "overdue" | "this_week" | "stale";

const filterPills: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due_today", label: "Due Today" },
  { id: "overdue", label: "Overdue" },
  { id: "this_week", label: "This Week" },
  { id: "stale", label: "Stale" },
];

interface HealthSummary {
  total_pipeline_value: number;
  avg_deal_size: number;
  overdue_follow_ups: number;
  committed_leads: number;
}

export default function PipelinePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [quickDrawer, setQuickDrawer] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });

  // URL params
  const [urlSynced, setUrlSynced] = useState(false);
  if (router.isReady && !urlSynced) {
    const q = router.query;
    if (q.search) setSearch(String(q.search));
    if (q.filter && filterPills.some((f) => f.id === q.filter)) {
      setActiveFilter(q.filter as FilterType);
    }
    setUrlSynced(true);
  }

  const updateUrl = (opts: { search?: string; filter?: FilterType }) => {
    const q: Record<string, string> = {};
    if (opts.search) q.search = opts.search;
    if (opts.filter && opts.filter !== "all") q.filter = opts.filter;
    router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
  };

  // Health summary
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ["pipeline-health"],
    queryFn: api.pipelineHealth,
    staleTime: 60_000,
  });
  const healthSummary: HealthSummary | null = healthData
    ? {
        total_pipeline_value: healthData.total_pipeline_value,
        avg_deal_size: healthData.avg_deal_size,
        overdue_follow_ups: healthData.overdue_follow_ups,
        committed_leads: healthData.committed_leads,
      }
    : null;

  // Board hook
  const board = usePipelineBoard();

  // Gate controller (Sprint B)
  const gates = usePipelineGates(board.moveMutation, board.bulkMoveMutation);

  // Filter leads
  const filteredLeads = useMemo(() => {
    let result = board.leads;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          (l.business_name || "").toLowerCase().includes(q) ||
          (l.email || "").toLowerCase().includes(q) ||
          (l.category || "").toLowerCase().includes(q)
      );
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

    switch (activeFilter) {
      case "due_today":
        result = result.filter((l) => {
          if (!l.followUpDate) return false;
          const d = new Date(l.followUpDate);
          d.setUTCHours(0, 0, 0, 0);
          return d.getTime() === today.getTime();
        });
        break;
      case "overdue":
        result = result.filter((l) => {
          if (!l.followUpDate) return false;
          const d = new Date(l.followUpDate);
          d.setUTCHours(0, 0, 0, 0);
          return d.getTime() < today.getTime();
        });
        break;
      case "this_week":
        result = result.filter((l) => {
          if (!l.followUpDate) return false;
          const d = new Date(l.followUpDate);
          d.setUTCHours(0, 0, 0, 0);
          return d.getTime() >= today.getTime() && d.getTime() <= endOfWeek.getTime();
        });
        break;
      case "stale":
        result = result.filter((l) => {
          const updated = l.updated_at ? new Date(l.updated_at) : null;
          if (!updated) return false;
          const days = Math.round((today.getTime() - updated.getTime()) / 86400000);
          return days > 14;
        });
        break;
    }

    return result;
  }, [board.leads, search, activeFilter]);

  // Group by column
  const leadsByColumn = useMemo(() => {
    const map: Record<string, PipelineLead[]> = {};
    for (const col of PIPELINE_COLUMNS) {
      map[col.id] = [];
    }
    for (const lead of filteredLeads) {
      const colId = getColumnDef(lead.status)?.id ?? "new";
      if (!map[colId]) map[colId] = [];
      map[colId].push(lead);
    }
    // Sort within each column using positionMap
    for (const colId of Object.keys(map)) {
      const positions = board.positionMap[colId] || {};
      map[colId].sort((a, b) => {
        const pa = positions[a.id] ?? Infinity;
        const pb = positions[b.id] ?? Infinity;
        return pa - pb;
      });
    }
    return map;
  }, [filteredLeads, board.positionMap]);

  // Move handler → gates
  const handleMoveLead = useCallback(
    (leadId: string, newColumnId: string, _newIndex: number) => {
      gates.requestMove([leadId], newColumnId, board.leads);
    },
    [gates, board.leads]
  );

  // Bulk move handler → gates
  const handleBulkMove = useCallback(
    (columnId: string) => {
      const ids = Array.from(board.selectedIds);
      if (ids.length === 0) return;
      gates.requestMove(ids, columnId, board.leads);
    },
    [gates, board.selectedIds, board.leads]
  );

  // Mobile status change → gates
  const handleStatusChange = useCallback(
    (leadId: string, newColumnId: string) => {
      gates.requestMove([leadId], newColumnId, board.leads);
    },
    [gates, board.leads]
  );

  // Card click → open drawer
  const handleCardClick = useCallback((lead: PipelineLead) => {
    setQuickDrawer({ open: true, lead: lead as unknown as Lead });
  }, []);

  const handleUpdateLead = useCallback(async (id: string, data: Record<string, unknown>) => {
    try {
      await api.leads.update(id, data);
      board.refresh();
    } catch (e: any) {
      console.error("[Pipeline] Update failed:", e.message);
    }
  }, [board]);

  return (
    <div className="space-y-4 md:space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Pipeline</h1>
          <p className="text-sm text-text-muted mt-1">
            {board.isLoading ? "Loading..." : `${board.leads.length} leads in your pipeline`}
          </p>
        </div>
        <Link href="/leads/new" className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" />
          Add Lead
        </Link>
      </div>

      {/* Health Summary Strip */}
      {healthLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-border/40 bg-surface animate-pulse" />
          ))}
        </div>
      ) : healthSummary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <PoundSterling className="w-4 h-4 text-primary" />
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Pipeline value</span>
            </div>
            <p className="text-lg font-bold text-text">
              {healthSummary.total_pipeline_value > 0 ? formatCompactDealValue(healthSummary.total_pipeline_value) : "—"}
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Avg deal</span>
            </div>
            <p className="text-lg font-bold text-text">
              {healthSummary.avg_deal_size > 0 ? formatCompactDealValue(healthSummary.avg_deal_size) : "—"}
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Overdue</span>
            </div>
            <p className="text-lg font-bold text-text">{healthSummary.overdue_follow_ups}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-success" />
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Committed</span>
            </div>
            <p className="text-lg font-bold text-text">{healthSummary.committed_leads}</p>
          </Card>
        </div>
      ) : null}

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              updateUrl({ search: e.target.value, filter: activeFilter });
            }}
            placeholder="Search leads..."
            className="input pl-9 text-sm w-full"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                updateUrl({ filter: activeFilter });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {filterPills.map((pill) => (
            <button
              key={pill.id}
              onClick={() => {
                setActiveFilter(pill.id);
                updateUrl({ search, filter: pill.id });
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
                activeFilter === pill.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface-2 text-text-muted border-border hover:bg-secondary"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0">
        {board.isLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINE_COLUMNS.map((col) => (
              <div key={col.id} className="min-w-[272px] w-[272px] flex-shrink-0">
                <div className="h-6 rounded bg-surface-2 animate-pulse mb-2" />
                <div className="h-32 rounded-lg bg-surface-2 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Desktop DnD Board */}
            <div className="hidden md:block h-full">
              <PipelineBoardDesktop
                columns={PIPELINE_COLUMNS}
                leadsByColumn={leadsByColumn}
                selection={board.selectedIds}
                recentlyMovedIds={board.recentlyMovedIds}
                onCardClick={handleCardClick}
                onSelect={(leadId, modifiers) => {
                  const columnId = getColumnDef(board.leads.find((l) => l.id === leadId)?.status || "")?.id || "new";
                  const columnLeads = leadsByColumn[columnId] || [];
                  board.selectLead(leadId, columnLeads, modifiers);
                }}
                onMoveLead={handleMoveLead}
              />
            </div>

            {/* Mobile Grouped List */}
            <div className="md:hidden">
              <PipelineBoardMobile
                columns={PIPELINE_COLUMNS}
                leadsByColumn={leadsByColumn}
                selection={board.selectedIds}
                recentlyMovedIds={board.recentlyMovedIds}
                onCardClick={handleCardClick}
                onStatusChange={handleStatusChange}
                onSelect={(leadId, modifiers) => {
                  const columnId = getColumnDef(board.leads.find((l) => l.id === leadId)?.status || "")?.id || "new";
                  const columnLeads = leadsByColumn[columnId] || [];
                  board.selectLead(leadId, columnLeads, modifiers);
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Selection Toolbar */}
      <SelectionToolbar
        count={board.selectedCount}
        columns={PIPELINE_COLUMNS}
        onMoveTo={handleBulkMove}
        onClear={board.clearSelection}
      />

      {/* Bulk Modals (Sprint B) */}
      {gates.pendingGate?.type === "follow_up" && (
        <BulkFollowUpModal
          isOpen={true}
          leads={gates.pendingGate.leads}
          onConfirm={(date) => gates.confirmGate({ followUpDate: date })}
          onSkip={gates.skipGate}
          onCancel={gates.cancelGate}
          defaultDays={getColumnDef(gates.pendingGate.targetColumn)?.defaultFollowUpDays || 5}
        />
      )}

      {gates.pendingGate?.type === "loss" && (
        <BulkLossModal
          isOpen={true}
          leads={gates.pendingGate.leads}
          onConfirm={(reason, notes) => gates.confirmGate({ lossReason: reason, lossNotes: notes })}
          onSkip={gates.skipGate}
          onCancel={gates.cancelGate}
        />
      )}

      <LeadQuickDrawer
        lead={quickDrawer.lead}
        isOpen={quickDrawer.open}
        onClose={() => setQuickDrawer({ open: false, lead: null })}
        onUpdate={handleUpdateLead}
      />
    </div>
  );
}

export const getServerSideProps = withAuth();
