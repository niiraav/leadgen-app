import { useState, useEffect } from "react";
import { RotateCcw, X } from "lucide-react";

interface Props {
  message: string;
  onUndo: () => Promise<void>;
  onDismiss: () => void;
}

export default function AutoActionBanner({ message, onUndo, onDismiss }: Props) {
  const [timeLeft, setTimeLeft] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timeLeft === 0) onDismiss();
  }, [timeLeft, onDismiss]);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-md">
        <span className="text-sm text-text flex-1 truncate">{message}</span>
        {timeLeft > 0 && (
          <button
            onClick={async () => { await onUndo(); onDismiss(); }}
            className="flex items-center gap-1.5 text-xs font-medium text-blue hover:underline"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Undo
          </button>
        )}
        <button onClick={onDismiss} className="text-text-faint hover:text-text">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
