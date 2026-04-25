import { PIPELINE_COLUMNS, getColumnDef } from '../constants/pipeline';
import type { FollowUpSource } from '../schemas';

/**
 * Compute follow-up date for a lead being moved to a new stage.
 *
 * Returns ISO date string (midnight UTC) or null.
 * If the column has defaultFollowUpDays === null, returns null (clears urgency).
 */
export function setFollowUp(
  lead: { followUpDate?: string | null; followUpSource?: string | null },
  newStage: string,
  options?: { overrideDays?: number; now?: Date; dryRun?: boolean }
): { followUpDate: string | null; followUpSource: FollowUpSource | null } {
  const col = getColumnDef(newStage);
  const days = options?.overrideDays ?? col?.defaultFollowUpDays ?? null;

  // If no follow-up configured for this column, clear any existing follow-up
  if (days === null) {
    return { followUpDate: null, followUpSource: null };
  }

  const now = options?.now ?? new Date();
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days));
  const followUpDate = target.toISOString().split('T')[0] + 'T00:00:00.000Z';

  return {
    followUpDate,
    followUpSource: 'column_default',
  };
}

/**
 * Check if a lead's follow-up is overdue or due today.
 */
export function getUrgencyStatus(followUpDate: string | null | undefined): 'overdue' | 'due_today' | 'upcoming' | 'none' {
  if (!followUpDate) return 'none';
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const due = new Date(followUpDate);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'due_today';
  return 'upcoming';
}

/**
 * Health colour for a follow-up date.
 * Red = overdue, amber = due today, green = upcoming, null = no date set.
 * Uses UTC midnight for BST-safe date comparison.
 */
export function followUpHealth(followUpDate: string | null | undefined): "red" | "amber" | "green" | null {
  if (!followUpDate) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(followUpDate);
  due.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "red";
  if (diffDays === 0) return "amber";
  return "green";
}

/**
 * Return a UTC-midnight Date N days from now.
 * Used for follow-up date calculations (BST-safe).
 */
export function daysFromNow(days: number, now = new Date()): Date {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Format deal value (pence integer) to compact GBP string.
 * £4,250 → "£4.2k", £350 → "£350"
 */
export function formatCompactDealValue(pence: number | null | undefined): string | null {
  if (pence == null) return null;
  const pounds = Math.round(pence / 100);
  if (pounds >= 1000) {
    const k = (pounds / 1000).toFixed(1).replace(/\.0$/, '');
    return `£${k}k`;
  }
  return `£${pounds.toLocaleString()}`;
}
