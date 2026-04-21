"use client";

import { useState, useRef, useEffect, memo } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ENGAGEMENT_OPTIONS,
  PIPELINE_OPTIONS,
  LIFECYCLE_OPTIONS,
  type StatusOption,
} from "@/lib/lead-domains";

interface BulkStatusDropdownProps {
  onApply: (chosenValue: string) => void;
  disabled?: boolean;
}

const ACTION_OPTIONS: StatusOption[] = [
  { value: "__toggle_dnc__", label: "Toggle Do Not Contact", domain: "none", isBridge: true },
];

export const BulkStatusDropdown = memo(function BulkStatusDropdown({
  onApply,
  disabled = false,
}: BulkStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const sections = [
    { label: "Engagement", options: ENGAGEMENT_OPTIONS },
    { label: "Pipeline", options: PIPELINE_OPTIONS },
    { label: "Lifecycle", options: LIFECYCLE_OPTIONS },
    { label: "Actions", options: ACTION_OPTIONS },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={cn(
          "btn text-xs flex items-center gap-1 h-9 py-1.5",
          disabled ? "btn-ghost opacity-50" : "btn-secondary"
        )}
      >
        Set status
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-50 w-56 rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint bg-surface-2">
                {section.label}
              </div>
              {section.options.map((opt: StatusOption) => (
                <button
                  key={opt.value}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-surface-2 transition-colors"
                  onClick={() => {
                    onApply(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
