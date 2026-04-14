import { supabaseAdmin } from '../db';

/**
 * Get or create usage tracking row for current month
 */
async function getOrCreateUsage(userId: string, month: string) {
  // Try to fetch existing
  let { data, error } = await supabaseAdmin
    .from('usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  if (!data || error) {
    // Create fresh tracking row
    await supabaseAdmin.from('usage_tracking').insert({
      user_id: userId,
      month,
      searches_count: 0,
      email_verifications_count: 0,
      ai_emails_count: 0,
      leads_count: 0,
      enrichment_count: 0,
    });
    return { searches_count: 0, email_verifications_count: 0, ai_emails_count: 0, leads_count: 0, enrichment_count: 0 };
  }

  return data;
}

/**
 * Increment a usage counter. Returns the new count and limit status.
 */
export async function incrementUsage(
  userId: string,
  field: 'searches_count' | 'email_verifications_count' | 'ai_emails_count' | 'leads_count' | 'enrichment_count',
  delta: number = 1
) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const usage = await getOrCreateUsage(userId, month);
  const newValue = (usage[field] ?? 0) + delta;
  
  await supabaseAdmin
    .from('usage_tracking')
    .update({ [field]: newValue, updated_at: now.toISOString() })
    .eq('user_id', userId)
    .eq('month', month);
  
  return { [field]: newValue };
}

/**
 * Get current month usage for a user
 */
export async function getUsage(userId: string) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return getOrCreateUsage(userId, month);
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────
export async function incrementSearches(userId: string) {
  return incrementUsage(userId, 'searches_count');
}
export async function incrementLeads(userId: string) {
  return incrementUsage(userId, 'leads_count');
}
export async function incrementEmailVerifications(userId: string) {
  return incrementUsage(userId, 'email_verifications_count');
}
export async function incrementAIEmails(userId: string) {
  return incrementUsage(userId, 'ai_emails_count');
}
export async function incrementEnrichments(userId: string) {
  return incrementUsage(userId, 'enrichment_count');
}
