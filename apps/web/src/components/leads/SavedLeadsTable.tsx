import React, { useState, useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Mail,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader,
  Globe,
  Linkedin,
  Instagram,
  Facebook,
  MessageCircle,
  MoreHorizontal,
  ListPlus,
  RefreshCw,
  PenLine,
  StickyNote,
  Sparkles,
  ExternalLink,
  Trash2,
  Check,
  BookmarkX,
  Search,
} from 'lucide-react';
import { NotesEditor } from './NotesEditor';
import type {
  LeadStatus,
  EngagementStatus,
  PipelineStage,
  EmailDeliverabilityState,
  ActivityEntry,
  ReplyIntent,
} from '@leadgen/shared';
import {
  STATUS_ORDER,
  SCORE_THRESHOLDS,
} from '@leadgen/shared';

// ── Local types ──────────────────────────────────────────────────

export interface SavedLead {
  id: string;
  businessName: string;
  contactName?: string;
  city?: string;
  country?: string;
  score?: number;
  email: {
    address?: string;
    deliverability: EmailDeliverabilityState;
  };
  links: {
    website?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
  };
  status: LeadStatus;
  // Phase 4: domain-specific status fields (preferred over legacy status)
  engagementStatus?: EngagementStatus | null;
  pipelineStage?: PipelineStage | null;
  doNotContact?: boolean;
  lastActivity?: ActivityEntry | null;
  phone?: string;
  whatsapp?: string;
  notes?: string;
}

export interface ActivityLogEntry {
  label: string;
  timestamp: Date;
  replyIntent?: ReplyIntent;
}

export interface SavedLeadsTableProps {
  leads: SavedLead[];
  isLoading?: boolean;
  error?: string | null;
  onWhatsAppClick: (lead: SavedLead) => void;
  onEmailClick: (lead: SavedLead) => void;
  onSequenceClick: (lead: SavedLead) => void;
  onEnrichClick: (lead: SavedLead) => void;
  onOpenLead: (lead: SavedLead) => void;
  onRemoveLead: (leadId: string) => void;
  // Phase 4: status change can target a specific domain field
  onStatusChange: (leadId: string, newStatus: LeadStatus, field?: 'engagement_status' | 'pipeline_stage') => void;
  onLogActivity: (leadId: string, entry: ActivityLogEntry) => void;
  onSearchClick?: () => void;
  onRetry?: () => void;
}

// ── Status badge config (Phase 4: domain-split) ─────────────────

const PIPELINE_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  qualified:        { label: 'Qualified',       className: 'bg-purple-100 text-purple-700' },
  proposal_sent:    { label: 'Proposal Sent',   className: 'bg-violet-100 text-violet-700' },
  converted:        { label: 'Converted',       className: 'bg-teal-100 text-teal-700' },
  lost:             { label: 'Lost',            className: 'bg-destructive-100 text-destructive-400' },
};

const ENGAGEMENT_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  new:              { label: 'New',              className: 'bg-primary-100 text-primary-700' },
  contacted:        { label: 'Contacted',        className: 'bg-warning-100 text-warning-700' },
  replied:          { label: 'Replied',          className: 'bg-success-100 text-success-700' },
  interested:       { label: 'Interested',       className: 'bg-emerald-100 text-emerald-700' },
  not_interested:   { label: 'Not Interested',  className: 'bg-gray-100 text-gray-500' },
  out_of_office:    { label: 'Out of Office',   className: 'bg-yellow-100 text-yellow-600' },
};

// Phase 4: legacy fallback for old rows without domain columns
const LEGACY_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  new:              { label: 'New',              className: 'bg-primary-100 text-primary-700' },
  contacted:        { label: 'Contacted',        className: 'bg-warning-100 text-warning-700' },
  replied:          { label: 'Replied',          className: 'bg-success-100 text-success-700' },
  interested:       { label: 'Interested',       className: 'bg-emerald-100 text-emerald-700' },
  not_interested:   { label: 'Not Interested',  className: 'bg-gray-100 text-gray-500' },
  qualified:        { label: 'Qualified',        className: 'bg-purple-100 text-purple-700' },
  proposal_sent:    { label: 'Proposal Sent',    className: 'bg-violet-100 text-violet-700' },
  converted:        { label: 'Converted',        className: 'bg-teal-100 text-teal-700' },
  closed:           { label: 'Closed',           className: 'bg-gray-100 text-gray-400' },
  lost:             { label: 'Lost',             className: 'bg-destructive-100 text-destructive-400' },
  archived:         { label: 'Archived',        className: 'bg-gray-50 text-gray-400' },
  out_of_office:    { label: 'Out of Office',   className: 'bg-yellow-100 text-yellow-600' },
  do_not_contact:   { label: 'Do Not Contact',  className: 'bg-destructive-100 text-destructive-600' },
};

// Phase 4: classify a LeadStatus value into its domain
function classifyStatus(s: LeadStatus): 'engagement' | 'pipeline' | 'lifecycle' | 'compliance' {
  if (['new', 'contacted', 'replied', 'interested', 'not_interested', 'out_of_office'].includes(s)) return 'engagement';
  if (['qualified', 'proposal_sent', 'converted', 'lost'].includes(s)) return 'pipeline';
  if (['closed', 'archived'].includes(s)) return 'lifecycle';
  if (s === 'do_not_contact') return 'compliance';
  return 'lifecycle'; // fallback
}

// ── Relative time formatting ─────────────────────────────────────

function formatRelativeTime(timestamp: Date): string {
  const now = new Date();
  const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const diffMs = now.getTime() - ts.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Same calendar day
  if (diffDays === 0 && now.getDate() === ts.getDate()) return 'Today';
  // Yesterday
  if (diffDays === 1 || (diffDays === 0 && now.getDate() !== ts.getDate())) return 'Yesterday';
  // 2–6 days
  if (diffDays >= 2 && diffDays <= 6) return `${diffDays}d ago`;
  // 7–27 days → weeks
  if (diffDays >= 7 && diffDays <= 27) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  }
  // 28+ days → date
  const day = ts.getDate();
  const month = ts.toLocaleString('en-US', { month: 'short' });
  const year = ts.getFullYear();
  return `${day} ${month} ${year}`;
}

// ── Reply intent chip config ─────────────────────────────────────

const REPLY_INTENT_CHIP: Record<ReplyIntent, { label: string; className: string }> = {
  interested:     { label: 'Interested',  className: 'bg-success-100 text-success-700' },
  question:       { label: 'Question',    className: 'bg-primary-100 text-primary-700' },
  objection:      { label: 'Objection',   className: 'bg-warning-100 text-warning-700' },
  not_now:        { label: 'Not now',     className: 'bg-yellow-100 text-yellow-600' },
  not_interested: { label: 'Not interested', className: 'bg-gray-100 text-gray-500' },
};

// ── Auto-status utility ──────────────────────────────────────────

function handleAutoStatusUpdate(
  lead: SavedLead,
  messageType: 'email' | 'whatsapp',
  onStatusChange: SavedLeadsTableProps['onStatusChange'],
  onLogActivity: SavedLeadsTableProps['onLogActivity']
) {
  // Phase 4: use engagement_status first, fallback to legacy status
  const isEngagementNew = (lead.engagementStatus ?? lead.status) === 'new';
  if (!isEngagementNew) return;
  onStatusChange(lead.id, 'contacted', 'engagement_status');
  onLogActivity(lead.id, {
    label: messageType === 'email' ? 'Email sent' : 'WhatsApp sent',
    timestamp: new Date(),
  });
  onLogActivity(lead.id, {
    label: 'Status changed',
    timestamp: new Date(),
  });
}

// ── Score colour helper ──────────────────────────────────────────

function scoreColor(score: number | undefined): string {
  if (score === undefined) return 'text-gray-400';
  if (score >= SCORE_THRESHOLDS.GREEN) return 'text-success-600';
  if (score >= SCORE_THRESHOLDS.AMBER) return 'text-warning-500';
  return 'text-destructive-500';
}

// ── Log Form sub-component ───────────────────────────────────────

function LogForm({
  lead,
  onLogActivity,
  onStatusChange,
  onClose,
}: {
  lead: SavedLead;
  onLogActivity: SavedLeadsTableProps['onLogActivity'];
  onStatusChange: SavedLeadsTableProps['onStatusChange'];
  onClose: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [showStatusPrompt, setShowStatusPrompt] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitted) return;
    setSubmitted(true);
    onLogActivity(lead.id, {
      label: 'Email logged',
      timestamp: new Date(date),
    });
    if ((lead.engagementStatus ?? lead.status) === 'new') {
      setShowStatusPrompt(true);
    } else {
      onClose();
    }
  };

  const handleStatusYes = () => {
    onStatusChange(lead.id, 'contacted', 'engagement_status');
    onLogActivity(lead.id, { label: 'Status changed', timestamp: new Date() });
    onClose();
  };

  const handleStatusSkip = () => {
    onClose();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        Log an email sent outside this platform
      </p>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full rounded border border-gray-200 px-2 py-1 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitted}
        className="w-full rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        Log activity
      </button>
      {showStatusPrompt && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-sm text-gray-700">Mark this lead as Contacted?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleStatusYes}
              className="rounded bg-warning-500 px-3 py-1 text-xs font-medium text-white hover:bg-warning-600"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={handleStatusSkip}
              className="text-xs text-gray-500 hover:underline"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Email Cell sub-component ─────────────────────────────────────

function EmailCell({
  lead,
  popoverOpen,
  onPopoverChange,
  onEmailClick,
  onSequenceClick,
  onEnrichClick,
  onLogActivity,
  onStatusChange,
}: {
  lead: SavedLead;
  popoverOpen: boolean;
  onPopoverChange: (open: boolean) => void;
  onEmailClick: SavedLeadsTableProps['onEmailClick'];
  onSequenceClick: SavedLeadsTableProps['onSequenceClick'];
  onEnrichClick: SavedLeadsTableProps['onEnrichClick'];
  onLogActivity: SavedLeadsTableProps['onLogActivity'];
  onStatusChange: SavedLeadsTableProps['onStatusChange'];
}) {
  const { email } = lead;
  const [showLogForm, setShowLogForm] = useState(false);

  const state = email.deliverability;

  // none
  if (state === 'none') {
    return (
      <Popover.Root open={popoverOpen} onOpenChange={onPopoverChange}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>
              <button className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm">
                <Mail className="w-4 h-4" />
                <span>Find email</span>
              </button>
            </Popover.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50"
              sideOffset={5}
            >
              No email found yet
              <Tooltip.Arrow className="fill-gray-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Popover.Portal>
          <Popover.Content
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-md z-50 w-72"
            side="bottom"
            align="start"
            sideOffset={5}
          >
            <p className="text-sm font-medium text-gray-900 mb-1">No email found</p>
            <p className="text-xs text-gray-500 mb-3">Enrich this lead to find an email address.</p>
            <button
              onClick={() => onEnrichClick(lead)}
              className="w-full rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 mb-2"
            >
              Enrich lead
            </button>
            <button
              type="button"
              onClick={() => setShowLogForm(!showLogForm)}
              className="text-xs text-primary-600 hover:underline w-full text-left"
            >
              Log email manually
            </button>
            {showLogForm && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <LogForm
                  lead={lead}
                  onLogActivity={onLogActivity}
                  onStatusChange={onStatusChange}
                  onClose={() => {
                    setShowLogForm(false);
                    onPopoverChange(false);
                  }}
                />
              </div>
            )}
            <Popover.Close className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" aria-label="Close">
              ✕
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  // verifying
  if (state === 'verifying') {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="flex items-center gap-1 text-gray-400 text-sm cursor-default">
            <Loader className="w-4 h-4 animate-spin" />
            <span>Verifying...</span>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50"
            sideOffset={5}
          >
            Email verification in progress
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }

  // deliverable
  if (state === 'deliverable') {
    return (
      <Popover.Root open={popoverOpen} onOpenChange={onPopoverChange}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>
              <button className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                <Mail className="w-4 h-4" />
                <CheckCircle className="w-3 h-3 text-success-500" />
                <span className="truncate max-w-[120px]">{email.address}</span>
              </button>
            </Popover.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50"
              sideOffset={5}
            >
              Verified email — safe to send
              <Tooltip.Arrow className="fill-gray-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Popover.Portal>
          <Popover.Content
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-md z-50 w-72"
            side="bottom"
            align="start"
            sideOffset={5}
          >
            <p className="text-sm font-medium text-gray-900 mb-1">Verified email</p>
            <p className="font-mono text-xs text-gray-600 mb-3">{email.address}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (lead.doNotContact) return;
                  onEmailClick(lead);
                  handleAutoStatusUpdate(lead, 'email', onStatusChange, onLogActivity);
                }}
                disabled={lead.doNotContact}
                className={`w-full rounded px-3 py-1.5 text-sm font-medium ${
                  lead.doNotContact
                    ? 'bg-destructive-200 text-destructive-400 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {lead.doNotContact ? 'Do Not Contact' : 'Send email'}
              </button>
              <button
                onClick={() => { if (!lead.doNotContact) onSequenceClick(lead); }}
                disabled={lead.doNotContact}
                className={`w-full rounded border px-3 py-1.5 text-sm font-medium ${
                  lead.doNotContact
                    ? 'border-destructive-200 text-destructive-400 cursor-not-allowed'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {lead.doNotContact ? 'Enrollment blocked' : 'Add to sequence'}
              </button>
              <button
                type="button"
                onClick={() => setShowLogForm(!showLogForm)}
                className="text-xs text-primary-600 hover:underline w-full text-left"
              >
                Log external email
              </button>
            </div>
            {showLogForm && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <LogForm
                  lead={lead}
                  onLogActivity={onLogActivity}
                  onStatusChange={onStatusChange}
                  onClose={() => {
                    setShowLogForm(false);
                    onPopoverChange(false);
                  }}
                />
              </div>
            )}
            <Popover.Close className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" aria-label="Close">
              ✕
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  // risky
  if (state === 'risky') {
    return (
      <Popover.Root open={popoverOpen} onOpenChange={onPopoverChange}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>
              <button className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                <Mail className="w-4 h-4" />
                <AlertTriangle className="w-3 h-3 text-warning-500" />
                <span className="truncate max-w-[120px]">{email.address}</span>
              </button>
            </Popover.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50"
              sideOffset={5}
            >
              Catch-all email — may not be deliverable
              <Tooltip.Arrow className="fill-gray-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Popover.Portal>
          <Popover.Content
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-md z-50 w-72"
            side="bottom"
            align="start"
            sideOffset={5}
          >
            <div className="rounded bg-warning-50 border border-amber-200 px-3 py-2 mb-3">
              <p className="text-xs text-warning-700">
                This email address may not be reliably deliverable. Send with caution.
              </p>
            </div>
            <p className="font-mono text-xs text-gray-600 mb-3">{email.address}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (lead.doNotContact) return;
                  onEmailClick(lead);
                  handleAutoStatusUpdate(lead, 'email', onStatusChange, onLogActivity);
                }}
                disabled={lead.doNotContact}
                className={`w-full rounded px-3 py-1.5 text-sm font-medium ${
                  lead.doNotContact
                    ? 'bg-destructive-200 text-destructive-400 cursor-not-allowed'
                    : 'bg-warning-500 text-white hover:bg-warning-600'
                }`}
              >
                {lead.doNotContact ? 'Do Not Contact' : 'Send anyway'}
              </button>
              <button
                onClick={() => { if (!lead.doNotContact) onSequenceClick(lead); }}
                disabled={lead.doNotContact}
                className={`w-full rounded border px-3 py-1.5 text-sm font-medium ${
                  lead.doNotContact
                    ? 'border-destructive-200 text-destructive-400 cursor-not-allowed'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {lead.doNotContact ? 'Enrollment blocked' : 'Add to sequence'}
              </button>
              <button
                type="button"
                onClick={() => setShowLogForm(!showLogForm)}
                className="text-xs text-primary-600 hover:underline w-full text-left"
              >
                Log external email
              </button>
            </div>
            {showLogForm && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <LogForm
                  lead={lead}
                  onLogActivity={onLogActivity}
                  onStatusChange={onStatusChange}
                  onClose={() => {
                    setShowLogForm(false);
                    onPopoverChange(false);
                  }}
                />
              </div>
            )}
            <Popover.Close className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" aria-label="Close">
              ✕
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  // undeliverable
  if (state === 'undeliverable') {
    return (
      <Popover.Root open={popoverOpen} onOpenChange={onPopoverChange}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>
              <button className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-500">
                <Mail className="w-4 h-4" />
                <XCircle className="w-3 h-3 text-destructive-500" />
                <span className="truncate max-w-[120px] line-through">{email.address}</span>
              </button>
            </Popover.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50"
              sideOffset={5}
            >
              Invalid or undeliverable email
              <Tooltip.Arrow className="fill-gray-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Popover.Portal>
          <Popover.Content
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-md z-50 w-72"
            side="bottom"
            align="start"
            sideOffset={5}
          >
            <div className="rounded bg-destructive-50 border border-destructive-200 px-3 py-2 mb-3">
              <p className="text-xs text-destructive-700">This email is invalid. Do not send.</p>
            </div>
            <p className="font-mono text-xs text-gray-400 line-through mb-3">{email.address}</p>
            <button
              onClick={() => onEnrichClick(lead)}
              className="w-full rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              Enrich lead
            </button>
            <Popover.Close className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" aria-label="Close">
              ✕
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return null;
}

// ── Main component ───────────────────────────────────────────────

export function SavedLeadsTable(props: SavedLeadsTableProps) {
  const {
    leads,
    isLoading,
    error,
    onWhatsAppClick,
    onEmailClick,
    onSequenceClick,
    onEnrichClick,
    onOpenLead,
    onRemoveLead,
    onStatusChange,
    onLogActivity,
    onSearchClick,
    onRetry,
  } = props;

  // Centralized popover/dropdown state
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  // Track which lead is confirming removal
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  // ── Error state ────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="w-12 h-12 text-warning-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-1">Failed to load leads</h3>
        <p className="text-sm text-gray-400 mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="w-10 px-2 py-3" />
              <th className="px-3 py-3 font-medium text-gray-500">Lead</th>
              <th className="px-3 py-3 font-medium text-gray-500">Location</th>
              <th className="px-3 py-3 font-medium text-gray-500">Score</th>
              <th className="px-3 py-3 font-medium text-gray-500">Email</th>
              <th className="px-3 py-3 font-medium text-gray-500">Links</th>
              <th className="px-3 py-3 font-medium text-gray-500">Status</th>
              <th className="px-3 py-3 font-medium text-gray-500">Last Activity</th>
              <th className="px-3 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100 animate-pulse">
                <td className="px-2 py-3"><div className="h-4 w-4 rounded bg-gray-200" /></td>
                <td className="px-3 py-3"><div className="h-4 w-32 rounded bg-gray-200" /></td>
                <td className="px-3 py-3"><div className="h-4 w-20 rounded bg-gray-200" /></td>
                <td className="px-3 py-3"><div className="h-4 w-8 rounded bg-gray-200" /></td>
                <td className="px-3 py-3"><div className="h-4 w-24 rounded bg-gray-200" /></td>
                <td className="px-3 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
                <td className="px-3 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
                <td className="px-3 py-3"><div className="h-4 w-20 rounded bg-gray-200" /></td>
                <td className="px-3 py-3"><div className="h-4 w-8 rounded bg-gray-200" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const openPopover = (key: string) => setActivePopover(key);
  const closePopover = () => {
    setActivePopover(null);
    setConfirmingRemove(null);
  };
  const closePopoverIf = (condition: (prev: string | null) => boolean) => {
    setActivePopover((prev) => {
      if (condition(prev)) return null;
      return prev;
    });
    setConfirmingRemove((prev) => {
      if (condition(null)) return null; // only clear if condition says we're closing
      return prev;
    });
  };
  const togglePopover = (key: string) => {
    setActivePopover((prev) => (prev === key ? null : key));
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Empty state ────────────────────────────────────────────
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BookmarkX className="w-12 h-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-1">No saved leads yet</h3>
        <p className="text-sm text-gray-400 mb-4">
          Search for leads and save them here to start your outreach.
        </p>
        {onSearchClick && (
          <button
            onClick={onSearchClick}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Search className="w-4 h-4" />
            Search for leads
          </button>
        )}
      </div>
    );
  }

  // ── Status submenu items split (Phase 4: domain-split) ────────
  const engagementStatusOptions: LeadStatus[] = ['new', 'contacted', 'replied', 'interested', 'not_interested', 'out_of_office'];
  const pipelineStatusOptions: LeadStatus[] = ['qualified', 'proposal_sent', 'converted', 'lost'];
  const warningStatuses: LeadStatus[] = ['do_not_contact', 'archived'];

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="w-10 px-2 py-3" />
              <th className="px-3 py-3 font-medium text-gray-500">Lead</th>
              <th className="px-3 py-3 font-medium text-gray-500">Location</th>
              <th className="px-3 py-3 font-medium text-gray-500">Score</th>
              <th className="px-3 py-3 font-medium text-gray-500">Email</th>
              <th className="px-3 py-3 font-medium text-gray-500">Links</th>
              <th className="px-3 py-3 font-medium text-gray-500">Status</th>
              <th className="px-3 py-3 font-medium text-gray-500">Last Activity</th>
              <th className="px-3 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const isSelected = selectedRows.has(lead.id);
              const location = [lead.city, lead.country].filter(Boolean).join(', ') || '—';
              const hasAnyLink = lead.links.website || lead.links.linkedin || lead.links.instagram || lead.links.facebook;

              return (
                <tr
                  key={lead.id}
                  className={`group border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${
                    isSelected ? 'bg-primary-50/40' : ''
                  }`}
                >
                  {/* Col 1 — Select */}
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(lead.id)}
                      aria-label="Select lead"
                      className={`rounded border-gray-300 text-primary-600 focus:ring-primary transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    />
                  </td>

                  {/* Col 2 — Lead */}
                  <td className="px-3 py-3">
                    <button
                      onClick={() => onOpenLead(lead)}
                      className="text-left"
                    >
                      <span className="font-medium text-gray-900 hover:underline">
                        {lead.businessName}
                      </span>
                      {lead.contactName && (
                        <span className="block text-xs text-gray-400 mt-0.5">
                          {lead.contactName}
                        </span>
                      )}
                    </button>
                  </td>

                  {/* Col 3 — Location */}
                  <td className="px-3 py-3 text-sm text-gray-500">
                    {location}
                  </td>

                  {/* Col 4 — Score */}
                  <td className={`px-3 py-3 font-medium ${scoreColor(lead.score)}`}>
                    {lead.score !== undefined ? lead.score : <span className="text-gray-400">—</span>}
                  </td>

                  {/* Col 5 — Email */}
                  <td className="px-3 py-3">
                    <EmailCell
                      lead={lead}
                      popoverOpen={activePopover === `${lead.id}-email`}
                      onPopoverChange={(open) =>
                        open ? openPopover(`${lead.id}-email`) : closePopover()
                      }
                      onEmailClick={onEmailClick}
                      onSequenceClick={onSequenceClick}
                      onEnrichClick={onEnrichClick}
                      onLogActivity={onLogActivity}
                      onStatusChange={onStatusChange}
                    />
                  </td>

                  {/* Col 6 — Links */}
                  <td className="px-3 py-3">
                    {hasAnyLink ? (
                      <div className="flex items-center gap-2">
                        {lead.links.website && (
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                onClick={() => window.open(lead.links.website!, '_blank', 'noopener,noreferrer')}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="Company website"
                              >
                                <Globe className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                Company website
                                <Tooltip.Arrow className="fill-gray-900" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        )}
                        {lead.links.linkedin && (
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                onClick={() => window.open(lead.links.linkedin!, '_blank', 'noopener,noreferrer')}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="LinkedIn profile"
                              >
                                <Linkedin className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                LinkedIn profile
                                <Tooltip.Arrow className="fill-gray-900" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        )}
                        {lead.links.instagram && (
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                onClick={() => window.open(lead.links.instagram!, '_blank', 'noopener,noreferrer')}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="Instagram profile"
                              >
                                <Instagram className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                Instagram profile
                                <Tooltip.Arrow className="fill-gray-900" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        )}
                        {lead.links.facebook && (
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                onClick={() => window.open(lead.links.facebook!, '_blank', 'noopener,noreferrer')}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="Facebook page"
                              >
                                <Facebook className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                Facebook page
                                <Tooltip.Arrow className="fill-gray-900" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  {/* Col 7 — Status (Phase 4: domain-split) */}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1 items-center">
                      {/* do_not_contact restriction badge */}
                      {lead.doNotContact && (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-destructive-100 text-destructive-600"
                          aria-label="Do Not Contact"
                        >
                          DNC
                        </span>
                      )}
                      {/* pipeline_stage badge (primary) */}
                      {(lead.pipelineStage != null)
                        ? (() => {
                            const cfg = PIPELINE_BADGE_CONFIG[lead.pipelineStage!];
                            return cfg ? (
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}
                                aria-label={cfg.label}
                              >
                                {cfg.label}
                              </span>
                            ) : (
                              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-400">
                                {lead.pipelineStage}
                              </span>
                            );
                          })()
                        : null}
                      {/* engagement_status badge */}
                      {(lead.engagementStatus != null)
                        ? (() => {
                            const cfg = ENGAGEMENT_BADGE_CONFIG[lead.engagementStatus!];
                            return cfg ? (
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}
                                aria-label={cfg.label}
                              >
                                {cfg.label}
                              </span>
                            ) : (
                              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-400">
                                {lead.engagementStatus}
                              </span>
                            );
                          })()
                        /* Phase 4: legacy fallback for old rows with no domain columns */
                        : (() => {
                            const cfg = LEGACY_BADGE_CONFIG[lead.status];
                            return cfg ? (
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}
                                aria-label={cfg.label}
                              >
                                {cfg.label}
                              </span>
                            ) : (
                              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-400">
                                {lead.status}
                              </span>
                            );
                          })()}
                    </div>
                  </td>

                  {/* Col 8 — Last Activity */}
                  <td className="px-3 py-3">
                    {lead.lastActivity ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm text-gray-700">
                          {lead.lastActivity.label} · {formatRelativeTime(lead.lastActivity.timestamp)}
                        </span>
                        {lead.lastActivity.replyIntent && (() => {
                          const chip = REPLY_INTENT_CHIP[lead.lastActivity.replyIntent!];
                          return chip ? (
                            <span className={`inline-block rounded-full px-1.5 py-0.5 text-micro font-medium leading-tight ${chip.className}`}>
                              {chip.label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    ) : (
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <span className="text-sm text-gray-400 cursor-default">—</span>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                            No activity recorded
                            <Tooltip.Arrow className="fill-gray-900" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    )}
                  </td>

                  {/* Col 9 — Actions */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {/* WhatsApp inline */}
                      {lead.whatsapp ? (
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button
                              onClick={() => {
                                onWhatsAppClick(lead);
                                handleAutoStatusUpdate(lead, 'whatsapp', onStatusChange, onLogActivity);
                              }}
                              className="text-success-500 hover:text-success-600"
                              aria-label="Send WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                              Send WhatsApp
                              <Tooltip.Arrow className="fill-gray-900" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      ) : (
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <span className="text-gray-300 cursor-not-allowed" aria-label="WhatsApp not available">
                              <MessageCircle className="w-4 h-4" />
                            </span>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                              WhatsApp not available for this lead
                              <Tooltip.Arrow className="fill-gray-900" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      )}

                      {/* Overflow menu */}
                      <DropdownMenu.Root
                        open={activePopover?.startsWith(`${lead.id}-actions`) ?? false}
                        onOpenChange={(open) => {
                          if (open) {
                            openPopover(`${lead.id}-actions`);
                          } else {
                            // Only truly close if activePopover is still a plain actions key
                            // (not a sub-panel like ${lead.id}-actions-log)
                            closePopoverIf((prev) =>
                              prev === null || prev === `${lead.id}-actions`
                            );
                          }
                        }}
                      >
                        <DropdownMenu.Trigger asChild>
                          <button
                            className="text-gray-400 hover:text-gray-600"
                            aria-label="More actions"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            className="rounded-lg border border-gray-200 bg-white p-1 shadow-md z-50 min-w-[200px]"
                            side="bottom"
                            align="end"
                            sideOffset={5}
                          >
                            {activePopover === `${lead.id}-actions-log` ? (
                              /* ── Log external email sub-panel ── */
                              <div className="p-3 space-y-2" onKeyDown={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => openPopover(`${lead.id}-actions`)}
                                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
                                >
                                  ← Back
                                </button>
                                <LogForm
                                  lead={lead}
                                  onLogActivity={onLogActivity}
                                  onStatusChange={onStatusChange}
                                  onClose={closePopover}
                                />
                              </div>
                            ) : activePopover === `${lead.id}-actions-note` ? (
                              /* ── Edit note sub-panel ── */
                              <div className="p-3 space-y-2" onKeyDown={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => openPopover(`${lead.id}-actions`)}
                                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
                                >
                                  ← Back
                                </button>
                                <NotesEditor
                                  leadId={lead.id}
                                  initialNotes={lead.notes}
                                />
                                <button
                                  type="button"
                                  onClick={closePopover}
                                  className="w-full rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
                                >
                                  Done
                                </button>
                              </div>
                            ) : (
                            <>
                            {/* Send email — Phase 4: blocked if do_not_contact */}
                            {lead.doNotContact ? (
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive-300 cursor-not-allowed outline-none"
                                    disabled
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <Mail className="w-4 h-4" />
                                    Send email
                                  </DropdownMenu.Item>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content className="rounded bg-destructive-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                    Do Not Contact — sends blocked
                                    <Tooltip.Arrow className="fill-red-900" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            ) : lead.email.deliverability === 'none' ? (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                                onSelect={() => onEnrichClick(lead)}
                              >
                                <Mail className="w-4 h-4" />
                                Find email first
                              </DropdownMenu.Item>
                            ) : lead.email.deliverability === 'undeliverable' ? (
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-300 cursor-not-allowed outline-none"
                                    disabled
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <Mail className="w-4 h-4" />
                                    Send email
                                  </DropdownMenu.Item>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                    Email is invalid
                                    <Tooltip.Arrow className="fill-gray-900" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            ) : lead.email.deliverability === 'verifying' ? (
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-300 cursor-not-allowed outline-none"
                                    disabled
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <Mail className="w-4 h-4" />
                                    Send email
                                  </DropdownMenu.Item>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                    Email verification in progress
                                    <Tooltip.Arrow className="fill-gray-900" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            ) : (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                                onSelect={() => {
                                  onEmailClick(lead);
                                  handleAutoStatusUpdate(lead, 'email', onStatusChange, onLogActivity);
                                }}
                              >
                                <Mail className="w-4 h-4" />
                                Send email
                              </DropdownMenu.Item>
                            )}

                            {/* Send WhatsApp — Phase 4: blocked if do_not_contact */}
                            {lead.doNotContact ? (
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive-300 cursor-not-allowed outline-none"
                                    disabled
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <MessageCircle className="w-4 h-4" />
                                    Send WhatsApp
                                  </DropdownMenu.Item>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content className="rounded bg-destructive-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                    Do Not Contact — sends blocked
                                    <Tooltip.Arrow className="fill-red-900" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            ) : lead.whatsapp ? (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                                onSelect={() => {
                                  onWhatsAppClick(lead);
                                  handleAutoStatusUpdate(lead, 'whatsapp', onStatusChange, onLogActivity);
                                }}
                              >
                                <MessageCircle className="w-4 h-4" />
                                Send WhatsApp
                              </DropdownMenu.Item>
                            ) : (
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-300 cursor-not-allowed outline-none"
                                    disabled
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <MessageCircle className="w-4 h-4" />
                                    Send WhatsApp
                                  </DropdownMenu.Item>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                    WhatsApp not available for this lead
                                    <Tooltip.Arrow className="fill-gray-900" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            )}

                            {/* Add to sequence — Phase 4: blocked if do_not_contact */}
                            {lead.doNotContact ? (
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <DropdownMenu.Item
                                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive-300 cursor-not-allowed outline-none"
                                    disabled
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <ListPlus className="w-4 h-4" />
                                    Add to sequence
                                  </DropdownMenu.Item>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content className="rounded bg-destructive-900 px-2 py-1 text-xs text-white shadow-lg z-50" sideOffset={5}>
                                    Do Not Contact — enrollment blocked
                                    <Tooltip.Arrow className="fill-red-900" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            ) : (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                                onSelect={() => onSequenceClick(lead)}
                              >
                                <ListPlus className="w-4 h-4" />
                                Add to sequence
                              </DropdownMenu.Item>
                            )}

                            <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />

                            {/* Change status → submenu */}
                            <DropdownMenu.Sub
                              onOpenChange={(open) => {
                                if (open) openPopover(`${lead.id}-status`);
                                // Don't close parent when sub closes
                              }}
                            >
                              <DropdownMenu.SubTrigger
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none w-full"
                                onSelect={(e) => e.preventDefault()}
                              >
                                <RefreshCw className="w-4 h-4" />
                                Change status
                              </DropdownMenu.SubTrigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.SubContent
                                  className="rounded-lg border border-gray-200 bg-white p-1 shadow-md z-50 min-w-[200px]"
                                  sideOffset={2}
                                  alignOffset={-5}
                                >
                                  {/* Engagement status section */}
                                  <div className="px-2 py-1 text-micro font-semibold text-gray-400 uppercase tracking-wider">Engagement</div>
                                  {engagementStatusOptions.map((s) => (
                                    <DropdownMenu.Item
                                      key={s}
                                      className="flex items-center justify-between rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                                      onSelect={() => {
                                        onStatusChange(lead.id, s, 'engagement_status');
                                        onLogActivity(lead.id, { label: 'Status changed', timestamp: new Date() });
                                        closePopover();
                                      }}
                                    >
                                      <span>{ENGAGEMENT_BADGE_CONFIG[s]?.label ?? s}</span>
                                      {(lead.engagementStatus ?? lead.status) === s && <Check className="w-3 h-3 text-primary-600" />}
                                    </DropdownMenu.Item>
                                  ))}
                                  <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                                  {/* Pipeline stage section */}
                                  <div className="px-2 py-1 text-micro font-semibold text-gray-400 uppercase tracking-wider">Pipeline</div>
                                  {pipelineStatusOptions.map((s) => (
                                    <DropdownMenu.Item
                                      key={s}
                                      className="flex items-center justify-between rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                                      onSelect={() => {
                                        onStatusChange(lead.id, s, 'pipeline_stage');
                                        onLogActivity(lead.id, { label: 'Status changed', timestamp: new Date() });
                                        closePopover();
                                      }}
                                    >
                                      <span>{PIPELINE_BADGE_CONFIG[s]?.label ?? s}</span>
                                      {lead.pipelineStage === s && <Check className="w-3 h-3 text-primary-600" />}
                                    </DropdownMenu.Item>
                                  ))}
                                  <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                                  {/* Warning / compliance section */}
                                  {warningStatuses.map((s) => (
                                    <DropdownMenu.Item
                                      key={s}
                                      className="flex items-center justify-between rounded px-2 py-1.5 text-sm text-gray-400 hover:bg-destructive-50 hover:text-destructive-600 cursor-pointer outline-none"
                                      onSelect={() => {
                                        onStatusChange(lead.id, s);
                                        onLogActivity(lead.id, { label: 'Status changed', timestamp: new Date() });
                                        closePopover();
                                      }}
                                    >
                                      <span>{LEGACY_BADGE_CONFIG[s]?.label ?? s}</span>
                                      {lead.status === s && <Check className="w-3 h-3 text-primary-600" />}
                                    </DropdownMenu.Item>
                                  ))}
                                </DropdownMenu.SubContent>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Sub>

                            {/* Log external email → inline sub-panel */}
                            <DropdownMenu.Item
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                              onSelect={(e) => {
                                e.preventDefault();
                                openPopover(`${lead.id}-actions-log`);
                              }}
                            >
                              <PenLine className="w-4 h-4" />
                              Log external email
                            </DropdownMenu.Item>

                            {/* Edit note → inline sub-panel */}
                            <DropdownMenu.Item
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                              onSelect={(e) => {
                                e.preventDefault();
                                openPopover(`${lead.id}-actions-note`);
                              }}
                            >
                              <StickyNote className="w-4 h-4" />
                              Edit note
                            </DropdownMenu.Item>

                            <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />

                            {/* Enrich lead */}
                            <DropdownMenu.Item
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                              onSelect={() => onEnrichClick(lead)}
                            >
                              <Sparkles className="w-4 h-4" />
                              Enrich lead
                            </DropdownMenu.Item>

                            {/* Open lead */}
                            <DropdownMenu.Item
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                              onSelect={() => onOpenLead(lead)}
                            >
                              <ExternalLink className="w-4 h-4" />
                              Open lead
                            </DropdownMenu.Item>

                            <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />

                            {/* Remove from saved */}
                            {confirmingRemove === lead.id ? (
                              <div className="px-2 py-2 space-y-2" onKeyDown={(e) => e.stopPropagation()}>
                                <p className="text-xs text-gray-600">Remove this lead?</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRemoveLead(lead.id);
                                      setConfirmingRemove(null);
                                      closePopover();
                                    }}
                                    className="rounded bg-destructive-600 px-2 py-1 text-xs font-medium text-white hover:bg-destructive-700"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmingRemove(null);
                                    }}
                                    className="text-xs text-gray-500 hover:underline"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive-600 hover:bg-destructive-50 cursor-pointer outline-none"
                                onSelect={(e) => {
                                  e.preventDefault(); // prevent menu from closing
                                  setConfirmingRemove(lead.id);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove from saved
                              </DropdownMenu.Item>
                            )}
                            </>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tooltip.Provider>
  );
}

// ── Mock data ────────────────────────────────────────────────────

export const MOCK_SAVED_LEADS: SavedLead[] = [
  // Deliverable email, new status, all links present
  {
    id: 'mock-1',
    businessName: 'Acme Corp',
    contactName: 'Jane Smith',
    city: 'London',
    country: 'UK',
    score: 92,
    email: { address: 'jane@acmecorp.com', deliverability: 'deliverable' },
    links: {
      website: 'https://acmecorp.com',
      linkedin: 'https://linkedin.com/company/acmecorp',
      instagram: 'https://instagram.com/acmecorp',
      facebook: 'https://facebook.com/acmecorp',
    },
    status: 'new',
    engagementStatus: 'new',
    lastActivity: null,
    phone: '+44 20 1234 5678',
    whatsapp: '+44 7911 123456',
    notes: 'Met at trade show, interested in enterprise plan',
  },
  // Risky email, contacted status, some links
  {
    id: 'mock-2',
    businessName: 'Beta Solutions',
    contactName: 'Bob Jones',
    city: 'Manchester',
    country: 'UK',
    score: 65,
    email: { address: 'info@betasolutions.co.uk', deliverability: 'risky' },
    links: {
      website: 'https://betasolutions.co.uk',
      linkedin: 'https://linkedin.com/company/beta-solutions',
    },
    status: 'contacted',
    engagementStatus: 'contacted',
    lastActivity: null,
    phone: '+44 161 987 6543',
    whatsapp: '+44 7911 654321',
    notes: '',
  },
  // Undeliverable email, replied status
  {
    id: 'mock-3',
    businessName: 'Gamma Tech',
    contactName: 'Carol White',
    city: 'Birmingham',
    country: 'UK',
    score: 38,
    email: { address: 'carol@gammatech.io', deliverability: 'undeliverable' },
    links: {
      website: 'https://gammatech.io',
    },
    status: 'replied',
    engagementStatus: 'replied',
    lastActivity: null,
    phone: '+44 121 555 1234',
    whatsapp: undefined,
    notes: 'Previously engaged, email went bad',
  },
  // Verifying email, interested status, no links
  {
    id: 'mock-4',
    businessName: 'Delta Services',
    contactName: 'Dave Brown',
    city: 'Edinburgh',
    country: 'UK',
    score: 71,
    email: { address: 'dave@deltaservices.com', deliverability: 'verifying' },
    links: {},
    status: 'interested',
    engagementStatus: 'interested',
    lastActivity: null,
    phone: '+44 131 222 3333',
    whatsapp: '+44 7911 999888',
    notes: '',
  },
  // No email (none), not_interested status, no links
  {
    id: 'mock-5',
    businessName: 'Epsilon Ltd',
    contactName: 'Eve Davis',
    city: 'Bristol',
    country: 'UK',
    score: 22,
    email: { deliverability: 'none' },
    links: {},
    status: 'not_interested',
    engagementStatus: 'not_interested',
    lastActivity: null,
    phone: '+44 117 444 5555',
    whatsapp: undefined,
    notes: '',
  },
  // Deliverable email, qualified status, no WhatsApp
  {
    id: 'mock-6',
    businessName: 'Zeta Consulting',
    contactName: 'Frank Miller',
    city: 'Leeds',
    country: 'UK',
    score: 85,
    email: { address: 'frank@zetaconsult.co', deliverability: 'deliverable' },
    links: {
      website: 'https://zetaconsult.co',
      linkedin: 'https://linkedin.com/in/frankmiller',
    },
    status: 'qualified',
    engagementStatus: 'contacted',
    pipelineStage: 'qualified',
    lastActivity: null,
    phone: '+44 113 666 7777',
    whatsapp: undefined,
    notes: 'Large opportunity, needs proposal',
  },
  // Various other statuses for badge coverage
  {
    id: 'mock-7',
    businessName: 'Eta Design',
    city: 'Glasgow',
    country: 'UK',
    score: 55,
    email: { address: 'hello@etadesign.com', deliverability: 'deliverable' },
    links: { website: 'https://etadesign.com' },
    status: 'proposal_sent',
    pipelineStage: 'proposal_sent',
    lastActivity: null,
    phone: '+44 141 888 9999',
    whatsapp: '+44 7911 111222',
    notes: '',
  },
  {
    id: 'mock-8',
    businessName: 'Theta Analytics',
    city: 'Cardiff',
    country: 'UK',
    score: 90,
    email: { address: 'team@thetaanalytics.wales', deliverability: 'risky' },
    links: {},
    status: 'converted',
    pipelineStage: 'converted',
    lastActivity: null,
    phone: '+44 29 222 3333',
    notes: '',
  },
  {
    id: 'mock-9',
    businessName: 'Iota Foods',
    city: 'Belfast',
    country: 'UK',
    score: 15,
    email: { address: 'old@iotafoods.co.uk', deliverability: 'undeliverable' },
    links: {},
    status: 'closed',
    lastActivity: null,
    notes: '',
  },
  {
    id: 'mock-10',
    businessName: 'Kappa Logistics',
    city: 'Liverpool',
    country: 'UK',
    score: 42,
    email: { address: 'ops@kappalog.co.uk', deliverability: 'risky' },
    links: { website: 'https://kappalog.co.uk' },
    status: 'lost',
    pipelineStage: 'lost',
    lastActivity: null,
    whatsapp: '+44 7911 333444',
    notes: '',
  },
  {
    id: 'mock-11',
    businessName: 'Lambda Media',
    city: 'Sheffield',
    country: 'UK',
    score: 67,
    email: { address: 'press@lambdamedia.co', deliverability: 'deliverable' },
    links: { website: 'https://lambdamedia.co', instagram: 'https://instagram.com/lambdamedia' },
    status: 'out_of_office',
    engagementStatus: 'out_of_office',
    lastActivity: null,
    whatsapp: '+44 7911 555666',
    notes: '',
  },
  {
    id: 'mock-12',
    businessName: 'Mu Security',
    city: 'Nottingham',
    country: 'UK',
    score: 30,
    email: { address: 'abuse@ musec.co.uk', deliverability: 'undeliverable' },
    links: {},
    status: 'not_interested',
    engagementStatus: 'not_interested',
    doNotContact: true,
    lastActivity: null,
    notes: 'Requested removal from mailing list',
  },
  {
    id: 'mock-13',
    businessName: 'Nu Consulting',
    city: 'Oxford',
    country: 'UK',
    score: 48,
    email: { deliverability: 'none' },
    links: { website: 'https://nuconsulting.co.uk' },
    status: 'archived',
    lastActivity: null,
    phone: '+44 1865 111222',
    whatsapp: undefined,
    notes: '',
  },
];
