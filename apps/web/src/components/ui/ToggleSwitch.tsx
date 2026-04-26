"use client";
import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelLeft?: React.ReactNode;
  labelRight?: React.ReactNode;
  size?: "sm" | "md";
  id?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  labelLeft,
  labelRight,
  size = "md",
  id,
}: ToggleSwitchProps) {
  const trackSize = size === "sm" ? "w-10 h-5" : "w-11 h-6";
  const thumbSize = size === "sm" ? "w-4 h-4" : "w-4 h-4";
  const thumbOffset = size === "sm" ? "translate-x-5" : "translate-x-5";
  const padding = size === "sm" ? "top-0.5 left-0.5" : "top-1 left-1";

  return (
    <div className="flex items-center gap-3">
      {labelLeft && (
        <span className={cn("text-sm", !checked ? "text-foreground font-medium" : "text-muted-foreground")}>
          {labelLeft}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          trackSize,
          checked ? "bg-primary" : "bg-secondary"
        )}
      >
        <span
          className={cn(
            "absolute rounded-full bg-white transition-transform",
            thumbSize,
            padding,
            checked ? thumbOffset : "translate-x-0"
          )}
        />
      </button>
      {labelRight && (
        <span className={cn("text-sm", checked ? "text-foreground font-medium" : "text-muted-foreground")}>
          {labelRight}
        </span>
      )}
    </div>
  );
}
