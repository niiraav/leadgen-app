import { withAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HotScoreBadge } from "@/components/ui/badge";
import {
  Mail, Phone, MapPin, Globe, ExternalLink, Sparkles, Send, Loader2, Copy,
  Check, MessageSquare, Clock, AlertCircle, Pencil, ChevronDown, X,
  Linkedin, Search, Info, RefreshCw, Star, AlertTriangle,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UpgradeRequiredError } from "@/lib/api";
import { useProfile } from "@/contexts/profile-context";
import type { Lead, ReviewSummary } from "@leadgen/shared";
import { ChannelButtons } from "@/components/leads/ChannelButtons";
import { NotesEditor } from "@/components/leads/NotesEditor";
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

const EMAIL_STATUS_BADGE: Record<string, { label: string; className: string; tooltip: string }> = {
  valid:       { label: "Valid",       className: "text-green",       tooltip: "Email address verified and deliverable" },
  invalid:     { label: "Invalid",     className: "text-red",        tooltip: "Email address does not exist" },
  "catch-all": { label: "Catch-all",   className: "text-amber",      tooltip: "Domain accepts all emails, deliverability uncertain" },
  accept_all:  { label: "Accept-all",  className: "text-amber",      tooltip: "Domain accepts all emails, deliverability uncertain" },
  disposable:  { label: "Disposable",  className: "text-orange",      tooltip: "Disposable/temporary email provider" },
  unknown:     { label: "Unknown",     className: "text-text-faint",  tooltip: "Could not verify email" },
};

export default function LeadProfilePage({ user }: { user?: { id: string; email: string } }) {
  const router = useRouter();
  const leadId = router.query.id as string;
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<Error | null>(null);

  const [draftEmail, setDraftEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [selectedSubjectIdx, setSelectedSubjectIdx] = useState<number>(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);

  // — Enrichment state —
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [showOwnerEdit, setShowOwnerEdit] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [socialEditing, setSocialEditing] = useState<string | null>(null);
  const [socialValues, setSocialValues] = useState<Record<string, string>>({
    facebook_url: "",
    linkedin_url: "",
    instagram_url: "",
    twitter_handle: "",
  });
  const [savingSocial, setSavingSocial] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ email: "", phone: "", website_url: "", city: "", category: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Sequence enrollment
  const [sequencesDropdown, setSequencesDropdown] = useState(false);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([]);

  // Email verification
  const [verifying, setVerifying] = useState(false);

  // Sprint 8: Contact enrichment
  const [enrichingContact, setEnrichingContact] = useState(false);
  const [confirmEnrich, setConfirmEnrich] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string | null>(null);

  // Sprint 8: Email verification confirmation
  const [confirmVerify, setConfirmVerify] = useState(false);

  // ── AI Review Insights state ──
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [ownerNoticeDismissed, setOwnerNoticeDismissed] = useState(false);

  // Check localStorage for dismissed owner notice per lead
  useEffect(() => {
    if (leadId) {
      const dismissed = localStorage.getItem('owner-notice-dismissed-' + leadId);
      setOwnerNoticeDismissed(!!dismissed);
    }
  }, [leadId]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch available sequences — only when dropdown opens, not on mount
  const [sequencesLoaded, setSequencesLoaded] = useState(false);
  const loadSequences = useCallback(() => {
    if (sequencesLoaded) return; // already fetched
    fetch("/api/sequences", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setSequences(data ?? []); setSequencesLoaded(true); })
      .catch(() => {});
  }, [sequencesLoaded]);

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
    } catch (err) {
      console.error("Failed to enroll:", err);
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
    queryFn: () => api.replies.list(leadId),
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
  const emailBadge = useMemo(() => lead?.email_status ? EMAIL_STATUS_BADGE[lead.email_status] : undefined, [lead?.email_status]);
  const isRecontact = router.query.action === "compose";

  // Sync derived state when lead data arrives
  // Use granular deps to avoid re-running when queryClient.setQueryData mutates
  // unrelated fields (e.g. status change triggers new lead object but owner_name is same)
  useEffect(() => {
    if (lead) {
      setEmailSubject(`Quick question about ${lead.business_name}'s lead generation`);
      setEditForm((prev) => ({ ...prev, notes: lead.notes ?? "" }));
      setOwnerName(lead.owner_name || "");
      setOwnerFirstName(lead.owner_first_name || "");
      setSocialValues({
        facebook_url: lead.facebook_url || "",
        linkedin_url: lead.linkedin_url || "",
        instagram_url: lead.instagram_url || "",
        twitter_handle: lead.twitter_handle || "",
      });
    }
  }, [lead?.business_name, lead?.notes, lead?.owner_name, lead?.owner_first_name,
      lead?.facebook_url, lead?.linkedin_url, lead?.instagram_url, lead?.twitter_handle]);

  // ── Auto-load contact preview when lead loads and isn't already enriched ──
  // Preview fires automatically so users see contact availability without clicking "Enrich".
  // The unlock/enrich call remains separate (requires explicit confirmation + credit).
  const [enrichmentVisible, setEnrichmentVisible] = useState(false);

  // Auto-enable preview once lead data is available and not yet enriched
  useEffect(() => {
    if (lead && !lead.contact_enriched_at && !enrichmentVisible) {
      setEnrichmentVisible(true);
    }
  }, [lead?.contact_enriched_at]); // only react to enrichment state changes

  const contactPreviewQuery = useQuery({
    queryKey: ["contact-preview", leadId],
    queryFn: () => api.contactPreview.get(leadId),
    enabled: !!leadId && enrichmentVisible && !lead?.contact_enriched_at,
    staleTime: 60_000,
  });

  const contactPreview = contactPreviewQuery.data ?? null;
  const previewLoading = contactPreviewQuery.isLoading && enrichmentVisible;

  // ── Edit helpers ──
  const startEditing = () => {
    setEditForm({
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      website_url: lead?.website_url ?? "",
      city: lead?.city ?? "",
      category: lead?.category ?? "",
      address: lead?.address ?? "",
      notes: lead?.notes ?? "",
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};

      const emailVal = editForm.email.trim();
      if (emailVal !== (lead.email ?? "")) updates.email = emailVal;
      const phoneVal = editForm.phone.trim();
      if (phoneVal !== (lead.phone ?? "")) updates.phone = phoneVal;
      const websiteVal = editForm.website_url.trim();
      if (websiteVal !== (lead.website_url ?? "")) updates.website_url = websiteVal;
      const cityVal = editForm.city.trim();
      if (cityVal !== (lead.city ?? "")) updates.city = cityVal;
      const categoryVal = editForm.category.trim();
      if (categoryVal !== (lead.category ?? "")) updates.category = categoryVal;
      const addressVal = editForm.address.trim();
      if (addressVal !== (lead.address ?? "")) updates.address = addressVal;
      const notesVal = editForm.notes.trim();
      if (notesVal !== (lead.notes ?? "")) updates.notes = notesVal;

      if (Object.keys(updates).length > 0) {
        await api.leads.update(leadId, updates);
        queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) => prev ? { ...prev, ...updates } : undefined);
      }
      setEditing(false);
    } catch (err: any) {
      console.error("[LeadProfile] Failed to save:", err.message);
      setToast(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async (value: string) => {
    if (!lead) return;
    const trimmed = value.trim();
    if (trimmed === (lead.notes ?? "")) return;
    setSaving(true);
    try {
      await api.leads.update(leadId, { notes: trimmed || undefined });
      queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) => prev ? { ...prev, notes: trimmed || undefined } : undefined);
    } catch (err: any) {
      console.error("[LeadProfile] Failed to save notes:", err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Email verification ──
  const verifyEmail = async () => {
    if (!lead?.email) return;
    setVerifying(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/verify-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const status = data.email_status ?? data.status ?? "unknown";
        queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) => prev ? { ...prev, email_status: status } : undefined);
      } else if (res.status === 402 && data?.upgrade_required) {
        setUpgradeError(new UpgradeRequiredError(data.error || "Upgrade required to verify emails"));
      } else {
        console.error("Email verification failed:", res.status, data);
      }
    } catch (err) {
      console.error("Failed to verify email:", err);
    } finally {
      setVerifying(false);
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
    setTimeout(() => setEmailSent(false), 4000);
  };

  // ── Mobile copy ──
  const handleCopyFull = () => {
    const subject = subjectOptions[selectedSubjectIdx] ?? emailSubject;
    const text = `Subject: ${subject}\n\n${draftEmail}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  // ── Enrichment Handlers ──
  const handleEnrich = async () => {
    if (!lead) return;
    setEnrichLoading(true);
    try {
      const result = await api.enrich.enrichLead(leadId);
      if (result.success) {
        setOwnerName(result.owner_name || "");
        setOwnerFirstName(result.owner_first_name || "");
        queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) => prev ? {
          ...prev,
          owner_name: result.owner_name || prev.owner_name,
          owner_first_name: result.owner_first_name || prev.owner_first_name,
          owner_name_source: result.owner_name_source || (result.owner_name ? "gmb_reviews" : prev.owner_name_source),
          enriched_at: result.enriched_at,
        } : undefined);
      }
    } catch (err: any) {
      // Show error toast or message
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err);
      }
      console.error("Enrichment failed:", err);
    } finally {
      setEnrichLoading(false);
    }
  };

  const handleSaveOwner = async () => {
    if (!lead) return;
    try {
      await api.enrich.updateSocialLinks(leadId, {
        owner_name: ownerName || undefined,
        owner_first_name: ownerFirstName || undefined,
      });
      queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) => prev ? {
        ...prev,
        owner_name: ownerName || undefined,
        owner_first_name: ownerFirstName || undefined,
        owner_name_source: "manual",
      } : undefined);
      setShowOwnerEdit(false);
    } catch (err: any) {
      console.error("Failed to save owner name:", err);
    }
  };

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
        if (rs.owner_name && !lead.owner_name) {
          setOwnerName(rs.owner_name);
          setOwnerFirstName(rs.owner_name.split(/\s+/)[0] || '');
        }
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

  const handleSaveSocial = async () => {
    if (!lead) return;
    setSavingSocial(true);
    setSocialError(null);
    try {
      const field = socialEditing as string;
      const payload: Record<string, unknown> = { [field]: socialValues[field] || null };
      await api.enrich.updateSocialLinks(leadId, payload);
      queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) => prev ? { ...prev, [field]: socialValues[field] || undefined } : undefined);
      setSocialEditing(null);
      setToast("Social link saved");
    } catch (err: any) {
      setSocialError(err?.message || "Failed to save. Check the URL format.");
      setTimeout(() => setSocialError(null), 5000);
    } finally {
      setSavingSocial(false);
    }
  };

  // Sprint 8: Contact enrichment (Outscraper) -- uses unlock endpoint
  const handleEnrichContact = async () => {
    if (!lead) return;
    setConfirmEnrich(false);
    setEnrichingContact(true);
    try {
      const result = await api.contactPreview.unlock(leadId);
      if (result && result.enriched) {
        // Backend now persists enrichment data and returns canonical lead state.
        // Use the returned lead object to update React Query cache directly,
        // avoiding manual field mapping from raw contacts.
        if (result.lead) {
          // Update the lead detail query with canonical DB state
          queryClient.setQueryData(["lead", leadId], result.lead);
          // Sync socialValues from persisted lead (immediate feedback)
          setSocialValues({
            facebook_url: result.lead.facebook_url || "",
            linkedin_url: result.lead.linkedin_url || "",
            instagram_url: result.lead.instagram_url || "",
            twitter_handle: result.lead.twitter_handle || "",
          });
        } else {
          // Fallback: if backend didn't return lead, invalidate to force refetch
          queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
        }
        // Invalidate leads list so enriched indicator updates
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        // Clear preview cache (enriched now, no need for preview)
        queryClient.setQueryData(["contact-preview", leadId], null);
        // Disable further preview queries since lead is now enriched
        setEnrichmentVisible(false);

        const status = result.enrichment_status || "success";
        const contactCount = result.contacts?.length ?? 0;
        if (status === "partial") {
          setEnrichResult(`Partially enriched — ${contactCount} contact(s) found, some fields skipped`);
        } else {
          setEnrichResult(`Contact enriched — ${contactCount} contact(s) found`);
        }
      } else {
        // Backend persisted no_data or failure status; refresh lead to reflect it
        queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        if (result?.enrichment_status === 'no_data') {
          setEnrichResult('No public contacts found for this business');
        } else {
          setEnrichResult(result?.message || 'Enrichment failed — please try again');
        }
      }
    } catch (err: any) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err);
      }
      // Refresh lead state — backend may have persisted failure status
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setEnrichResult(err.message || "Enrichment failed");
    } finally {
      setEnrichingContact(false);
      setTimeout(() => setEnrichResult(null), 5000);
    }
  };

  // Sprint 8: Email verification with confirmation
  const handleVerifyEmail = async () => {
    if (!lead) return;
    setConfirmVerify(false);
    setVerifying(true);
    try {
      const result = await api.leadActions.verifyEmail(leadId);
      // Merge verify result into local state instead of full re-fetch
      if (result) {
        queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) => prev ? {
          ...prev,
          email_status: result.email_status ?? result.status ?? prev.email_status,
          email: result.email ?? prev.email,
        } : undefined);
      }
    } catch (err: any) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err);
      }
      console.error("Verify failed:", err);
    } finally {
      setVerifying(false);
    }
  };

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
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl">
            <span className="text-sm">{toast}</span>
            <button onClick={() => setToast(null)} className="text-text-faint hover:text-text">✕</button>
          </div>
        </div>
      )}

      {/* Upgrade prompt — shown when feature gate / credit limit hit */}
      {upgradeError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <UpgradePrompt error={upgradeError} compact onDismiss={() => setUpgradeError(null)} />
        </div>
      )}

      <div className="space-y-6 max-w-6xl">

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
                setToast(e.message || "Failed to update status");
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
                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-tight ${chip.className}`}>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ══════════════════════════════════════════════════════════════════
            LEFT COLUMN (1/3)
            ══════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-1 space-y-4">

          {/* ──────────────────────────────────────────────────────────────
              2) CONTACT & PROFILE
              All reachability + identity + enrichment in one card
              ────────────────────────────────────────────────────────────── */}
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text">Contact & Profile</h3>
                {!editing && (
                  <button
                    onClick={startEditing}
                    className="rounded-full p-1.5 text-text-faint hover:text-blue hover:bg-blue/5 transition-colors"
                    title="Edit contact info"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {editing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="rounded-full p-1.5 text-green hover:bg-green/5 transition-colors"
                      title="Save"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="rounded-full p-1.5 text-text-faint hover:text-red hover:bg-red/5 transition-colors"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* ── Known contact data ── */}
              <div className="space-y-3 mt-3">
                {editing ? (
                  <>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Email</label>
                      <input type="email" value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="Add email..." className="input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Phone</label>
                      <input type="tel" value={editForm.phone}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="Add phone..." className="input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Website</label>
                      <input type="url" value={editForm.website_url}
                        onChange={(e) => setEditForm((f) => ({ ...f, website_url: e.target.value }))}
                        placeholder="Add website..." className="input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">City</label>
                      <input type="text" value={editForm.city}
                        onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                        placeholder="Add city..." className="input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Category</label>
                      <input type="text" value={editForm.category}
                        onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                        placeholder="Add category..." className="input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Address</label>
                      <input type="text" value={editForm.address}
                        onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                        placeholder="Add address..." className="input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Notes</label>
                      <textarea value={editForm.notes}
                        onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Add notes..."
                        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
                        rows={3} />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Enriched contact data — takes priority when available */}
                    {lead.contact_full_name || lead.contact_email ? (
                      <div className="space-y-2.5 text-sm">
                        {lead.contact_full_name && (
                          <div className="flex items-center gap-2">
                            <span className="text-text font-medium">{lead.contact_full_name}</span>
                            {lead.contact_title && <span className="text-text-muted text-xs">· {lead.contact_title}</span>}
                          </div>
                        )}
                        {lead.contact_email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-text-faint" />
                            <span className="text-text">{lead.contact_email}</span>
                            {lead.email_status === "valid" && <span className="text-green text-xs">✓</span>}
                            {lead.email_status === "catch-all" && <span className="text-amber text-xs">⚠</span>}
                            {lead.email_status === "invalid" && <span className="text-red text-xs">✗</span>}
                            {lead.contact_email_type && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                lead.contact_email_type === "direct" ? "bg-green/10 text-green" : "bg-surface-2 text-text-muted"
                              }`}>
                                {lead.contact_email_type === "direct" ? "Direct" : "Generic"}
                              </span>
                            )}
                            {repliesQuery.data?.replies?.length ? (
                              <span className="text-[10px] font-medium bg-blue/10 text-blue px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                <MessageSquare className="w-2.5 h-2.5" />
                                {repliesQuery.data.replies!.length} repl{repliesQuery.data.replies!.length === 1 ? "y" : "ies"}
                              </span>
                            ) : null}
                          </div>
                        )}
                        {lead.contact_phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-text-faint" />
                            <span className="text-text">{lead.contact_phone}</span>
                          </div>
                        )}
                        {lead.contact_linkedin && (
                          <div className="flex items-center gap-2">
                            <Linkedin className="w-3.5 h-3.5 text-text-faint" />
                            <a href={lead.contact_linkedin} target="_blank" rel="noopener noreferrer"
                              className="text-blue text-xs hover:underline">LinkedIn</a>
                          </div>
                        )}
                        {lead.company_size && (
                          <div className="text-xs text-text-muted">Company size: {lead.company_size}</div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Manual contact fields */}
                        {lead.email ? (
                          <div className="flex items-center gap-3 text-sm">
                            <Mail className="w-4 h-4 text-text-faint shrink-0" />
                            <span className="text-text">{lead.email}</span>
                            {emailBadge && (
                              <span className={`text-xs ${emailBadge.className}`} title={emailBadge.tooltip}>
                                {EMAIL_STATUS_BADGE[lead.email_status || ""]?.label === "Valid"
                                  ? "✓"
                                  : emailBadge.label === "Invalid"
                                  ? "✗"
                                  : emailBadge.label === "Catch-all"
                                  ? "⚠"
                                  : "?"}
                              </span>
                            )}
                            {hasEmail && (
                              <button onClick={verifyEmail} disabled={verifying}
                                className="text-xs text-blue hover:underline disabled:opacity-50">
                                {verifying ? <Loader2 className="w-3 h-3 inline animate-spin" /> : "Verify"}
                              </button>
                            )}
                          </div>
                        ) : null}
                        {lead.phone && (
                          <div className="flex items-center gap-3 text-sm">
                            <Phone className="w-4 h-4 text-text-faint shrink-0" />
                            <span className="text-text">{lead.phone}</span>
                          </div>
                        )}
                        {lead.website_url && (
                          <div className="flex items-center gap-3 text-sm">
                            <Globe className="w-4 h-4 text-text-faint shrink-0" />
                            <a
                              href={lead.website_url?.startsWith('http') ? lead.website_url : `https://${lead.website_url}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-blue hover:underline flex items-center gap-1"
                            >
                              {lead.website_url?.replace(/^https?:\/\//, '')}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}

                        {/* ── Empty state 1: No contact data, enrichment not attempted (has identifier) ── */}
                        {!lead.email && !lead.phone && !lead.website_url
                          && (lead.place_id || lead.data_id)
                          && lead.contact_enrichment_status !== 'success'
                          && lead.contact_enrichment_status !== 'partial'
                          && lead.contact_enrichment_status !== 'no_data' && (
                          <div className="text-xs space-y-1">
                            <p className="text-text-muted">No contact details yet.</p>
                            <p className="text-text-faint">Enrich to find public contacts, or add manually.</p>
                          </div>
                        )}

                        {/* ── Empty state 2: Enrichment attempted, no_data ── */}
                        {lead.contact_enrichment_status === 'no_data'
                          && !lead.email && !lead.phone && !lead.website_url && (
                          <div className="text-xs space-y-1">
                            <p className="text-text-muted">No public contacts found for this business.</p>
                            <p className="text-text-faint">You can add contact details manually.</p>
                          </div>
                        )}

                        {/* ── Empty state 3: No identifier available (no place_id AND no data_id) ── */}
                        {!lead.email && !lead.phone && !lead.website_url
                          && !lead.place_id && !lead.data_id
                          && lead.contact_enrichment_status !== 'no_data' && (
                          <p className="text-xs text-text-muted">Contact details unavailable.</p>
                        )}

                        {/* Verify email button (enriched contact email exists but not verified) */}
                        {lead.contact_email && !(lead as any).email_verified_at && !lead.email_status && (
                          <div className="mt-2">
                            {!confirmVerify ? (
                              <button onClick={() => setConfirmVerify(true)} disabled={verifying}
                                className="btn btn-ghost text-xs w-full text-amber">
                                {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                                Verify email — 1 credit
                              </button>
                            ) : (
                              <div className="rounded-lg bg-surface-2 p-2 text-xs space-y-2">
                                <p className="text-text">Use 1 verification credit?</p>
                                <div className="flex gap-2">
                                  <button onClick={handleVerifyEmail} disabled={verifying}
                                    className="btn btn-primary text-xs flex-1 disabled:opacity-50">
                                    {verifying ? "Verifying..." : "Confirm"}
                                  </button>
                                  <button onClick={() => setConfirmVerify(false)}
                                    className="btn btn-ghost text-xs flex-1">Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* ── Enrichment preview + CTA ── */}
              {/* Show enrichment section ONLY when:
                  - preview data exists (total_contacts > 0) AND already_enriched is false AND status is NOT success/partial
                  - OR status is null/undefined/failed (CTA still needed)
                  Skip entirely when: already_enriched is true OR status is success/partial/no_data */}
              {!(lead.contact_enrichment_status === 'success' || lead.contact_enrichment_status === 'partial' || lead.contact_enrichment_status === 'no_data')
                && !lead.contact_enriched_at && (
                <div className="mt-4 pt-3 border-t border-border/40">

                  {/* Enrichment failed banner */}
                  {lead.contact_enrichment_status === 'failed' && (
                    <div className="rounded-lg bg-red/5 border border-red/20 p-2.5 mb-2 text-xs text-red space-y-1">
                      <p className="font-medium">Enrichment failed</p>
                      {lead.contact_enrichment_error && <p className="text-text-muted">{lead.contact_enrichment_error}</p>}
                      <p className="text-text-faint italic">You can retry — the error may be transient.</p>
                    </div>
                  )}

                  {/* Preview teaser — only when preview data exists AND already_enriched is false AND status NOT success/partial */}
                  {previewLoading ? (
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <Loader2 className="w-3 h-3 animate-spin" />Checking for contacts...
                    </div>
                  ) : contactPreview && contactPreview.total_contacts > 0 && !contactPreview.already_enriched ? (
                    <div className="rounded-lg bg-blue/5 border border-blue/20 p-3 mb-2 space-y-2">
                      <div className="flex items-center gap-1.5 text-sm text-text font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-blue" />
                        {contactPreview.total_contacts} contact{contactPreview.total_contacts > 1 ? "s" : ""} found
                        {contactPreview.direct_emails > 0 && (
                          <span className="text-xs text-text-muted">({contactPreview.direct_emails} direct{contactPreview.direct_emails > 1 ? "s" : ""})</span>
                        )}
                      </div>
                      {/* Masked preview rows */}
                      {contactPreview.first_name && (
                        <div className="text-xs text-text-muted flex items-center gap-2">
                          <span className="text-text font-medium">{contactPreview.first_name.charAt(0)}***</span>
                          {contactPreview.first_email && (
                            <>
                              <span>·</span>
                              <span>{contactPreview.first_email.charAt(0)}***@{contactPreview.first_email.split('@')[1]}</span>
                              {contactPreview.direct_emails > 0 && (
                                <span className="text-[10px] font-medium bg-green/10 text-green px-1.5 py-0.5 rounded-full">Direct</span>
                              )}
                              {contactPreview.generic_emails > 0 && contactPreview.direct_emails === 0 && (
                                <span className="text-[10px] font-medium bg-surface-2 text-text-muted px-1.5 py-0.5 rounded-full">Generic</span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-text-muted italic">Unlock to view all contact details</div>
                    </div>
                  ) : null}

                  {/* CTA — show when status is null/undefined/failed, regardless of email */}
                  {(!lead.contact_enrichment_status || lead.contact_enrichment_status === 'failed') && (lead.place_id || lead.data_id || lead.website_url) && (
                    <div className="space-y-1.5">
                      {!confirmEnrich ? (
                        <button
                          onClick={() => { setEnrichmentVisible(true); setConfirmEnrich(true); }}
                          disabled={enrichingContact}
                          className="btn btn-ghost text-xs w-full text-blue"
                        >
                          {enrichingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                          {lead.contact_enrichment_status === 'failed' ? 'Retry enrichment' : 'Unlock contact details'}
                        </button>
                      ) : (
                        <div className="rounded-lg bg-surface-2 p-2 text-xs space-y-2">
                          <p className="text-text">Use 1 enrichment credit to unlock?</p>
                          <div className="flex gap-2">
                            <button onClick={handleEnrichContact} disabled={enrichingContact}
                              className="btn btn-primary text-xs flex-1 disabled:opacity-50">
                              {enrichingContact ? "Enriching..." : "Confirm"}
                            </button>
                            <button onClick={() => setConfirmEnrich(false)}
                              className="btn btn-ghost text-xs flex-1">Cancel</button>
                          </div>
                        </div>
                      )}
                      <p className="text-[10px] text-text-faint text-center">
                        Finds direct email, phone, LinkedIn and owner name
                      </p>
                      <p className="text-[9px] text-text-faint text-center">
                        Uses 1 enrichment credit
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Enrichment result toast — rendered once only in the merged card */}
              {enrichResult && <p className="text-xs text-text-muted mt-2">{enrichResult}</p>}

              {/* ── Owner row (slim, folded into same card) ── */}
              <div className="mt-4 pt-3 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-faint uppercase tracking-wide">Owner</span>
                  {lead.contact_enrichment_status === 'success' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-green/10 text-green px-1.5 py-0.5 rounded-full">
                      <Sparkles className="w-2.5 h-2.5" />Enriched
                    </span>
                  )}
                  {lead.contact_enrichment_status === 'partial' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber/10 text-amber px-1.5 py-0.5 rounded-full">
                      <Sparkles className="w-2.5 h-2.5" />Partial
                    </span>
                  )}
                </div>

                {showOwnerEdit ? (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Full name</label>
                      <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="e.g. John Smith"
                        className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text focus:outline-none min-h-[28px]" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">First name</label>
                      <input value={ownerFirstName} onChange={(e) => setOwnerFirstName(e.target.value)}
                        placeholder="e.g. John"
                        className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text focus:outline-none min-h-[28px]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleSaveOwner}
                        className="btn btn-primary text-xs py-0.5 h-6 min-h-[24px]">Save</button>
                      <button onClick={() => setShowOwnerEdit(false)}
                        className="text-xs text-text-muted hover:text-text underline">Cancel</button>
                    </div>
                  </div>
                ) : lead?.owner_name || lead?.owner_first_name ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-sm text-text font-medium">
                      {lead.owner_first_name || lead.owner_name}
                    </span>
                    {lead.owner_name_source && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-2 text-text-muted">
                        {lead.owner_name_source === "gmb_reviews" ? "from reviews"
                          : lead.owner_name_source === "reviews" ? "from reviews"
                          : "manual"}
                      </span>
                    )}
                    <button onClick={() => setShowOwnerEdit(true)}
                      className="text-xs text-blue hover:underline">Edit</button>
                    {/* AI-suggested owner name disclaimer */}
                    {lead.owner_name_source === 'reviews' && !ownerNoticeDismissed && (
                      <div className="mt-2 rounded-lg bg-blue/5 border border-blue/20 p-2 flex items-start gap-2 w-full">
                        <Info className="w-3.5 h-3.5 text-blue mt-0.5 shrink-0" />
                        <div className="text-xs text-text-muted flex-1">
                          Owner name suggested by AI — extracted from customer reviews. Please verify before using in outreach.
                        </div>
                        <button
                          onClick={() => {
                            setOwnerNoticeDismissed(true);
                            localStorage.setItem('owner-notice-dismissed-' + leadId, '1');
                          }}
                          className="text-text-faint hover:text-text shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2 text-xs">
                    <span className="text-text-faint">Owner unknown</span>
                    {(lead?.data_id || lead?.place_id) && (
                      <button onClick={handleEnrich} disabled={enrichLoading}
                        className="text-blue hover:underline flex items-center gap-1">
                        {enrichLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {enrichLoading ? "Extracting..." : "Extract from reviews"}
                      </button>
                    )}
                    <button onClick={() => setShowOwnerEdit(true)}
                      className="text-text-muted hover:text-text underline">
                      Add manually
                    </button>
                  </div>
                )}

                {/* Last enriched timestamp */}
                {lead?.enriched_at && (
                  <p className="text-[10px] text-text-faint mt-2">
                    Last enriched: {new Date(lead.enriched_at).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* ── Social & Web ── */}
              <div className="mt-4 pt-3 border-t border-border/40">
                <h4 className="text-xs font-medium text-text-faint uppercase tracking-wide mb-2">Social & Web</h4>
                {socialError && <p className="text-xs text-red mb-2">{socialError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  {/* Google Maps */}
                  {lead?.gmb_url ? (
                    <a href={lead.gmb_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue hover:underline">
                      <MapPin className="w-3 h-3" />
                      Google Maps <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : null}

                  {/* Website */}
                  {lead.website_url ? (
                    <a href={lead.website_url?.startsWith('http') ? lead.website_url : `https://${lead.website_url}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue hover:underline">
                      <Globe className="w-3 h-3" />
                      Website <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : null}

                  {/* Facebook */}
                  {socialEditing === "facebook_url" ? (
                    <div className="col-span-2 flex items-center gap-1.5">
                      <input value={socialValues.facebook_url || ""}
                        onChange={(e) => setSocialValues(v => ({ ...v, facebook_url: e.target.value }))}
                        placeholder="https://facebook.com/..."
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text focus:outline-none min-h-[28px]" />
                      <button onClick={handleSaveSocial} disabled={savingSocial}
                        className="text-green hover:underline text-xs min-h-[28px] px-1">
                        {savingSocial ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button onClick={() => setSocialEditing(null)}
                        className="text-text-faint hover:text-text text-xs min-h-[28px] px-1">✕</button>
                    </div>
                  ) : lead?.facebook_url ? (
                    <a href={lead.facebook_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue hover:underline">
                      <span className="text-blue-600 font-bold text-xs">f</span>
                      Facebook <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <button onClick={() => setSocialEditing("facebook_url")}
                      className="text-xs text-text-faint hover:text-blue underline">+ Add Facebook</button>
                  )}

                  {/* LinkedIn */}
                  {socialEditing === "linkedin_url" ? (
                    <div className="col-span-2 flex items-center gap-1.5">
                      <input value={socialValues.linkedin_url || ""}
                        onChange={(e) => setSocialValues(v => ({ ...v, linkedin_url: e.target.value }))}
                        placeholder="https://linkedin.com/in/..."
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text focus:outline-none min-h-[28px]" />
                      <button onClick={handleSaveSocial} disabled={savingSocial}
                        className="text-green hover:underline text-xs min-h-[28px] px-1">
                        {savingSocial ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button onClick={() => setSocialEditing(null)}
                        className="text-text-faint hover:text-text text-xs min-h-[28px] px-1">✕</button>
                    </div>
                  ) : lead?.linkedin_url ? (
                    <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue hover:underline">
                      <span className="text-[#0077b5] font-bold text-xs">in</span>
                      LinkedIn <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <button onClick={() => setSocialEditing("linkedin_url")}
                      className="text-xs text-text-faint hover:text-blue underline">+ Add LinkedIn</button>
                  )}

                  {/* Instagram */}
                  {socialEditing === "instagram_url" ? (
                    <div className="col-span-2 flex items-center gap-1.5">
                      <input value={socialValues.instagram_url || ""}
                        onChange={(e) => setSocialValues(v => ({ ...v, instagram_url: e.target.value }))}
                        placeholder="https://instagram.com/..."
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text focus:outline-none min-h-[28px]" />
                      <button onClick={handleSaveSocial} disabled={savingSocial}
                        className="text-green hover:underline text-xs min-h-[28px] px-1">
                        {savingSocial ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button onClick={() => setSocialEditing(null)}
                        className="text-text-faint hover:text-text text-xs min-h-[28px] px-1">✕</button>
                    </div>
                  ) : lead?.instagram_url ? (
                    <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue hover:underline">
                      <span className="text-[#e1306c] font-bold text-xs">ig</span>
                      Instagram <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <button onClick={() => setSocialEditing("instagram_url")}
                      className="text-xs text-text-faint hover:text-blue underline">+ Add Instagram</button>
                  )}

                  {/* Twitter / X */}
                  {socialEditing === "twitter_handle" ? (
                    <div className="col-span-2 flex items-center gap-1.5">
                      <input value={socialValues.twitter_handle || ""}
                        onChange={(e) => setSocialValues(v => ({ ...v, twitter_handle: e.target.value }))}
                        placeholder="https://twitter.com/... or https://x.com/..."
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text focus:outline-none min-h-[28px]" />
                      <button onClick={handleSaveSocial} disabled={savingSocial}
                        className="text-green hover:underline text-xs min-h-[28px] px-1">
                        {savingSocial ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button onClick={() => setSocialEditing(null)}
                        className="text-text-faint hover:text-text text-xs min-h-[28px] px-1">✕</button>
                    </div>
                  ) : lead?.twitter_handle ? (
                    <a href={lead.twitter_handle} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue hover:underline">
                      <span className="text-text-faint font-bold text-xs">𝕏</span>
                      Twitter / X <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    <button onClick={() => setSocialEditing("twitter_handle")}
                      className="text-xs text-text-faint hover:text-blue underline">+ Add Twitter / X</button>
                  )}
                </div>
              </div>

              {/* Channel buttons */}
              <div className="mt-4 pt-3 border-t border-border/40">
                <ChannelButtons
                  contactEmail={lead.contact_email || lead.email || undefined}
                  contactLinkedin={lead.contact_linkedin || undefined}
                  phone={lead.contact_phone || lead.phone || undefined}
                  lead={{
                    id: lead.id,
                    business_name: lead.business_name,
                    category: lead.category,
                    rating: lead.rating,
                    phone: lead.phone,
                    contact_phone: lead.contact_phone,
                  }}
                  onEmailCompose={() => {
                    const el = document.getElementById("email-composer");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                    if (!draftEmail) handleAISuggest(false);
                  }}
                  doNotContact={!!lead.doNotContact}
                />
              </div>
            </div>
          </Card>

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
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green/10 text-green font-medium">{t}</span>
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
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue/10 text-blue font-medium">{u}</span>
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
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-surface-2 text-text font-medium">
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
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber/10 text-amber font-medium">{p}</span>
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
        <div id="email-composer" className="lg:col-span-2 space-y-4">

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

          {/* ──────────────────────────────────────────────────────────────
              5) AI EMAIL COMPOSER
              Generate outreach email using contact + enrichment + review intelligence
              ────────────────────────────────────────────────────────────── */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border/40">
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
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
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

            <div className="px-4 py-3 bg-surface-2 border-t border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="rounded-full p-2 text-text-muted hover:text-text hover:bg-border/10 transition-colors"
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
          </Card>

          {/* ──────────────────────────────────────────────────────────────
              6) NOTES / ACTIVITY / SECONDARY DETAILS
              Useful but not core to the lead workflow
              ────────────────────────────────────────────────────────────── */}

          {/* Activity History */}
          <Card className="p-0">
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                <Clock className="w-4 h-4 text-text-faint" />
                Activity
                {allActivities.length > 0 && (
                  <span className="text-[10px] font-medium bg-surface-2 text-text-muted px-1.5 py-0.5 rounded-full">
                    {allActivities.length}
                  </span>
                )}
              </h3>
            </div>
            {allActivities.length > 0 ? (
              <div className="divide-y divide-border/40">
                {allActivities.map((activity) => (
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
                ))}
              </div>
            ) : (
              <div className="p-4">
                <p className="text-xs text-text-muted">No activity yet</p>
              </div>
            )}
          </Card>

          {/* Replies */}
          <Card>
            <div className="p-4">
              <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue" />
                Replies
                {repliesQuery.data?.replies?.length ? (
                  <span className="text-[10px] font-medium bg-blue/10 text-blue px-1.5 py-0.5 rounded-full">
                    {repliesQuery.data.replies.length}
                  </span>
                ) : null}
              </h3>
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
          </Card>

          {/* Notes */}
          <Card>
            <div className="p-4">
              <NotesEditor leadId={leadId} initialNotes={lead.notes ?? ""} />
            </div>
          </Card>
        </div>
      </div>
    </div>
    </>
  );
}

export const getServerSideProps = withAuth();
