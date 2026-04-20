"use client";

import { useState, useCallback, useRef, useEffect, memo } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Mail,
  Phone,
  Star,
  Lock,
  Pencil,
  X,
  Sparkles,
  Linkedin,
  Facebook,
  Instagram,
  Twitter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HotScoreBadge } from "@/components/ui/badge";
import { SCORE_THRESHOLDS, type ReplyIntent } from "@leadgen/shared";
import { ChannelButtons } from "@/components/leads/ChannelButtons";
import { formatRelativeTime, REPLY_INTENT_CHIP } from "@/lib/activity-utils";

const EMPTY_SET: Set<string> = new Set();

// --- Types ---

export interface ActivityEntry {
  label: string;
  timestamp: Date;
  replyIntent?: ReplyIntent;
}

export interface LeadsTableRow {
  id: string;
  business_name: string;
  category?: string | null;
  city?: string | null;
  country?: string;
  rating?: number | null;
  review_count?: number;
  website_url?: string | null;
  phone?: string | null;
  email: string | null;
  email_status?: string | null;
  hot_score: number;
  status: string;
  engagementStatus?: string | null;
  pipelineStage?: string | null;
  doNotContact?: boolean;
  notes?: string | null;
  contact_enrichment_status?: 'pending' | 'success' | 'partial' | 'failed' | null;
  // Enriched contact fields
  contact_full_name?: string | null;
  contact_email?: string | null;
  domain?: string | null;
  linkedin_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_handle?: string | null;
  // Last activity (Sprint 3 — resolved server-side)
  lastActivity?: ActivityEntry | null;
}

interface LeadsTableProps {
  leads: LeadsTableRow[];
  loading?: boolean;
  selected?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onRowClick?: (id: string) => void;
  onEnrich?: (id: string) => void;
  onVerify?: (id: string) => void;
  onRefresh?: () => void;
}

// --- Status badge helper ---

const StatusBadge = memo(function StatusBadge({ status, engagementStatus, pipelineStage }: { status: string; engagementStatus?: string | null; pipelineStage?: string | null }) {
  const map: Record<string, string> = {
    new: "bg-blue/10 text-blue",
    contacted: "bg-amber/10 text-amber",
    responded: "bg-green/10 text-green",
    interested: "bg-emerald/10 text-emerald",
    not_interested: "bg-red/10 text-red",
    out_of_office: "bg-surface-2 text-text-faint",
    qualified: "bg-blue/10 text-blue",
    proposal_sent: "bg-purple/10 text-purple",
    converted: "bg-green/10 text-green",
    won: "bg-green/10 text-green",
    lost: "bg-red/10 text-red",
    closed: "bg-surface-2 text-text-faint",
    archived: "bg-surface-2 text-text-faint",
  };
  // Phase 4: primary = pipeline_stage (sales), then engagement_status (outreach), then legacy status (fallback)
  const primary = pipelineStage || engagementStatus || status;
  // Show secondary engagement pill when pipeline_stage is primary and engagement differs
  const showSecondary = !!pipelineStage && !!engagementStatus && engagementStatus !== pipelineStage;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          map[primary] ?? "bg-surface-2 text-text-faint"
        )}
      >
        {primary}
      </span>
      {showSecondary && (
        <span
          className={cn(
            "inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider opacity-70",
            map[engagementStatus] ?? "bg-surface-2 text-text-faint"
          )}
        >
          {engagementStatus}
        </span>
      )}
    </span>
  );
});

// --- Email status icon ---

const EmailIcon = memo(function EmailIcon({ lead }: { lead: LeadsTableRow }) {
  const { email, email_status: status } = lead;

  if (!email && !status) {
    // no email at all
    return (
      <span className="text-text-faint" title="No email">
        —
      </span>
    );
  }

  switch (status) {
    case "valid":
      return (
        <span className="text-green" title="Verified email">
          ✅
        </span>
      );
    case "invalid":
      return (
        <span className="text-red" title="Invalid email">
          ❌
        </span>
      );
    case "catch-all":
      return (
        <span title="Catch-all email">⚠️</span>
      );
    case "enriching":
      return (
        <span className="text-text-faint" title="Enriching…">
          ⏳
        </span>
      );
    default:
      if (email) {
        // Has email but not verified
        return (
          <span
            className="text-text-faint flex items-center gap-0.5 opacity-60 cursor-default"
            title="Unverified email — enrich & verify"
          >
            <Lock className="w-3 h-3" />
          </span>
        );
      }
      return (
        <span className="text-text-faint" title="No email">
          —
        </span>
      );
  }
});

// --- Hot score bar ---

const HotScoreBar = memo(function HotScoreBar({ score }: { score: number }) {
  const pct = Math.min(score, 100);
  const color = score >= SCORE_THRESHOLDS.GREEN ? "bg-green" : score >= SCORE_THRESHOLDS.AMBER ? "bg-amber" : "bg-red";
  return (
    <div className="flex items-center gap-2" title={`Hot score: ${score}`}>
      <div className="w-12 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-muted tabular-nums">{score}</span>
    </div>
  );
});

// --- Skeletal row ---

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-3 py-3">
        <div className="w-4 h-4 rounded bg-surface-2" />
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-40 bg-surface-2 rounded" />
          <div className="h-3 w-16 bg-surface-2 rounded-full" />
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-20 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-24 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="w-4 h-4 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-center gap-0.5">
          <div className="w-3 h-3 bg-surface-2 rounded" />
          <div className="w-3 h-3 bg-surface-2 rounded" />
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-center gap-1">
          <div className="w-3 h-3 bg-surface-2 rounded" />
          <div className="w-3 h-3 bg-surface-2 rounded" />
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="w-4 h-4 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-20 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3 w-24 bg-surface-2 rounded" />
      </td>
      <td className="px-3 py-3">
        <div className="h-4 w-16 bg-surface-2 rounded-full" />
      </td>
    </tr>
  );
}

// --- Notes inline editor ---

function InlineNotes({
  lead,
  onSave,
}: {
  lead: LeadsTableRow;
  onSave: (id: string, notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lead.notes ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(lead.notes ?? "");
  }, [lead.notes]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
    }
  }, [editing]);

  const handleChange = (val: string) => {
    setValue(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (val !== lead.notes) {
        onSave(lead.id, val);
      }
    }, 1000);
  };

  if (editing) {
    return (
      <div className="absolute bottom-full left-0 right-0 z-20 bg-surface border border-border rounded-xl shadow-lg p-2 mb-1">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          rows={3}
          className="w-full text-xs bg-surface-2 border border-border rounded-lg p-2 text-text resize-none focus:outline-none focus:ring-1 focus:ring-blue/30"
          placeholder="Add a note…"
        />
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
      }}
      className="opacity-0 group-hover:opacity-100 text-text-faint hover:text-text transition-opacity"
      title="Edit notes"
    >
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}

// --- Main component ---

export const LeadsTable = memo(function LeadsTable({
  leads,
  loading = false,
  selected = EMPTY_SET,
  onSelectionChange,
  onRowClick,
  onEnrich,
  onVerify,
  onNotesSave,
}: LeadsTableProps & {
  onNotesSave?: (id: string, notes: string) => void;
}) {
  const allSelected =
    leads.length > 0 && leads.every((l) => selected.has(l.id));
  const someSelected = leads.some((l) => selected.has(l.id));

  const handleToggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set((leads ?? []).map((l) => l.id)));
    }
  };

  const handleNotesSave = useCallback(
    async (leadId: string, notes: string) => {
      if (onNotesSave) {
        onNotesSave(leadId, notes);
      } else {
        const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        try {
          await fetch(`${API}/leads/${leadId}/notes`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ notes }),
          });
        } catch {}
      }
    },
    [onNotesSave]
  );

  const statusColors: Record<string, string> = {
    new: "border-l-blue",
    contacted: "border-l-amber",
    responded: "border-l-green",
    interested: "border-l-emerald",
    not_interested: "border-l-red",
    out_of_office: "border-l-surface-2",
    qualified: "border-l-blue",
    converted: "border-l-green",
    won: "border-l-green",
    lost: "border-l-red",
    closed: "border-l-surface-2",
    proposal_sent: "border-l-purple",
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 text-xs text-text-faint uppercase tracking-wider">
            <th className="px-3 py-2.5 w-10 text-left">
              {onSelectionChange && (
                <div className="flex items-center">
                  <button
                    onClick={handleToggleAll}
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      allSelected
                        ? "bg-accent border-accent text-accent-text"
                        : someSelected
                          ? "bg-accent/30 border-accent"
                          : "border-border hover:border-border-strong"
                    )}
                    title="Select all"
                  >
                    {allSelected && "✓"}
                  </button>
                </div>
              )}
            </th>
            <th className="px-3 py-2.5 text-left">Business</th>
            <th className="px-3 py-2.5 text-left">City</th>
            <th className="px-3 py-2.5 text-left">Rating</th>
            <th className="px-3 py-2.5 text-center w-10" title="Website">
              🌐
            </th>
            <th className="px-3 py-2.5 text-center w-16" title="Social links">
              🔗
            </th>
            <th className="px-3 py-2.5 text-center w-16" title="Message">
              💬
            </th>
            <th className="px-3 py-2.5 text-center w-10" title="Email">
              ✉️
            </th>
            <th className="px-3 py-2.5 text-left">Score</th>
            <th className="px-3 py-2.5 text-left">Last Activity</th>
            <th className="px-3 py-2.5 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            : (leads ?? []).map((lead) => (
                <tr
                  key={lead.id}
                  className={cn(
                    "border-b border-border/20 hover:bg-surface-2 transition-colors group relative",
                    selected.has(lead.id) && "bg-blue/5",
                    "border-l-4",
                    statusColors[lead.pipelineStage || lead.engagementStatus || lead.status] ?? "border-l-transparent"
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-3">
                    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          const next = new Set(selected);
                          if (next.has(lead.id)) next.delete(lead.id);
                          else next.add(lead.id);
                          onSelectionChange?.(next);
                        }}
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          selected.has(lead.id)
                            ? "bg-accent border-accent text-accent-text"
                            : "border-border hover:border-border-strong"
                        )}
                      >
                        {selected.has(lead.id) && "✓"}
                      </button>
                    </div>
                  </td>

                  {/* Business */}
                  <td className="px-3 py-3">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="group/link block"
                    >
                      <span className="font-medium text-text text-sm group-hover/link:text-blue transition-colors truncate block max-w-[220px]">
                        {lead.business_name}
                      </span>
                      {lead.category && (
                        <span className="inline-block mt-0.5 text-[10px] bg-surface-2 text-text-muted rounded-full px-1.5 py-px border border-border/50">
                          {lead.category}
                        </span>
                      )}
                      {lead.contact_full_name && (
                        <span className="block mt-0.5 text-[10px] text-text-muted">
                          {lead.contact_full_name}
                        </span>
                      )}
                    </Link>
                  </td>

                  {/* City */}
                  <td className="px-3 py-3 text-text-muted text-xs">
                    {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
                  </td>

                  {/* Rating */}
                  <td className="px-3 py-3">
                    {lead.rating != null ? (
                      <span className="text-xs text-text-muted">
                        <span className="text-amber">★</span>{" "}
                        {lead.rating.toFixed(1)}
                        {lead.review_count != null &&
                          lead.review_count > 0 && (
                            <span className="text-text-faint">
                              {" "}
                              ({lead.review_count})
                            </span>
                          )}
                      </span>
                    ) : (
                      <span className="text-text-faint text-xs">—</span>
                    )}
                  </td>

                  {/* Website icon */}
                  <td className="px-3 py-3 text-center">
                    {lead.website_url ? (
                      <a
                        href={
                          lead.website_url.startsWith("http")
                            ? lead.website_url
                            : `https://${lead.website_url}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-green hover:scale-110 transition-transform inline-block"
                        title={`Visit ${lead.website_url}`}
                      >
                        <Globe className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-text-faint" title="No website">
                        <Globe className="w-3.5 h-3.5 opacity-40" />
                      </span>
                    )}
                  </td>

                  {/* Social links */}
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5">
                      {lead.linkedin_url && (
                        <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue hover:scale-110 transition-transform inline-block" title="LinkedIn">
                          <Linkedin className="w-3 h-3" />
                        </a>
                      )}
                      {lead.facebook_url && (
                        <a href={lead.facebook_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue hover:scale-110 transition-transform inline-block" title="Facebook">
                          <Facebook className="w-3 h-3" />
                        </a>
                      )}
                      {lead.instagram_url && (
                        <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer"
                          className="text-purple hover:scale-110 transition-transform inline-block" title="Instagram">
                          <Instagram className="w-3 h-3" />
                        </a>
                      )}
                      {lead.twitter_handle && (
                        <a href={lead.twitter_handle.startsWith("http") ? lead.twitter_handle : `https://twitter.com/${lead.twitter_handle.replace("@","")}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-blue hover:scale-110 transition-transform inline-block" title="Twitter/X">
                          <Twitter className="w-3 h-3" />
                        </a>
                      )}
                      {!lead.linkedin_url && !lead.facebook_url && !lead.instagram_url && !lead.twitter_handle && (
                        <span className="text-text-faint">—</span>
                      )}
                    </div>
                  </td>

                  {/* Message icons (WhatsApp + SMS) */}
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <ChannelButtons
                        phone={lead.phone ?? undefined}
                        lead={{
                          id: lead.id,
                          business_name: lead.business_name,
                          category: lead.category ?? undefined,
                          rating: lead.rating ?? undefined,
                          phone: lead.phone ?? undefined,
                        }}
                        compact
                        doNotContact={!!lead.doNotContact}
                      />
                    </div>
                  </td>

                  {/* Email icon */}
                  <td className="px-3 py-3 text-center">
                    <EmailIcon lead={lead} />
                  </td>

                  {/* Hot score */}
                  <td className="px-3 py-3">
                    <HotScoreBar score={lead.hot_score} />
                  </td>

                  {/* Last Activity */}
                  <td className="px-3 py-3">
                    {lead.lastActivity ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-700">
                          {lead.lastActivity.label} · {formatRelativeTime(lead.lastActivity.timestamp)}
                        </span>
                        {lead.lastActivity.replyIntent && (() => {
                          const chip = REPLY_INTENT_CHIP[lead.lastActivity.replyIntent!];
                          return chip ? (
                            <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-tight ${chip.className}`}>
                              {chip.label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 cursor-default" title="No activity recorded">—</span>
                    )}
                  </td>

                  {/* Status + notes toggle */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={lead.status} engagementStatus={lead.engagementStatus} pipelineStage={lead.pipelineStage} />
                      {lead.contact_enrichment_status === "success" && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-medium bg-green/10 text-green px-1 py-0.5 rounded-full" title="Contact enriched">
                          <Sparkles className="w-2.5 h-2.5" />
                        </span>
                      )}
                      <InlineNotes
                        lead={lead}
                        onSave={handleNotesSave}
                      />
                    </div>
                  </td>
                </tr>
              ))}
          {!loading && leads.length === 0 && (
            <tr>
              <td colSpan={11} className="text-center py-12 text-text-muted">
                No leads found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
