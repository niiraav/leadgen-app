import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtimeSocket, type ReplyNotification } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';

interface ReplyDrawerProps {
  replyId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const intentMeta: Record<string, { label: string; colour: string; icon: React.ReactNode }> = {
  interested: { label: 'Interested', colour: 'bg-green-600 hover:bg-green-700', icon: <Sparkles className="h-3 w-3 mr-1" /> },
  'not-interested': { label: 'Not Interested', colour: 'bg-red-600 hover:bg-red-700', icon: <ShieldAlert className="h-3 w-3 mr-1" /> },
  'needs-info': { label: 'Needs Info', colour: 'bg-amber-600 hover:bg-amber-700', icon: <AlertTriangle className="h-3 w-3 mr-1" /> },
  'out-of-office': { label: 'Out of Office', colour: 'bg-blue-600 hover:bg-blue-700', icon: <Clock className="h-3 w-3 mr-1" /> },
  'forwarded-to-colleague': { label: 'Forwarded', colour: 'bg-purple-600 hover:bg-purple-700', icon: <Send className="h-3 w-3 mr-1" /> },
  'no-intent-detected': { label: 'No Intent', colour: 'bg-slate-600 hover:bg-slate-700', icon: <Bot className="h-3 w-3 mr-1" /> },
};

function IntentBadge({ intent }: { intent: string }) {
  const meta = intentMeta[intent] ?? intentMeta['no-intent-detected'];
  return (
    <span className={`inline-flex items-center gap-1 text-white text-xs font-semibold px-2.5 py-1 rounded-full ${meta.colour}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function UrgentBanner({ score }: { score: number }) {
  if (score < 85) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <p className="text-sm font-medium text-amber-800">
        High-priority reply — this lead requires immediate attention.
      </p>
    </div>
  );
}

function HotScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-medium text-muted-foreground">Hot Score</span>
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-orange-500 transition-all duration-500"
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums">{score}</span>
    </div>
  );
}

export default function ReplyDrawer({ replyId, isOpen, onClose }: ReplyDrawerProps) {
  const queryClient = useQueryClient();
  const [composeMode, setComposeMode] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [subject, setSubject] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastNotification, setToastNotification] = useState<ReplyNotification | null>(null);

  const { data: reply, isLoading } = useQuery<any>({
    queryKey: ['reply', replyId],
    queryFn: async () => {
      if (!replyId) throw new Error('No reply ID');
      return api.replies.get(replyId);
    },
    enabled: isOpen && !!replyId,
    staleTime: 30_000,
  });

  const { mutate: markRead } = useMutation({
    mutationFn: (id: string) => api.replies.read(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['replies-unread-count'] });
    },
  });

  const { mutate: regenerateDraft } = useMutation({
    mutationFn: (id: string) => api.replies.regenerateDraft(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reply', replyId] });
      if (data?.draft) setDraftText(data.draft);
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
      setSubject(`Re: ${reply.lead.business_name}`);
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

  const handleCopy = () => {
    if (!reply?.lead?.email) return;
    navigator.clipboard.writeText(reply.lead.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenMail = () => {
    if (!reply?.lead?.email || !subject || !draftText) return;
    const mailto = `mailto:${reply.lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(draftText)}`;
    window.location.href = mailto;
  };

  const handleLogSent = () => {
    if (!replyId) return;
    api.replies.handled(replyId, 'replied').then(() => {
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['reply', replyId] });
      setComposeMode(false);
      onClose();
    });
  };

  const handleAction = (action: 'not_interested' | 'snoozed' | 'archived') => {
    if (!replyId) return;
    api.replies.handled(replyId, action).then(() => {
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['reply', replyId] });
      onClose();
    });
  };

  // Compose mode width: 900px, view mode: 640px
  const drawerWidth = composeMode ? 'sm:w-[900px]' : 'sm:w-[640px]';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
            className={`fixed right-0 top-0 h-full w-full ${drawerWidth} bg-white border-l border-border shadow-2xl z-50 flex flex-col transition-[width] duration-300 ease-in-out`}
          >
            {/* Toast Notification */}
            {toastNotification && (
              <motion.div
                initial={{ y: -40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -40, opacity: 0 }}
                className="absolute top-4 left-4 right-4 z-50 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 shadow-lg flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-medium text-amber-800">
                    {toastNotification.title}
                  </p>
                  {toastNotification.subtitle && (
                    <p className="text-xs text-amber-600 truncate max-w-[200px]">
                      {toastNotification.subtitle}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-700 hover:text-amber-900"
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
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors shrink-0"
                    aria-label="Back to view mode"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold truncate">
                    {isLoading ? 'Loading…' : reply?.lead?.business_name ?? 'Reply Details'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                    <Mail className="w-3.5 h-3.5" />
                    {reply?.lead?.email ?? '—'}
                    {reply?.lead?.email && (
                      <button
                        onClick={handleCopy}
                        className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copy email"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors shrink-0"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {isLoading || !reply ? (
                <div className="space-y-4 mt-4">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <>
                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <IntentBadge intent={reply.intent ?? 'no-intent-detected'} />
                    {reply.hot_score !== undefined && reply.hot_score >= 85 && (
                      <span className="inline-flex items-center text-xs font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
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
                        className="mt-2 bg-surface-2 border border-border rounded-lg p-4 overflow-hidden"
                      >
                        {reply.original_email ? (
                          <>
                            <p className="text-xs text-muted-foreground mb-1">
                              <strong>Subject:</strong> {reply.original_email.subject}
                            </p>
                            <div className="text-sm text-text whitespace-pre-line leading-relaxed max-h-64 overflow-y-auto">
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
                  <div className="mt-4 bg-surface-2 border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ReplyIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reply Content</span>
                    </div>
                    <div className="text-sm text-text whitespace-pre-line leading-relaxed">
                      {reply.content || 'No content available.'}
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
                          className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">To</label>
                        <input
                          type="text"
                          readOnly
                          value={reply.lead?.email ?? ''}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-surface-2 text-sm text-muted-foreground cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block flex items-center justify-between">
                          <span>Draft Reply</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => replyId && regenerateDraft(replyId)}
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Regenerate
                          </Button>
                        </label>
                        <textarea
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          rows={10}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-y"
                        />
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t shrink-0 bg-surface">
              {composeMode ? (
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
        </>
      )}
    </AnimatePresence>
  );
}
