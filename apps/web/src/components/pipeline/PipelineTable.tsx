"use client";

import { memo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Mail,
  MailCheck,
  MessageSquare,
  Ban,
  Search,
  ArrowUp,
  ArrowDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TableEmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/activity-utils";
import {
  getColumnDef,
  getLeadColumn,
  followUpHealth,
  formatCompactDealValue,
  PIPELINE_COLUMNS,
} from "@leadgen/shared";
import { Badge } from "@/components/ui/badge";
import {
  PIPELINE_STAGE_VARIANTS,
  ENGAGEMENT_STATUS_VARIANTS,
} from "@/lib/status-colors";
import type { PipelineLead, SelectModifiers } from "@/hooks/usePipelineBoard";
import MessagePicker from "@/components/leads/MessagePicker";

// ── Table row motion variants ─────────────────────────────────────────────────

const rowStaggerContainer = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

const rowStaggerItem = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 30 },
  },
} as const;

// WhatsApp icon (inline for reuse)
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M2.99169 16.3417C3.13873 16.7126 3.17147 17.119 3.08569 17.5087L2.02069 20.7987C1.98638 20.9655 1.99525 21.1384 2.04647 21.3008C2.09769 21.4633 2.18955 21.61 2.31336 21.727C2.43716 21.844 2.5888 21.9274 2.75389 21.9693C2.91898 22.0113 3.09205 22.0104 3.25669 21.9667L6.66969 20.9687C7.03741 20.8958 7.41822 20.9276 7.76869 21.0607C9.90408 22.0579 12.3231 22.2689 14.5988 21.6564C16.8746 21.0439 18.861 19.6473 20.2074 17.7131C21.5538 15.7788 22.1738 13.4311 21.958 11.0842C21.7422 8.73738 20.7044 6.54216 19.0278 4.88589C17.3511 3.22962 15.1434 2.21873 12.7941 2.03159C10.4448 1.84445 8.10483 2.49308 6.18713 3.86303C4.26944 5.23299 2.89722 7.23624 2.31258 9.51933C1.72795 11.8024 1.96846 14.2186 2.99169 16.3417Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.3004 16.453C9.60317 15.4492 8.34487 14.0436 7.26764 12.3885C6.75659 11.6033 6.42625 11.0853 6.1385 10.0774C5.76172 8.75759 6.30795 6.83683 7.69747 6.28767C7.88425 6.21383 8.67224 6.25029 8.8627 6.38175C9.28091 6.77017 9.48102 7.72073 9.71566 8.26027C9.83126 8.59292 9.98316 8.89215 10.0757 9.23401C10.1496 9.50753 9.96894 9.67568 9.87235 9.87474C9.74594 10.1352 8.94028 10.7573 9.05542 11.0216C9.6038 12.2805 10.6714 13.4313 11.8002 14.2072C12.2664 14.5224 12.9039 14.9099 13.4418 14.9699C13.8369 14.9513 14.719 13.4091 15.0296 13.4695C15.6838 13.597 17.0862 14.4616 17.7457 14.79C17.8532 14.8434 17.9605 14.954 17.9709 15.0585C18.015 15.502 17.8222 16.3027 17.551 16.6516C17.1259 17.1858 16.3638 17.6055 15.6952 17.7098C14.5464 17.8888 13.3978 17.3754 12.3544 16.9642C12.1389 16.8793 11.528 16.6149 11.3633 16.4745L11.3004 16.453Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ── Sort Header ──────────────────────────────────────────────────────────────

function SortHeader({
  label,
  sortKey,
  currentField,
  order,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  currentField?: string | null;
  order?: "asc" | "desc";
  onSort?: (key: string) => void;
  className?: string;
}) {
  const active = currentField === sortKey;
  return (
    <th
      className={cn(
        "px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground select-none cursor-pointer hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:rounded",
        className
      )}
      onClick={() => onSort?.(sortKey)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort?.(sortKey);
        }
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="inline-flex">
            {order === "asc" ? (
              <ArrowUp className="w-4 h-4 text-foreground" />
            ) : (
              <ArrowDown className="w-4 h-4 text-foreground" />
            )}
          </span>
        )}
      </span>
    </th>
  );
}

// ── Stage Dropdown (inline) ──────────────────────────────────────────────────

function StageDropdown({
  lead,
  onChange,
}: {
  lead: PipelineLead;
  onChange: (leadId: string, newColumnId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentId = getLeadColumn(lead);
  const col = getColumnDef(currentId);
  const variant =
    col?.field === "pipeline_stage"
      ? PIPELINE_STAGE_VARIANTS[col.id as keyof typeof PIPELINE_STAGE_VARIANTS]
      : ENGAGEMENT_STATUS_VARIANTS[col?.id as keyof typeof ENGAGEMENT_STATUS_VARIANTS];
  const badgeClasses: Record<string, string> = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-border bg-background text-foreground",
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-micro-sm font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/30 ${badgeClasses[variant ?? "secondary"]}`}
      >
        {getColumnDef(currentId)?.title ?? lead.status}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-44 rounded-lg border border-border/60 bg-card shadow-lg py-1">
          {PIPELINE_COLUMNS.map((col) => (
            <button
              key={col.id}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onChange(lead.id, col.id);
              }}
              className={cn(
                "w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors",
                col.id === currentId
                  ? "bg-primary/5 text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: col.color }}
              />
              {col.title}
              {col.id === currentId && <Check className="w-3.5 h-3.5 ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Skeleton row (6 data columns + checkbox) ────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse h-14">
      <td className="px-3 py-3 w-10">
        <div className="w-4 h-4 rounded bg-secondary" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3.5 w-40 bg-secondary rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-5 w-24 bg-secondary rounded-full" />
      </td>
      <td className="px-3 py-3">
        <div className="h-5 w-20 bg-secondary rounded-full" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-16 bg-secondary rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-28 bg-secondary rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-2">
          <div className="w-5 h-5 bg-secondary rounded" />
          <div className="w-5 h-5 bg-secondary rounded" />
          <div className="w-5 h-5 bg-secondary rounded" />
        </div>
      </td>
    </tr>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface PipelineTableProps {
  leads: PipelineLead[];
  loading?: boolean;
  selected?: Set<string>;
  recentlyMovedIds?: Set<string>;
  onSelect?: (leadId: string, modifiers: SelectModifiers) => void;
  onSelectAll?: () => void;
  onRowClick?: (lead: PipelineLead) => void;
  onStageChange?: (leadId: string, newColumnId: string) => void;
  sortField?: string | null;
  sortOrder?: "asc" | "desc";
  onSortChange?: (field: string) => void;
}

export const PipelineTable = memo(function PipelineTable({
  leads,
  loading = false,
  selected = new Set(),
  recentlyMovedIds = new Set(),
  onSelect,
  onSelectAll,
  onRowClick,
  onStageChange,
  sortField,
  sortOrder,
  onSortChange,
}: PipelineTableProps) {
  const [pickerLead, setPickerLead] = useState<PipelineLead | null>(null);
  const [pickerChannel, setPickerChannel] = useState<"whatsapp" | "sms" | undefined>(undefined);
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const someSelected = leads.some((l) => selected.has(l.id));

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border/40 bg-card">
              {/* Select all */}
              <th className="px-3 py-3 w-10 text-left">
                {onSelectAll && leads.length > 0 && (
                  <button
                    onClick={onSelectAll}
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40",
                      allSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : someSelected
                          ? "bg-primary/30 border-primary"
                          : "border-border hover:border-border-strong"
                    )}
                    aria-label="Select all"
                    title="Select all"
                  >
                    {allSelected && (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                )}
              </th>
              <SortHeader
                label="Name"
                sortKey="business_name"
                currentField={sortField}
                order={sortOrder}
                onSort={onSortChange}
                className="min-w-52"
              />
              <SortHeader
                label="Stage"
                sortKey="stage"
                currentField={sortField}
                order={sortOrder}
                onSort={onSortChange}
                className="min-w-36"
              />
              <SortHeader
                label="Follow-up"
                sortKey="followUpDate"
                currentField={sortField}
                order={sortOrder}
                onSort={onSortChange}
                className="min-w-32"
              />
              <SortHeader
                label="Value"
                sortKey="dealValue"
                currentField={sortField}
                order={sortOrder}
                onSort={onSortChange}
                className="min-w-24"
              />
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground min-w-40">
                Last Activity
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground w-36">
                Actions
              </th>
            </tr>
          </thead>
          <motion.tbody initial="initial" animate="animate" variants={rowStaggerContainer}>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              : leads.map((lead) => {
                  const isSelected = selected.has(lead.id);
                  const isDNC = !!lead.doNotContact;
                  const isRecentlyMoved = recentlyMovedIds.has(lead.id);

                  // Follow-up chip
                  const followUpChip = (() => {
                    if (!lead.followUpDate) return <span className="text-muted-foreground">—</span>;
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

                  return (
                    <motion.tr
                      key={lead.id}
                      variants={rowStaggerItem}
                      className={cn(
                        "border-b border-border/20 transition-colors group relative h-14",
                        !isSelected && !isDNC && "hover:bg-secondary",
                        isSelected && "bg-primary/5",
                        isDNC && "bg-destructive/[0.06]",
                        isRecentlyMoved && "bg-warning/10"
                      )}
                      onClick={() => onRowClick?.(lead)}
                    >
                      {/* Checkbox */}
                      <td
                        className="px-3 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            // Checkbox clicks always toggle (Ctrl-like) so plain
                            // clicks add/remove without resetting other selections.
                            onSelect?.(lead.id, {
                              shiftKey: e.shiftKey,
                              metaKey: e.metaKey || (!e.shiftKey && !e.ctrlKey),
                              ctrlKey: e.ctrlKey || (!e.shiftKey && !e.metaKey),
                            });
                          }}
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40",
                            isSelected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-border hover:border-border-strong"
                          )}
                          aria-label={isSelected ? "Deselect row" : "Select row"}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </button>
                      </td>

                      {/* Name */}
                      <td className="px-3 py-0">
                        <div className="flex items-center gap-1.5 py-3">
                          {isDNC && (
                            <span className="inline-flex text-destructive shrink-0">
                              <Ban className="w-4 h-4" />
                            </span>
                          )}
                        <span
                          className="text-foreground text-sm hover:text-primary transition-colors hover:underline underline-offset-2 truncate max-w-56 cursor-pointer"
                        >
                          {lead.business_name}
                        </span>
                        </div>
                      </td>

                      {/* Stage */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {onStageChange ? (
                          <StageDropdown lead={lead} onChange={onStageChange} />
                        ) : (
                          (() => {
                            const col = getColumnDef(getLeadColumn(lead));
                            const variant =
                              col?.field === "pipeline_stage"
                                ? PIPELINE_STAGE_VARIANTS[col.id as keyof typeof PIPELINE_STAGE_VARIANTS]
                                : ENGAGEMENT_STATUS_VARIANTS[col?.id as keyof typeof ENGAGEMENT_STATUS_VARIANTS];
                            return (
                              <Badge variant={variant ?? "secondary"} className="text-micro-sm">
                                {col?.title ?? lead.status}
                              </Badge>
                            );
                          })()
                        )}
                      </td>

                      {/* Follow-up */}
                      <td className="px-3 py-3">{followUpChip}</td>

                      {/* Deal Value */}
                      <td className="px-3 py-3 text-sm">
                        {lead.dealValue && lead.dealValue > 0 ? (
                          <span className="font-semibold text-primary">
                            {formatCompactDealValue(lead.dealValue)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Last Activity */}
                      <td className="px-3 py-3">
                        {lead.lastActivity ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-muted-foreground">
                              {lead.lastActivity.label} · {formatRelativeTime(lead.lastActivity.timestamp)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions — clickable, always visible */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {lead.email ? (
                            <Link
                              href={`/leads/${lead.id}?action=compose`}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Send email"
                            >
                              {lead.email_status === "valid" ? (
                                <MailCheck className="w-5 h-5" />
                              ) : (
                                <Mail className="w-5 h-5" />
                              )}
                            </Link>
                          ) : (
                            <span className="p-1.5 rounded-md opacity-30 text-muted-foreground">
                              <Mail className="w-5 h-5" />
                            </span>
                          )}
                          {lead.phone ? (
                            <button
                              onClick={() => {
                                setPickerLead(lead);
                                setPickerChannel("whatsapp");
                              }}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-success hover:bg-success/10 transition-colors"
                              title="WhatsApp templates"
                              aria-label="WhatsApp templates"
                            >
                              <WhatsAppIcon className="w-5 h-5" />
                            </button>
                          ) : (
                            <span className="p-1.5 rounded-md opacity-30 text-muted-foreground">
                              <WhatsAppIcon className="w-5 h-5" />
                            </span>
                          )}
                          <button
                            onClick={() => {
                              setPickerLead(lead);
                              setPickerChannel("sms");
                            }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="SMS templates"
                            aria-label="SMS templates"
                          >
                            <MessageSquare className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
            {!loading && leads.length === 0 && (
              <TableEmptyState
                colSpan={7}
                icon={Search}
                title="No leads match"
                description="Try adjusting your search or filters."
              />
            )}
          </motion.tbody>
        </table>
      </div>

      {/* MessagePicker modal */}
      {pickerLead && (
        <MessagePicker
          lead={{
            id: pickerLead.id,
            business_name: pickerLead.business_name,
            category: pickerLead.category ?? undefined,
            rating: pickerLead.rating ?? undefined,
            phone: pickerLead.phone ?? undefined,
            contact_phone: pickerLead.contact_phone ?? undefined,
          }}
          open={!!pickerLead}
          onClose={() => {
            setPickerLead(null);
            setPickerChannel(undefined);
          }}
          channel={pickerChannel}
        />
      )}
    </>
  );
});
