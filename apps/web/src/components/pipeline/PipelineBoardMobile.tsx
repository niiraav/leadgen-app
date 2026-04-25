import { PipelineColumnDef, PipelineLead } from "@/hooks/usePipelineBoard";
import PipelineCard from "./PipelineCard";

interface PipelineBoardMobileProps {
  columns: PipelineColumnDef[];
  leadsByColumn: Record<string, PipelineLead[]>;
  selection: Set<string>;
  recentlyMovedIds: Set<string>;
  onCardClick: (lead: PipelineLead) => void;
  onStatusChange?: (leadId: string, newColumnId: string) => void;
  onSelect: (leadId: string, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
}

export default function PipelineBoardMobile({
  columns,
  leadsByColumn,
  selection,
  recentlyMovedIds,
  onCardClick,
  onStatusChange,
  onSelect,
}: PipelineBoardMobileProps) {
  return (
    <div className="flex flex-col gap-6 pb-6">
      {columns.map((column) => {
        const leads = leadsByColumn[column.id] ?? [];
        return (
          <section key={column.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 px-1">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: column.color }}
              />
              <h3 className="text-xs font-semibold text-text uppercase tracking-wide">
                {column.title}
              </h3>
              <span className="text-xs font-medium text-text-faint tabular-nums ml-auto">
                {leads.length}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {leads.map((lead) => (
                <div key={lead.id}>
                  <PipelineCard
                    lead={lead}
                    isSelected={selection.has(lead.id)}
                    isRecentlyMoved={recentlyMovedIds.has(lead.id)}
                    onClick={onCardClick}
                    onSelect={onSelect}
                  />
                  {onStatusChange && (
                    <select
                      value={lead.status}
                      onChange={(e) => {
                        e.stopPropagation();
                        onStatusChange(lead.id, e.target.value);
                      }}
                      className="mt-1 w-full h-8 px-2 text-xs rounded-md bg-surface-2 border border-border"
                    >
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              {leads.length === 0 && (
                <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/30 h-12 flex items-center justify-center">
                  <span className="text-[10px] text-text-faint">No leads</span>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
