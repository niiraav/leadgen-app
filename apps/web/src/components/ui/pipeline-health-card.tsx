import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SCORE_THRESHOLDS } from "@leadgen/shared";
import {
  Shield, ShieldCheck, ShieldAlert,
  ArrowRight, Clock,
} from "lucide-react";
import Link from "next/link";

interface HealthData {
  health_score: number;
  stale_count: number;
  uncontacted_count: number;
  active_sequences: number;
  won_this_month: number;
  conversion_rate: number;
  insights: string[];
}

export default function PipelineHealthCard({ data, loading }: { data?: HealthData; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-5 animate-pulse">
        <div className="h-4 w-32 bg-secondary rounded mb-4" />
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 bg-secondary rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-full bg-secondary rounded" />
            <div className="h-3 w-3/4 bg-secondary rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { health_score, insights } = data;
  const color = health_score >= SCORE_THRESHOLDS.GREEN ? "text-success" : health_score >= SCORE_THRESHOLDS.AMBER ? "text-warning" : "text-destructive";
  const strokeColor = health_score >= SCORE_THRESHOLDS.GREEN ? "text-success" : health_score >= SCORE_THRESHOLDS.AMBER ? "text-warning" : "text-destructive";
  const label = health_score >= SCORE_THRESHOLDS.GREEN ? "Healthy" : health_score >= SCORE_THRESHOLDS.AMBER ? "Needs attention" : "At risk";
  const Icon = health_score >= SCORE_THRESHOLDS.GREEN ? ShieldCheck : health_score >= SCORE_THRESHOLDS.AMBER ? Shield : ShieldAlert;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (health_score / 100) * circumference;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          Pipeline Health
        </h3>
        <Link href="/pipeline" className="text-xs text-primary hover:underline flex items-center gap-1">
          View pipeline <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex items-center gap-6">
        {/* Circular Score */}
        <div className="relative">
          <svg viewBox="0 0 100 100" className="w-20 h-20">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" className="text-surface-2" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="40" fill="none"
              className={strokeColor}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-xl font-bold ${color}`}>{health_score}</span>
          </div>
        </div>

        {/* Label + Insights */}
        <div className="flex-1">
          <p className={`text-sm font-semibold ${color} mb-1`}>{label}</p>
          {insights.length > 0 && (
            <ul className="space-y-1">
              {insights.map((insight, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">·</span>
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
