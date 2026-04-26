"use client";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  used: number;
  limit: number;
  label: string;
  icon?: React.ReactNode;
  labelId?: string;
}

export function ProgressBar({ used, limit, label, icon, labelId }: ProgressBarProps) {
  const isUnlimited = limit < 0;
  const pct = isUnlimited ? 0 : limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const over = !isUnlimited && used > limit;
  const color = over ? "bg-destructive" : pct > 80 ? "bg-warning" : "bg-primary";
  const labelElemId = labelId || `progress-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span id={labelElemId} className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className={cn(over && "text-destructive font-medium")}>
          {isUnlimited ? `${used} / ∞` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-secondary overflow-hidden"
        role="progressbar"
        aria-labelledby={labelElemId}
        aria-valuemin={0}
        aria-valuemax={isUnlimited ? 1 : limit}
        aria-valuenow={isUnlimited ? 0 : used}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", color, pct === 0 && "opacity-0")}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
    </div>
  );
}
