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
