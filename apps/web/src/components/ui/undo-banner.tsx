import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { RotateCcw, X } from "lucide-react";

interface UndoAction {
  id: string;
  message: string;
  onUndo: () => Promise<void>;
}

interface UndoContextValue {
  push: (message: string, onUndo: () => Promise<void>) => void;
}

const UndoContext = createContext<UndoContextValue>({ push: () => {} });

export const useUndo = () => useContext(UndoContext);

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = useState<UndoAction[]>([]);

  const push = useCallback((message: string, onUndo: () => Promise<void>) => {
    const id = Math.random().toString(36).slice(2, 10);
    setActions((prev) => [...prev, { id, message, onUndo }]);
  }, []);

  return (
    <UndoContext.Provider value={{ push }}>
      {children}
      {actions.length > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 space-y-2 pointer-events-none">
          {actions.map((action) => (
            <div key={action.id} className="pointer-events-auto">
              <UndoBannerItem
                action={action}
                onDismiss={() => setActions((prev) => prev.filter((a) => a.id !== action.id))}
              />
            </div>
          ))}
        </div>
      )}
    </UndoContext.Provider>
  );
}

function UndoBannerItem({ action, onDismiss }: { action: UndoAction; onDismiss: () => void }) {
  const [timeLeft, setTimeLeft] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft((t) => (t <= 1 ? 0 : t - 1)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timeLeft === 0) onDismiss();
  }, [timeLeft, onDismiss]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue/20 bg-surface px-4 py-3 shadow-xl">
      <span className="text-sm text-text flex-1 truncate">{action.message}</span>
      {timeLeft > 0 && (
        <button
          onClick={async () => { await action.onUndo(); onDismiss(); }}
          className="flex items-center gap-1 text-xs font-medium text-blue hover:underline shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Undo
        </button>
      )}
      <button onClick={onDismiss} className="text-text-faint hover:text-text shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
