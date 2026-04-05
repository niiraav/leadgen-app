import { cn } from "@/lib/utils";
import React from "react";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-surface p-5 shadow-sm transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 mb-3", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold tracking-tight text-text", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-text-muted", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center pt-4 border-t border-border/40", className)}
      {...props}
    />
  );
}

// ============ KPI Card ============

interface KPICardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
}

export function KPICard({
  title,
  value,
  change,
  changeType = "neutral",
  icon,
  className,
  ...props
}: KPICardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-surface p-5 shadow-sm hover:shadow-md transition-all duration-200",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-text-muted">{title}</p>
          <p className="text-3xl font-bold text-text tracking-tight">{value}</p>
        </div>
        {icon && (
          <div className="rounded-full bg-surface-2 p-2.5 text-text-muted">
            {icon}
          </div>
        )}
      </div>
      {change && (
        <div className="mt-3 flex items-center gap-1">
          <span
            className={cn(
              "text-xs font-semibold",
              changeType === "positive" && "text-green",
              changeType === "negative" && "text-red",
              changeType === "neutral" && "text-text-muted"
            )}
          >
            {change}
          </span>
          <span className="text-xs text-text-faint">vs last week</span>
        </div>
      )}
    </div>
  );
}

// ============ Lead Card ============

import Link from "next/link";
import { HotScoreBadge } from "@/components/ui/badge";

export function LeadCard({
  lead,
  className,
}: {
  lead: {
    id: string;
    name: string;
    title: string;
    company: string;
    email: string;
    location: string;
    hotScore: number;
    status: string;
    addedAt: string;
  };
  className?: string;
}) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      className={cn(
        "block rounded-xl border border-border/60 bg-surface p-4 hover:shadow-md hover:border-border-strong transition-all duration-200 cursor-pointer group",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-text text-sm truncate group-hover:text-blue transition-colors">
              {lead.name}
            </h4>
            <HotScoreBadge score={lead.hotScore} />
          </div>
          <p className="text-xs text-text-muted mt-0.5">{lead.title} at {lead.company}</p>
          <p className="text-xs text-text-faint mt-0.5">{lead.email}</p>
          <p className="text-xs text-text-faint mt-0.5">{lead.location}</p>
        </div>
        <div className="text-right shrink-0">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              lead.status === "new" && "bg-blue/10 text-blue",
              lead.status === "contacted" && "bg-amber/10 text-amber",
              lead.status === "replied" && "bg-green/10 text-green",
              lead.status === "meeting" && "bg-accent/10 text-green",
              lead.status === "won" && "bg-green/10 text-green",
              lead.status === "lost" && "bg-red/10 text-red"
            )}
          >
            {lead.status}
          </span>
          <p className="text-[10px] text-text-faint mt-1.5">
            {lead.addedAt}
          </p>
        </div>
      </div>
    </Link>
  );
}
