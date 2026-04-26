import { useState, useEffect } from "react";
import { X, Calendar, Clock } from "lucide-react";
import { daysFromNow } from "@leadgen/shared";
import FocusTrap from "focus-trap-react";
import { Portal } from "@/components/ui/portal";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: string) => void;
  leadName: string;
  defaultDays?: number;
  existingDate?: string | null;
}

export default function FollowUpModal({
  isOpen,
  onClose,
  onConfirm,
  leadName,
  defaultDays = 3,
  existingDate,
}: FollowUpModalProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [quickDays, setQuickDays] = useState<number | null>(null);

  useScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      if (existingDate) {
        setSelectedDate(existingDate.slice(0, 10));
        setQuickDays(null);
      } else {
        const d = daysFromNow(defaultDays);
        setSelectedDate(d.toISOString().slice(0, 10));
        setQuickDays(defaultDays);
      }
    }
  }, [isOpen, existingDate, defaultDays]);

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
    onClose();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay" onClick={onClose}>
        <FocusTrap active={isOpen} focusTrapOptions={{ returnFocusOnDeactivate: true, escapeDeactivates: true, onDeactivate: onClose }}>
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-sm mx-4 p-5" role="dialog" aria-modal="true" aria-labelledby="follow-up-title" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 id="follow-up-title" className="text-sm font-semibold text-foreground">Follow-up due</h3>
              <button onClick={onClose} aria-label="Close modal" className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              {existingDate ? "Update follow-up for" : "Set follow-up for"}{" "}
              <span className="font-medium text-foreground">{leadName}</span>
            </p>

            <div className="flex gap-2 mb-4">
              {quickOptions.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => handleQuick(opt.days)}
                  className={`flex-1 py-1.5 px-2 rounded-md text-micro-sm font-medium border transition-colors focus-ring ${
                    quickDays === opt.days
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:bg-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="relative mb-5">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
              <button onClick={onClose} className="btn btn-secondary flex-1 text-xs">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedDate}
                className="btn btn-primary flex-1 text-xs"
              >
                <Clock className="w-3.5 h-3.5" />
                {existingDate ? "Update" : "Set follow-up"}
              </button>
            </div>
          </div>
        </FocusTrap>
      </div>
    </Portal>
  );
}
