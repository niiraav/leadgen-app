import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PipelineColumnDef, PipelineLead } from "@/hooks/usePipelineBoard";
import PipelineCard from "./PipelineCard";

interface PipelineColumnProps {
  column: PipelineColumnDef;
  leads: PipelineLead[];
  selection: Set<string>;
  recentlyMovedIds: Set<string>;
  onCardClick: (lead: PipelineLead) => void;
  onSelect: (leadId: string, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onClearSelection?: () => void;
}

export default function PipelineColumn({
  column,
  leads,
  selection,
  recentlyMovedIds,
  onCardClick,
  onSelect,
  onClearSelection,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });

  return (
    <div className="flex flex-col min-w-72 w-72 flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
            {column.title}
          </h3>
        </div>
        <span className="text-xs font-medium text-foreground-faint tabular-nums">
          {leads.length}
        </span>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        role="button"
        aria-label="Clear selection"
        tabIndex={0}
        onClick={() => onClearSelection?.()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClearSelection?.();
          }
        }}
        className={`
          flex-1 flex flex-col gap-2 min-h-32 rounded-lg p-2
          transition-colors
          ${isOver ? "bg-primary/5 ring-1 ring-primary/20" : "bg-secondary/50"}
        `}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <PipelineCard
              key={lead.id}
              lead={lead}
              isSelected={selection.has(lead.id)}
              isRecentlyMoved={recentlyMovedIds.has(lead.id)}
              onClick={onCardClick}
              onSelect={onSelect}
            />
          ))}
        </SortableContext>

        {/* Drop preview slot when empty or hovering */}
        {(leads.length === 0 || isOver) && (
          <div
            className={`
              rounded-md border border-dashed flex items-center justify-center
              ${isOver ? "border-primary/40 bg-primary/[0.03] h-16" : "border-border bg-secondary/50 h-12"}
            `}
          >
            {leads.length === 0 && !isOver && (
              <span className="text-micro text-foreground-faint">Drop leads here</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
