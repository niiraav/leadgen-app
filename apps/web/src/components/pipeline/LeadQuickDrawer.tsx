import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Save,
  Calendar,
  PoundSterling,
  Clock,
  Mail,
  Phone,
  MapPin,
  Globe,
  Star,
  Tag,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  ChevronDown,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  MailOpen,
  Quote,
  Users,
  Lightbulb,
  Frown,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { daysFromNow, formatCompactDealValue, LOSS_REASON_LABELS } from "@leadgen/shared";
import { api } from "@/lib/api";
import type { PipelineLead } from "@/hooks/usePipelineBoard";
import { getDrawerVisibility } from "./drawer-visibility";
import { ChannelButtons } from "@/components/leads/ChannelButtons";

interface LeadQuickDrawerProps {
  lead: PipelineLead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function replySnippet(latestReply: any): string {
  if (!latestReply) return "";
  if (typeof latestReply === "string") return latestReply;
  if (typeof latestReply.body_plain === "string") return latestReply.body_plain;
  if (typeof latestReply.body_html === "string") return latestReply.body_html;
  if (typeof latestReply.body === "string") return latestReply.body;
  if (typeof latestReply.content === "string") return latestReply.content;
  if (typeof latestReply.text === "string") return latestReply.text;
  return "";
}

function replyIdFrom(latestReply: any): string | null {
  if (!latestReply) return null;
  if (typeof latestReply === "object" && latestReply !== null && typeof latestReply.id === "string") {
    return latestReply.id;
  }
  return null;
}

function sanitizeBio(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\*\*/g, "")           // bold markdown
    .replace(/\*/g, "")             // italic markdown
    .replace(/`/g, "")              // inline code
    .replace(/#{1,6}\s+/g, "")      // headings
    .replace(/\n{2,}/g, " ")        // collapse multiple newlines
    .replace(/\s+/g, " ")           // collapse whitespace
    .trim()
    .slice(0, 280);                 // hard cap (prompt says 200, give headroom)
}

function BioSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const clean = sanitizeBio(text);
  if (!clean) return null;
  const isLong = clean.length > 150;
  return (
    <div className="bg-surface-2 border border-border rounded-md px-3 py-2">
      <p className={`text-xs text-text leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
        {clean}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[11px] text-primary hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

export default function LeadQuickDrawer({ lead, isOpen, onClose, onUpdate }: LeadQuickDrawerProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [dealValue, setDealValue] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // ── Phase 4: Local optimistic reply state ──
  const [localLatestReply, setLocalLatestReply] = useState(lead?.latestReply ?? null);
  const [localUnreadCount, setLocalUnreadCount] = useState(lead?.unreadReplyCount ?? 0);

  useEffect(() => {
    setLocalLatestReply(lead?.latestReply ?? null);
    setLocalUnreadCount(lead?.unreadReplyCount ?? 0);
  }, [lead?.id]);

  // ── Phase 3: Bio generation local state ──
  const [bioText, setBioText] = useState<string | null>(lead?.ai_bio ?? null);
  const [bioGenerating, setBioGenerating] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  // ── Phase 3: Review summary local state ──
  const [reviewSummaryData, setReviewSummaryData] = useState<Record<string, unknown> | null>(lead?.review_summary ?? null);

  useEffect(() => {
    setBioText(lead?.ai_bio ?? null);
    setBioError(null);
  }, [lead?.id]);

  useEffect(() => {
    setReviewSummaryData(lead?.review_summary ?? null);
  }, [lead?.id]);

  useEffect(() => {
    if (lead) {
      setDealValue(lead.dealValue ? String(lead.dealValue / 100) : "");
      setFollowUpDate(lead.followUpDate ? lead.followUpDate.slice(0, 10) : "");
      setNotesText(lead.notes ?? "");
    }
  }, [lead]);

  // Compute visibility BEFORE any conditional hooks
  const v = lead ? getDrawerVisibility(lead) : null;
  const {
    data: healthData,
    isLoading: healthLoading,
  } = useQuery({
    queryKey: ["lead-health", lead?.id],
    queryFn: () => api.leads.getHealth(lead!.id),
    enabled: isOpen && !!lead?.id && (v?.showHealth ?? false),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // ── Phase 4: Reply mutations with optimistic UI ──
  const markHandledMutation = useMutation({
    mutationFn: (id: string) => api.replies.handled(id, "archive"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["leads", { view: "pipeline" }] });
      const previous = queryClient.getQueryData(["leads", { view: "pipeline" }]);
      const originalLatestReply = lead?.latestReply ?? null;
      const originalUnreadCount = lead?.unreadReplyCount ?? 0;

      queryClient.setQueryData(["leads", { view: "pipeline" }], (old: any) => {
        if (!old) return old;
        return old.map((l: any) =>
          l.id === lead?.id
            ? { ...l, latestReply: null, unreadReplyCount: 0 }
            : l
        );
      });

      setLocalLatestReply(null);
      setLocalUnreadCount(0);
      return { previous, originalLatestReply, originalUnreadCount };
    },
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(["leads", { view: "pipeline" }], context?.previous);
      setLocalLatestReply((context as any)?.originalLatestReply ?? lead?.latestReply ?? null);
      setLocalUnreadCount((context as any)?.originalUnreadCount ?? lead?.unreadReplyCount ?? 0);
      toast.error("Failed to mark handled");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.replies.read(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["leads", { view: "pipeline" }] });
      const previous = queryClient.getQueryData(["leads", { view: "pipeline" }]);
      const originalUnreadCount = lead?.unreadReplyCount ?? 0;

      queryClient.setQueryData(["leads", { view: "pipeline" }], (old: any) => {
        if (!old) return old;
        return old.map((l: any) =>
          l.id === lead?.id
            ? { ...l, unreadReplyCount: 0 }
            : l
        );
      });

      setLocalUnreadCount(0);
      return { previous, originalUnreadCount };
    },
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(["leads", { view: "pipeline" }], context?.previous);
      setLocalUnreadCount((context as any)?.originalUnreadCount ?? lead?.unreadReplyCount ?? 0);
      toast.error("Failed to mark read");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  if (!isOpen || !lead) return null;

  const quickOptions = [
    { label: "Tomorrow", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
  ];

  const handleQuick = (days: number) => {
    const d = daysFromNow(days);
    setFollowUpDate(d.toISOString().slice(0, 10));
    handleSave({ followUpDate: d.toISOString() });
  };

  const handleSave = async (override?: Record<string, unknown>) => {
    if (!lead) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = override || {};
      if (!override) {
        const val = dealValue ? Math.round(parseFloat(dealValue) * 100) : null;
        data.dealValue = val;
        if (followUpDate) {
          const d = new Date(followUpDate);
          d.setUTCHours(0, 0, 0, 0);
          data.followUpDate = d.toISOString();
        } else {
          data.followUpDate = null;
        }
      }
      await onUpdate(lead.id, data);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const handleNotesBlur = async () => {
    if (!lead) return;
    const trimmed = notesText.trim();
    const currentNotes = (lead.notes ?? "").trim();
    if (trimmed === currentNotes) return;

    setNotesSaving(true);
    try {
      await onUpdate(lead.id, { notes: trimmed || null });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 1500);
    } catch (e) {
      console.error("Notes save failed", e);
    } finally {
      setNotesSaving(false);
    }
  };

  const handleGenerateBio = async () => {
    if (!lead) return;
    setBioGenerating(true);
    setBioError(null);
    try {
      const res = await api.leadActions.generateBio(lead.id, 200);
      const generated = res?.bio ?? res?.ai_bio ?? res?.text ?? null;
      if (generated) {
        setBioText(generated);
      } else if (res?.status === 402 || res?.code === 402 || res?.upgradeRequired) {
        setBioError("Start your free 14-day trial to generate AI bios.");
      } else {
        setBioText("Bio generated.");
      }
    } catch (e: any) {
      if (e?.status === 402 || e?.response?.status === 402) {
        setBioError("Start your free 14-day trial to generate AI bios.");
      } else {
        setBioError("Failed to generate bio. Please try again.");
      }
    } finally {
      setBioGenerating(false);
    }
  };

  const healthColor =
    healthData?.follow_up_health === "red"
      ? "text-destructive"
      : healthData?.follow_up_health === "amber"
      ? "text-warning"
      : healthData?.follow_up_health === "green"
      ? "text-success"
      : "text-text-muted";

  const healthLabel =
    healthData?.follow_up_health === "red"
      ? "Overdue"
      : healthData?.follow_up_health === "amber"
      ? "Due today"
      : healthData?.follow_up_health === "green"
      ? "On track"
      : "No follow-up";

  const healthDot =
    healthData?.follow_up_health === "red"
      ? "bg-red-500"
      : healthData?.follow_up_health === "amber"
      ? "bg-amber-500"
      : healthData?.follow_up_health === "green"
      ? "bg-green-500"
      : "bg-gray-300";

  // Derive reply id from local state
  const activeReplyId = replyIdFrom(localLatestReply);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="relative bg-surface border-l border-border w-full max-w-md h-full overflow-y-auto animate-slide-in-right">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text">{lead.business_name}</h3>
            <p className="text-xs text-text-muted mt-0.5">{lead.email || lead.phone || "No contact"}</p>
          </div>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* ── URGENT ── */}

          {/* DNC Banner */}
          {v?.showDncBanner && lead.doNotContact && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-100 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-xs font-medium text-red-600">Do Not Contact</span>
            </div>
          )}

          {/* Reply Preview */}
          {v?.showReplyPreview && localLatestReply && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Latest Reply
                </span>
                {(localUnreadCount ?? 0) > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-[10px] text-white font-bold">
                    {(localUnreadCount ?? 0) > 9 ? '9+' : localUnreadCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-text line-clamp-2">{replySnippet(localLatestReply)}</p>
              <p className="text-[11px] text-text-faint mt-1.5">
                {relativeTime(localLatestReply?.received_at || localLatestReply?.created_at || localLatestReply?.timestamp)}
              </p>

              {/* Reply Actions */}
              {v?.showReplyActions && activeReplyId && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => markHandledMutation.mutate(activeReplyId)}
                    disabled={markHandledMutation.isPending}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-surface-2 border border-border text-text-muted hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    {markHandledMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    Mark handled
                  </button>
                  {(localUnreadCount ?? 0) > 0 && (
                    <button
                      onClick={() => markReadMutation.mutate(activeReplyId)}
                      disabled={markReadMutation.isPending}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-surface-2 border border-border text-text-muted hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                      {markReadMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <MailOpen className="w-3 h-3" />
                      )}
                      Mark read
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ACTION ── */}

          {/* Follow-up */}
          {v?.showFollowUp && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-2">
              <Calendar className="w-3.5 h-3.5" />
              Follow-up date
            </label>

            <div className="relative mb-3">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                onBlur={() => handleSave()}
                className="input pl-9 text-sm"
              />
            </div>

            <div className="flex gap-2">
              {quickOptions.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => handleQuick(opt.days)}
                  className="flex-1 py-1.5 px-1 rounded-md text-[11px] font-medium bg-surface-2 border border-border text-text-muted hover:bg-secondary transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Deal Value */}
          {v?.showDealValue && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-2">
              <PoundSterling className="w-3.5 h-3.5" />
              Deal value
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-faint">£</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                onBlur={() => handleSave()}
                className="input pl-6 text-sm"
                placeholder="0.00"
              />
            </div>
            {lead.dealValue && lead.dealValue > 0 && (
              <p className="text-[11px] text-text-faint mt-1">
                Current: {formatCompactDealValue(lead.dealValue)}
              </p>
            )}
          </div>
          )}

          {/* Channel action buttons (email, WhatsApp, SMS, LinkedIn, Call) */}
          {v?.showComposer && (
            <div>
              <ChannelButtons
                contactEmail={lead.contact_email || lead.email || undefined}
                contactLinkedin={lead.contact_linkedin || lead.linkedin_url || undefined}
                phone={lead.contact_phone || lead.phone || undefined}
                lead={{
                  id: lead.id,
                  business_name: lead.business_name,
                  category: lead.category || undefined,
                  rating: lead.rating ?? undefined,
                  phone: lead.phone || undefined,
                  contact_phone: lead.contact_phone || undefined,
                }}
                onEmailCompose={() => {
                  router.push(`/leads/${lead.id}?action=compose`);
                  onClose();
                }}
                doNotContact={!!lead.doNotContact}
                compact
              />
            </div>
          )}

          {/* Save indicator */}
          {saved && (
            <div className="flex items-center gap-1.5 text-[11px] text-success">
              <Save className="w-3 h-3" />
              Saved
            </div>
          )}
          {saving && (
            <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Saving...
            </div>
          )}

          {/* ── HEALTH ── */}
          {/* Health Strip */}
          {v?.showHealth && (
            <div>
              {healthLoading ? (
                <div className="space-y-2">
                  <div className="h-4 bg-surface-2 rounded animate-pulse w-3/4" />
                  <div className="h-4 bg-surface-2 rounded animate-pulse w-1/2" />
                </div>
              ) : healthData ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`w-2 h-2 rounded-full ${healthDot}`} />
                  <span className={`text-xs font-medium ${healthColor}`}>{healthLabel}</span>
                  {healthData.days_since_activity !== null && healthData.days_since_activity !== undefined && (
                    <span className="text-[11px] text-text-muted">
                      {healthData.days_since_activity}d since activity
                    </span>
                  )}
                  {healthData.stale && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      Stale
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* ── NOTES ── */}
          {v?.showNotes && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-2">
                <FileText className="w-3.5 h-3.5" />
                Notes
              </label>
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Add notes about this lead..."
                rows={3}
                maxLength={2000}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
              />
              {lead.notes && lead.notes.trim().length > 0 && (
                <div className="mt-2 rounded-lg border border-border bg-surface p-3">
                  <p className="text-xs text-text whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1.5 min-h-[16px]">
                  {notesSaving && (
                    <span className="text-[11px] text-text-faint flex items-center gap-1">
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </span>
                  )}
                  {notesSaved && !notesSaving && (
                    <span className="text-[11px] text-success flex items-center gap-1">
                      <Save className="w-3 h-3" />
                      Saved
                    </span>
                  )}
                </div>
                {notesText.length > 1800 && (
                  <span className={`text-[11px] ${notesText.length >= 1950 ? "text-warning" : "text-text-muted"}`}>
                    {2000 - notesText.length} remaining
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── CONTEXT ── */}

          {/* Contact Block */}
          {v?.showContactBlock && (
            <details open={v.expandContactBlock} className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <span className="text-xs font-semibold text-text">Contact</span>
                <ChevronDown className="w-4 h-4 text-text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-2">
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                    <span className="text-xs text-text">{lead.email}</span>
                    {v?.showEmailVerification && lead.email_status && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 border border-border text-text-muted">
                        {lead.email_status}
                      </span>
                    )}
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                    <span className="text-xs text-text">{lead.phone}</span>
                  </div>
                )}
                {(lead.address || lead.city || lead.country) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-text-muted flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-text">
                      {[lead.address, lead.city, lead.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {lead.website_url && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                    <a
                      href={lead.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline truncate"
                    >
                      {lead.website_url}
                    </a>
                  </div>
                )}

                {/* Enrichment contact block — New only */}
                {v?.showEnrichmentContact && (lead.contact_full_name || lead.contact_title || lead.contact_email || lead.contact_phone) && (
                  <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                    {lead.contact_full_name && (
                      <p className="text-xs text-text">
                        <span className="text-text-muted">Name:</span> {lead.contact_full_name}
                        {lead.contact_title && <span className="text-text-muted"> — {lead.contact_title}</span>}
                      </p>
                    )}
                    {lead.contact_email && (
                      <p className="text-xs text-text">
                        <span className="text-text-muted">Email:</span> {lead.contact_email}
                      </p>
                    )}
                    {lead.contact_phone && (
                      <p className="text-xs text-text">
                        <span className="text-text-muted">Phone:</span> {lead.contact_phone}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </details>
          )}

          {/* ── INTEL ── */}

          {/* AI Bio */}
          {v?.showAiBio && (bioText || !lead.ai_bio) && (
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  AI Bio
                </span>
                <ChevronDown className="w-4 h-4 text-text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2">
                {bioText ? (
                  <BioSummary text={bioText} />
                ) : bioError ? (
                  <p className="text-xs text-warning">{bioError}</p>
                ) : (
                  <button
                    onClick={handleGenerateBio}
                    disabled={bioGenerating}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded bg-surface-2 border border-border text-text-muted hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    {bioGenerating ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        Generate bio
                      </>
                    )}
                  </button>
                )}
              </div>
            </details>
          )}

          {/* Review Summary */}
          {v?.showReviewSummary && reviewSummaryData && (
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
                  <Quote className="w-3.5 h-3.5 text-text-muted" />
                  Review Summary
                </span>
                <ChevronDown className="w-4 h-4 text-text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-3">
                {/* Themes */}
                {Array.isArray(reviewSummaryData.themes) && reviewSummaryData.themes.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-text-muted mb-1.5 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      Themes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(reviewSummaryData.themes as string[]).map((theme: string, i: number) => (
                        <span
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-text-muted"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pain Points */}
                {Array.isArray(reviewSummaryData.pain_points) && reviewSummaryData.pain_points.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-text-muted mb-1.5 flex items-center gap-1">
                      <Frown className="w-3 h-3" />
                      Pain Points
                    </p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {(reviewSummaryData.pain_points as string[]).map((point: string, i: number) => (
                        <li key={i} className="text-xs text-text">{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* USP Candidates */}
                {Array.isArray(reviewSummaryData.usp_candidates) && reviewSummaryData.usp_candidates.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-text-muted mb-1.5 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      USP Candidates
                    </p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {(reviewSummaryData.usp_candidates as string[]).map((usp: string, i: number) => (
                        <li key={i} className="text-xs text-text">{usp}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Staff Names */}
                {Array.isArray(reviewSummaryData.staff_names) && reviewSummaryData.staff_names.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-text-muted mb-1 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Staff Names
                    </p>
                    <p className="text-xs text-text">{(reviewSummaryData.staff_names as string[]).join(", ")}</p>
                  </div>
                )}

                {/* Owner Name + Evidence */}
                {(!!reviewSummaryData.owner_name || !!reviewSummaryData.owner_evidence) && (
                  <div>
                    <p className="text-[11px] font-medium text-text-muted mb-1 flex items-center gap-1">
                      <Crown className="w-3 h-3" />
                      Owner
                    </p>
                    {!!reviewSummaryData.owner_name && (
                      <p className="text-xs text-text font-medium">{(reviewSummaryData.owner_name as string)}</p>
                    )}
                    {!!reviewSummaryData.owner_evidence && (
                      <blockquote className="mt-1 text-[11px] text-text-muted italic border-l-2 border-border pl-2">
                        {(reviewSummaryData.owner_evidence as string)}
                      </blockquote>
                    )}
                  </div>
                )}
              </div>
            </details>
          )}

          {/* ── META ── */}

          {/* Rating + Reviews */}
          {v?.showRating && (lead.rating || lead.review_count) && (
            <div className="flex items-center gap-2">
              {lead.rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                  <span className="text-xs font-medium text-text">{lead.rating}</span>
                </div>
              )}
              {lead.review_count !== null && lead.review_count !== undefined && (
                <span className="text-[11px] text-text-muted">
                  {lead.review_count} review{lead.review_count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Category + Tags */}
          {v?.showCategoryTags && (lead.category || (lead.tags && lead.tags.length > 0)) && (
            <div className="flex flex-wrap items-center gap-2">
              {lead.category && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-text-muted">
                  <Tag className="w-3 h-3" />
                  {lead.category}
                </span>
              )}
              {lead.tags?.map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Loss Reason */}
          {v?.showLossReason && lead.lossReason && (
            <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2">
              <p className="text-[11px] font-medium text-red-600">
                Lost: {LOSS_REASON_LABELS[lead.lossReason] || lead.lossReason}
              </p>
              {lead.lossReasonNotes && (
                <p className="text-[11px] text-red-500 mt-1">{lead.lossReasonNotes}</p>
              )}
            </div>
          )}

          {/* Last Activity */}
          {v?.showLastActivity && lead.lastActivity && (
            <div className="text-[11px] text-text-muted">
              {lead.lastActivity.label && <span>{lead.lastActivity.label}</span>}
              {lead.lastActivity.timestamp && (
                <span className="ml-1">— {relativeTime(lead.lastActivity.timestamp as unknown as string)}</span>
              )}
            </div>
          )}

          {/* ── FOOTER ── */}

          {/* Footer: Open Full Profile */}
          {v?.showFooter && (
            <div className="pt-2 border-t border-border">
              <Link
                href={`/leads/${lead.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                onClick={onClose}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open full profile
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
