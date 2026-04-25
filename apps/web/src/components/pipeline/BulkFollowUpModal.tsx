import { useState, useEffect } from "react";
import { X, Calendar, Clock, Users } from "lucide-react";
import { daysFromNow } from "@leadgen/shared";
import type { PipelineLead } from "@/hooks/usePipelineBoard";

interface BulkFollowUpModalProps {
  isOpen: boolean;
  leads: PipelineLead[];
  onConfirm: (date: string) => void;
  onSkip: () => void;
  onCancel: () => void;
  defaultDays?: number;
}

export default function BulkFollowUpModal({
  isOpen,
  leads,
  onConfirm,
  onSkip,
  onCancel,
  defaultDays = 3,
}: BulkFollowUpModalProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [quickDays, setQuickDays] = useState<number | null>(null);

  const count = leads.length;

  useEffect(() => {
    if (isOpen) {
      const d = daysFromNow(defaultDays);
      setSelectedDate(d.toISOString().slice(0, 10));
      setQuickDays(defaultDays);
    }
  }, [isOpen, defaultDays]);

  if (!isOpen) return null;

  const quickOptions = [
    { label: "Tomorrow", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
  ];

  const handleQuick = (days: number) => {
    const d = daysFromNow(days);
    setSelectedDate(d.toISOString().slice(0, 10));
    setQuickDays(days);
  };

  const handleConfirm = () => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setUTCHours(0, 0, 0, 0);
    onConfirm(d.toISOString());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-xl border border-border shadow-lg w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Set follow-up
          </h3>
          <button onClick={onCancel} className="text-text-faint hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/50">
          <Users className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <p className="text-xs text-text-muted">
            <span className="font-medium text-text">{count}</span> lead{count > 1 ? "s" : ""}{" "}
            missing a follow-up date
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          {quickOptions.map((opt) => (
            <button
              key={opt.days}
              onClick={() => handleQuick(opt.days)}
              className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium border transition-colors ${
                quickDays === opt.days
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface-2 text-text-muted border-border hover:bg-secondary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="relative mb-5">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setQuickDays(null);
            }}
            className="input pl-9 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="btn btn-secondary flex-1 text-xs">
            Cancel
          </button>
          <button onClick={onSkip} className="btn btn-secondary flex-1 text-xs">
            Skip for now
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDate}
            className="btn btn-primary flex-1 text-xs"
          >
            <Clock className="w-3.5 h-3.5" />
            Apply to all
          </button>
        </div>
      </div>
    </div>
  );
}
