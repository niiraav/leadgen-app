import type { ReplyIntent } from '@leadgen/shared';

// ── Relative time formatting ──────────────────────────────────────────────

export function formatRelativeTime(timestamp: Date | string): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / (86400000));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays >= 2 && diffDays <= 6) return `${diffDays}d ago`;
  if (diffDays >= 7 && diffDays <= 27) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  }

  // 28+ days — show absolute date
  const day = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// ── Reply intent chip config ──────────────────────────────────────────────

export const REPLY_INTENT_CHIP: Record<ReplyIntent, { label: string; className: string }> = {
  interested:     { label: 'Interested',   className: 'bg-green/15 text-green' },
  question:       { label: 'Question',     className: 'bg-blue/15 text-blue' },
  objection:      { label: 'Objection',    className: 'bg-amber/15 text-amber' },
  not_now:        { label: 'Not now',      className: 'bg-gray-200 text-gray-600' },
  not_interested: { label: 'Not interested', className: 'bg-red/15 text-red' },
};
