"use client";

import { useState, useRef, useEffect, memo } from "react";
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
  new: "bg-blue/10 text-blue",
  contacted: "bg-amber/10 text-amber",
  replied: "bg-green/10 text-green",
  interested: "bg-emerald/10 text-emerald",
  not_interested: "bg-red/10 text-red",
  out_of_office: "bg-surface-2 text-text-faint",
  qualified: "bg-blue/10 text-blue",
  proposal_sent: "bg-purple/10 text-purple",
  converted: "bg-green/10 text-green",
  lost: "bg-red/10 text-red",
  closed: "bg-surface-2 text-text-faint",
  archived: "bg-surface-2 text-text-faint",
  active: "bg-green/10 text-green",
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1">
      {/* Do-not-contact indicator */}
      {isDNC && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-red/10 text-red",
            compact && "text-[8px] px-1"
          )}
          title="Do not contact"
        >
          <AlertTriangle className="w-2.5 h-2.5" />
          DNC
        </span>
      )}

      {/* Current status badge — click to open dropdown */}
      <button
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

      {/* Domain label */}
      {compact && (
        <span className="text-[8px] text-text-faint uppercase">
          {DOMAIN_LABELS[domain]}
        </span>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border/60 bg-surface shadow-lg py-1 z-30">
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
      )}
    </div>
  );
});
