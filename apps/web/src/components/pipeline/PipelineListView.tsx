import { PipelineLead, SelectModifiers } from "@/hooks/usePipelineBoard";
import { getColumnDef, getLeadColumn, followUpHealth, formatCompactDealValue } from "@leadgen/shared";
import { ChevronRight } from "lucide-react";

interface PipelineListViewProps {
  leads: PipelineLead[];
  selection: Set<string>;
  recentlyMovedIds: Set<string>;
  onCardClick: (lead: PipelineLead) => void;
  onSelect: (leadId: string, modifiers: SelectModifiers) => void;
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
        ? "bg-red-50 text-red-600 border-red-200"
        : health === "amber"
        ? "bg-amber-50 text-amber-600 border-amber-200"
        : "bg-green-50 text-green-600 border-green-200";
    const label =
      health === "red"
        ? "Overdue"
        : health === "amber"
        ? "Due today"
        : new Date(lead.followUpDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${colorClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${health === "red" ? "bg-red-500" : health === "amber" ? "bg-amber-500" : "bg-green-500"}`} />
        {label}
      </span>
    );
  })();

  // Context pills
  const contextPills = (() => {
    const items: React.ReactNode[] = [];

    if ((lead.unreadReplyCount ?? 0) > 0) {
      items.push(
        <span key="reply" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
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
        <span key="intent" className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
          {String(lead.latestReply.intent).replace(/_/g, " ")}
        </span>
      );
    }

    if (lead.dealValue && lead.dealValue > 0) {
      items.push(
        <span key="deal" className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-primary border border-primary/20 bg-primary/5">
          {formatCompactDealValue(lead.dealValue)}
        </span>
      );
    }

    if (lead.lossReason) {
      items.push(
        <span key="loss" className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
          {lead.lossReason.replace(/_/g, " ")}
        </span>
      );
    }

    return items;
  })();

  return (
    <div
      onClick={handleClick}
      className={`
        relative group cursor-pointer select-none
        rounded-lg border p-3 transition-colors
        ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-surface hover:border-primary/30 hover:bg-primary/[0.02]"}
        ${isRecentlyMoved ? "border-primary/35 bg-primary/5 shadow-sm" : ""}
      `}
    >
      {/* Checkbox */}
      <div className={`absolute top-3 left-3 z-10 ${isSelected || "opacity-0 group-hover:opacity-100 transition-opacity"}`}>
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            isSelected ? "bg-primary border-primary" : "bg-surface border-border group-hover:border-primary/40"
          }`}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>

      <div className="pl-7 flex items-center justify-between gap-4">
        {/* Left: Name + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-text truncate">{lead.business_name}</h4>
            {/* Status badge */}
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white flex-shrink-0"
              style={{ backgroundColor: column?.color ?? "#6b7280" }}
            >
              {column?.title ?? lead.status}
            </span>
            {followUpChip}
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-text-faint">
            {lead.category && <span>{lead.category}</span>}
            {lead.city && <span>· {lead.city}</span>}
            {lead.email && <span>· {lead.email}</span>}
          </div>

          {/* Context pills */}
          {contextPills.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">{contextPills}</div>
          )}
        </div>

        {/* Right: Arrow */}
        <ChevronRight className="w-4 h-4 text-text-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
}: PipelineListViewProps) {
  if (leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-text-faint">
        No leads match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-4">
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
    </div>
  );
}
