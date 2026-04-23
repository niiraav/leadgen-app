import { useState } from "react";
import { Button } from "@/components/ui/button";

const REASONS = [
  { value: "no_budget", label: "No budget" },
  { value: "no_decision_power", label: "No decision power" },
  { value: "went_competitor", label: "Chose a competitor" },
  { value: "timing", label: "Wrong timing" },
  { value: "not_interested", label: "Not interested" },
  { value: "other", label: "Other" },
];

export function LossReasonModal({
  open,
  leadCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  leadCount: number;
  onConfirm: (reason: string | null) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-1">
          Mark {leadCount} {leadCount === 1 ? "Lead" : "Leads"} as Lost
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Select a loss reason or skip to continue.
        </p>

        <div className="space-y-2 mb-6">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                selected === r.value
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
              onClick={() => setSelected(r.value)}
            >
              <input
                type="radio"
                name="lossReason"
                value={r.value}
                checked={selected === r.value}
                onChange={() => setSelected(r.value)}
                className="accent-blue-600"
              />
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => onConfirm(null)}>
            Skip
          </Button>
          <Button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
