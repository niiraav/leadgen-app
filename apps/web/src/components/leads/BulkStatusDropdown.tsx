"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkStatusDropdownProps {
  onSelect: (status: string) => void;
}

const statuses = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

export function BulkStatusDropdown({ onSelect }: BulkStatusDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wider transition-colors",
          "bg-primary/10 text-primary border border-primary/20",
          "hover:opacity-80 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
        aria-label="Change status"
      >
        Change Status
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
          {statuses.map((status) => (
            <button
              key={status.value}
              onClick={() => {
                onSelect(status.value);
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-secondary transition-colors truncate flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Check className="w-3 h-3 opacity-0" />
              {status.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
