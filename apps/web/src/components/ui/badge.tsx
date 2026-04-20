import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { SCORE_THRESHOLDS } from "@leadgen/shared";

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-text",
        secondary: "bg-surface-2 text-text-muted border border-border",
        destructive: "bg-red/10 text-red",
        outline: "border border-border text-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

// ============ Hot Score Badge ============

export function HotScoreBadge({ score }: { score: number }) {
  let colorClass = "";
  let bgClass = "";

  if (score >= SCORE_THRESHOLDS.GREEN) {
    colorClass = "text-green";
    bgClass = "bg-green/10";
  } else if (score >= SCORE_THRESHOLDS.AMBER) {
    colorClass = "text-amber";
    bgClass = "bg-amber/10";
  } else {
    colorClass = "text-red";
    bgClass = "bg-red/10";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
        bgClass,
        colorClass
      )}
    >
      {score >= SCORE_THRESHOLDS.GREEN && (
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="inline">
          <path d="M10 2a5 5 0 014.5 2.87A4.5 4.5 0 0118 9a5 5 0 01-2.5 4.34A5 5 0 0110 18a5 5 0 01-2.26-5.66A5 5 0 015.5 9a4.5 4.5 0 013.5-4.13A5 5 0 0110 2z" />
        </svg>
      )}
      {score}
    </span>
  );
}
