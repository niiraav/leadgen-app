import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight } from "lucide-react";
import { PipelineLead } from "@/hooks/usePipelineBoard";
import { getColumnDef, getLeadColumn, followUpHealth, formatCompactDealValue } from "@leadgen/shared";

interface PipelineCardProps {
  lead: PipelineLead;
  isSelected: boolean;
  isRecentlyMoved: boolean;
  onClick: (lead: PipelineLead) => void;
  onSelect: (leadId: string, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
}

export default function PipelineCard({
  lead,
  isSelected,
  isRecentlyMoved,
  onClick,
  onSelect,
}: PipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { type: "lead", lead } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const columnId = getLeadColumn(lead);
  const column = getColumnDef(columnId);

  // State signal (highest precedence)
  const renderStateSignal = () => {
    if ((lead.unreadReplyCount ?? 0) > 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
          </span>
          {lead.unreadReplyCount} new
        </span>
      );
    }

    if (lead.followUpDate) {
      const health = followUpHealth(lead.followUpDate);
      const colorClass =
        health === "red"
          ? "text-destructive"
          : health === "amber"
          ? "text-warning"
          : "text-muted-foreground";
      const label =
        health === "red"
          ? "Overdue"
          : health === "amber"
          ? "Due today"
          : new Date(lead.followUpDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${colorClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${health === "red" ? "bg-destructive" : health === "amber" ? "bg-warning" : "bg-muted-foreground"}`} />
          {label}
        </span>
      );
    }

    if (lead.status === "lost") {
      return (
        <span className="inline-flex items-center text-[10px] font-medium text-muted-foreground">
          Lost
        </span>
      );
    }

    return null;
  };

  // Context row (column-dependent)
  const renderContextRow = () => {
    const items: React.ReactNode[] = [];

    if (columnId === "replied" && lead.latestReply?.intent) {
      items.push(
        <span
          key="intent"
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary"
        >
          {String(lead.latestReply.intent).replace(/_/g, " ")}
        </span>
      );
    }

    if (["proposal_sent", "converted"].includes(columnId) && lead.dealValue && lead.dealValue > 0) {
      items.push(
        <span
          key="deal"
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary"
        >
          {formatCompactDealValue(lead.dealValue)}
        </span>
      );
    }

    if (columnId === "lost" && lead.lossReason) {
      items.push(
        <span
          key="loss"
          className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200"
        >
          {lead.lossReason.replace(/_/g, " ")}
        </span>
      );
    }

    if (items.length === 0) return null;
    return <div className="flex items-center gap-1.5 mt-1">{items}</div>;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(lead.id, {
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
    });
    onClick(lead);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`
        relative group cursor-pointer select-none
        rounded-lg border p-3 transition-colors
        ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-surface hover:border-primary/30 hover:bg-primary/[0.02]"}
        ${isRecentlyMoved ? "border-primary/35 bg-primary/5 shadow-sm" : ""}
      `}
    >
      {/* Selection checkbox — toggles this card only, never opens drawer */}
      <div
        className={`
          absolute top-2 left-2 z-10
          ${isSelected || "opacity-0 group-hover:opacity-100 transition-opacity"}
        `}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(lead.id, { shiftKey: false, metaKey: true, ctrlKey: false });
        }}
      >
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            isSelected
              ? "bg-primary border-primary"
              : "bg-surface border-border group-hover:border-primary/40"
          }`}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>

      <div className="pl-5">
        {/* Row 1: Business name + hover arrow */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h4 className="text-sm font-semibold text-text truncate flex-1 min-w-0">
            {lead.business_name}
          </h4>
          <ChevronRight className="w-3.5 h-3.5 text-text-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>

        {/* Row 2: Stage badge */}
        <div className="mt-1">
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: column?.color ?? "#6b7280" }}
          >
            {column?.title ?? lead.status}
          </span>
        </div>

        {/* Row 3: State signal */}
        {renderStateSignal() && <div className="mt-1">{renderStateSignal()}</div>}

        {/* Row 4: Context row */}
        {renderContextRow()}
      </div>
    </div>
  );
}
