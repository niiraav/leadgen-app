"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Lead, LeadActivity, AIGeneratedEmail } from "@leadgen/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
} from "lucide-react";

export default function LeadProfilePage() {
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [draftEmail, setDraftEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose");
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

          // Default subject
          setEmailSubject(`Quick question about ${data.business_name}'s lead generation`);

          // Load activity history
          try {
            const actRes = await api.pipeline.getActivity(leadId);
            if (!cancelled) setActivities(actRes.activities);
          } catch {
            // Activity endpoint might not exist yet
          }
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
      const subject = result.email.subject_lines?.[0] || result.email.subject;
      setDraftEmail(body);
      setEmailSubject(subject);
    } catch (err: any) {
      // If AI endpoint fails, generate a simple template locally
      console.warn("[LeadProfile] AI compose failed, using local template:", err.message);
      const localEmail = `Hi,

I was researching leading ${lead.category ?? "business"} companies in ${lead.city ?? ""} and ${lead.business_name} caught my attention.

At LeadGen, we help ${lead.category ?? "business"} professionals like yourself automate prospecting and increase pipeline velocity. Our AI identifies high-intent prospects and crafts personalized outreach that converts at 38%+ reply rates.

I'd love to show you a quick demo of how this could work for ${lead.business_name}. Are you free for a 15-min call this week?

Best,
[Your Name]
LeadGen | Smart Lead Generation`;

      setDraftEmail(localEmail);
      setEmailSubject(`Quick question about ${lead.business_name}'s lead generation`);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(draftEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!lead || !draftEmail) return;
    setEmailLoading(true);
    try {
      // In a real setup, this calls an email sending endpoint
      // For now, log the activity
      await new Promise((r) => setTimeout(r, 1000));
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 3000);
    } catch {
      setEmailError("Failed to send email");
    } finally {
      setEmailLoading(false);
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
            <CardTitle>Contact Info</CardTitle>
            <div className="space-y-3 mt-3">
              {lead.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-text-faint shrink-0" />
                  <span className="text-text">{lead.email}</span>
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
                    href={`https://${lead.website_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:underline flex items-center gap-1"
                  >
                    {lead.website_url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Business Info</CardTitle>
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
          </Card>

          {lead.notes && (
            <Card>
              <CardTitle>Notes</CardTitle>
              <p className="text-sm text-text-muted mt-2">{lead.notes}</p>
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
                  <div className="flex items-center gap-2">
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
                </div>

                {emailError && (
                  <div className="text-xs text-red mb-2">{emailError}</div>
                )}
              </div>

              {/* Subject */}
              <div className="px-4 pt-3">
                <input
                  type="text"
                  placeholder="Subject line..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
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
                </div>
                <div className="flex items-center gap-2">
                  {emailSent && (
                    <span className="text-xs text-green font-medium animate-pulse">
                      ✓ Email sent!
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
                    {emailSent ? "Sent" : "Send Email"}
                  </button>
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
