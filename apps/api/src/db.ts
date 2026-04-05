import { Hono } from 'hono';
// Load .env before anything else
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '..', '.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Auth middleware — verifies JWT and adds userId/user to context
export async function authMiddleware(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid token' }, 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    // First try to verify with the anon key (JWT signed by Supabase Auth)
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      // Fall back to manual JWT decoding if auth.getUser fails
      const supabaseWithKey = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData, error: userError } = await supabaseWithKey.auth.getUser(token);

      if (userError || !userData.user) {
        return c.json({ error: 'Unauthorized: Invalid token' }, 401);
      }

      c.set('userId', userData.user.id);
      c.set('user', userData.user);
    } else {
      c.set('userId', data.user.id);
      c.set('user', data.user);
    }

    await next();
  } catch (err) {
    return c.json({ error: 'Unauthorized: Token verification failed' }, 401);
  }
}

// Helper: get user ID from context
export function getUserId(c: any): string {
  return c.get('userId');
}

export type Database = typeof supabase;

// Database helper functions
export async function getLeads(userId: string, params: {
  limit?: number;
  cursor?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
  search?: string;
}) {
  const { limit = 20, cursor, sortField = 'created_at', sortOrder = 'desc', status, search } = params;

  let query = supabaseAdmin.from('leads').select('*', { count: 'exact' })
    .eq('user_id', userId);

  if (status) query = query.eq('status', status);

  if (search) {
    query = query.or(
      `business_name.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`
    );
  }

  if (cursor) {
    const { data: cursorLeads } = await supabaseAdmin
      .from('leads')
      .select(sortField)
      .eq('id', cursor)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (!cursorLeads || (cursorLeads as any).error) {
      return { data: [], nextCursor: null as string | null, total: 0 };
    }

    const typedCursorLeads = cursorLeads as unknown as Record<string, unknown>;
    const cursorValue: unknown = typedCursorLeads[sortField];
    if (sortOrder === 'desc') {
      query = query.lt(sortField, cursorValue);
    } else {
      query = query.gt(sortField, cursorValue);
    }
  }

  query = query.order(sortField, { ascending: sortOrder === 'asc' }).limit(limit + 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const items = (data ?? []) as any[];
  const hasMore = items.length > limit;
  const paginatedItems = items.slice(0, limit);
  const nextCursor = hasMore ? paginatedItems[paginatedItems.length - 1].id : null;

  return {
    data: paginatedItems.map((lead: any) => ({
      ...lead,
      readiness_flags: safeParseJson(lead.readiness_flags, []),
      tags: safeParseJson(lead.tags, []),
      metadata: safeParseJson(lead.metadata, {}),
    })),
    nextCursor,
    total: count ?? 0,
  };
}

export async function getLeadById(userId: string, id: string) {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error || !data) return null;

  const lead = data as any;
  return {
    ...lead,
    readiness_flags: safeParseJson(lead.readiness_flags, []),
    tags: safeParseJson(lead.tags, []),
    metadata: safeParseJson(lead.metadata, {}),
  };
}

export async function createLead(userId: string, values: any) {
  const insertData = {
    user_id: userId,
    ...values,
    readiness_flags: values.readiness_flags ?? [],
    tags: values.tags ?? [],
    metadata: values.metadata ?? {},
    review_count: values.review_count ?? 0,
    hot_score: values.hot_score ?? 0,
    status: values.status ?? 'new',
    source: values.source ?? 'manual',
  };

  const { data, error } = await supabaseAdmin.from('leads').insert(insertData).select('id').single();
  if (error) throw error;
  return { id: (data as any).id };
}

export async function batchCreateLeads(userId: string, leads: any[]) {
  let imported = 0;
  for (const lead of leads) {
    try {
      await createLead(userId, lead);
      imported++;
    } catch (err) {
      console.warn('[Batch] Failed to insert lead:', err);
    }
  }
  return { imported };
}

export async function updateLead(userId: string, id: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from('leads')
    .update(values)
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deleteLead(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return (data as any[]).length > 0;
}

export async function createActivity(userId: string, values: {
  lead_id: string;
  type: string;
  description?: string | null;
}) {
  const { error } = await supabaseAdmin
    .from('lead_activities')
    .insert({ ...values, user_id: userId });
  if (error) throw error;
}

export async function getActivitiesForLead(userId: string, leadId: string) {
  const { data, error } = await supabaseAdmin
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function getSequences(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('sequences')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

export async function createSequence(userId: string, values: any) {
  const { data, error } = await supabaseAdmin
    .from('sequences')
    .insert({ ...values, user_id: userId })
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as any).id };
}

export async function getKPI(userId: string) {
  const { count: totalLeads } = await supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

  const { count: contactedThisWeek } = await supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['contacted', 'qualified', 'proposal_sent', 'converted'])
    .gte('last_contacted', weekStart.toISOString());

  const { count: replies } = await supabaseAdmin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'replied');

  const { count: openSequences } = await supabaseAdmin
    .from('sequences')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  return {
    total_leads: totalLeads ?? 0,
    contacted_this_week: contactedThisWeek ?? 0,
    replies: replies ?? 0,
    open_sequences: openSequences ?? 0,
  };
}

function safeParseJson(value: unknown, fallback: unknown) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value as string); } catch { return fallback; }
}
