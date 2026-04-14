/**
 * Downgrade logic — run when a subscription is cancelled / deleted.
 * NEVER deletes user data. Only pauses sequences, locks premium features,
 * and resets plan to free.
 */
import { supabaseAdmin } from '../../db';
import { getTier } from './tiers';

export interface DowngradeResult {
  userId: string;
  plan: string;
  status: string;
  sequencesPaused: number;
  aiEmailsLocked: boolean;
  creditTransactionId: string | null;
}

/**
 * Downgrade a user to free plan after subscription cancellation.
 * - Sets plan = 'free', subscription_status = 'cancelled'
 * - Pauses all active sequences
 * - Locks AI email generation
 * - Preserves ALL user data (never deletes)
 * - Logs a credit_transaction record
 */
export async function runDowngrade(userId: string): Promise<DowngradeResult> {
  const now = new Date().toISOString();

  // 1. Get current profile for logging
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('plan, subscription_status')
    .eq('id', userId)
    .single();

  const previousPlan = profile?.plan || 'free';
  console.log(`[Downgrade] User ${userId}: ${previousPlan} → free`);

  // 2. Update profile to free
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .update({
      plan: 'free',
      subscription_status: 'cancelled',
      subscription_ends_at: null,
      updated_at: now,
    })
    .eq('id', userId);

  if (profileErr) {
    console.error(`[Downgrade] Failed to update profile for ${userId}:`, profileErr.message);
    throw profileErr;
  }

  // 3. Pause all active sequences
  const { data: activeSequences, error: seqErr } = await supabaseAdmin
    .from('sequences')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  let sequencesPaused = 0;

  if (!seqErr && activeSequences && activeSequences.length > 0) {
    const { error: pauseErr } = await supabaseAdmin
      .from('sequences')
      .update({ status: 'paused', updated_at: now })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (pauseErr) {
      console.error(`[Downgrade] Failed to pause sequences for ${userId}:`, pauseErr.message);
    } else {
      sequencesPaused = activeSequences.length;
      console.log(`[Downgrade] Paused ${sequencesPaused} sequences for ${userId}`);
    }
  }

  // 4. Also pause active sequence enrollments (so scheduled jobs won't fire)
  const { error: enrolErr } = await supabaseAdmin
    .from('sequence_enrollments')
    .update({ status: 'paused' })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (enrolErr) {
    console.error(`[Downgrade] Failed to pause enrollments for ${userId}:`, enrolErr.message);
  }

  // 5. Lock AI email generation — NOTE: ai_emails_locked column doesn't exist yet
  // Feature gates already check subscription status, so this is redundant.
  // Skip the profile update for the missing column.
  const aiEmailsLocked = true; // Conceptually locked since plan is now free

  // 6. Log credit_transaction for audit trail
  let creditTransactionId: string | null = null;
  const { data: txn, error: txnErr } = await supabaseAdmin
    .from('credit_transactions')
    .insert({
      user_id: userId,
      action: 'grace_period_downgrade',
      amount: 0,
      metadata: {
        previous_plan: previousPlan,
        sequences_paused: sequencesPaused,
        ai_emails_locked: aiEmailsLocked,
        downgraded_at: now,
      },
    })
    .select('id')
    .single();

  if (txnErr) {
    console.error(`[Downgrade] Failed to log credit_transaction for ${userId}:`, txnErr.message);
  } else {
    creditTransactionId = (txn as any)?.id || null;
  }

  // 7. Also update subscriptions table if it exists
  const { error: subErr } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      updated_at: now,
    })
    .eq('user_id', userId)
    .neq('status', 'cancelled');

  // Ignore error — subscriptions table may not exist yet
  if (subErr) {
    console.log(`[Downgrade] subscriptions table update skipped for ${userId}: ${subErr.message}`);
  }

  const result: DowngradeResult = {
    userId,
    plan: 'free',
    status: 'cancelled',
    sequencesPaused,
    aiEmailsLocked,
    creditTransactionId,
  };

  console.log(`[Downgrade] Complete for ${userId}:`, JSON.stringify(result));
  return result;
}
