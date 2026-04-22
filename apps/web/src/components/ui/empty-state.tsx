import { motion } from "framer-motion";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
  iconClassName?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
  iconClassName = "",
}: EmptyStateProps) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        prefersReducedMotion
          ? undefined
          : { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }
      }
      className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}
    >
      <div
        className={`w-14 h-14 rounded-xl bg-surface-2 border border-border/50 flex items-center justify-center mb-4 ${iconClassName}`}
      >
        <Icon className="w-7 h-7 text-text-faint" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-text">{title}</p>
      {description && (
        <p className="text-xs text-text-muted mt-1 max-w-xs">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link
              href={action.href}
              className="btn btn-primary text-sm"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="btn btn-primary text-sm"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/*
 * Table-friendly wrapper — renders EmptyState inside a full-width td.
 * Use when the empty state lives inside a <table>.
 */
export function TableEmptyState(props: EmptyStateProps & { colSpan: number }) {
  const { colSpan, ...rest } = props;
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <EmptyState {...rest} />
      </td>
    </tr>
  );
}
