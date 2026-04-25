import { useState, useEffect } from "react";
import { X, AlertCircle, Users } from "lucide-react";
import { LOSS_REASON_LABELS } from "@leadgen/shared";
import type { PipelineLead } from "@/hooks/usePipelineBoard";

interface BulkLossModalProps {
  isOpen: boolean;
  leads: PipelineLead[];
  onConfirm: (reason: string, notes: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export default function BulkLossModal({
  isOpen,
  leads,
  onConfirm,
  onSkip,
  onCancel,
}: BulkLossModalProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  const count = leads.length;

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setNotes("");
      setTouched(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    setTouched(true);
    if (!reason) return;
    onConfirm(reason, notes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-xl border border-border shadow-lg w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            Mark as lost
          </h3>
          <button onClick={onCancel} className="text-text-faint hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-lg bg-destructive/5 border border-destructive/10">
          <Users className="w-3.5 h-3.5 text-destructive/60 shrink-0" />
          <p className="text-xs text-text-muted">
            <span className="font-medium text-text">{count}</span> lead{count > 1 ? "s" : ""}{" "}
            will be marked as lost
          </p>
        </div>

        <p className="text-xs text-text-muted mb-4">
          Why are these {count > 1 ? "leads" : "lead"} lost?
        </p>

        <div className="space-y-2 mb-4">
          {Object.entries(LOSS_REASON_LABELS).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setReason(value)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                reason === value
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "bg-surface-2 border-border text-text-muted hover:bg-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {touched && !reason && (
          <p className="text-[11px] text-destructive mb-3">Please select a reason</p>
        )}

        <label className="block text-[11px] font-medium text-text-muted mb-1.5">
          Additional notes (optional, applies to all)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="input text-xs resize-none mb-5"
          placeholder="Add context about why these leads were lost..."
        />

        <div className="flex gap-2">
          <button onClick={onCancel} className="btn btn-secondary flex-1 text-xs">
            Cancel
          </button>
          <button onClick={onSkip} className="btn btn-secondary flex-1 text-xs">
            Skip
          </button>
          <button
            onClick={handleConfirm}
            className="btn btn-primary flex-1 text-xs bg-destructive hover:bg-destructive/90"
          >
            Mark as lost
          </button>
        </div>
      </div>
    </div>
  );
}
