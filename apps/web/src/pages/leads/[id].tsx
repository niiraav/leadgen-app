import { withAuth } from "@/lib/auth";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { api } from "@/lib/api";
import type { Lead, LeadActivity } from "@leadgen/shared";
import { Card } from "@/components/ui/card";
import { HotScoreBadge, Badge } from "@/components/ui/badge";
import {
  Mail,
  Phone,
  MapPin,
  Globe,
  ExternalLink,
  Sparkles,
  Send,
  Loader2,
  Copy,
  Check,
  MessageSquare,
  Clock,
  AlertCircle,
  Pencil,
  X,
} from "lucide-react";

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

export default function LeadProfilePage() {
  const router = useRouter();
  const leadId = router.query.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [draftEmail, setDraftEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [selectedSubjectIdx, setSelectedSubjectIdx] = useState<number>(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose");
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ email: "", phone: "", website_url: "", city: "", category: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const hasEmail = !!(lead?.email && lead.email.trim().length > 0);

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

      // Send changed fields (empty string to clear, string value to set)
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
        setLead((prev) => prev ? { ...prev, ...updates } : null);
      }
      setEditing(false);
    } catch (err: any) {
      console.error("[LeadProfile] Failed to save:", err.message);
      setError(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch lead data + history
  useEffect(() => {
    let cancelled = false;

    async function getData() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.leads.get(leadId);
        if (!cancelled) {
          setLead(data);
          setEmailSubject(`Quick question about ${data.business_name}'s lead generation`);

          try {
            const actRes = await api.pipeline.getActivity(leadId);
            if (!cancelled) setActivities(actRes.activities);
          } catch { /* ignore */ }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("[LeadProfile] Failed to load lead:", err.message);
          setError(`Failed to load lead: ${err.message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    getData();
    return () => { cancelled = true; };
  }, [leadId]);

  // ── AI Suggest ──
  const handleAISuggest = async () => {
    if (!lead) return;
    setEmailLoading(true);
    setEmailError(null);

    try {
      const result = await api.ai.composeEmail(lead.id, {
        tone: "professional",
        purpose: "Introduction and outreach for lead generation automation",
      });

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
      console.warn("[LeadProfile] AI compose failed, using local template:", err.message);
      const subjects = FALLBACK_SUBJECTS(lead);
      setSubjectOptions(subjects);
      setSelectedSubjectIdx(0);
      setEmailSubject(subjects[0]);
      setDraftEmail(FALLBACK_BODY(lead));
    } finally {
      setEmailLoading(false);
    }
  };

  // ── Copy ──
  const handleCopy = () => {
    const text = `Subject: ${emailSubject}\n\n${draftEmail}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Send via mailto ──
  const handleSend = async () => {
    if (!lead || !draftEmail || !hasEmail) return;

    const subject = subjectOptions[selectedSubjectIdx] ?? emailSubject;
    const body = draftEmail;

    // 1. Open mailto:
    const mailtoUri = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUri;

    // 2. Update lead status to 'contacted' if still 'new' (with activity note)
    if (lead.status === "new") {
      try {
        await api.pipeline.updateStatus(leadId, "contacted", `Email sent: ${subject}`);
        setLead((prev) => prev ? { ...prev, status: "contacted" } : null);
      } catch (err) {
        console.warn("[LeadProfile] Failed to update status:", err);
      }
    }

    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 4000);
  };

  // ── Copy fallback for mobile ──
  const handleCopyFull = () => {
    const subject = subjectOptions[selectedSubjectIdx] ?? emailSubject;
    const text = `Subject: ${subject}\n\n${draftEmail}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
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
        <Badge className="capitalize">
          {lead.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Details */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text">Contact Info</h3>
                {!editing && (
                  <button
                    onClick={startEditing}
                    className="rounded-full p-1.5 text-text-faint hover:text-blue hover:bg-blue/5 transition-colors"
                    title="Edit lead info"
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
              <div className="space-y-3 mt-3">
                {editing ? (
                  <>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="Add email..."
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Phone</label>
                      <input
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="Add phone..."
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Website</label>
                      <input
                        type="url"
                        value={editForm.website_url}
                        onChange={(e) => setEditForm((f) => ({ ...f, website_url: e.target.value }))}
                        placeholder="Add website..."
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">City</label>
                      <input
                        type="text"
                        value={editForm.city}
                        onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                        placeholder="Add city..."
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Category</label>
                      <input
                        type="text"
                        value={editForm.category}
                        onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                        placeholder="Add category..."
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Address</label>
                      <input
                        type="text"
                        value={editForm.address}
                        onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                        placeholder="Add address..."
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Notes</label>
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Add notes..."
                        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
                        rows={3}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {lead.email ? (
                      <div className="flex items-center gap-3 text-sm">
                        <Mail className="w-4 h-4 text-text-faint shrink-0" />
                        <span className="text-text">{lead.email}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-sm">
                        <AlertCircle className="w-4 h-4 text-red shrink-0" />
                        <span className="text-xs text-text-muted">No email — enrich this lead first</span>
                      </div>
                    )}
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
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue hover:underline flex items-center gap-1"
                        >
                          {lead.website_url?.replace(/^https?:\/\//, '')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    {!lead.email && !lead.phone && !lead.website_url && (
                      <p className="text-xs text-text-faint italic">Click the pencil icon above to add contact info</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4">
              <h3 className="text-sm font-semibold text-text">Business Info</h3>
              <div className="space-y-3 mt-3">
                {lead.category && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Category</span>
                    <span className="text-text font-medium">{lead.category}</span>
                  </div>
                )}
                {lead.city && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Location</span>
                    <span className="text-text font-medium">{lead.city}, {lead.country}</span>
                  </div>
                )}
                {lead.rating !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Rating</span>
                    <span className="text-text font-medium">★ {lead.rating}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Reviews</span>
                  <span className="text-text font-medium">{lead.review_count ?? 0}</span>
                </div>
                {lead.address && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Address</span>
                    <span className="text-text font-medium">{lead.address}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {lead.notes && (
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-text">Notes</h3>
                <p className="text-sm text-text-muted mt-2">{lead.notes}</p>
              </div>
            </Card>
          )}
        </div>

        {/* Email Composer */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-surface-2 rounded-full p-1 w-fit">
            <button
              onClick={() => setActiveTab("compose")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                activeTab === "compose"
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Compose
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                activeTab === "history"
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              History ({activities.length})
            </button>
          </div>

          {activeTab === "compose" && (
            <Card className="p-0 overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-border/40">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue" />
                    AI Email Composer
                  </h3>
                  <button
                    onClick={handleAISuggest}
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
                        AI Suggest
                      </>
                    )}
                  </button>
                </div>

                {emailError && (
                  <div className="text-xs text-red mb-2">{emailError}</div>
                )}

                {/* Subject line chips */}
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

              {/* Subject input */}
              <div className="px-4 pt-3">
                <input
                  type="text"
                  placeholder="Subject line..."
                  value={emailSubject}
                  onChange={(e) => {
                    setEmailSubject(e.target.value);
                    // If user edits the subject field, sync with chips
                    const matchIdx = subjectOptions.indexOf(e.target.value);
                    if (matchIdx >= 0) setSelectedSubjectIdx(matchIdx);
                  }}
                  className="w-full px-0 py-2 text-sm font-medium bg-transparent border-0 text-text placeholder:text-text-faint focus:outline-none focus:ring-0"
                />
              </div>

              {/* Email Body */}
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

              {/* Footer Actions */}
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

                  {/* Mobile copy fallback button */}
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
                  {/* No email tooltip / disabled state */}
                  {!hasEmail ? (
                    <div className="relative group">
                      <button
                        disabled
                        className="btn btn-primary text-xs py-1.5 h-8 opacity-50 cursor-not-allowed"
                      >
                        <Send className="w-3.5 h-3.5" />
                        No email address
                      </button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48">
                        <div className="text-xs text-text bg-surface border border-border rounded-lg px-3 py-2 shadow-lg">
                          <AlertCircle className="w-3 h-3 inline mr-1 text-red" />
                          No email address — enrich this lead first
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
                        disabled={emailLoading || !draftEmail}
                        className="btn btn-primary text-xs py-1.5 h-8 disabled:opacity-50"
                      >
                        {emailLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        {emailSent ? "Queued" : "Send Email"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )}

          {activeTab === "history" && (
            <Card className="p-0">
              {activities.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {activities.map((activity) => (
                    <div key={activity.id} className="p-4 hover:bg-surface-2/50 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-text">{activity.description}</p>
                        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                          <Clock className="w-3 h-3" />
                          {new Date(activity.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <MessageSquare className="w-8 h-8 text-text-faint mx-auto mb-2" />
                  <p className="text-sm text-text-muted">No activity yet</p>
                  <p className="text-xs text-text-faint mt-1">Activity will appear here as you interact with this lead</p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
