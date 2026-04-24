"use client";

import { useState, useRef, useEffect, memo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDropdownOptions,
  getLeadDomain,
  buildStatusPatch,
  DOMAIN_LABELS,
  type LeadDomainFields,
  type StatusOption,
} from "@/lib/lead-domains";

interface StatusDropdownProps {
  lead: LeadDomainFields & { id: string; doNotContact?: boolean };
  onStatusChange: (leadId: string, patch: Record<string, unknown>) => void;
  /** Compact mode for table rows */
  compact?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  // Engagement (PRD §5.5)
  new: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
  contacted: "bg-blue/10 text-blue border-blue/20",
  replied: "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700",
  interested: "bg-amber/10 text-amber border-amber/20",
  not_interested: "bg-red/10 text-red border-red/20",
  out_of_office: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-700",
  // Pipeline (PRD §5.5)
  qualified: "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-700",
  proposal_sent: "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-700",
  converted: "bg-green/10 text-green border-green/20",
  lost: "bg-red/10 text-red border-red/20",
  // Lifecycle
  active: "bg-green/10 text-green border-green/20",
  closed: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
  archived: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
};

function getPrimaryStatus(lead: LeadDomainFields): string {
  return (lead.pipelineStage || lead.engagementStatus || lead.status || "new");
}

export const StatusDropdown = memo(function StatusDropdown({
  lead,
  onStatusChange,
  compact = false,
}: StatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width < 200 ? 200 : rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleScrollResize = () => setOpen(false);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScrollResize, true);
    window.addEventListener("resize", handleScrollResize);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScrollResize, true);
      window.removeEventListener("resize", handleScrollResize);
    };
  }, [open]);

  const primary = getPrimaryStatus(lead);
  const domain = getLeadDomain(lead);
  const options = getDropdownOptions(lead);
  const isDNC = !!lead.doNotContact;

  const handleChange = async (option: StatusOption) => {
    if (option.value === getPrimaryStatus(lead) && !option.isBridge) {
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      if (option.value === "__toggle_dnc__") {
        onStatusChange(lead.id, { do_not_contact: !isDNC });
      } else {
        const patch = buildStatusPatch(lead, option.value);
        if (patch && !patch.__toggle_dnc__) {
          onStatusChange(lead.id, patch);
        }
      }
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const badgeClass = STATUS_COLORS[primary] ?? "bg-surface-2 text-text-faint";

  const dropdown = open && dropdownPos && (
    <div
      className="fixed rounded-lg border border-border/60 bg-surface shadow-lg py-1 z-[100]"
      style={{
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: 208,
      }}
    >
      {/* Domain header */}
      <div className="px-3 py-1.5 border-b border-border/40">
        <p className="text-[10px] font-medium text-text-faint uppercase tracking-wider">
          {DOMAIN_LABELS[domain]} Status
        </p>
      </div>

      {/* Current-domain statuses */}
      {options
        .filter((o) => !o.isBridge)
        .map((option) => (
          <button
            key={option.value}
            onClick={(e) => {
              e.stopPropagation();
              handleChange(option);
            }}
            className={cn(
              "w-full px-3 py-1.5 text-xs text-left hover:bg-surface-2 transition-colors truncate",
              option.value === primary && "font-semibold text-blue"
            )}
          >
            {option.label}
          </button>
        ))}

      {/* Divider before bridge actions */}
      <div className="border-t border-border/40 my-1" />

      {/* Bridge actions */}
      {options
        .filter((o) => o.isBridge)
        .map((option) => (
          <button
            key={option.value}
            onClick={(e) => {
              e.stopPropagation();
              handleChange(option);
            }}
            className={cn(
              "w-full px-3 py-1.5 text-xs text-left hover:bg-surface-2 transition-colors truncate",
              option.value === "__toggle_dnc__" && isDNC
                ? "text-red"
                : "text-text-muted",
              option.value === "__toggle_dnc__" && !isDNC
                ? "text-amber"
                : ""
            )}
          >
            {option.value === "__toggle_dnc__" ? (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {isDNC ? "Remove Do Not Contact" : "Mark Do Not Contact"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />
                {option.label}
              </span>
            )}
          </button>
        ))}
    </div>
  );

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1">
      {/* Current status badge — click to open dropdown */}
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
          badgeClass,
          "hover:opacity-80 cursor-pointer",
          loading && "opacity-50"
        )}
        disabled={loading}
      >
        {primary.replace(/_/g, " ")}
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {dropdown && createPortal(dropdown, document.body)}

      {/* Do-not-contact indicator */}
      {isDNC && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-red/10 text-red",
            compact && "text-[8px] px-1"
          )}
          title="Do not contact"
        >
          <AlertTriangle className="w-4 h-4" />
          DNC
        </span>
      )}
    </div>
  );
});
