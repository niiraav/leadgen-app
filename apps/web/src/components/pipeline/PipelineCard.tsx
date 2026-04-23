import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { HotScoreBadge } from "@/components/ui/badge";
import Link from "next/link";
import { useState, useEffect } from "react";
import type { PipelineLead } from "@/hooks/usePipelineBoard";
import type { PipelineColumnDef } from "@leadgen/shared";

const engagementColors: Record<string, string> = {
  new: "#1d6fa8",
  contacted: "#d97706",
  responded: "#16a34a",
  not_interested: "#dc2626",
  interested: "#16a34a",
  out_of_office: "#6b7280",
};

const engagementLabels: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  responded: "Responded",
  not_interested: "Not Interested",
  interested: "Interested",
  out_of_office: "Out of Office",
};

interface PipelineCardProps {
  lead: PipelineLead;
  column: PipelineColumnDef;
  onStatusChange: (leadId: string, newStatus: string) => void;
  statusOptions: { id: string; title: string }[];
  isOverlay?: boolean;
  isNew?: boolean;
  onClick?: (lead: PipelineLead) => void;
}

export function PipelineCard({
  lead,
  column,
  onStatusChange,
  statusOptions,
  isOverlay = false,
  isNew = false,
  onClick,
}: PipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
    data: {
      type: "Lead",
      lead,
      columnId: column.id,
    },
    disabled: isOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    if (isNew) {
      setHighlight(true);
      const t = setTimeout(() => setHighlight(false), 1200);
      return () => clearTimeout(t);
    }
  }, [isNew]);

  const currentStatus = lead.pipelineStage || lead.engagementStatus || lead.status;

  const handleClick = () => {
    onClick?.(lead);
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout={!isDragging}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={isOverlay ? "shadow-2xl rotate-2 scale-105" : ""}
      onClick={handleClick}
    >
      <Card
        className={`p-4 group cursor-grab active:cursor-grabbing ${
          isDragging ? "shadow-xl ring-2 ring-primary/20" : ""
        } ${highlight ? "ring-2 ring-primary/40 bg-primary/5 transition-colors duration-300" : ""}`}
        {...attributes}
        {...listeners}
        data-sortable-id={lead.id}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-text truncate">
              {lead.businessName}
            </h4>
            {lead.engagementStatus && (
              <span
                className="inline-block mt-1 text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: engagementColors[lead.engagementStatus] || "#6b7280",
                  backgroundColor: `${engagementColors[lead.engagementStatus] || "#6b7280"}18`,
                }}
              >
                {engagementLabels[lead.engagementStatus] || lead.engagementStatus}
              </span>
            )}
          </div>
          <HotScoreBadge score={lead.hotScore} />
        </div>

        <p className="text-xs text-text-muted mb-0.5 truncate">
          {lead.category}
        </p>
        <p className="text-xs text-text-faint truncate">
          {lead.email}
        </p>

        {/* Status Dropdown — stopPropagation prevents drag interference */}
        <div className="mt-3">
          <select
            value={currentStatus}
            onChange={(e) => onStatusChange(lead.id, e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full h-7 px-2 text-sm font-medium rounded-md bg-surface-2 border border-border text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer uppercase tracking-wider disabled:opacity-50"
          >
            {statusOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-text-faint">
            {lead.city || lead.country}
          </span>
          <Link
            href={`/leads/${lead.id}`}
            className="text-xs text-blue hover:underline"
            onPointerDown={(e) => e.stopPropagation()}
          >
            View profile →
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}

// Overlay version for drag preview
export function PipelineCardOverlay({
  lead,
  column,
}: Omit<PipelineCardProps, "onStatusChange" | "statusOptions" | "isNew" | "onClick">) {
  return (
    <div className="opacity-90 rotate-2 scale-105">
      <PipelineCard
        lead={lead}
        column={column}
        onStatusChange={() => {}}
        statusOptions={[]}
        isOverlay
      />
    </div>
  );
}
