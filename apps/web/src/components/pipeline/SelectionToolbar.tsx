import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PipelineColumnDef } from "@/hooks/usePipelineBoard";

interface SelectionToolbarProps {
  count: number;
  columns: PipelineColumnDef[];
  onMoveTo: (columnId: string) => void;
  onClear: () => void;
}

export default function SelectionToolbar({ count, columns, onMoveTo, onClear }: SelectionToolbarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 z-30 flex items-center justify-center px-4">
      <div className="flex items-center gap-3 bg-surface border border-border shadow-lg shadow-black/10 rounded-xl px-4 py-2.5">
        <span className="text-sm font-medium text-text tabular-nums">
          {count} selected
        </span>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-text-faint uppercase tracking-wide mr-1">
            Move to
          </span>
          {columns.map((col) => (
            <Button
              key={col.id}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] font-medium gap-1 hover:bg-primary/10"
              onClick={() => onMoveTo(col.id)}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              {col.title}
              <ArrowRight className="w-3 h-3" />
            </Button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onClear}
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
