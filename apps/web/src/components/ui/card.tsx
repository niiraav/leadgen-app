import { cn } from "@/lib/utils";
import React from "react";
import { motion } from "framer-motion";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 transition-all duration-200",
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
      className={cn("text-lg font-semibold tracking-tight text-foreground", className)}
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
      className={cn("text-sm text-muted-foreground", className)}
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
      className={cn("flex items-center pt-4 border-t border-border", className)}
      {...props}
    />
  );
}

// ============ KPI Card ============

interface KPICardProps {
  title: string;
  value: string | number;
  secondaryValue?: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  className?: string;
  subtitle?: string;
  color?: string;
}

export function KPICard({
  title,
  value,
  secondaryValue,
  change,
  changeType = "neutral",
  icon,
  className,
  ...props
}: KPICardProps) {
  return (
    <motion.div
      className={cn(
        "rounded-lg border border-border bg-card p-5 hover:shadow-sm transition-all duration-200",
        className
      )}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
          {secondaryValue && (
            <p className="text-xs text-muted-foreground mt-0.5">{secondaryValue}</p>
          )}
        </div>
        {icon && (
          <div className="rounded-full bg-secondary p-2.5 text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
      {change && (
        <div className="mt-3 flex items-center gap-1">
          <span
            className={cn(
              "text-xs font-semibold",
              changeType === "positive" && "text-success",
              changeType === "negative" && "text-destructive",
              changeType === "neutral" && "text-muted-foreground"
            )}
          >
            {change}
          </span>
          <span className="text-xs text-muted-foreground">vs last week</span>
        </div>
      )}
    </motion.div>
  );
}

// ============ Lead Card ============

import Link from "next/link";
import { HotScoreBadge } from "@/components/ui/badge";

// Phase 4: badge color maps for domain-specific status fields
const PIPELINE_BADGE_COLORS: Record<string, string> = {
  qualified: "bg-primary/10 text-primary",
  proposal_sent: "bg-primary/10 text-primary",
  converted: "bg-success/10 text-success",
  lost: "bg-destructive/10 text-destructive",
};

const ENGAGEMENT_BADGE_COLORS: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  contacted: "bg-warning/10 text-warning",
  replied: "bg-success/10 text-success",
  interested: "bg-success/10 text-success",
  not_interested: "bg-muted/10 text-muted-foreground",
  out_of_office: "bg-warning/10 text-warning",
};

// Phase 4: legacy fallback for old rows without domain columns
const LEGACY_BADGE_COLORS: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  contacted: "bg-warning/10 text-warning",
  replied: "bg-success/10 text-success",
  interested: "bg-success/10 text-success",
  not_interested: "bg-muted/10 text-muted-foreground",
  qualified: "bg-primary/10 text-primary",
  proposal_sent: "bg-primary/10 text-primary",
  converted: "bg-success/10 text-success",
  closed: "bg-muted/10 text-muted-foreground",
  lost: "bg-destructive/10 text-destructive",
  archived: "bg-muted/10 text-muted-foreground",
  out_of_office: "bg-warning/10 text-warning",
};

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
    pipelineStage?: string | null;
    engagementStatus?: string | null;
    doNotContact?: boolean;
    addedAt: string;
  };
  className?: string;
}) {
  // Phase 4: primary badge = pipeline_stage, secondary = engagement_status
  const primaryBadge = lead.pipelineStage || null;
  const secondaryBadge = lead.engagementStatus || null;
  // Fallback: if no domain columns, use legacy status
  const fallbackBadge = !primaryBadge && !secondaryBadge ? lead.status : null;

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={cn(
        "block rounded-lg border border-border bg-card p-4 hover:border-border transition-all duration-200 cursor-pointer group",
        lead.doNotContact && "border-destructive/30",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">
              {lead.name}
            </h4>
            <HotScoreBadge score={lead.hotScore} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{lead.title} at {lead.company}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{lead.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{lead.location}</p>
        </div>
        <div className="text-right shrink-0">
          {/* Phase 4: do_not_contact warning badge */}
          {lead.doNotContact && (
            <span className="inline-block rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wider bg-destructive/10 text-destructive mb-1">
              Do Not Contact
            </span>
          )}
          {/* Primary badge: pipeline_stage (or legacy fallback) */}
          {(primaryBadge || fallbackBadge) && (
            <span
              className={cn(
                "inline-block rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wider",
                primaryBadge
                  ? PIPELINE_BADGE_COLORS[primaryBadge] || "bg-muted/10 text-muted-foreground"
                  : LEGACY_BADGE_COLORS[fallbackBadge!] || "bg-muted/10 text-muted-foreground"
              )}
            >
              {primaryBadge || fallbackBadge}
            </span>
          )}
          {/* Secondary badge: engagement_status */}
          {secondaryBadge && (
            <span
              className={cn(
                "inline-block rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wider ml-1",
                ENGAGEMENT_BADGE_COLORS[secondaryBadge] || "bg-muted/10 text-muted-foreground"
              )}
            >
              {secondaryBadge}
            </span>
          )}
          <p className="text-micro text-muted-foreground mt-1.5">
            {lead.addedAt}
          </p>
        </div>
      </div>
    </Link>
  );
}
