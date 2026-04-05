"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { mockLeads } from "@/lib/mock-data";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { HotScoreBadge, Badge } from "@/components/ui/badge";
import {
  Mail,
  Phone,
  MapPin,
  Globe,
  ExternalLink,
  Users,
  DollarSign,
  Briefcase,
  Sparkles,
  Send,
  Loader2,
  Copy,
  Check,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  FileText,
  Clock,
} from "lucide-react";

const emailTemplates = [
  {
    id: "intro",
    label: "Introduction",
    content: `Hi {name},

I came across {company} while researching innovative {industry} companies in {location}, and I'm impressed by what you're building.

I help companies like yours streamline their lead generation and outreach with intelligent automation. Given your role as {title}, I thought there might be an interesting conversation to have about how we could help {company} scale your pipeline.

Would you be open to a quick 15-minute call this week?

Best,
[Your Name]`,
  },
  {
    id: "value",
    label: "Value Proposition",
    content: `Hi {name},

Following up on my previous email — I wanted to share a quick example of how we've helped similar companies:

• Generated 47 qualified leads in the first 30 days
• Reduced manual prospecting time by 62%
• Achieved a 38% reply rate with AI-personalized outreach

I'd love to show you how this could work for {company}. Are you available for a brief demo this week?

Best,
[Your Name]`,
  },
  {
    id: "followup",
    label: "Follow-up",
    content: `Hi {name},

I wanted to follow up on my email from earlier this week. 

I know your schedule is busy — I'll keep this brief. I built a quick profile of how our solution could help {company} grow, and I'd love to walk you through it.

No pressure at all — just let me know if you'd be open to a quick chat.

Best,
[Your Name]`,
  },
  {
    id: "breakup",
    label: "Break-up",
    content: `Hi {name},

This will be my last email — I don't want to clutter your inbox.

If lead generation automation isn't a priority right now, I completely understand. If things change down the road, feel free to reach out anytime.

In the meantime, here's a link to our latest case study in case it's interesting: [link]

Wishing you and the team at {company} all the best.

Cheers,
[Your Name]`,
  },
];

export default function LeadProfilePage() {
  const params = useParams();
  const leadId = params.id as string;
  const lead = mockLeads.find((l) => l.id === leadId);

  const [draftEmail, setDraftEmail] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Email history mock data
  const emailHistory = [
    {
      id: "em-1",
      subject: "Quick question about lead generation",
      sentAt: "Jan 10, 2025 2:30 PM",
      opened: true,
      replied: false,
    },
    {
      id: "em-2",
      subject: "Following up — demo for TechFlow",
      sentAt: "Jan 13, 2025 10:15 AM",
      opened: true,
      replied: true,
    },
  ];

  useEffect(() => {
    if (lead && emailTemplates.length > 0) {
      populateTemplate(emailTemplates[selectedTemplate].content);
    }
  }, [lead, selectedTemplate]);

  const populateTemplate = (template: string) => {
    if (!lead) return;
    const filled = template
      .replace("{name}", lead.name.split(" ")[0])
      .replace("{company}", lead.company)
      .replace("{industry}", lead.industry)
      .replace("{location}", lead.location)
      .replace("{title}", lead.title);
    setDraftEmail(filled);
  };

  const handleAISuggest = async () => {
    if (!lead) return;
    setEmailLoading(true);
    // Simulate AI composing
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const aiEmail = `Hi ${lead.name.split(" ")[0]},

I was researching leading ${lead.industry} companies in ${lead.location} and ${lead.company} caught my attention — especially your work with ${lead.employees > 50 ? "enterprise" : "growth-stage"} teams.

At LeadGen, we're helping ${lead.industry} professionals like yourself automate prospecting and increase pipeline velocity by 3x. Our AI identifies high-intent prospects and crafts personalized outreach that converts at 38%+ reply rates.

I'd love to show you a quick demo of how this could work for ${lead.company}. Are you free for a 15-min call this Thursday or Friday?

Best,
[Your Name]
LeadGen | Smart Lead Generation`;

    setDraftEmail(aiEmail);
    setEmailLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(draftEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!lead || !draftEmail) return;
    setEmailLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setEmailSent(true);
    setEmailLoading(false);
    setTimeout(() => setEmailSent(false), 3000);
  };

  if (!lead) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="card text-center py-12">
          <p className="text-text-muted">Lead not found</p>
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
            <h1 className="text-2xl font-bold text-text tracking-tight">{lead.name}</h1>
            <HotScoreBadge score={lead.hotScore} />
          </div>
          <p className="text-sm text-text-muted">
            {lead.title} at {lead.company}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-fainted mt-1.5">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />{lead.location}
            </span>
          </div>
        </div>
        <Badge
          variant={
            lead.status === "new"
              ? "default"
              : lead.status === "won"
              ? "default"
              : "secondary"
          }
          className="capitalize"
        >
          {lead.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Details */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardTitle>Contact Info</CardTitle>
            <div className="space-y-3 mt-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-text-faint shrink-0" />
                <span className="text-text">{lead.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-text-faint shrink-0" />
                <span className="text-text">{lead.phone}</span>
              </div>
              {lead.social.linkedin && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="w-4 h-4 text-text-faint shrink-0" />
                  <a
                    href={`https://${lead.social.linkedin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:underline flex items-center gap-1"
                  >
                    LinkedIn
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {lead.website && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="w-4 h-4 text-text-faint shrink-0" />
                  <a
                    href={`https://${lead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:underline flex items-center gap-1"
                  >
                    {lead.website}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Company</CardTitle>
            <div className="space-y-3 mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> Industry
                </span>
                <span className="text-text font-medium">{lead.industry}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted flex items-center gap-2">
                  <Users className="w-4 h-4" /> Size
                </span>
                <span className="text-text font-medium">{lead.employees} employees</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Revenue
                </span>
                <span className="text-text font-medium">{lead.revenue}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Location
                </span>
                <span className="text-text font-medium">{lead.location}</span>
              </div>
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
              History ({emailHistory.length})
            </button>
          </div>

          {activeTab === "compose" && (
            <Card className="p-0 overflow-hidden">
              {/* Template Selector */}
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

                {/* Templates */}
                <div className="flex flex-wrap gap-1.5">
                  {emailTemplates.map((tmpl, i) => (
                    <button
                      key={tmpl.id}
                      onClick={() => {
                        setSelectedTemplate(i);
                        populateTemplate(tmpl.content);
                      }}
                      className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition-all ${
                        i === selectedTemplate
                          ? "bg-accent text-accent-text"
                          : "bg-surface-2 text-text-muted hover:text-text"
                      }`}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div className="px-4 pt-3">
                <input
                  type="text"
                  placeholder="Subject line..."
                  defaultValue={`Quick question about ${lead.company}'s lead generation`}
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
              <div className="divide-y divide-border/40">
                {emailHistory.map((email) => (
                  <div key={email.id} className="p-4 hover:bg-surface-2/50 transition-colors">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium text-text">{email.subject}</p>
                        <div className="flex items-center gap-2 text-xs text-text-faint mt-0.5">
                          <Clock className="w-3 h-3" />
                          {email.sentAt}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {email.opened && (
                          <Badge variant="secondary" className="text-[10px]">
                            Opened
                          </Badge>
                        )}
                        {email.replied && (
                          <Badge
                            variant="default"
                            className="text-[10px] bg-green/10 text-green border-green/20"
                          >
                            Replied
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
