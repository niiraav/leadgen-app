import { withAuth } from "@/lib/auth";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, KPICard } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Plus, Search, X, Clock, AlertTriangle, PoundSterling, Eye, BarChart3, Users, LayoutGrid, List as ListIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { followUpHealth, formatCompactDealValue, PIPELINE_COLUMNS, getColumnDef, getLeadColumn } from "@leadgen/shared";
import { usePipelineBoard, PipelineLead, FilterType, ViewMode } from "@/hooks/usePipelineBoard";
import { usePipelineGates } from "@/hooks/usePipelineGates";
import PipelineBoardDesktop from "@/components/pipeline/PipelineBoardDesktop";
import PipelineBoardMobile from "@/components/pipeline/PipelineBoardMobile";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import SelectionToolbar from "@/components/pipeline/SelectionToolbar";
import BulkFollowUpModal from "@/components/pipeline/BulkFollowUpModal";
import BulkLossModal from "@/components/pipeline/BulkLossModal";
import LeadQuickDrawer from "@/components/pipeline/LeadQuickDrawer";

const filterPills: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due_today", label: "Due Today" },
  { id: "overdue", label: "Overdue" },
  { id: "this_week", label: "This Week" },
  { id: "stale", label: "Stale" },
];

interface HealthSummary {
  stale_count: number;
  proposals_out_count: number;
  proposals_out_value: number;
  replies_this_week: number;
  won_this_month: number;
  won_this_month_value: number;
}

export default function PipelinePage() {
  const router = useRouter();
  const [quickDrawer, setQuickDrawer] = useState<{ open: boolean; leadId: string | null }>({ open: false, leadId: null });

  // Board hook (Sprint A: now owns search, filter, viewMode)
  const board = usePipelineBoard();

  // Derive live lead from React Query cache so stage transitions update drawer without re-open
  const drawerLead = useMemo(
    () => board.leads.find((l) => l.id === quickDrawer.leadId) ?? null,
    [board.leads, quickDrawer.leadId]
  );

  // URL params
  const [urlSynced, setUrlSynced] = useState(false);
  if (router.isReady && !urlSynced) {
    const q = router.query;
    if (q.search) board.setSearchQuery(String(q.search));
    if (q.filter && filterPills.some((f) => f.id === q.filter)) {
      board.setActiveFilter(q.filter as FilterType);
    }
    if (q.view === "list" || q.view === "board") {
      board.setViewMode(q.view as "board" | "list");
    }
    setUrlSynced(true);
  }

  const updateUrl = (opts: { search?: string; filter?: FilterType; view?: ViewMode }) => {
    const q: Record<string, string> = {};
    if (opts.search) q.search = opts.search;
    if (opts.filter && opts.filter !== "all") q.filter = opts.filter;
    if (opts.view && opts.view !== "board") q.view = opts.view;
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
        stale_count: (healthData as any).stale_count ?? 0,
        proposals_out_count: (healthData as any).proposals_out_count ?? 0,
        proposals_out_value: (healthData as any).proposals_out_value ?? 0,
        replies_this_week: (healthData as any).replies_this_week ?? 0,
        won_this_month: (healthData as any).won_this_month ?? 0,
        won_this_month_value: (healthData as any).won_this_month_value ?? 0,
      }
    : null;

  // Gate controller (Sprint B)
  const gates = usePipelineGates(board.moveMutation, board.bulkMoveMutation);

  // Move handler → gates
  const handleMoveLead = useCallback(
    (leadId: string, newColumnId: string, _newIndex: number) => {
      gates.requestMove([leadId], newColumnId, board.leads);
    },
    [gates, board.leads]
  );

  // Reorder handler → direct mutation (same-column)
  const handleReorderLead = useCallback(
    (leadId: string, columnId: string, prevLeadId: string | null, nextLeadId: string | null) => {
      board.reorderMutation.mutate({ leadId, columnId, prevLeadId, nextLeadId });
    },
    [board.reorderMutation]
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
    setQuickDrawer({ open: true, leadId: lead.id });
  }, []);

  // Viewport-aware aria-hidden for responsive board/list containers
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (desktopRef.current) desktopRef.current.setAttribute("aria-hidden", String(!mql.matches));
      if (mobileRef.current) mobileRef.current.setAttribute("aria-hidden", String(mql.matches));
    };
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  const handleUpdateLead = useCallback(async (id: string, data: Record<string, unknown>) => {
    try {
      await api.leads.update(id, data);
      board.refresh();
    } catch (e: any) {
      console.error("[Pipeline] Update failed:", e.message);
    }
  }, [board]);

  // Search handler
  const onSearchChange = (value: string) => {
    board.handleSearch(value);
    updateUrl({ search: value, filter: board.activeFilter, view: board.viewMode });
  };

  // Filter handler
  const onFilterChange = (filter: FilterType) => {
    board.handleFilterChange(filter);
    updateUrl({ search: board.searchQuery, filter, view: board.viewMode });
  };

  return (
    <div className="space-y-4 md:space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {board.isLoading ? "Loading..." : `${board.leads.length} leads in your pipeline`}
          </p>
        </div>
        <Link href="/leads" className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Lead
        </Link>
      </div>

      {/* Health Summary Strip */}
      {healthLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading health summary…</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-border/40 bg-card animate-pulse" />
          ))}
        </div>
      ) : healthSummary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            title="Stale leads"
            value={healthSummary.stale_count}
            changeType="negative"
            icon={<AlertTriangle className="w-5 h-5" aria-hidden="true" />}
          />
          <KPICard
            title="Proposals out"
            value={healthSummary.proposals_out_count}
            secondaryValue={healthSummary.proposals_out_value > 0 ? (formatCompactDealValue(healthSummary.proposals_out_value) ?? undefined) : undefined}
            changeType="positive"
            icon={<BarChart3 className="w-5 h-5" aria-hidden="true" />}
          />
          <KPICard
            title="Replies this week"
            value={healthSummary.replies_this_week}
            changeType="positive"
            icon={<Eye className="w-5 h-5" aria-hidden="true" />}
          />
          <KPICard
            title="Won this month"
            value={healthSummary.won_this_month}
            secondaryValue={healthSummary.won_this_month_value > 0 ? (formatCompactDealValue(healthSummary.won_this_month_value) ?? undefined) : undefined}
            changeType="positive"
            icon={<PoundSterling className="w-5 h-5" aria-hidden="true" />}
          />
        </div>
      ) : null}

      {/* Search + Filters + View Toggle */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <label htmlFor="pipeline-search" className="sr-only">Search leads</label>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            id="pipeline-search"
            type="text"
            value={board.searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search leads..."
            className="input pl-9 text-sm w-full"
          />
          {board.searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {filterPills.map((pill) => (
            <button
              key={pill.id}
              onClick={() => onFilterChange(pill.id)}
              aria-pressed={board.activeFilter === pill.id}
              className={`rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-all min-h-8 focus-ring ${
                board.activeFilter === pill.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-secondary rounded-lg border border-border p-0.5 flex-shrink-0">
          <button
            onClick={() => {
              board.setViewMode("board");
              updateUrl({ search: board.searchQuery, filter: board.activeFilter, view: "board" });
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors focus-ring ${
              board.viewMode === "board"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={board.viewMode === "board"}
          >
            <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
            Board
          </button>
          <button
            onClick={() => {
              board.setViewMode("list");
              updateUrl({ search: board.searchQuery, filter: board.activeFilter, view: "list" });
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors focus-ring ${
              board.viewMode === "list"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={board.viewMode === "list"}
          >
            <ListIcon className="w-3.5 h-3.5" aria-hidden="true" />
            List
          </button>
        </div>
      </div>

      {/* Board / List Area */}
      <div className="flex-1 min-h-0">
        {board.isLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-4" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading pipeline board…</span>
            {PIPELINE_COLUMNS.map((col) => (
              <div key={col.id} className="min-w-72 w-72 flex-shrink-0">
                <div className="h-6 rounded bg-secondary animate-pulse mb-2" />
                <div className="h-32 rounded-lg bg-secondary animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div ref={desktopRef} className="hidden md:block h-full">
              {board.viewMode === "board" ? (
                <PipelineBoardDesktop
                  columns={PIPELINE_COLUMNS}
                  leadsByColumn={board.boardLeadsByColumn}
                  selection={board.selectedIds}
                  recentlyMovedIds={board.recentlyMovedIds}
                  onCardClick={handleCardClick}
                  onSelect={(leadId, modifiers) => {
                    const columnId = getColumnDef(board.leads.find((l) => l.id === leadId)?.status || "")?.id || "new";
                    const columnLeads = board.boardLeadsByColumn[columnId] || [];
                    board.selectLead(leadId, columnLeads, modifiers);
                  }}
                  onMoveLead={handleMoveLead}
                  onReorderLead={handleReorderLead}
                  onClearSelection={board.clearSelection}
                />
              ) : (
                <div className="h-full overflow-y-auto pr-1">
                  <PipelineTable
                    leads={board.filteredLeads}
                    loading={board.isLoading}
                    selected={board.selectedIds}
                    recentlyMovedIds={board.recentlyMovedIds}
                    onSelect={(leadId, modifiers) => {
                      board.selectLead(leadId, board.filteredLeads, modifiers);
                    }}
                    onSelectAll={() => board.selectAllInColumn("list", board.filteredLeads)}
                    onRowClick={handleCardClick}
                    onStageChange={(leadId, newColumnId) => {
                      gates.requestMove([leadId], newColumnId, board.leads);
                    }}
                    sortField={board.sortField}
                    sortOrder={board.sortOrder}
                    onSortChange={board.handleSortChange}
                  />
                </div>
              )}
            </div>

            {/* Mobile — always grouped, honours filters */}
            <div ref={mobileRef} className="md:hidden">
              <PipelineBoardMobile
                columns={PIPELINE_COLUMNS}
                leadsByColumn={board.boardLeadsByColumn}
                selection={board.selectedIds}
                recentlyMovedIds={board.recentlyMovedIds}
                onCardClick={handleCardClick}
                onStatusChange={handleStatusChange}
                onSelect={(leadId, modifiers) => {
                  const columnId = getColumnDef(board.leads.find((l) => l.id === leadId)?.status || "")?.id || "new";
                  const columnLeads = board.boardLeadsByColumn[columnId] || [];
                  board.selectLead(leadId, columnLeads, modifiers);
                }}
                onClearSelection={board.clearSelection}
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
        lead={drawerLead}
        isOpen={quickDrawer.open}
        onClose={() => setQuickDrawer({ open: false, leadId: null })}
        onUpdate={handleUpdateLead}
      />
    </div>
  );
}

export const getServerSideProps = withAuth();
