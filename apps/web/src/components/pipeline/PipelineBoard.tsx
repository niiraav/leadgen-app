import { DndContext, DragOverlay, closestCorners } from "@dnd-kit/core";
import { PipelineColumn } from "./PipelineColumn";
import { PipelineCard, PipelineCardOverlay } from "./PipelineCard";
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
          />
        ))}
      </motion.div>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeLead && activeColumn ? (
          <PipelineCardOverlay lead={activeLead} column={activeColumn} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
