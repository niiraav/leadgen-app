import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState, useCallback, useRef } from "react";
import { PipelineColumnDef, PipelineLead } from "@/hooks/usePipelineBoard";
import PipelineColumn from "./PipelineColumn";
import PipelineCardOverlay from "./PipelineCardOverlay";

interface PipelineBoardDesktopProps {
  columns: PipelineColumnDef[];
  leadsByColumn: Record<string, PipelineLead[]>;
  selection: Set<string>;
  recentlyMovedIds: Set<string>;
  onCardClick: (lead: PipelineLead) => void;
  onSelect: (leadId: string, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onMoveLead: (leadId: string, newColumnId: string, newIndex: number) => void;
  onReorderLead?: (leadId: string, columnId: string, prevLeadId: string | null, nextLeadId: string | null) => void;
  onClearSelection?: () => void;
}

export default function PipelineBoardDesktop({
  columns,
  leadsByColumn,
  selection,
  recentlyMovedIds,
  onCardClick,
  onSelect,
  onMoveLead,
  onReorderLead,
  onClearSelection,
}: PipelineBoardDesktopProps) {
  const [activeLead, setActiveLead] = useState<PipelineLead | null>(null);
  const [localLeadsByColumn, setLocalLeadsByColumn] = useState(leadsByColumn);
  const dragStartColumn = useRef<string | null>(null);

  // Keep local state in sync with props
  const isDragging = activeLead !== null;
  const displayLeadsByColumn = isDragging ? localLeadsByColumn : leadsByColumn;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  const findLeadColumn = useCallback(
    (leadId: string): string | null => {
      for (const [colId, leads] of Object.entries(displayLeadsByColumn)) {
        if (leads.find((l) => l.id === leadId)) return colId;
      }
      return null;
    },
    [displayLeadsByColumn]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const lead = active.data.current?.lead as PipelineLead | undefined;
    if (!lead) return;
    setActiveLead(lead);
    dragStartColumn.current = findLeadColumn(lead.id);
    setLocalLeadsByColumn(leadsByColumn);
  }, [leadsByColumn, findLeadColumn]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !activeLead) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeCol = findLeadColumn(activeId);
    const overCol = columns.find((c) => c.id === overId) ? overId : findLeadColumn(overId);

    if (!activeCol || !overCol || activeCol === overCol) return;

    // Moving to a different column
    setLocalLeadsByColumn((prev) => {
      const activeLeads = [...prev[activeCol]];
      const overLeads = [...prev[overCol]];
      const leadIndex = activeLeads.findIndex((l) => l.id === activeId);
      if (leadIndex === -1) return prev;

      const [movedLead] = activeLeads.splice(leadIndex, 1);
      overLeads.push(movedLead);

      return {
        ...prev,
        [activeCol]: activeLeads,
        [overCol]: overLeads,
      };
    });
  }, [activeLead, columns, findLeadColumn]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLead(null);

    if (!over) {
      dragStartColumn.current = null;
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeCol = dragStartColumn.current || findLeadColumn(activeId);
    const overCol = columns.find((c) => c.id === overId)
      ? overId
      : findLeadColumn(overId);

    dragStartColumn.current = null;

    if (!activeCol || !overCol) return;

    if (activeCol === overCol) {
      // Same column — reorder
      const leads = [...localLeadsByColumn[activeCol]];
      const oldIndex = leads.findIndex((l) => l.id === activeId);
      const newIndex = leads.findIndex((l) => l.id === overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(leads, oldIndex, newIndex);
        setLocalLeadsByColumn((prev) => ({ ...prev, [activeCol]: reordered }));
        if (onReorderLead) {
          const prevLeadId = newIndex > 0 ? reordered[newIndex - 1].id : null;
          const nextLeadId = newIndex < reordered.length - 1 ? reordered[newIndex + 1].id : null;
          onReorderLead(activeId, activeCol, prevLeadId, nextLeadId);
        } else {
          onMoveLead(activeId, activeCol, newIndex);
        }
      }
    } else {
      // Different column — move
      const overLeads = localLeadsByColumn[overCol];
      const newIndex = overLeads.findIndex((l) => l.id === overId);
      const resolvedIndex = newIndex === -1 ? overLeads.length : newIndex;
      onMoveLead(activeId, overCol, resolvedIndex);
    }
  }, [columns, findLeadColumn, localLeadsByColumn, onMoveLead]);

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.4",
        },
      },
    }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 px-1 h-full items-start">
        {columns.map((column) => (
          <PipelineColumn
            key={column.id}
            column={column}
            leads={displayLeadsByColumn[column.id] ?? []}
            selection={selection}
            recentlyMovedIds={recentlyMovedIds}
            onCardClick={onCardClick}
            onSelect={onSelect}
            onClearSelection={onClearSelection}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeLead ? <PipelineCardOverlay lead={activeLead} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
