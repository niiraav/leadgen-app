import { DndContext, DragOverlay, closestCorners } from "@dnd-kit/core";
import { PipelineColumn } from "./PipelineColumn";
import { PipelineCardOverlay } from "./PipelineCard";
import { SelectionToolbar } from "./SelectionToolbar";
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
  } = usePipelineBoard();

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
    // Placeholder for quick-preview drawer
    console.log("Lead card clicked:", lead.id);
  };

  const handleSelect = (
    leadId: string,
    modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
  ) => {
    // Find which column this lead belongs to for shift+range selection
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
    const idsToMove = Array.from(selectedIds);
    bulkMoveMutation.mutate({ leadIds: idsToMove, targetColumn: colDef });
  };

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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        autoScroll={{ enabled: true, layoutShiftCompensation: true }}
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

      <SelectionToolbar
        selectedCount={selectedCount}
        columns={PIPELINE_COLUMNS}
        onMoveTo={handleToolbarMove}
        onClear={clearSelection}
      />
    </>
  );
}
