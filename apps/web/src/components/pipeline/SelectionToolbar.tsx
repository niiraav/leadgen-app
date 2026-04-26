import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PipelineColumnDef } from "@/hooks/usePipelineBoard";
import { PIPELINE_COLUMN_DOT_CLASS } from "@/lib/shared/constants/pipeline";

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
      <div className="flex items-center gap-3 bg-card border border-border shadow-lg rounded-xl px-4 py-2.5">
        <span className="text-sm font-medium text-foreground tabular-nums">
          {count} selected
        </span>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-1">
          <span className="text-micro font-medium text-muted-foreground uppercase tracking-wide mr-1">
            Move to
          </span>
          {columns.map((col) => (
            <Button
              key={col.id}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-micro-sm font-medium gap-1 hover:bg-primary/10"
              onClick={() => onMoveTo(col.id)}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${PIPELINE_COLUMN_DOT_CLASS[col.id] ?? 'bg-muted-foreground'}`}
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
          className="h-7 px-2 text-micro-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onClear}
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
