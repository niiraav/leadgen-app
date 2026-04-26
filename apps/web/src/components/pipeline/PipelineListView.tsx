import { cn } from "@/lib/utils";
import { PipelineLead, SelectModifiers } from "@/hooks/usePipelineBoard";
import { getColumnDef, getLeadColumn, followUpHealth, formatCompactDealValue } from "@leadgen/shared";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_COLUMN_BORDER_CLASS } from "@/lib/shared/constants/pipeline";
import {
  PIPELINE_STAGE_VARIANTS,
  ENGAGEMENT_STATUS_VARIANTS,
  LOSS_REASON_VARIANTS,
} from "@/lib/status-colors";

interface PipelineListViewProps {
  leads: PipelineLead[];
  selection: Set<string>;
  recentlyMovedIds: Set<string>;
  onCardClick: (lead: PipelineLead) => void;
  onSelect: (leadId: string, modifiers: SelectModifiers) => void;
  onClearSelection?: () => void;
}

function ListCard({
  lead,
  isSelected,
  isRecentlyMoved,
  onClick,
  onSelect,
}: {
  lead: PipelineLead;
  isSelected: boolean;
  isRecentlyMoved: boolean;
  onClick: (lead: PipelineLead) => void;
  onSelect: (leadId: string, modifiers: SelectModifiers) => void;
}) {
  const columnId = getLeadColumn(lead);
  const column = getColumnDef(columnId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(lead.id, {
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
    });
    onClick(lead);
  };

  // Follow-up chip
  const followUpChip = (() => {
    if (!lead.followUpDate) return null;
    const health = followUpHealth(lead.followUpDate);
    const colorClass =
      health === "red"
        ? "bg-destructive/10 text-destructive border-destructive/20"
        : health === "amber"
        ? "bg-warning/10 text-warning border-warning/20"
        : "bg-success/10 text-success border-success/20";
    const label =
      health === "red"
        ? "Overdue"
        : health === "amber"
        ? "Due today"
        : new Date(lead.followUpDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro-sm font-medium border ${colorClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${health === "red" ? "bg-destructive" : health === "amber" ? "bg-warning" : "bg-success"}`} />
        {label}
      </span>
    );
  })();

  // Context pills
  const contextPills = (() => {
    const items: React.ReactNode[] = [];

    if ((lead.unreadReplyCount ?? 0) > 0) {
      items.push(
        <span key="reply" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro-sm font-medium bg-destructive/10 text-destructive border border-destructive/20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-destructive" />
          </span>
          {lead.unreadReplyCount} new
        </span>
      );
    }

    if (lead.latestReply?.intent) {
      items.push(
        <span key="intent" className="inline-flex items-center rounded-full px-2 py-0.5 text-micro-sm font-medium bg-primary/10 text-primary border border-primary/20">
          {String(lead.latestReply.intent).replace(/_/g, " ")}
        </span>
      );
    }

    if (lead.dealValue && lead.dealValue > 0) {
      items.push(
        <span key="deal" className="inline-flex items-center rounded-full px-2 py-0.5 text-micro-sm font-semibold text-primary border border-primary/20 bg-primary/5">
          {formatCompactDealValue(lead.dealValue)}
        </span>
      );
    }

    if (lead.lossReason) {
      const lossVariant = LOSS_REASON_VARIANTS[lead.lossReason as keyof typeof LOSS_REASON_VARIANTS] ?? "secondary";
      items.push(
        <Badge key="loss" variant={lossVariant} className="text-micro-sm">
          {lead.lossReason.replace(/_/g, " ")}
        </Badge>
      );
    }

    return items;
  })();

  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative group cursor-pointer select-none rounded-2xl border border-l-4 p-4 transition-colors",
        PIPELINE_COLUMN_BORDER_CLASS[columnId] ?? "border-l-muted-foreground",
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-card hover:border-primary/30 hover:bg-primary/[0.02]",
        isRecentlyMoved && "border-primary/35 bg-primary/5 shadow-sm"
      )}
    >
      {/* Checkbox — toggles this card only, never opens drawer */}
      <div
        className={`absolute top-4 left-4 z-10 ${isSelected || "opacity-0 group-hover:opacity-100 transition-opacity"}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(lead.id, { shiftKey: false, metaKey: true, ctrlKey: false });
        }}
      >
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            isSelected ? "bg-primary border-primary" : "bg-card border-border group-hover:border-primary/40"
          }`}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>

      <div className="pl-8 flex items-start justify-between gap-4">
        {/* Left: structured content */}
        <div className="min-w-0 flex-1">
          {/* Header row: name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-foreground truncate">{lead.business_name}</h4>
            {((): React.ReactNode => {
              const variant =
                column?.field === "pipeline_stage"
                  ? PIPELINE_STAGE_VARIANTS[column.id as keyof typeof PIPELINE_STAGE_VARIANTS]
                  : ENGAGEMENT_STATUS_VARIANTS[column?.id as keyof typeof ENGAGEMENT_STATUS_VARIANTS];
              return (
                <Badge variant={variant ?? "secondary"} className="text-micro flex-shrink-0">
                  {column?.title ?? lead.status}
                </Badge>
              );
            })()}
            {followUpChip}
            {lead.hot_score > 0 && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-micro font-medium bg-warning/10 text-warning border border-warning/20">
                ★ {lead.hot_score}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
            {lead.category && <span className="font-medium text-muted-foreground">{lead.category}</span>}
            {lead.city && <span>· {lead.city}</span>}
            {lead.email && <span>· {lead.email}</span>}
          </div>

          {/* Footer pills */}
          {contextPills.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">{contextPills}</div>
          )}
        </div>

        {/* Right: chevron */}
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

export default function PipelineListView({
  leads,
  selection,
  recentlyMovedIds,
  onCardClick,
  onSelect,
  onClearSelection,
}: PipelineListViewProps) {
  if (leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No leads match the current filters.
      </div>
    );
  }

  return (
    <button
      type="button"
      className="space-y-2 pb-4 w-full text-left"
      onClick={() => onClearSelection?.()}
    >
      {leads.map((lead) => (
        <ListCard
          key={lead.id}
          lead={lead}
          isSelected={selection.has(lead.id)}
          isRecentlyMoved={recentlyMovedIds.has(lead.id)}
          onClick={onCardClick}
          onSelect={onSelect}
        />
      ))}
    </button>
  );
}
