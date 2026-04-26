import React, { useState, useEffect, useCallback } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtimeSocket, type ReplyNotification } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Portal } from '@/components/ui/portal';
import FocusTrap from 'focus-trap-react';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import {
  X,
  ArrowLeft,
  Mail,
  Reply as ReplyIcon,
  Copy,
  Check,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Send,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Archive,
  Ban,
  ArrowUpRight,
  Phone,
  MapPin,
  Globe,
  Star,
  Tag,
  Calendar,
  Frown,
  Flame,
  User,
} from 'lucide-react';

interface ReplyDrawerProps {
  replyId: string | null;
  leadId?: string | null; // optional: fetch full lead profile to show alongside reply
  isOpen: boolean;
  onClose: () => void;
}

const intentMeta: Record<string, { label: string; colour: string; textClass: string; icon: React.ReactNode }> = {
  interested: { label: 'Interested', colour: 'bg-success hover:bg-success/90', textClass: 'text-success-foreground', icon: <Sparkles className="h-3 w-3 mr-1" /> },
  'not-interested': { label: 'Not Interested', colour: 'bg-destructive hover:bg-destructive/90', textClass: 'text-destructive-foreground', icon: <ShieldAlert className="h-3 w-3 mr-1" /> },
  'needs-info': { label: 'Needs Info', colour: 'bg-warning hover:bg-warning/90', textClass: 'text-warning-foreground', icon: <AlertTriangle className="h-3 w-3 mr-1" /> },
  'out-of-office': { label: 'Out of Office', colour: 'bg-primary hover:bg-primary/90', textClass: 'text-primary-foreground', icon: <Clock className="h-3 w-3 mr-1" /> },
  'forwarded-to-colleague': { label: 'Forwarded', colour: 'bg-primary hover:bg-primary/90', textClass: 'text-primary-foreground', icon: <Send className="h-3 w-3 mr-1" /> },
  'no-intent-detected': { label: 'No Intent', colour: 'bg-muted-foreground hover:bg-muted-foreground/90', textClass: 'text-primary-foreground', icon: <Bot className="h-3 w-3 mr-1" /> },
};

function IntentBadge({ intent }: { intent: string }) {
  const meta = intentMeta[intent] ?? intentMeta['no-intent-detected'];
  return (
    <span className={`inline-flex items-center gap-1 ${meta.textClass} text-xs font-semibold px-2.5 py-1 rounded-full ${meta.colour}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function UrgentBanner({ score }: { score: number }) {
  if (score < 85) return null;
  return (
    <div className="bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
      <p className="text-sm font-medium text-warning">
        High-priority reply — this lead requires immediate attention.
      </p>
    </div>
  );
}

function HotScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-medium text-muted-foreground">Hot Score</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-warning transition-all duration-500"
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums">{score}</span>
    </div>
  );
}

function LeadInfoPanel({ lead }: { lead: any }) {
  const phone = lead.phone || lead.contact_phone || null;
  const website = lead.website_url || null;
  const addressParts = [lead.address, lead.city, lead.country].filter(Boolean);
  const address = addressParts.join(', ') || null;
  const rating = lead.rating != null ? `${lead.rating} (${lead.review_count ?? 0} reviews)` : null;
  const tags = lead.tags || [];

  return (
    <div className="mt-2 mb-4 rounded-lg border border-border bg-secondary p-3">
      <div className="flex items-center gap-2 mb-2">
        <User className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead Profile</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 text-xs text-foreground">
        {lead.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>{phone}</span>
          </div>
        )}
        {address && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{address}</span>
          </div>
        )}
        {website && (
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <a href={website} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
              {website}
            </a>
          </div>
        )}
        {rating && (
          <div className="flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-warning shrink-0" />
            <span>{rating}</span>
          </div>
        )}
        {(lead.category || tags.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {lead.category && (
              <span className="px-2 py-0.5 bg-card rounded text-micro font-medium uppercase tracking-wide">
                {lead.category}
              </span>
            )}
            {tags.map((t: string) => (
              <span key={t} className="px-2 py-0.5 bg-card rounded text-micro">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      {(lead.contact_full_name || lead.contact_title || lead.contact_email) && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-micro font-semibold text-muted-foreground uppercase tracking-wider mb-1">Contact</p>
          <div className="text-xs text-foreground">
            {lead.contact_full_name && <span className="font-medium">{lead.contact_full_name}</span>}
            {lead.contact_title && <span className="text-muted-foreground"> · {lead.contact_title}</span>}
            {lead.contact_email && (
              <span className="block text-muted-foreground truncate">{lead.contact_email}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReplyDrawer({ replyId, leadId, isOpen, onClose }: ReplyDrawerProps) {
  const queryClient = useQueryClient();
  const [composeMode, setComposeMode] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [subject, setSubject] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastNotification, setToastNotification] = useState<ReplyNotification | null>(null);

  useScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  const { data: reply, isLoading } = useQuery<any>({
    queryKey: ['reply', replyId],
    queryFn: async () => {
      if (!replyId) throw new Error('No reply ID');
      return api.replies.get(replyId);
    },
    enabled: isOpen && !!replyId,
    staleTime: 30_000,
  });

  /* Fetch full lead profile when leadId is provided (e.g. opened from PipelineBoard) */
  const { data: lead, isLoading: leadLoading } = useQuery<any>({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      if (!leadId) throw new Error('No lead ID');
      return api.leads.get(leadId);
    },
    enabled: isOpen && !!leadId,
    staleTime: 30_000,
  });

  const { mutate: markRead } = useMutation({
    mutationFn: (id: string) => api.replies.read(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['replies-unread-count'] });
      if (leadId) queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
    },
  });

  const { mutate: regenerateDraft } = useMutation({
    mutationFn: (id: string) => api.replies.regenerateDraft(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reply', replyId] });
      if (leadId) queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      if (data?.draft) setDraftText(data.draft);
    },
    onError: () => {
      toast.error('Failed to regenerate draft — keeping existing draft. Retry?');
    },
  });

  useEffect(() => {
    if (isOpen && replyId) {
      markRead(replyId);
    }
  }, [isOpen, replyId, markRead]);

  useEffect(() => {
    if (reply?.suggested_reply_draft) {
      setDraftText(reply.suggested_reply_draft);
    }
    if (reply?.lead?.business_name) {
      setSubject(reply.subject ? `Re: ${reply.subject}` : `Re: ${reply.lead?.business_name ?? 'Lead'}`);
    }
    setComposeMode(false);
    setShowOriginal(false);
  }, [replyId, reply?.suggested_reply_draft, reply?.lead?.business_name]);

  const handleNewReply = useCallback((payload: ReplyNotification) => {
    if (replyId && payload.replyEventId !== replyId) {
      setToastNotification(payload);
      setTimeout(() => setToastNotification(null), 8000);
    }
  }, [replyId]);

  useRealtimeSocket({ onReply: handleNewReply });

  const [draftCopied, setDraftCopied] = useState(false);

  const handleCopyEmail = async () => {
    const email = reply?.lead?.email ?? lead?.email;
    if (!email) return;
    const ok = await copyToClipboard(email);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Copy failed — please copy manually');
    }
  };

  const handleCopyDraft = async () => {
    if (!draftText) return;
    const ok = await copyToClipboard(draftText);
    if (ok) {
      setDraftCopied(true);
      setTimeout(() => setDraftCopied(false), 2000);
    } else {
      toast.error('Copy failed — please copy manually');
    }
  };

  const handleOpenMail = () => {
    const email = reply?.lead?.email ?? lead?.email;
    if (!email || !subject || !draftText) return;
    const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(draftText)}`;
    window.location.href = mailto;
  };

  const handleLogSent = async () => {
    if (!replyId) return;
    try {
      await api.replies.handled(replyId, 'replied');
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['reply', replyId] });
      setComposeMode(false);
      onClose();
    } catch {
      toast.error('Failed to log as sent. Please retry.');
    }
  };

  const handleAction = async (action: 'not_interested' | 'snoozed' | 'archived') => {
    if (!replyId) return;
    try {
      await api.replies.handled(replyId, action);
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['reply', replyId] });
      onClose();
    } catch {
      toast.error(`Failed to mark as ${action.replace('_', ' ')}. Please retry.`);
    }
  };

  // Compose mode width: 900px, view mode: 640px
  const drawerWidth = composeMode ? 'sm:w-[900px]' : 'sm:w-[640px]';

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-overlay z-[55]"
              onClick={onClose}
            />

            {/* Drawer */}
            <FocusTrap active={isOpen} focusTrapOptions={{ returnFocusOnDeactivate: true, escapeDeactivates: true, onDeactivate: onClose }}>
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 32 }}
              className={`fixed right-0 top-0 h-[100dvh] w-full ${drawerWidth} bg-card border-l border-border shadow-2xl z-[60] flex flex-col transition-[width] duration-300 ease-in-out`}
              role="dialog"
              aria-modal="true"
              aria-label="Reply details"
            >
            {/* Toast Notification */}
            {toastNotification && (
              <motion.div
                initial={{ y: -40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -40, opacity: 0 }}
                className="absolute top-4 left-4 right-4 z-50 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 shadow-lg flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-warning" />
                  <p className="text-sm font-medium text-warning">
                    {toastNotification.title}
                  </p>
                  {toastNotification.subtitle && (
                    <p className="text-xs text-warning truncate max-w-[200px]">
                      {toastNotification.subtitle}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-warning hover:text-warning/80"
                  onClick={() => {
                    setToastNotification(null);
                    onClose();
                  }}
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              </motion.div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {composeMode && (
                  <button
                    onClick={() => setComposeMode(false)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                    aria-label="Back to view mode"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold truncate">
                    {isLoading ? 'Loading…' : reply?.lead?.business_name ?? lead?.business_name ?? 'Lead Details'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                    <Mail className="w-3.5 h-3.5" />
                    {reply?.lead?.email ?? lead?.email ?? '—'}
                    {(reply?.lead?.email ?? lead?.email) && (
                      <button
                        onClick={handleCopyEmail}
                        className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copy email"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {isLoading ? (
                <div className="space-y-4 mt-4">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : !replyId ? (
                <>
                  {lead && <LeadInfoPanel lead={lead} />}
                  <div className="mt-8 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-secondary mb-3">
                      <Mail className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No inbound replies yet for this lead.</p>
                    <p className="text-xs text-muted-foreground mt-1">Click Compose below to draft a new email.</p>
                  </div>
                </>
              ) : !reply ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Reply not found.
                </div>
              ) : (
                <>
                  {/* Lead Profile Panel (shown when opened from PipelineBoard with leadId) */}
                  {lead && <LeadInfoPanel lead={lead} />}

                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <IntentBadge intent={reply.intent ?? 'no-intent-detected'} />
                    {reply.hot_score !== undefined && reply.hot_score >= 85 && (
                      <span className="inline-flex items-center text-xs font-semibold text-warning bg-warning/10 px-2.5 py-1 rounded-full">
                        <Sparkles className="w-3 h-3 mr-1" />
                        High Priority
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {reply.received_at ? new Date(reply.received_at).toLocaleString() : '—'}
                    </span>
                  </div>

                  {reply.hot_score !== undefined && (
                    <div className="mt-3">
                      <HotScoreBar score={reply.hot_score} />
                      {reply.score_breakdown && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                          <span>Recency: {reply.score_breakdown.recency ?? 0}</span>
                          <span>Intent: {reply.score_breakdown.intent ?? 0}</span>
                          <span>Response: {reply.score_breakdown.response ?? 0}</span>
                          <span>History: {reply.score_breakdown.history ?? 0}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <UrgentBanner score={reply.hot_score ?? 0} />

                  {/* Original Email collapsible */}
                  <div className="mt-4">
                    <button
                      onClick={() => setShowOriginal(!showOriginal)}
                      className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      <Mail className="w-4 h-4" />
                      Your Last Email
                      {showOriginal ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showOriginal && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-2 bg-secondary border border-border rounded-lg p-4 overflow-hidden"
                      >
                        {reply.original_email ? (
                          <>
                            <p className="text-xs text-muted-foreground mb-1">
                              <strong>Subject:</strong> {reply.original_email.subject}
                            </p>
                            <div className="text-sm text-foreground whitespace-pre-line leading-relaxed max-h-64 overflow-y-auto">
                              {reply.original_email.body}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Original email not available — no sent step execution was found for this lead.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </div>

                  {/* Reply content */}
                  <div className="mt-4 bg-secondary border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ReplyIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reply Content</span>
                    </div>
                    <div className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                      {reply.body_plain || 'No content available.'}
                    </div>
                  </div>

                  {/* Compose Mode */}
                  {composeMode && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-4 space-y-3"
                    >
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Subject</label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">To</label>
                        <input
                          type="text"
                          readOnly
                          value={reply?.lead?.email ?? lead?.email ?? ''}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-sm text-muted-foreground cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block flex items-center justify-between">
                          <span>Draft Reply</span>
                      <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => replyId && regenerateDraft(replyId)}
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Regenerate
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={handleCopyDraft}
                          >
                            {draftCopied ? <Check className="w-3 h-3 mr-1 text-success" /> : <Copy className="w-3 h-3 mr-1" />}
                            {draftCopied ? 'Copied' : 'Copy'}
                          </Button>
                      </div>
                        </label>
                        <textarea
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          rows={10}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-y"
                        />
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t shrink-0 bg-card">
              {!replyId ? (
                <Button
                  className="w-full bg-foreground text-background hover:bg-foreground/90"
                  onClick={() => {
                    const email = lead?.email ?? reply?.lead?.email;
                    const sub = `Re: ${lead?.business_name ?? 'Lead'}`;
                    if (email) {
                      window.location.href = `mailto:${email}?subject=${encodeURIComponent(sub)}`;
                    } else {
                      toast.error('No email address available for this lead');
                    }
                  }}
                >
                  <ReplyIcon className="w-4 h-4 mr-2" />
                  Compose new email
                </Button>
              ) : composeMode ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleOpenMail}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open in Mail
                  </Button>
                  <Button
                    className="flex-1 bg-foreground text-background hover:bg-foreground/90"
                    onClick={handleLogSent}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Log as Sent
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    className="w-full bg-foreground text-background hover:bg-foreground/90"
                    onClick={() => {
                      setComposeMode(true);
                      setDraftText(reply?.suggested_reply_draft ?? '');
                    }}
                  >
                    <ReplyIcon className="w-4 h-4 mr-2" />
                    Reply to this email
                  </Button>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleAction('not_interested')}
                    >
                      <Ban className="h-4 w-4 mr-1" />
                      Not Interested
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleAction('snoozed')}
                    >
                      <Clock className="h-4 w-4 mr-1" />
                      Snooze
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleAction('archived')}
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      Archive
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          </FocusTrap>
        </>
      )}
    </AnimatePresence>
  </Portal>
  );
}
