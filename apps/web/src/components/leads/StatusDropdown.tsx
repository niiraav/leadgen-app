"use client";

import { useState, useRef, memo, useLayoutEffect, useEffect } from "react";
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
  new: "bg-muted text-muted-foreground border-border",
  contacted: "bg-primary/10 text-primary border-primary/20",
  replied: "bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary border-primary/20 dark:border-primary/30",
  interested: "bg-warning/10 text-warning border-warning/20",
  not_interested: "bg-destructive/10 text-destructive border-destructive/20",
  out_of_office: "bg-warning/10 dark:bg-warning/20 text-warning dark:text-warning border-warning/20 dark:border-warning/30",
  // Pipeline (PRD §5.5)
  qualified: "bg-success/10 dark:bg-success/20 text-success dark:text-success border-success/20 dark:border-success/30",
  proposal_sent: "bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary border-primary/20 dark:border-primary/30",
  converted: "bg-success/10 text-success border-success/20",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
  // Lifecycle
  active: "bg-success/10 text-success border-success/20",
  closed: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted text-muted-foreground border-border",
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
    document.addEventListener("click", handleClick);
    window.addEventListener("scroll", handleScrollResize, true);
    window.addEventListener("resize", handleScrollResize);
    return () => {
      document.removeEventListener("click", handleClick);
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

  const badgeClass = STATUS_COLORS[primary] ?? "bg-secondary text-muted-foreground";

  const dropdown = open && dropdownPos && (
    <div
      className="fixed rounded-lg border border-border bg-card shadow-lg py-1 z-[100]"
      style={{
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: 208,
      }}
    >
      {/* Domain header */}
      <div className="px-3 py-1.5 border-b border-border/40">
        <p className="text-micro font-medium text-muted-foreground uppercase tracking-wider">
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
              "w-full px-3 py-1.5 text-xs text-left hover:bg-secondary transition-colors truncate focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              option.value === primary && "font-semibold text-primary"
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
              "w-full px-3 py-1.5 text-xs text-left hover:bg-secondary transition-colors truncate focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              option.value === "__toggle_dnc__" && isDNC
                ? "text-destructive"
                : "text-muted-foreground",
              option.value === "__toggle_dnc__" && !isDNC
                ? "text-warning"
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
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wider transition-colors",
          badgeClass,
          "hover:opacity-80 cursor-pointer",
          loading && "opacity-50"
        )}
        disabled={loading}
        aria-label={`Current status: ${primary.replace(/_/g, " ")}. Click to change.`}
      >
        {primary.replace(/_/g, " ")}
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {dropdown && createPortal(dropdown, document.body)}

      {/* Do-not-contact indicator */}
      {isDNC && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-destructive/10 text-destructive",
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
