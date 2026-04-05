// Load .env before anything else
import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ─── TypeScript Types ────────────────────────────────────────────────────────

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface Lead {
  id: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  rating: number | null;
  review_count: number;
  hot_score: number;
  readiness_flags: string[];
  status: string;
  source: string;
  notes: string | null;
  tags: string[];
  metadata: Record<string, JsonValue>;
  created_at: string;
  updated_at: string;
  last_contacted: string | null;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: string;
  description: string | null;
  created_at: string;
}

export interface Sequence {
  id: string;
  name: string;
  status: string;
  leads_count: number;
  sent_count: number;
  reply_count: number;
  steps: number;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  subject_template: string;
  body_template: string;
  delay_days: number;
  step_order: number;
}

// ─── Helper: Safely parse JSONB from Supabase ────────────────────────────────

export function safeParseJson(value: unknown, fallback: unknown) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value; // Already parsed by Supabase
  try {
    return JSON.parse(value as string);
  } catch {
    return fallback;
  }
}

// ─── Database helper functions ───────────────────────────────────────────────

export async function getLeads(params: {
  limit?: number;
  cursor?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
  search?: string;
}) {
  const { limit = 20, cursor, sortField = 'created_at', sortOrder = 'desc', status, search } = params;

  let query = supabase.from('leads').select('*', { count: 'exact' });

  // Filter by status
  if (status) {
    query = query.eq('status', status);
  }

  // Search
  if (search) {
    query = query.or(
      `business_name.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`
    );
  }

  // Cursor-based pagination
  if (cursor) {
    // Fetch the cursor lead to get its sort value
    const { data: cursorLeads } = await supabase
      .from('leads')
      .select(sortField)
      .eq('id', cursor)
      .limit(1)
      .single();

    if (!cursorLeads) {
      return { data: [], nextCursor: null as string | null, total: 0 };
    }

    const cursorValue = (cursorLeads as never as Record<string, unknown>)[sortField];
    if (sortOrder === 'desc') {
      query = query.lt(sortField, cursorValue as string);
    } else {
      query = query.gt(sortField, cursorValue as string);
    }
  }

  // Order and limit
  query = query.order(sortField, { ascending: sortOrder === 'asc' }).limit(limit + 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const items = (data ?? []) as Lead[];
  const hasMore = items.length > limit;
  const paginatedItems = items.slice(0, limit);

  // Parse JSONB fields
  const parsedItems = paginatedItems.map((lead) => ({
    ...lead,
    readiness_flags: safeParseJson(lead.readiness_flags, []) as string[],
    tags: safeParseJson(lead.tags, []) as string[],
    metadata: safeParseJson(lead.metadata, {}) as Record<string, JsonValue>,
  }));

  const nextCursor = hasMore ? paginatedItems[paginatedItems.length - 1].id : null;

  return {
    data: parsedItems,
    nextCursor,
    total: count ?? 0,
  };
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .limit(1)
    .single();

  if (error || !data) return null;

  const lead = data as Lead;
  return {
    ...lead,
    readiness_flags: safeParseJson(lead.readiness_flags, []) as string[],
    tags: safeParseJson(lead.tags, []) as string[],
    metadata: safeParseJson(lead.metadata, {}) as Record<string, JsonValue>,
  };
}

export async function createLead(values: {
  id?: string;
  business_name: string;
  email?: string | null;
  phone?: string | null;
  website_url?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  category?: string | null;
  rating?: number | null;
  review_count?: number;
  hot_score?: number;
  readiness_flags?: string[];
  status?: string;
  source?: string;
  notes?: string | null;
  tags?: string[];
  metadata?: Record<string, JsonValue>;
  created_at?: string;
  updated_at?: string;
  last_contacted?: string | null;
}): Promise<{ id: string }> {
  const insertData = {
    ...values,
    readiness_flags: values.readiness_flags ?? [],
    tags: values.tags ?? [],
    metadata: values.metadata ?? {},
    review_count: values.review_count ?? 0,
    hot_score: values.hot_score ?? 0,
    status: values.status ?? 'new',
    source: values.source ?? 'manual',
  };

  const { data, error } = await supabase.from('leads').insert(insertData).select('id').single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export async function updateLead(id: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('leads').update(values).eq('id', id);
  if (error) throw error;
}

export async function deleteLead(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('leads').delete().eq('id', id).select('id');
  if (error) throw error;
  return (data as any[]).length > 0;
}

export async function createActivity(values: {
  lead_id: string;
  type: string;
  description?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('lead_activities').insert(values);
  if (error) throw error;
}

export async function getActivitiesForLead(leadId: string): Promise<LeadActivity[]> {
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as LeadActivity[];
}
