import { withAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HotScoreBadge } from "@/components/ui/badge";
import {
  MapPin, Sparkles, Send, Loader2, Copy,
  Check, MessageSquare, Clock, AlertCircle, ArrowLeft, ChevronDown,
  Star, AlertTriangle, NotebookPen, RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UpgradeRequiredError } from "@/lib/api";
import { useProfile } from "@/contexts/profile-context";
import type { Lead, ReviewSummary } from "@leadgen/shared";
import { ChannelButtons } from "@/components/leads/ChannelButtons";
import ContactProfileCard from "@/components/leads/ContactProfileCard";
import { NotesEditor } from "@/components/leads/NotesEditor";
import { LeadDetailTabs } from "@/components/leads/LeadDetailTabs";
import { StatusDropdown } from "@/components/leads/StatusDropdown";
import { formatRelativeTime, REPLY_INTENT_CHIP } from "@/lib/activity-utils";
import UpgradePrompt from "@/components/ui/upgrade-prompt";
import { getLeadDomain, resolveStatusPatch, type LeadDomainFields, DOMAIN_LABELS } from "@/lib/lead-domains";

// ── Phase 3: Field-aware labels for status_changed activities ────────────────
const FIELD_LABELS: Record<string, string> = {
  engagement_status: "Engagement status changed",
  pipeline_stage: "Pipeline stage changed",
  lifecycle_state: "Lifecycle state changed",
  do_not_contact: "Marked do not contact",
};

// ─── Fallback subjects/body ─────────────────────────────────────────────────

const FALLBACK_SUBJECTS = (lead?: Pick<Lead, "business_name" | "category" | "city">) => [
  lead ? `Quick question about ${lead.business_name}'s lead generation` : "Introduction from LeadGen",
  lead ? `Help ${lead.business_name} win more customers this quarter` : "Let's grow your pipeline",
  lead ? `Re: ${lead.business_name} — lead gen opportunity` : "Partnership inquiry",
];

const FALLBACK_BODY = (lead?: Pick<Lead, "business_name" | "category" | "city">) => {
  if (!lead) return "Hi,\n\nI'd love to introduce you to our lead generation platform.\n\nBest,\n[Your Name]";
  return `Hi ${lead.business_name.split(" ")[0]},

I was researching leading ${lead.category ?? "business"} companies in ${lead.city ?? "your area"} and ${lead.business_name} caught my attention.

At LeadGen, we help ${lead.category ?? "business"} professionals like yourself automate prospecting and increase pipeline velocity. Our AI identifies high-intent prospects and crafts personalized outreach that converts at 38%+ reply rates.

I'd love to show you a quick demo of how this could work for ${lead.business_name}. Are you free for a 15-min call this week?

Best,
[Your Name]
LeadGen | Smart Lead Generation`;
};

export default function LeadProfilePage({ user }: { user?: { id: string; email: string } }) {
  const router = useRouter();
  const leadId = router.query.id as string;
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const [emailError, setEmailError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<Error | null>(null);

  const [draftEmail, setDraftEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [selectedSubjectIdx, setSelectedSubjectIdx] = useState<number>(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [logEmailLoading, setLogEmailLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);

  // Sequence enrollment
  const [sequencesDropdown, setSequencesDropdown] = useState(false);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([]);

  // Email verification
  // Sprint 8: Email verification confirmation

  // ── AI Review Insights state ──
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  // Fetch available sequences
  const [sequencesLoaded, setSequencesLoaded] = useState(false);
  const loadSequences = useCallback(() => {
    if (sequencesLoaded) return; // already fetched
    fetch("/api/sequences", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setSequences(data ?? []); setSequencesLoaded(true); })
      .catch(() => {});
  }, [sequencesLoaded]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleEnroll = async (seqId: string) => {
    if (!lead) return;
    try {
      await fetch(`/api/sequences/${seqId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lead_ids: [lead.id] }),
      });
      setSequencesDropdown(false);
      toast.success("Enrolled in sequence");
    } catch (err) {
      console.error("Failed to enroll:", err);
      toast.error("Failed to enroll in sequence");
    }
  };

  // ── React Query: lead + activity batched (deduplicated, cached, no double-fetch) ──
  // refetchOnMount: false — if leads list page pre-populated cache, don't re-fetch on mount
  // This also prevents StrictMode double-mount from firing a second network request
  const leadQuery = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => api.leads.get(leadId),
    enabled: !!leadId,
    staleTime: 30_000,
    refetchOnMount: false,
  });

  const activityQuery = useQuery({
    queryKey: ["lead-activity", leadId],
    queryFn: () => api.pipeline.getActivity(leadId).catch(() => null),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  const repliesQuery = useQuery({
    queryKey: ["lead-replies", leadId],
    queryFn: () => api.replies.list({ leadId }),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  // Derive state from queries (no duplicate useState)
  const lead = leadQuery.data ?? null;
  const loading = leadQuery.isLoading;
  const error = leadQuery.error
    ? `Failed to load lead: ${(leadQuery.error as Error).message}`
    : null;
  const allActivities = activityQuery.data?.activities ?? [];

  // Memoized derived values — avoid recalculating on every render
  const hasEmail = useMemo(() => !!(lead?.email && lead.email.trim().length > 0), [lead?.email]);
  const canSend = useMemo(() =>
    (lead?.email_deliverability === 'deliverable' || lead?.email_deliverability === 'risky') && !lead?.doNotContact,
    [lead?.email_deliverability, lead?.doNotContact]
  );
  const isRecontact = router.query.action === "compose";

  // Sync email subject when business name changes
  useEffect(() => {
    if (lead) {
      setEmailSubject(`Quick question about ${lead.business_name}'s lead generation`);
    }
  }, [lead?.business_name]);

  // ── Edit helpers ──
  const saveNotes = async (value: string) => {
    if (!lead) return;
    const trimmed = value.trim();
    if (trimmed === (lead.notes ?? "")) return;
    setSaving(true);
    try {
      await api.leads.update(leadId, { notes: trimmed || undefined });
      queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) => prev ? { ...prev, notes: trimmed || undefined } : undefined);
      toast.success("Notes saved");
    } catch (err: any) {
      console.error("[LeadProfile] Failed to save notes:", err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── AI Suggest ──
  const handleAISuggest = useCallback(async (recontact = false) => {
    if (!lead) return;
    setEmailLoading(true);
    setEmailError(null);

    try {
      // Use profile from context (already loaded by ProfileProvider) — no extra fetch
      const params: any = {
        tone: "professional",
        purpose: recontact ? "Re-engagement — they did not reply to previous outreach" : "Introduction and outreach for lead generation automation",
        customInstructions: recontact ? "Short, direct, different angle. No reference to previous emails." : undefined,
        recontact,
      };
      // Inject lead's cached AI bio for personalization
      if (lead.ai_bio) params.bio = lead.ai_bio;
      // Pass review summary for personalised email generation
      if (lead.review_summary) params.review_summary = JSON.stringify(lead.review_summary);
      // Pass owner first name for personalized greeting
      if (lead.owner_first_name) params.owner_first_name = lead.owner_first_name;
      if (profile?.usp) params.profile_usp = profile.usp;
      if (profile?.services?.length) params.profile_services = profile.services;
      if (profile?.full_name) params.profile_full_name = profile.full_name;
      if (profile?.signoff_style) params.profile_signoff = profile.signoff_style;
      if (profile?.cta_preference) params.profile_cta = profile.cta_preference;
      if (profile?.calendly_link) params.profile_calendly = profile.calendly_link;
      if (profile?.linkedin_url) params.profile_linkedin = profile.linkedin_url;

      const result = await api.ai.composeEmail(lead.id, params);

      const body = result.email.body;
      const subjects: string[] = [];

      if (result.email.subject_lines?.length) {
        subjects.push(...result.email.subject_lines.slice(0, 3));
      }
      if (result.email.subject && !subjects.includes(result.email.subject)) {
        subjects.unshift(result.email.subject);
      }
      while (subjects.length < 3) {
        subjects.push(...FALLBACK_SUBJECTS(lead));
      }

      setSubjectOptions(subjects.slice(0, 3));
      setSelectedSubjectIdx(0);
      setEmailSubject(subjects[0]);
      setDraftEmail(body);
    } catch (err: any) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err);
        setEmailLoading(false);
        return;
      }
      console.warn("[LeadProfile] AI compose failed, using local template:", err.message);
      const subjects = FALLBACK_SUBJECTS(lead);
      setSubjectOptions(subjects);
      setSelectedSubjectIdx(0);
      setEmailSubject(subjects[0]);
      setDraftEmail(FALLBACK_BODY(lead));
    } finally {
      setEmailLoading(false);
    }
  }, [lead, profile]);

  // ── Copy ──
  const handleCopy = () => {
    const text = `Subject: ${emailSubject}\n\n${draftEmail}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Send via mailto ──
  const handleSend = async () => {
    if (!lead || !draftEmail || !canSend) return;

    const subject = subjectOptions[selectedSubjectIdx] ?? emailSubject;
    const body = draftEmail;

    // Sprint 9: Include reply-tracking address as CC so replies are captured
    const replyDomain = process.env.NEXT_PUBLIC_INBOUND_REPLY_DOMAIN || '';
    const replyCc = (lead.reply_token && replyDomain)
      ? `&cc=reply+${lead.reply_token}@${replyDomain}`
      : '';

    const mailtoUri = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${replyCc}`;
    window.location.href = mailtoUri;

    // Phase 4.1: use api.leads.update for consistent domain resolution
    if ((lead.engagementStatus ?? lead.status) === "new") {
      try {
        await api.leads.update(leadId, { engagement_status: "contacted", status: "contacted" });
        queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) =>
          prev ? { ...prev, engagement_status: "contacted", engagementStatus: "contacted", status: "contacted" } : undefined
        );
      } catch (err) {
        console.warn("[LeadProfile] Failed to update status:", err);
      }
    }

    setEmailSent(true);
    toast.success("Email opened in your mail client");
    setTimeout(() => setEmailSent(false), 4000);
  };

  // ── Log as sent (stopgap for mailto copy-paste workflows) ──
  const handleLogSent = async () => {
    if (!lead) return;
    setLogEmailLoading(true);
    try {
      await api.leads.update(leadId, { logEmailSent: true });
      toast.success("Email logged as sent");
    } catch (e: any) {
      toast.error(e.message || "Failed to log email");
    } finally {
      setLogEmailLoading(false);
    }
  };

  // ── Mobile copy ──
  const handleCopyFull = () => {
    const subject = subjectOptions[selectedSubjectIdx] ?? emailSubject;
    const text = `Subject: ${subject}\n\n${draftEmail}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };


  // ── Enrichment Handlers ──
  // ── Fetch AI Review Insights ──
  const handleFetchReviews = useCallback(async () => {
    if (!lead) return;
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const result = await api.leadActions.fetchReviews(leadId);
      if (result.success && result.review_summary) {
        const rs = result.review_summary as unknown as ReviewSummary;
        queryClient.setQueryData(['lead', leadId], (prev: Lead | undefined) => prev ? {
          ...prev,
          review_summary: rs,
          reviews_fetched_at: rs.fetched_at,
          ...(rs.owner_name && !prev.owner_name ? {
            owner_name: rs.owner_name,
            owner_first_name: rs.owner_name.split(/\s+/)[0] || null,
            owner_name_source: 'reviews',
          } : {}),
        } : undefined);
      } else if (result.error) {
        setReviewsError(result.error as string);
      }
    } catch (err: any) {
      console.error('[AI Insights] Fetch failed:', err.message);
      setReviewsError(err.message || 'Failed to analyze reviews');
    } finally {
      setReviewsLoading(false);
    }
  }, [lead, leadId, queryClient]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl animate-pulse">
        <div className="h-8 w-64 bg-surface-2 rounded" />
        <div className="h-4 w-48 bg-surface-2 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="h-40 bg-surface-2 rounded-xl" />
            <div className="h-40 bg-surface-2 rounded-xl" />
          </div>
          <div className="lg:col-span-2 h-80 bg-surface-2 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!lead || error) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="card text-center py-12">
          <p className="text-text-muted">{error || "Lead not found"}</p>
          <a href="/leads" className="text-sm text-blue hover:underline mt-2 inline-block">
            ← Back to leads
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Upgrade prompt — shown when feature gate / credit limit hit */}
      {upgradeError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <UpgradePrompt error={upgradeError} compact onDismiss={() => setUpgradeError(null)} />
        </div>
      )}

      <div className="space-y-6 max-w-6xl">

      {/* Back button */}
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          1) LEAD SUMMARY
          Business name, category, location, rating, review count, status badge
          ══════════════════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-text tracking-tight">{lead.business_name}</h1>
            <HotScoreBadge score={lead.hot_score} />
          </div>
          <p className="text-sm text-text-muted">
            {lead.category}
            {lead.city && ` — ${lead.city}`}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted mt-1.5">
            {lead.city && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />{lead.city}, {lead.country}
              </span>
            )}
            {lead.rating && <span>★ {lead.rating}</span>}
            {lead.review_count !== undefined && <span>{lead.review_count} reviews</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Phase 4.1: StatusDropdown + domain context */}
          <StatusDropdown
            lead={{
              id: leadId,
              engagementStatus: lead.engagementStatus ?? null,
              pipelineStage: lead.pipelineStage ?? null,
              lifecycleState: null,
              status: lead.status ?? null,
              doNotContact: !!lead.doNotContact,
            }}
            onStatusChange={async (_leadId, patch) => {
              try {
                await api.leads.update(leadId, patch);
                queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
              } catch (e: any) {
                toast.error(e.message || "Failed to update status");
              }
            }}
          />
          <span className="text-[10px] uppercase tracking-wider text-text-faint font-medium">
            {DOMAIN_LABELS[getLeadDomain({
              engagementStatus: lead.engagementStatus ?? null,
              pipelineStage: lead.pipelineStage ?? null,
              lifecycleState: null,
              status: lead.status ?? null,
            })]}
          </span>
          {lead.doNotContact && (
            <Badge className="bg-red-100 text-red-800 text-[11px]">Do Not Contact</Badge>
          )}
          {lead.lastActivity && (
            <span className="text-[11px] text-text-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lead.lastActivity.label} · {formatRelativeTime(lead.lastActivity.timestamp)}
              {lead.lastActivity.replyIntent && (() => {
                const chip = REPLY_INTENT_CHIP[lead.lastActivity.replyIntent!];
                return chip ? (
                  <span className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-medium leading-tight ${chip.className}`}>
                    {chip.label}
                  </span>
                ) : null;
              })()}
            </span>
          )}
          {repliesQuery.data?.replies?.length ? (
            <span className="text-[10px] font-medium bg-blue/10 text-blue px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <MessageSquare className="w-2.5 h-2.5" />
              {repliesQuery.data.replies!.length}
            </span>
          ) : null}
          <div className="relative">
            <button
              onClick={() => { if (!lead.doNotContact) { setSequencesDropdown(!sequencesDropdown); if (!sequencesDropdown) loadSequences(); } }}
              className="btn btn-ghost text-xs py-1 h-7 px-2"
              title={lead.doNotContact ? 'Cannot enroll — do not contact' : 'Enroll in sequence'}
              disabled={!!lead.doNotContact}
            >
              Enroll in Sequence
              {lead.doNotContact && <AlertTriangle className="w-3 h-3 ml-1 text-amber-500" />}
              <ChevronDown className="w-3 h-3" />
            </button>
            {sequencesDropdown && (
              <div className="absolute right-0 mt-1 w-56 rounded-lg border border-border/60 bg-surface shadow-lg py-1 z-20">
                <div className="px-3 py-1.5 border-b border-border/40">
                  <p className="text-xs font-medium text-text">Enroll in Sequence</p>
                </div>
                {sequences.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-text-muted">No active sequences</div>
                ) : (
                  sequences.map((seq: { id: string; name: string }) => (
                    <button
                      key={seq.id}
                      onClick={() => handleEnroll(seq.id)}
                      className="w-full px-3 py-2 text-sm text-text hover:bg-surface-2 transition-colors text-left truncate"
                    >
                      {seq.name}
                    </button>
                  ))
                )}
                <a
                  href="/sequences/new"
                  className="block px-3 py-2 text-xs text-blue hover:bg-blue/5 transition-colors"
                >
                  + Create Sequence
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* ══════════════════════════════════════════════════════════════════
            LEFT COLUMN (1/3)
            ══════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-1 space-y-4">

          {/* ──────────────────────────────────────────────────────────────
              2) CONTACT & PROFILE
              ────────────────────────────────────────────────────────────── */}
          <ContactProfileCard
            lead={lead}
            leadId={leadId}
            onEmailCompose={() => {
              if (!draftEmail) handleAISuggest(false);
            }}
            repliesCount={repliesQuery.data?.replies?.length ?? 0}
          />

          {/* ──────────────────────────────────────────────────────────────
              4) REVIEW INTELLIGENCE
              Review-derived insights for outreach personalization
              ────────────────────────────────────────────────────────────── */}
          <Card className="p-0">
            <div className="px-4 pt-4 pb-2 flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber" />
              <h3 className="text-sm font-semibold text-text">Review Intelligence</h3>
              {lead?.review_summary && lead.reviews_fetched_at && (Date.now() - new Date(lead.reviews_fetched_at).getTime()) / 86400000 >= 7 && (lead?.place_id || lead?.business_name) && (
                <button
                  onClick={handleFetchReviews}
                  disabled={reviewsLoading}
                  className="ml-auto text-xs text-blue hover:underline flex items-center gap-1"
                >
                  {reviewsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Refresh
                </button>
              )}
            </div>

            {lead?.review_summary ? (
              <div className="px-4 pb-4 space-y-3">
                {/* Themes */}
                {lead.review_summary.themes && lead.review_summary.themes.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-text-faint uppercase tracking-wide mb-1">What Customers Value</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.review_summary.themes.map((t, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-green/10 text-green font-medium">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* USP Candidates */}
                {lead.review_summary.usp_candidates && lead.review_summary.usp_candidates.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-text-faint uppercase tracking-wide mb-1">Unique Strengths</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.review_summary.usp_candidates.map((u, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-blue/10 text-blue font-medium">{u}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Staff Names */}
                {lead.review_summary.staff_names && lead.review_summary.staff_names.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-text-faint uppercase tracking-wide mb-1">Staff Mentioned</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.review_summary.staff_names.map((s, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-surface-2 text-text font-medium">
                          <span className="w-4 h-4 rounded-full bg-purple/20 text-purple text-[9px] flex items-center justify-center font-bold">{s.charAt(0)}</span>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Pain Points */}
                {lead.review_summary.pain_points && lead.review_summary.pain_points.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-text-faint uppercase tracking-wide mb-1">Pain Points</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.review_summary.pain_points.map((p, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-amber/10 text-amber font-medium">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Owner Evidence */}
                {lead.review_summary.owner_name && lead.review_summary.owner_evidence && (
                  <div className="rounded-lg bg-surface-2/60 p-2.5">
                    <h4 className="text-xs font-medium text-text-faint uppercase tracking-wide mb-1">Owner Evidence</h4>
                    <p className="text-xs text-text-muted italic">{lead.review_summary.owner_evidence}</p>
                  </div>
                )}
                {/* Fetched timestamp */}
                {lead.reviews_fetched_at && (
                  <p className="text-[10px] text-text-faint pt-1">
                    Insights from {lead.review_count || 0} reviews &middot; analyzed {new Date(lead.reviews_fetched_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : reviewsLoading ? (
              <div className="px-4 pb-4 flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning reviews and extracting insights...
              </div>
            ) : reviewsError ? (
              <div className="px-4 pb-4">
                <div className="rounded-lg bg-red/5 border border-red/20 p-3 mb-2">
                  <p className="text-xs text-red font-medium">Failed to scan reviews</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{reviewsError}</p>
                </div>
                <button
                  onClick={handleFetchReviews}
                  disabled={reviewsLoading}
                  className="btn btn-secondary text-xs py-1.5 h-8 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Try Again
                </button>
              </div>
            ) : lead?.place_id || lead?.business_name ? (
              <div className="px-4 pb-4">
                <p className="text-xs text-text-muted mb-2">Scan customer reviews to discover what makes this business unique and personalize your outreach.</p>
                <button
                  onClick={handleFetchReviews}
                  disabled={reviewsLoading}
                  className="btn btn-primary text-xs py-1.5 h-8 flex items-center gap-1.5"
                >
                  <Star className="w-3.5 h-3.5" />
                  Scan reviews for insights
                </button>
              </div>
            ) : (
              <div className="px-4 pb-4">
                <p className="text-xs text-text-muted">No Google Maps data available for review analysis.</p>
              </div>
            )}
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT COLUMN (2/3)
            ══════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-2 space-y-4">

          {isRecontact && (
            <div className="rounded-xl border border-amber/20 bg-amber/5 p-4 flex items-start gap-3">
              <span className="text-lg">💡</span>
              <div>
                <p className="text-sm text-amber font-medium">Re-engaging a cold lead</p>
                <p className="text-xs text-amber/80 mt-0.5">Try a different angle — shorter, more direct, no reference to previous outreach</p>
              </div>
            </div>
          )}

          {lead.email_status === "catch-all" && (
            <div className="rounded-xl border border-amber/20 bg-amber/5 p-3 text-xs text-amber">
              ⚠️ This email is catch-all — it may not reach a real inbox
            </div>
          )}

          <Card className="p-0 overflow-hidden">
            <LeadDetailTabs
              defaultTab="email"
              emailTab={
                <div>
                  {/* ── Email Composer Header ── */}
                  <div className="px-4 pt-4 pb-3 border-b border-border/40">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue" />
                        AI Email Composer
                      </h3>
                      <button
                        onClick={() => handleAISuggest(isRecontact)}
                        disabled={emailLoading}
                        className="btn btn-secondary text-xs py-1.5 h-8"
                      >
                        {emailLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Generate personalized email
                          </>
                        )}
                      </button>
                    </div>

                    {/* Prerequisite hints */}
                    {!lead.review_summary && !emailLoading && !lead.email && (
                      <div className="rounded-lg bg-amber/5 border border-amber/20 p-2 text-xs text-amber space-y-1">
                        <p className="font-medium">Missing prerequisites</p>
                        <p>Enrich contact for an email address, then scan reviews for personalized content.</p>
                      </div>
                    )}
                    {!lead.review_summary && !emailLoading && lead.email && (
                      <p className="text-[10px] text-text-faint mt-1 flex items-center gap-1">
                        <Star className="w-2.5 h-2.5" />
                        Scan reviews first for a personalised email
                      </p>
                    )}

                    {emailError && (
                      <div className="text-xs text-red mb-2">{emailError}</div>
                    )}

                    {subjectOptions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {subjectOptions.map((subj, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setSelectedSubjectIdx(idx);
                              setEmailSubject(subj);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              idx === selectedSubjectIdx
                                ? "bg-blue text-white"
                                : "bg-surface-2 text-text-muted hover:text-text hover:bg-border/10"
                            }`}
                          >
                            Option {idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Subject ── */}
                  <div className="px-4 pt-3">
                    <input
                      type="text"
                      placeholder="Subject line..."
                      value={emailSubject}
                      onChange={(e) => {
                        setEmailSubject(e.target.value);
                        const matchIdx = subjectOptions.indexOf(e.target.value);
                        if (matchIdx >= 0) setSelectedSubjectIdx(matchIdx);
                      }}
                      className="w-full px-0 py-2 text-sm font-medium bg-transparent border-0 text-text placeholder:text-text-faint focus:outline-none focus:ring-0"
                    />
                  </div>

                  {/* ── Body ── */}
                  <div className="px-4 pb-3 pt-1">
                    <textarea
                      ref={textareaRef}
                      value={draftEmail}
                      onChange={(e) => setDraftEmail(e.target.value)}
                      rows={12}
                      className="w-full px-0 py-1 text-sm bg-transparent border-0 text-text placeholder:text-text-faint focus:outline-none focus:ring-0 resize-none leading-relaxed"
                      placeholder="Write your email here or use AI to generate..."
                    />
                  </div>

                  {/* ── Footer Toolbar ── */}
                  <div className="px-4 py-3 bg-surface-2/60 border-t border-border/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="rounded-md p-2 text-text-muted hover:text-text hover:bg-border/10 transition-colors"
                        aria-label="Copy email"
                        title="Copy subject + body"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-green" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-xs text-text-faint">
                        {draftEmail.split(/\s+/).filter(Boolean).length} words
                      </span>
                      {isMobile && !copied && (
                        <button
                          onClick={handleCopyFull}
                          className="btn btn-ghost text-xs py-1 h-6 px-2"
                          title="Copy subject + body to clipboard"
                        >
                          Copy for mail app
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!canSend ? (
                        <div className="relative group">
                          <button
                            disabled
                            className="btn btn-primary text-xs py-1.5 h-8 opacity-50 cursor-not-allowed"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {!hasEmail ? "No email" : "Email invalid"}
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48">
                            <div className="text-xs text-text bg-surface border border-border rounded-lg px-3 py-2 shadow-lg">
                              <AlertCircle className="w-3 h-3 inline mr-1 text-red" />
                              {!hasEmail ? "No email address — enrich this lead first" : "Email marked invalid — cannot send outreach"}
                            </div>
                            <div className="w-2 h-2 bg-surface border-r border-b border-border rotate-45 mx-auto -mt-1" />
                          </div>
                        </div>
                      ) : (
                        <>
                          {emailSent && (
                            <span className="text-xs text-green font-medium animate-pulse">
                              ✓ Email queued!
                            </span>
                          )}
                          <button
                            onClick={handleSend}
                            disabled={emailLoading || !draftEmail || !!lead.doNotContact}
                            className="btn btn-primary text-xs py-1.5 h-8 disabled:opacity-50"
                            title={lead.doNotContact ? 'Cannot send — do not contact' : undefined}
                          >
                            {emailLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            {emailSent ? "Queued" : "Send Email"}
                          </button>
                          <button
                            onClick={handleLogSent}
                            disabled={logEmailLoading || !!lead.doNotContact}
                            className="btn btn-secondary text-xs py-1.5 h-8 disabled:opacity-50 inline-flex items-center gap-1.5"
                            title={lead.doNotContact ? 'Cannot log — do not contact' : 'Log as sent (if you used your own email client)'}
                          >
                            {logEmailLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <NotebookPen className="w-3.5 h-3.5" />
                            )}
                            {logEmailLoading ? "Logging..." : "Log as sent"}
                          </button>
                          {lead.doNotContact && (
                            <span className="text-[10px] text-red flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Blocked — do not contact
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              }
              activityTab={
                <div className="divide-y divide-border/40">
                  {allActivities.length > 0 ? (
                    allActivities.map((activity) => (
                      <div key={activity.id} className="p-4 hover:bg-surface-2/50 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-text">
                            {activity.type === 'status_changed' && activity.field && FIELD_LABELS[activity.field]
                              ? FIELD_LABELS[activity.field]
                              : activity.type === 'status_changed'
                                ? 'Status changed'
                                : activity.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(activity.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4">
                      <p className="text-xs text-text-muted">No activity yet</p>
                    </div>
                  )}
                </div>
              }
              repliesTab={
                <div className="px-4 pb-4 space-y-3">
                  {repliesQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-text-muted py-4">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading replies...
                    </div>
                  ) : !repliesQuery.data?.replies?.length ? (
                    <p className="text-xs text-text-muted py-2">No replies yet</p>
                  ) : (
                    <div className="space-y-3">
                      {repliesQuery.data.replies.map((r: any) => {
                        const intentColor: Record<string, string> = {
                          interested: "text-green", question: "text-blue", objection: "text-amber",
                          not_now: "text-orange", not_interested: "text-red", referral: "text-purple",
                          other: "text-text-muted",
                        };
                        return (
                          <div key={r.id} className="border border-border/40 rounded-lg p-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-text">{r.subject || "(no subject)"}</span>
                              <span className="text-[10px] text-text-faint">{new Date(r.received_at).toLocaleDateString()}</span>
                            </div>
                            <p className="text-xs text-text-muted line-clamp-3">{r.body_plain?.slice(0, 300)}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              {r.intent_label && (
                                <span className={`text-[10px] font-semibold uppercase ${intentColor[r.intent_label] ?? "text-text-muted"}`}>
                                  {r.intent_label}
                                </span>
                              )}
                              {r.key_phrase && (
                                <span className="text-[10px] text-text-faint italic">"{r.key_phrase}"</span>
                              )}
                              {r.needs_review && (
                                <span className="text-[10px] bg-amber/10 text-amber px-1.5 py-0.5 rounded">Needs review</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              }
              notesTab={
                <NotesEditor leadId={leadId} initialNotes={lead.notes ?? ""} />
              }
              activityCount={allActivities.length}
              repliesCount={repliesQuery.data?.replies?.length ?? 0}
            />
          </Card>
        </div>
      </motion.div>
    </div>
    </>
  );
}

export const getServerSideProps = withAuth();
