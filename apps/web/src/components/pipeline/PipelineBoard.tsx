import { useState, useCallback, useEffect, useRef } from "react";
import { DndContext, DragOverlay, closestCorners } from "@dnd-kit/core";
import { PipelineColumn } from "./PipelineColumn";
import { PipelineCardOverlay } from "./PipelineCard";
import { SelectionToolbar } from "./SelectionToolbar";
import { LeadQuickDrawer } from "./LeadQuickDrawer";
import { LossReasonModal } from "./LossReasonModal";
import { usePipelineBoard } from "@/hooks/usePipelineBoard";
import { PIPELINE_COLUMNS } from "@leadgen/shared";
import { motion } from "framer-motion";

const statusOptions = PIPELINE_COLUMNS.map((c) => ({
  id: c.id,
  title: c.title,
}));

export function PipelineBoard() {
  const {
    leads,
    leadsByColumn,
    isLoading,
    sensors,
    activeLeadId,
    handleDragStart,
    handleDragEnd,
    dropAnimation,
    moveMutation,
    recentlyMovedIds,
    // Bulk
    bulkMoveMutation,
    // Selection
    selectedIds,
    selectedCount,
    hasSelection,
    isMultiDrag,
    selectLead,
    selectAllInColumn,
    clearSelection,
    // Filter
    dueTodayFilter,
    setDueTodayFilter,
    // Loss reason modal
    pendingLossMove,
    setPendingLossMove,
    confirmLossMove,
    cancelLossMove,
  } = usePipelineBoard();

  const [focusedLeadId, setFocusedLeadId] = useState<string | null>(null);
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const activeLead = activeLeadId
    ? leads.find((l) => l.id === activeLeadId)
    : undefined;

  const activeColumn = activeLead
    ? PIPELINE_COLUMNS.find(
        (c) =>
          c.id ===
          (activeLead.pipelineStage || activeLead.engagementStatus || activeLead.status)
      )
    : undefined;

  const handleStatusChange = (leadId: string, newStatus: string) => {
    const colDef = PIPELINE_COLUMNS.find((c) => c.id === newStatus);
    if (!colDef) return;
    moveMutation.mutate({ leadId, targetColumn: colDef });
  };

  const handleLeadClick = (lead: any) => {
    setDrawerLeadId(lead.id);
  };

  const handleSelect = (
    leadId: string,
    modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
  ) => {
    let columnLeads: typeof leads = [];
    for (const col of PIPELINE_COLUMNS) {
      const colLeads = leadsByColumn[col.id] || [];
      if (colLeads.some((l) => l.id === leadId)) {
        columnLeads = colLeads;
        break;
      }
    }
    selectLead(leadId, columnLeads, modifiers);
  };

  const handleSelectAllInColumn = (columnId: string) => {
    const columnLeads = leadsByColumn[columnId] || [];
    selectAllInColumn(columnId, columnLeads);
  };

  const handleToolbarMove = (columnId: string) => {
    const colDef = PIPELINE_COLUMNS.find((c) => c.id === columnId);
    if (!colDef || selectedCount === 0) return;
    if (colDef.id === 'lost') {
      const idsToMove = Array.from(selectedIds);
      setPendingLossMove({ leadIds: idsToMove, targetColumn: colDef });
      return;
    }
    const idsToMove = Array.from(selectedIds);
    bulkMoveMutation.mutate({ leadIds: idsToMove, targetColumn: colDef });
  };

  // ── Keyboard Navigation ──────────────────────────────────────────

  const findColumnForLead = useCallback(
    (leadId: string) => {
      for (const col of PIPELINE_COLUMNS) {
        if ((leadsByColumn[col.id] || []).some((l) => l.id === leadId)) return col.id;
      }
      return null;
    },
    [leadsByColumn]
  );

  const focusCard = useCallback((leadId: string) => {
    setFocusedLeadId(leadId);
    // Programmatically focus the card element for visual focus ring
    const el = document.querySelector(`[data-lead-id="${leadId}"]`);
    if (el instanceof HTMLElement) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Escape: close drawer first, then clear selection
      if (e.key === "Escape") {
        if (drawerLeadId) {
          e.preventDefault();
          setDrawerLeadId(null);
          return;
        }
        if (hasSelection) {
          e.preventDefault();
          clearSelection();
          return;
        }
      }

      // Enter: open drawer for focused lead
      if (e.key === "Enter" && focusedLeadId) {
        e.preventDefault();
        setDrawerLeadId(focusedLeadId);
        return;
      }

      const currentColumnId = focusedLeadId ? findColumnForLead(focusedLeadId) : null;
      if (!currentColumnId) return;
      const colLeads = leadsByColumn[currentColumnId] || [];
      const currentIndex = colLeads.findIndex((l) => l.id === focusedLeadId);
      if (currentIndex === -1) return;

      const currentColIdx = PIPELINE_COLUMNS.findIndex((c) => c.id === currentColumnId);

      // ArrowUp: focus previous card in same column
      if (e.key === "ArrowUp" && !e.shiftKey) {
        e.preventDefault();
        const prevIndex = currentIndex - 1;
        if (prevIndex >= 0) {
          focusCard(colLeads[prevIndex].id);
        }
        return;
      }

      // ArrowDown: focus next card in same column
      if (e.key === "ArrowDown" && !e.shiftKey) {
        e.preventDefault();
        const nextIndex = currentIndex + 1;
        if (nextIndex < colLeads.length) {
          focusCard(colLeads[nextIndex].id);
        }
        return;
      }

      // Shift+ArrowUp: move focused lead to previous column
      if (e.key === "ArrowUp" && e.shiftKey) {
        e.preventDefault();
        const prevColIdx = currentColIdx - 1;
        if (prevColIdx >= 0) {
          const targetCol = PIPELINE_COLUMNS[prevColIdx];
          if (focusedLeadId) {
            if (targetCol.id === 'lost') {
              setPendingLossMove({ leadIds: [focusedLeadId], targetColumn: targetCol });
            } else {
              moveMutation.mutate({ leadId: focusedLeadId, targetColumn: targetCol });
            }
            // After move, try to focus the same lead in its new column
            setTimeout(() => focusCard(focusedLeadId), 150);
          }
        }
        return;
      }

      // Shift+ArrowDown: move focused lead to next column
      if (e.key === "ArrowDown" && e.shiftKey) {
        e.preventDefault();
        const nextColIdx = currentColIdx + 1;
        if (nextColIdx < PIPELINE_COLUMNS.length) {
          const targetCol = PIPELINE_COLUMNS[nextColIdx];
          if (focusedLeadId) {
            if (targetCol.id === 'lost') {
              setPendingLossMove({ leadIds: [focusedLeadId], targetColumn: targetCol });
            } else {
              moveMutation.mutate({ leadId: focusedLeadId, targetColumn: targetCol });
            }
            setTimeout(() => focusCard(focusedLeadId), 150);
          }
        }
        return;
      }

      // ArrowLeft: move focus to previous column (first card)
      if (e.key === "ArrowLeft" && !e.shiftKey) {
        e.preventDefault();
        const prevColIdx = currentColIdx - 1;
        if (prevColIdx >= 0) {
          const prevCol = PIPELINE_COLUMNS[prevColIdx];
          const prevColLeads = leadsByColumn[prevCol.id] || [];
          if (prevColLeads.length > 0) {
            focusCard(prevColLeads[0].id);
          }
        }
        return;
      }

      // ArrowRight: move focus to next column (first card)
      if (e.key === "ArrowRight" && !e.shiftKey) {
        e.preventDefault();
        const nextColIdx = currentColIdx + 1;
        if (nextColIdx < PIPELINE_COLUMNS.length) {
          const nextCol = PIPELINE_COLUMNS[nextColIdx];
          const nextColLeads = leadsByColumn[nextCol.id] || [];
          if (nextColLeads.length > 0) {
            focusCard(nextColLeads[0].id);
          }
        }
        return;
      }
    },
    [focusedLeadId, drawerLeadId, hasSelection, leadsByColumn, findColumnForLead, focusCard, moveMutation, clearSelection]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Focus first card by default when loading completes
  useEffect(() => {
    if (!isLoading && !focusedLeadId && leads.length > 0) {
      const firstCol = PIPELINE_COLUMNS.find((c) => (leadsByColumn[c.id] || []).length > 0);
      if (firstCol) {
        const firstLead = leadsByColumn[firstCol.id][0];
        setFocusedLeadId(firstLead.id);
      }
    }
  }, [isLoading, leads.length, leadsByColumn, focusedLeadId]);

  if (isLoading) {
    return (
      <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-none">
        {PIPELINE_COLUMNS.map((col) => (
          <div
            key={col.id}
            className="min-w-[280px] md:min-w-[300px] max-w-[300px] flex-shrink-0"
          >
            <div className="h-8 rounded-xl border border-border/40 animate-pulse mb-3" />
            <div className="h-32 rounded-xl bg-surface-2 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setDueTodayFilter((v) => !v)}
          className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
            dueTodayFilter
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-surface border-border text-text-muted hover:bg-surface-2"
          }`}
        >
          {dueTodayFilter ? "Due Today · On" : "Due Today"}
        </button>
        {dueTodayFilter && (
          <span className="text-xs text-text-faint">
            Showing leads with follow-up date ≤ today
          </span>
        )}
      </div>

      <div ref={boardRef} className="relative">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          autoScroll={{
            enabled: true,
            layoutShiftCompensation: true,
            acceleration: 10,
            threshold: {
              x: 0.2,
              y: 0.1,
            },
          }}
        >
          <motion.div
            className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {PIPELINE_COLUMNS.map((column) => (
              <PipelineColumn
                key={column.id}
                column={column}
                leads={leadsByColumn[column.id] || []}
                statusOptions={statusOptions}
                onStatusChange={handleStatusChange}
                recentlyMovedIds={recentlyMovedIds}
                onLeadClick={handleLeadClick}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onSelectAll={() => handleSelectAllInColumn(column.id)}
                isMultiDragActive={isMultiDrag}
                focusedLeadId={focusedLeadId}
                onCardFocus={setFocusedLeadId}
              />
            ))}
          </motion.div>

          <DragOverlay dropAnimation={dropAnimation}>
            {activeLead && activeColumn ? (
              <PipelineCardOverlay
                lead={activeLead}
                column={activeColumn}
                selectedCount={isMultiDrag ? selectedCount : 1}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <SelectionToolbar
        selectedCount={selectedCount}
        columns={PIPELINE_COLUMNS}
        onMoveTo={handleToolbarMove}
        onClear={clearSelection}
      />

      <LeadQuickDrawer
        leadId={drawerLeadId}
        onClose={() => setDrawerLeadId(null)}
      />

      <LossReasonModal
        open={!!pendingLossMove}
        leadCount={pendingLossMove?.leadIds.length ?? 0}
        onConfirm={confirmLossMove}
        onCancel={cancelLossMove}
      />
    </>
  );
}
