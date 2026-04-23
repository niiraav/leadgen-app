import { X, MoveRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { PipelineColumnDef } from "@leadgen/shared";

interface SelectionToolbarProps {
  selectedCount: number;
  columns: PipelineColumnDef[];
  onMoveTo: (columnId: string) => void;
  onClear: () => void;
}

export function SelectionToolbar({
  selectedCount,
  columns,
  onMoveTo,
  onClear,
}: SelectionToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface border border-border shadow-2xl rounded-xl px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <span className="bg-primary text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
              {selectedCount}
            </span>
            <span className="text-sm font-medium text-text">
              {selectedCount === 1 ? "lead selected" : "leads selected"}
            </span>
          </div>

          <div className="h-6 w-px bg-border" />

          {/* Move to dropdown */}
          <div className="flex items-center gap-2">
            <MoveRight className="w-4 h-4 text-text-muted" />
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onMoveTo(e.target.value);
                  e.target.value = "";
                }
              }}
              className="text-sm bg-surface-2 border border-border rounded-md px-2 py-1 text-text focus:outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer"
              defaultValue=""
            >
              <option value="" disabled>
                Move to…
              </option>
              {columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.title}
                </option>
              ))}
            </select>
          </div>

          <div className="h-6 w-px bg-border" />

          <button
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-text-faint hover:text-text transition-colors"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
