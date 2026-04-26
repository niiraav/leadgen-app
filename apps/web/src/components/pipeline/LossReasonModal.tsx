import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";

const LOSS_REASON_OPTIONS = [
  { value: "no_budget", label: "No budget" },
  { value: "went_silent", label: "Went silent" },
  { value: "went_with_competitor", label: "Went with competitor" },
  { value: "unqualified", label: "Unqualified" },
];

interface LossReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => void;
  leadName: string;
  existingReason?: string | null;
  existingNotes?: string | null;
}

export default function LossReasonModal({
  isOpen,
  onClose,
  onConfirm,
  leadName,
  existingReason,
  existingNotes,
}: LossReasonModalProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason(existingReason || "");
      setNotes(existingNotes || "");
      setTouched(false);
    }
  }, [isOpen, existingReason, existingNotes]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    setTouched(true);
    if (!reason) return;
    onConfirm(reason, notes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
      <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            Lost deal
          </h3>
          <button onClick={onClose} aria-label="Close modal" className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Why did <span className="font-medium text-foreground">{leadName}</span> not convert?
        </p>

        <div className="space-y-2 mb-4">
          {LOSS_REASON_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setReason(opt.value)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors focus-ring ${
                reason === opt.value
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "bg-secondary border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {touched && !reason && (
          <p className="text-micro-sm text-destructive mb-3">Please select a reason</p>
        )}

        <label className="block text-micro-sm font-medium text-muted-foreground mb-1.5">
          Additional notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="input text-xs resize-none mb-5"
          placeholder="Add context about why this lead was lost..."
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-secondary flex-1 text-xs">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="btn btn-primary flex-1 text-xs bg-destructive hover:bg-destructive/90"
          >
            Confirm lost
          </button>
        </div>
      </div>
    </div>
  );
}
