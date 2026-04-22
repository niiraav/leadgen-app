"use client";

import { useState, useCallback, memo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Mail,
  MailCheck,
  MessageSquare,
  MoreHorizontal,
  Ban,
  ExternalLink,
  ListPlus,
  Download,
  StickyNote,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { springSoft } from "@/lib/animation";

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

// WhatsApp icon (Frame.svg) – inline for component reuse
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

import { StatusDropdown } from "@/components/leads/StatusDropdown";
import { formatRelativeTime } from "@/lib/activity-utils";
import type { ReplyIntent } from "@leadgen/shared";

const EMPTY_SET: Set<string> = new Set();

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ActivityEntry {
  label: string;
  timestamp: Date;
  replyIntent?: ReplyIntent;
}

export interface LeadsTableRow {
  id: string;
  business_name: string;
  email: string | null;
  email_status?: string | null;
  phone?: string | null;
  status: string;
  engagementStatus?: string | null;
  pipelineStage?: string | null;
  doNotContact?: boolean;
  category?: string | null;
  lastActivity?: ActivityEntry | null;
}

interface LeadsTableProps {
  leads: LeadsTableRow[];
  loading?: boolean;
  selected?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onStatusChange?: (leadId: string, patch: Record<string, unknown>) => void;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (field: string) => void;
  onEmailCompose?: (lead: LeadsTableRow) => void;
  onWhatsApp?: (lead: LeadsTableRow) => void;
  onSMS?: (lead: LeadsTableRow) => void;
  onAddToSequence?: (leadId: string) => void;
  onExportLead?: (leadId: string) => void;
  onAddNote?: (leadId: string) => void;
  onToggleDNC?: (leadId: string, current: boolean) => void;
}

// ── Tooltip (portal-style fixed positioning) ────────────────────────────────

interface TooltipState {
  text: string;
  x: number;
  y: number;
  show: boolean;
}

function useTooltip() {
  const [tip, setTip] = useState<TooltipState>({ text: "", x: 0, y: 0, show: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, el: HTMLElement) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const rect = el.getBoundingClientRect();
    setTip({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      show: true,
    });
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setTip((t) => ({ ...t, show: false }));
    }, 50);
  }, []);

  return { tip, show, hide };
}

const TooltipLayer = memo(function TooltipLayer({ tip }: { tip: TooltipState }) {
  if (!tip.show || !tip.text) return null;
  return (
    <div
      className="fixed z-[9999] pointer-events-none px-2 py-1 rounded-md bg-[#1a1a1a] text-white text-xs shadow-lg max-w-[240px] text-center"
      style={{
        left: tip.x,
        top: tip.y,
        transform: "translate(-50%, -100%)",
      }}
    >
      {tip.text}
      <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-[#1a1a1a] rotate-45 -translate-x-1/2" />
    </div>
  );
});

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
  currentField?: string;
  order?: "asc" | "desc";
  onSort?: (key: string) => void;
  className?: string;
}) {
  const active = currentField === sortKey;
  return (
    <th
      className={cn(
        "px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted select-none",
        onSort && "cursor-pointer hover:text-text",
        className
      )}
      onClick={() => onSort?.(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="inline-flex">
            {order === "asc" ? (
              <ArrowUp className="w-4 h-4 text-text" />
            ) : (
              <ArrowDown className="w-4 h-4 text-text" />
            )}
          </span>
        )}
      </span>
    </th>
  );
}

// ── Status Pill Color Map (PRD §5.5) ─────────────────────────────────────────

const STATUS_PILL_COLORS: Record<string, string> = {
  // Engagement
  new: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
  contacted: "bg-blue/10 text-blue border-blue/20",
  replied: "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700",
  interested: "bg-amber/10 text-amber border-amber/20",
  not_interested: "bg-red/10 text-red border-red/20",
  out_of_office: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-700",
  // Pipeline
  qualified: "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-700",
  proposal_sent: "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-700",
  converted: "bg-green/10 text-green border-green/20",
  lost: "bg-red/10 text-red border-red/20",
  // Lifecycle
  active: "bg-green/10 text-green border-green/20",
  closed: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
  archived: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
};

// ── Skeletal row (7 columns) ─────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse h-14">
      <td className="px-3 py-3 w-10">
        <div className="w-4 h-4 rounded bg-surface-2" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3.5 w-40 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-32 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-24 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-5 w-24 bg-surface-2 rounded-full" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-20 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-2">
          <div className="w-5 h-5 bg-surface-2 rounded" />
          <div className="w-5 h-5 bg-surface-2 rounded" />
          <div className="w-5 h-5 bg-surface-2 rounded" />
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const LeadsTable = memo(function LeadsTable({
  leads,
  loading = false,
  selected = EMPTY_SET,
  onSelectionChange,
  onStatusChange,
  sortField,
  sortOrder,
  onSortChange,
  onEmailCompose,
  onWhatsApp,
  onSMS,
  onAddToSequence,
  onExportLead,
  onAddNote,
  onToggleDNC,
}: LeadsTableProps) {
  const tooltip = useTooltip();
  const [overflowOpenId, setOverflowOpenId] = useState<string | null>(null);
  const overflowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!overflowOpenId) return;
    const handleClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [overflowOpenId]);

  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const someSelected = leads.some((l) => selected.has(l.id));

  const handleToggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(leads.map((l) => l.id)));
    }
  }, [allSelected, leads, onSelectionChange]);

  return (
    <>
      <TooltipLayer tip={tooltip.tip} />
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-surface">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border/40 bg-surface">
              <th className="px-3 py-3 w-10 text-left">
                {onSelectionChange && (
                  <button
                    onClick={handleToggleAll}
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40",
                      allSelected
                        ? "bg-accent border-accent text-accent-text"
                        : someSelected
                          ? "bg-accent/30 border-accent"
                          : "border-border hover:border-border-strong"
                    )}
                    aria-label="Select all on page"
                    title="Select all on page"
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
                label="Business name"
                sortKey="business_name"
                currentField={sortField}
                order={sortOrder}
                onSort={onSortChange}
                className="min-w-[200px]"
              />
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted min-w-[180px]">
                Email
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted min-w-[120px]">
                Phone
              </th>
              <SortHeader
                label="Status"
                sortKey="status"
                currentField={sortField}
                order={sortOrder}
                onSort={onSortChange}
                className="min-w-[140px]"
              />
              <SortHeader
                label="Last activity"
                sortKey="last_activity"
                currentField={sortField}
                order={sortOrder}
                onSort={onSortChange}
                className="min-w-[160px]"
              />
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-muted w-[140px]">
                Actions
              </th>
            </tr>
          </thead>
          <motion.tbody
            initial="initial"
            animate="animate"
            variants={rowStaggerContainer}
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              : leads.map((lead) => {
                  const isSelected = selected.has(lead.id);
                  const isDNC = !!lead.doNotContact;
                  const primaryStatus = lead.pipelineStage || lead.engagementStatus || lead.status || "new";
                  const domain = lead.pipelineStage ? "pipeline" : lead.engagementStatus ? "engagement" : "engagement";
                  const pillColor = STATUS_PILL_COLORS[primaryStatus] ?? "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700";

                  return (
                    <motion.tr
                      key={lead.id}
                      variants={rowStaggerItem}
                      whileHover={{ x: 2 }}
                      transition={springSoft}
                      className={cn(
                        "border-b border-border/20 transition-colors group relative h-14",
                        !isSelected && !isDNC && "hover:bg-surface-2",
                        isSelected && "bg-blue/5",
                        isDNC && "bg-red/[0.06]"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center">
                          <button
                            onClick={() => {
                              const next = new Set(selected);
                              if (next.has(lead.id)) next.delete(lead.id);
                              else next.add(lead.id);
                              onSelectionChange?.(next);
                            }}
                            className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40",
                              isSelected
                                ? "bg-accent border-accent text-accent-text"
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
                        </div>
                      </td>

                      {/* Business name */}
                      <td className="px-3 py-0">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="group/link flex items-center gap-1.5 py-3 text-text text-sm hover:text-blue transition-colors hover:underline underline-offset-2"
                        >
                          {isDNC && (
                            <span
                              className="inline-flex text-red shrink-0"
                              onMouseEnter={(e) => tooltip.show("Do not contact — this lead has been marked DNC", e.currentTarget as HTMLElement)}
                              onMouseLeave={tooltip.hide}
                            >
                              <Ban className="w-4 h-4" />
                            </span>
                          )}
                          <span className="truncate max-w-[220px]">
                            {lead.business_name}
                          </span>
                        </Link>
                      </td>

                      {/* Email */}
                      <td className="px-3 py-3">
                        <div className="inline-flex items-center gap-1.5">
                          {lead.email && lead.email_status === "valid" ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-green"
                              onMouseEnter={(e) => tooltip.show("Verified email address", e.currentTarget as HTMLElement)}
                              onMouseLeave={tooltip.hide}
                            >
                              <MailCheck className="w-4 h-4" />
                              <span className="text-text text-sm">{lead.email}</span>
                            </span>
                          ) : lead.email ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-text-faint"
                              onMouseEnter={(e) => tooltip.show("Email found but not verified", e.currentTarget as HTMLElement)}
                              onMouseLeave={tooltip.hide}
                            >
                              <Mail className="w-4 h-4" />
                              <span className="text-text text-sm">{lead.email}</span>
                            </span>
                          ) : (
                            <span
                              className="text-text-faint text-sm"
                              onMouseEnter={(e) => tooltip.show("Email not yet available", e.currentTarget as HTMLElement)}
                              onMouseLeave={tooltip.hide}
                            >
                              —
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-3 py-3 text-text text-sm">
                        {lead.phone ? (
                          <span>{lead.phone}</span>
                        ) : (
                          <span
                            className="text-text-faint"
                            onMouseEnter={(e) => tooltip.show("Phone number not yet available", e.currentTarget as HTMLElement)}
                            onMouseLeave={tooltip.hide}
                          >
                            —
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <StatusDropdown
                            lead={{
                              id: lead.id,
                              engagementStatus: lead.engagementStatus,
                              pipelineStage: lead.pipelineStage,
                              lifecycleState: null,
                              status: lead.status,
                              doNotContact: isDNC,
                            }}
                            compact
                            onStatusChange={(_id, patch) => onStatusChange?.(lead.id, patch)}
                          />
                          {/* Domain prefix — optional per PRD. Hidden by default; show if colour alone insufficient in testing. */}
                          <span className="text-[9px] text-text-faint uppercase hidden">
                            {domain === "engagement" ? "E" : "P"}
                          </span>
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="px-3 py-3">
                        {lead.lastActivity ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-text-muted">
                              {lead.lastActivity.label} · {formatRelativeTime(lead.lastActivity.timestamp)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-text-faint">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* Email action */}
                          <button
                            onClick={() => {
                              if (!isDNC && lead.email) onEmailCompose?.(lead);
                            }}
                            aria-disabled={isDNC || !lead.email}
                            tabIndex={isDNC || !lead.email ? -1 : 0}
                            className={cn(
                              "p-1.5 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40",
                              isDNC || !lead.email
                                ? "opacity-40 cursor-not-allowed text-text-faint"
                                : "text-text-muted hover:text-blue hover:bg-blue/10"
                            )}
                            onMouseEnter={(e) =>
                              tooltip.show(
                                isDNC
                                  ? "Actions disabled — lead is marked Do Not Contact"
                                  : !lead.email
                                    ? "Missing email"
                                    : "Send email",
                                e.currentTarget as HTMLElement
                              )
                            }
                            onMouseLeave={tooltip.hide}
                          >
                            {lead.email && lead.email_status === "valid" ? (
                              <MailCheck className="w-5 h-5" />
                            ) : (
                              <Mail className="w-5 h-5" />
                            )}
                          </button>

                          {/* WhatsApp action */}
                          <button
                            onClick={() => {
                              if (!isDNC && lead.phone) onWhatsApp?.(lead);
                            }}
                            aria-disabled={isDNC || !lead.phone}
                            tabIndex={isDNC || !lead.phone ? -1 : 0}
                            className={cn(
                              "p-1.5 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40",
                              isDNC || !lead.phone
                                ? "opacity-40 cursor-not-allowed text-text-faint"
                                : "text-text-muted hover:text-green hover:bg-green/10"
                            )}
                            onMouseEnter={(e) =>
                              tooltip.show(
                                isDNC
                                  ? "Actions disabled — lead is marked Do Not Contact"
                                  : !lead.phone
                                    ? "Missing phone"
                                    : "Send WhatsApp message",
                                e.currentTarget as HTMLElement
                              )
                            }
                            onMouseLeave={tooltip.hide}
                          >
                            <WhatsAppIcon className="w-5 h-5" />
                          </button>

                          {/* SMS action */}
                          <button
                            onClick={() => {
                              if (!isDNC && lead.phone) onSMS?.(lead);
                            }}
                            aria-disabled={isDNC || !lead.phone}
                            tabIndex={isDNC || !lead.phone ? -1 : 0}
                            className={cn(
                              "p-1.5 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40",
                              isDNC || !lead.phone
                                ? "opacity-40 cursor-not-allowed text-text-faint"
                                : "text-text-muted hover:text-blue hover:bg-blue/10"
                            )}
                            onMouseEnter={(e) =>
                              tooltip.show(
                                isDNC
                                  ? "Actions disabled — lead is marked Do Not Contact"
                                  : !lead.phone
                                    ? "Missing phone"
                                    : "Send SMS",
                                e.currentTarget as HTMLElement
                              )
                            }
                            onMouseLeave={tooltip.hide}
                          >
                            <MessageSquare className="w-5 h-5" />
                          </button>

                          {/* Overflow */}
                          <div className="relative" ref={overflowOpenId === lead.id ? overflowRef : undefined}>
                            <button
                              onClick={() => setOverflowOpenId((prev) => (prev === lead.id ? null : lead.id))}
                              className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40"
                              onMouseEnter={(e) => tooltip.show("More actions", e.currentTarget as HTMLElement)}
                              onMouseLeave={tooltip.hide}
                            >
                              <MoreHorizontal className="w-5 h-5" />
                            </button>
                            {overflowOpenId === lead.id && (
                              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border/60 bg-surface shadow-lg py-1 z-30">
                                <OverflowItem
                                  icon={<ListPlus className="w-4 h-4" />}
                                  label="Add to sequence"
                                  onClick={() => {
                                    setOverflowOpenId(null);
                                    onAddToSequence?.(lead.id);
                                  }}
                                />
                                <OverflowItem
                                  icon={<ExternalLink className="w-4 h-4" />}
                                  label="Open lead"
                                  onClick={() => {
                                    setOverflowOpenId(null);
                                    window.location.href = `/leads/${lead.id}`;
                                  }}
                                />
                                <OverflowItem
                                  icon={<Download className="w-4 h-4" />}
                                  label="Export"
                                  onClick={() => {
                                    setOverflowOpenId(null);
                                    onExportLead?.(lead.id);
                                  }}
                                />
                                <OverflowItem
                                  icon={<StickyNote className="w-4 h-4" />}
                                  label="Add note"
                                  onClick={() => {
                                    setOverflowOpenId(null);
                                    onAddNote?.(lead.id);
                                  }}
                                />
                                <div className="border-t border-border/40 my-1" />
                                <OverflowItem
                                  icon={<Ban className="w-4 h-4" />}
                                  label={isDNC ? "Remove Do Not Contact" : "Mark Do Not Contact"}
                                  danger={!isDNC}
                                  onClick={() => {
                                    setOverflowOpenId(null);
                                    onToggleDNC?.(lead.id, isDNC);
                                  }}
                                />
                                <OverflowItem
                                  icon={<X className="w-4 h-4" />}
                                  label="Remove lead"
                                  disabled
                                  onClick={() => setOverflowOpenId(null)}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-text-muted">
                  No leads found
                </td>
              </tr>
            )}
          </motion.tbody>
        </table>
      </div>
    </>
  );
});

// ── Overflow menu item ─────────────────────────────────────────────────────────

function OverflowItem({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors",
        disabled
          ? "opacity-40 cursor-not-allowed text-text-faint"
          : danger
            ? "text-red hover:bg-red/5"
            : "text-text-muted hover:bg-surface-2 hover:text-text"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
