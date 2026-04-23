import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../db';

export type FollowUpSource = 'column_default' | 'reply_received' | 'manual';

/**
 * Returns UTC midnight N days from now. All follow-up dates are stored as
 * start-of-day so that "overdue" checks at any time during the day are
 * consistent (filter uses `follow_up_date <= startOfToday()`).
 */
export function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * Returns UTC midnight today. Same boundary used by the filter pill and
 * the urgency indicator. Equivalent to `daysFromNow(0)`.
 */
export const startOfToday = () => daysFromNow(0);

export async function setFollowUp(
  leadId: string,
  date: Date | null,
  source: FollowUpSource | null,
  supabase: SupabaseClient = supabaseAdmin
): Promise<void> {
  if ((date === null) !== (source === null)) {
    throw new Error('follow_up_date and follow_up_source must be set atomically');
  }
  const { error } = await supabase
    .from('leads')
    .update({
      follow_up_date: date?.toISOString() ?? null,
      follow_up_source: source,
    })
    .eq('id', leadId);
  if (error) {
    throw new Error(`setFollowUp failed: ${error.message}`);
  }
}
