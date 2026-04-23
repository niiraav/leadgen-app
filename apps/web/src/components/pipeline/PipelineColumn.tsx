import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { Plus, Inbox } from "lucide-react";
import { PipelineCard } from "./PipelineCard";
import { EmptyState } from "@/components/ui/empty-state";
import type { PipelineLead } from "@/hooks/usePipelineBoard";
import type { PipelineColumnDef } from "@leadgen/shared";

interface PipelineColumnProps {
  column: PipelineColumnDef;
  leads: PipelineLead[];
  statusOptions: { id: string; title: string }[];
  onStatusChange: (leadId: string, newStatus: string) => void;
  recentlyMovedIds?: Set<string>;
  onLeadClick?: (lead: PipelineLead) => void;
  selectedIds?: Set<string>;
  onSelect?: (
    leadId: string,
    modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
  ) => void;
  onSelectAll?: () => void;
  isMultiDragActive?: boolean;
  focusedLeadId?: string | null;
  onCardFocus?: (leadId: string) => void;
}

export function PipelineColumn({
  column,
  leads,
  statusOptions,
  onStatusChange,
  recentlyMovedIds,
  onLeadClick,
  selectedIds,
  onSelect,
  onSelectAll,
  isMultiDragActive,
  focusedLeadId,
  onCardFocus,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "Column", columnId: column.id },
  });

  const selectedCountInColumn = leads.filter((l) => selectedIds?.has(l.id)).length;
  const allSelected = leads.length > 0 && selectedCountInColumn === leads.length;
  const totalDealValue = leads.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);

  return (
    <div className="min-w-[300px] max-w-[300px] flex-shrink-0 flex flex-col">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="text-sm font-semibold text-text">
            {column.title}
          </h3>
          <span className="text-xs text-text-faint bg-surface-2 px-2 py-0.5 rounded-full">
            {leads.length}
          </span>
          {selectedCountInColumn > 0 && (
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {selectedCountInColumn}
            </span>
          )}
          {totalDealValue > 0 && (
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              Σ £{totalDealValue.toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {leads.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectAll?.();
              }}
              className={`rounded p-1 transition-colors ${
                allSelected
                  ? "text-primary bg-primary/10"
                  : "text-text-faint hover:text-text hover:bg-surface-2"
              }`}
              title={allSelected ? "Deselect all" : "Select all"}
            >
              <svg
                className="w-4 h-4"
                fill={allSelected ? "currentColor" : "none"}
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                {allSelected && <path d="M7 12l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />}
              </svg>
            </button>
          )}
          <button className="rounded-full p-1 text-text-faint hover:text-text hover:bg-surface-2 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Droppable Area */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[200px] rounded-xl transition-colors ${
          isOver ? "bg-primary/5 ring-2 ring-primary/20 ring-dashed" : ""
        }`}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <motion.div className="space-y-2" layout>
            <AnimatePresence mode="popLayout">
              {leads.map((lead) => (
                <PipelineCard
                  key={lead.id}
                  lead={lead}
                  column={column}
                  onStatusChange={onStatusChange}
                  statusOptions={statusOptions}
                  isNew={recentlyMovedIds?.has(lead.id)}
                  onClick={onLeadClick}
                  isSelected={selectedIds?.has(lead.id)}
                  onSelect={onSelect}
                  dimmed={isMultiDragActive && selectedIds && !selectedIds.has(lead.id)}
                  isFocused={focusedLeadId === lead.id}
                  onFocus={onCardFocus}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </SortableContext>

        {leads.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="rounded-xl border-2 border-dashed border-border/40 p-6 text-center"
          >
            <EmptyState
              icon={Inbox}
              title={`No ${column.title} leads`}
              description="Save leads from search to populate your pipeline."
              action={{ label: "Run a Search", href: "/search/google-maps" }}
              className="py-0"
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
