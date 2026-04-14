const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

import { createBrowserSupabaseClient } from "./supabase";

// ─── Custom error for upgrade-required (402) responses ────────────────────────

export class UpgradeRequiredError extends Error {
  public upgradeRequired: boolean;
  public limit: number;
  public remaining: number;

  constructor(message: string, opts: { upgradeRequired?: boolean; limit?: number; remaining?: number } = {}) {
    super(message);
    this.name = 'UpgradeRequiredError';
    this.upgradeRequired = opts.upgradeRequired ?? true;
    this.limit = opts.limit ?? 0;
    this.remaining = opts.remaining ?? 0;
  }
}

import type {
  Lead,
  LeadSource,
  LeadActivity,
  Sequence,
  AIGeneratedEmail,
  DashboardKPI,
} from "@leadgen/shared";

// ─── Response shapes matching the backend ─────────────────────────────────────

/** Backend returns { data: Lead[], nextCursor: string|null, total: number } */
export interface BackendPaginatedLeads {
  data: BackendLead[];
  nextCursor: string | null;
  total: number;
}

/** Backend returns { query, count, results[] } for search */
export interface BackendSearchResult {
  query: string;
  count: number;
  results: BackendRawSearchLead[];
}

/** Lead fields as returned by the backend (snake_case - stored in SQLite/Supabase) */
export interface BackendLead {
  id: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
  country: string;
  category: string | null;
  rating: number | null;
  review_count: number;
  hot_score: number;
  readiness_flags: string[];
  status: string;
  source: string;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_contacted: string | null;
  // Contact enrichment fields
  contact_full_name?: string | null;
  contact_title?: string | null;
  contact_email?: string | null;
  contact_email_type?: string | null;
  contact_phone?: string | null;
  contact_linkedin?: string | null;
  company_linkedin?: string | null;
  domain?: string | null;
  contact_enriched_at?: string | null;
  contacts?: Record<string, unknown>[] | null;
  company_socials?: Record<string, unknown> | null;
  // Enrichment status tracking
  contact_enrichment_status?: 'pending' | 'success' | 'partial' | 'failed' | 'no_data' | null;
  contact_enrichment_provider?: string | null;
  contact_enrichment_error?: string | null;
  // AI bio (cached per lead)
  ai_bio?: string | null;
  ai_bio_generated_at?: string | null;
}

/** A raw search result from search providers (SerpAPI/Outscraper) */
export interface BackendRawSearchLead {
  business_name: string;
  phone?: string;
  website_url?: string;
  address?: string;
  city?: string;
  country?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  latitude?: number;
  longitude?: number;
  hot_score?: number;
  readiness_flags?: string[];
  source?: string;
  place_id?: string;
  data_id?: string;
  gmb_reviews_url?: string;
  postal_code?: string;
}

/** Single lead from GET /leads/:id */
export interface BackendLeadDetail {
  id: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
  country: string;
  category: string | null;
  rating: number | null;
  review_count: number;
  hot_score: number;
  readiness_flags: string[];
  status: string;
  source: string;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_contacted: string | null;
  // Contact enrichment fields
  contact_full_name?: string | null;
  contact_title?: string | null;
  contact_email?: string | null;
  contact_email_type?: string | null;
  contact_phone?: string | null;
  contact_linkedin?: string | null;
  company_linkedin?: string | null;
  domain?: string | null;
  contact_enriched_at?: string | null;
  contacts?: Record<string, unknown>[] | null;
  company_socials?: Record<string, unknown> | null;
  // Enrichment status tracking
  contact_enrichment_status?: 'pending' | 'success' | 'partial' | 'failed' | null;
  contact_enrichment_provider?: string | null;
  contact_enrichment_error?: string | null;
  // AI bio (cached per lead)
  ai_bio?: string | null;
  ai_bio_generated_at?: string | null;
}

/** Pipeline activity response */
export interface BackendActivityResponse {
  lead_id: string;
  activities: LeadActivity[];
}

/** Pipeline status update response */
export interface BackendStatusUpdateResponse {
  message: string;
  lead_id: string;
  status: string;
}

/** AI email response */
export interface BackendAIEmailResponse {
  lead_id: string;
  email: {
    subject_lines?: string[];
    subject: string;
    body: string;
  };
}

/** KPI summary from API */
export interface BackendKPI {
  total_leads: number;
  contacted_this_week: number;
  replies: number;
  open_sequences: number;
}

// ─── Field mapping: backend (camelCase) → frontend (snake_case) ──────────────

export function mapBackendLead(raw: BackendLead): Lead {
  return {
    id: raw.id,
    business_name: raw.business_name,
    contact_name: undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    website_url: raw.website_url ?? undefined,
    address: raw.address ?? undefined,
    city: raw.city ?? undefined,
    country: raw.country,
    latitude: undefined,
    longitude: undefined,
    category: raw.category ?? undefined,
    industry: raw.category ?? undefined,
    company_size: (raw as any).company_size ?? undefined,
    linkedin_url: (raw as any).linkedin_url ?? (raw as any).contact_linkedin ?? undefined,
    facebook_url: (raw as any).facebook_url ?? undefined,
    instagram_url: (raw as any).instagram_url ?? undefined,
    twitter_handle: (raw as any).twitter_handle ?? undefined,
    has_website: !!raw.website_url,
    rating: raw.rating ?? undefined,
    review_count: raw.review_count,
    hot_score: raw.hot_score,
    readiness_flags: raw.readiness_flags,
    status: raw.status as Lead["status"],
    source: raw.source as Lead["source"],
    notes: raw.notes ?? undefined,
    tags: raw.tags,
    metadata: raw.metadata,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    last_contacted: raw.last_contacted ?? undefined,
    sequence_ended: undefined,
    owner_name: (raw as any).owner_name ?? undefined,
    owner_first_name: (raw as any).owner_first_name ?? undefined,
    owner_name_source: (raw as any).owner_name_source ?? undefined,
    place_id: (raw as any).place_id ?? undefined,
    data_id: (raw as any).data_id ?? undefined,
    gmb_url: (raw as any).gmb_url ?? undefined,
    gmb_reviews_url: (raw as any).gmb_reviews_url ?? undefined,
    enriched_at: (raw as any).enriched_at ?? undefined,
    enrichment_attempted_at: (raw as any).enrichment_attempted_at ?? undefined,
    email_status: (raw as any).email_status ?? undefined,
    email_status_checked_at: (raw as any).email_status_checked_at ?? undefined,
    // Contact enrichment fields
    contact_full_name: (raw as any).contact_full_name ?? undefined,
    contact_title: (raw as any).contact_title ?? undefined,
    contact_email: (raw as any).contact_email ?? undefined,
    contact_email_type: (raw as any).contact_email_type ?? undefined,
    contact_phone: (raw as any).contact_phone ?? undefined,
    contact_linkedin: (raw as any).contact_linkedin ?? undefined,
    company_linkedin: (raw as any).company_linkedin ?? undefined,
    domain: (raw as any).domain ?? undefined,
    contact_enriched_at: (raw as any).contact_enriched_at ?? undefined,
    contacts: (raw as any).contacts ?? undefined,
    company_socials: (raw as any).company_socials ?? undefined,
    // Enrichment status tracking
    contact_enrichment_status: (raw as any).contact_enrichment_status ?? undefined,
    contact_enrichment_provider: (raw as any).contact_enrichment_provider ?? undefined,
    contact_enrichment_error: (raw as any).contact_enrichment_error ?? undefined,
    // AI bio (cached per lead, used invisibly for email personalization)
    ai_bio: raw.ai_bio ?? undefined,
    ai_bio_generated_at: raw.ai_bio_generated_at ?? undefined,
  };
}

// ─── Generic request helper ──────────────────────────────────────────────────

// Cached session token — avoids calling supabase.auth.getSession() on every request.
// Supabase tokens expire every hour but the client auto-refreshes; we re-check
// periodically and on 401 errors.
let _cachedToken: string | null = null;
let _tokenExpiry = 0; // timestamp when cached token becomes stale
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 min — balances freshness vs. overhead

async function getAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;
  try {
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      _cachedToken = session.access_token;
      // Set expiry to 5 min from now, or token's real expiry minus 60s (whichever is sooner)
      const realExpiry = (session.expires_at ?? 0) * 1000 - 60_000;
      _tokenExpiry = Math.min(now + TOKEN_CACHE_TTL, realExpiry > now ? realExpiry : now + TOKEN_CACHE_TTL);
      return _cachedToken;
    }
  } catch {
    // Not logged in — let the API return 401
  }
  _cachedToken = null;
  _tokenExpiry = 0;
  return null;
}

// Call this after a 401 to force a fresh token lookup on next request
export function invalidateSessionCache() {
  _cachedToken = null;
  _tokenExpiry = 0;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Attach Supabase JWT if available (cached)
  const token = await getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Only set Content-Type when NOT sending FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Invalidate cached token so next request fetches a fresh one
        invalidateSessionCache();
        // Already on auth page — don't redirect (causes flicker)
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth')) {
          throw new Error('Unauthorized — not logged in');
        }
        window.location.href = '/auth/login';
        throw new Error("Session expired — redirecting to login");
      }

      // 402 = upgrade required (feature gate / credit limit)
      if (response.status === 402) {
        const errorData = await response.json().catch(() => ({}));
        throw new UpgradeRequiredError(
          errorData.error || 'Upgrade required',
          {
            upgradeRequired: errorData.upgrade_required ?? true,
            limit: errorData.limit ?? 0,
            remaining: errorData.remaining ?? 0,
          }
        );
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message ||
          errorData.error ||
          `API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as Promise<T>;
  } catch (err: any) {
    // Already redirected, re-throw to let caller handle
    throw err;
  }
}

// ─── Public API client ───────────────────────────────────────────────────────

export const api = {
  // ── Google Maps search ──
  search: {
    googleMaps: (params: {
      query: string;
      location: string;
      maxResults?: number;
      noWebsite?: boolean;
    }) =>
      request<BackendSearchResult>("/search/google-maps", {
        method: "POST",
        body: JSON.stringify({
          query: params.query,
          location: params.location,
          maxResults: Math.min(params.maxResults ?? 50, 50),
          noWebsite: params.noWebsite ?? false,
        }),
      }),
  },

  // ── Leads CRUD ──
  leads: {
    list: (params?: {
      cursor?: string;
      limit?: number;
      status?: string;
      search?: string;
      sortField?: string;
      sortOrder?: "asc" | "desc";
    }) => {
      const qs = new URLSearchParams();
      if (params?.cursor) qs.set("cursor", params.cursor);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.status) qs.set("status", params.status);
      if (params?.search) qs.set("search", params.search);
      if (params?.sortField) qs.set("sortField", params.sortField);
      if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
      return request<BackendPaginatedLeads>(`/leads?${qs.toString()}`);
    },

    get: (id: string) =>
      request<BackendLeadDetail>(`/leads/${id}`).then(mapBackendLead),

    create: (data: Record<string, unknown>) =>
      request<BackendLeadDetail>("/leads", {
        method: "POST",
        body: JSON.stringify(data),
      }).then(mapBackendLead),

    batchCreate: (leads: Record<string, unknown>[]) =>
      request<{ imported: number }>("/leads/batch", {
        method: "POST",
        body: JSON.stringify({ leads }),
      }),

    update: (id: string, data: Record<string, unknown>) =>
      request<BackendLeadDetail>(`/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }).then(mapBackendLead),

    delete: (id: string) =>
      request<{ message: string }>(`/leads/${id}`, { method: "DELETE" }),
  },

  // ── Pipeline ──
  pipeline: {
    list: async () => {
      // Backend doesn't have a standalone pipeline list — use leads with wider scope
      const res = await api.leads.list({ limit: 500 });
      return res.data.map(mapBackendLead);
    },

    updateStatus: (id: string, status: string, notes?: string) =>
      request<BackendStatusUpdateResponse>(`/pipeline/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, notes }),
      }),

    getActivity: (id: string) =>
      request<BackendActivityResponse>(`/pipeline/${id}/activity`),
  },

  // ── Sequences ──
  sequences: {
    list: () => request<Sequence[]>("/sequences"),
    create: (data: Record<string, unknown>) =>
      request<Sequence>("/sequences", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // ── AI Email ──
  ai: {
    composeEmail: (leadId: string, params: {
      tone: "professional" | "friendly" | "casual" | "persuasive";
      purpose: string;
      customInstructions?: string;
      recontact?: boolean;
      bio?: string;
      owner_first_name?: string;
      profile_usp?: string;
      profile_services?: string[];
      profile_full_name?: string;
      profile_signoff?: string;
      profile_cta?: string;
      profile_calendly?: string;
      profile_linkedin?: string;
    }) =>
      request<BackendAIEmailResponse>(`/leads/${leadId}/ai-email`, {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },

  // ── Lead Enrichment ──
  enrich: {
    enrichLead: (leadId: string) =>
      request<{ success: boolean; owner_name: string | null; owner_first_name: string | null; owner_name_source: string | null; enriched_at: string }>(
        `/leads/${leadId}/enrich`,
        { method: "POST" }
      ),
    updateSocialLinks: (leadId: string, data: Record<string, unknown>) =>
      request<Record<string, unknown>>(`/leads/${leadId}/social-links`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    backfillGmbUrls: () =>
      request<{ updated: number; skipped: number; fallback_used: number }>(
        "/leads/admin/backfill-gmb-urls",
        { method: "POST" }
      ),
  },

  // ── Import ──
  import: {
    csv: (rows: Record<string, unknown>[]) =>
      request<{ imported: number }>("/leads/batch", {
        method: "POST",
        body: JSON.stringify({ leads: rows }),
      }),
  },

  // ── KPI / Dashboard ──
  kpi: {
    get: async (): Promise<DashboardKPI> => {
      const res = await api.leads.list({ limit: 1 });
      const total = res.total;

      return {
        total_leads: total,
        contacted_this_week: 0,
        replies: 0,
        open_sequences: 0,
      };
    },
  },

  // ── Reply Classification ───────────────────────────────────────────
  classifyReply: async (leadId: string, replyText: string) => {
    const res = await request<{
      classification: string;
      suggested_stage: string;
      reasoning: string;
      previous_status: string;
      auto_moved: boolean;
      re_engage_after?: string;
    }>(`/leads/${leadId}/classify-reply`, {
      method: "POST",
      body: JSON.stringify({ reply_text: replyText }),
    });
    return res;
  },

  // Undo a status auto-change
  undoStatus: async (leadId: string, revert_to: string) => {
    return request(`/leads/${leadId}/undo-status`, {
      method: "POST",
      body: JSON.stringify({ revert_to }),
    });
  },

  // Stale leads (returns stale leads from the /leads/stale endpoint)
  staleLeads: async () => {
    const res = await request<any>("/leads/stale?limit=5");
    return res.leads ?? [];
  },

  // Pipeline health
  pipelineHealth: async (): Promise<{
    health_score: number; stale_count: number; uncontacted_count: number;
    active_sequences: number; won_this_month: number; conversion_rate: number;
    insights: string[];
  }> => {
    return request("/analytics/pipeline-health");
  },

  // ── Profile ──────────────────────────────────────────────────────
  profile: {
    get: () => request<any>("/profile"),
    patch: (data: Record<string, unknown>) =>
      request<any>("/profile", { method: "PATCH", body: JSON.stringify(data) }),
    completeness: () =>
      request<{ score: number; missing: string[]; next_prompt: any }>("/profile/completeness"),
    generateUsp: (data: Record<string, unknown>) =>
      request<{ pitches: string[] }>("/profile/generate-usp", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // ── Lists ──────────────────────────────────────────────────────
  lists: {
    list: () => request<any[]>("/leads/lists"),
    create: (data: { name: string; color?: string }) =>
      request<any>("/leads/lists", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; color?: string }) =>
      request<any>(`/leads/lists/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<any>(`/leads/lists/${id}`, { method: "DELETE" }),
    assignLead: (leadId: string, listId: string) =>
      request<any>(`/leads/${leadId}/list`, { method: "PATCH", body: JSON.stringify({ list_id: listId }) }),
    bulkAssign: (leadIds: string[], listId: string) =>
      request<any>(`/leads/bulk-list`, { method: "POST", body: JSON.stringify({ lead_ids: leadIds, list_id: listId }) }),
  },

  // ── Saved Filters ──────────────────────────────────────────────
  filters: {
    list: () => request<any[]>("/leads/saved-filters"),
    save: (data: { name: string; filters: Record<string, any> }) =>
      request<any>("/leads/saved-filters", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<any>(`/leads/saved-filters/${id}`, { method: "DELETE" }),
  },

  // ── Recent Searches ────────────────────────────────────────────
  searchHistory: {
    list: () => request<any[]>("/search-history"),
  },

  // ── Contact Preview / Unlock ────────────────────────────────────
  contactPreview: {
    get: (leadId: string) =>
      request<{ total_contacts: number; direct_emails: number; generic_emails: number; first_name: string | null; first_email: string | null; already_enriched?: boolean; contacts?: any[] }>(
        `/leads/${leadId}/enrichment-preview`
      ),
    unlock: (leadId: string) =>
      request<{ enriched: boolean; contacts: any[]; cached?: boolean; message?: string; lead?: Lead; enrichment_status?: string }>(
        `/leads/${leadId}/enrichment-unlock`,
        { method: "POST" }
      ),
  },

  // ── Lead Actions ────────────────────────────────────────────────
  leadActions: {
    enrichContact: (leadId: string) =>
      request<{ enriched: boolean; contacts: any[]; cached?: boolean; message?: string; lead?: Lead; enrichment_status?: string }>(`/leads/${leadId}/enrich-contact`, { method: "POST" }),
    verifyEmail: (leadId: string) =>
      request<any>(`/leads/${leadId}/verify-email`, { method: "POST", body: JSON.stringify({}) }),
    generateBio: (leadId: string, maxLength?: number) =>
      request<any>(`/leads/${leadId}/generate-bio`, {
        method: "POST",
        body: JSON.stringify({ maxLength: maxLength ?? 200 }),
      }),
    updateNotes: (leadId: string, notes: string) =>
      request<any>(`/leads/${leadId}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      }),
  },

  // ── Billing ──────────────────────────────────────────────────────
  billing: {
    status: () => request<Record<string, unknown>>("/billing/status"),
    usage: () => request<Record<string, number>>("/billing/usage"),
    checkout: (plan: string, period: string) =>
      request<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan, period }),
      }),
    portal: () => request<{ url: string }>("/billing/portal", { method: "POST" }),
    sync: () => request<Record<string, unknown>>("/billing/sync", { method: "POST" }),
    cancel: () =>
      request<{ message: string }>("/billing/cancel", {
        method: "POST",
        body: JSON.stringify({ cancel_at_period_end: true }),
      }),
    reactivate: () =>
      request<{ message: string }>("/billing/reactivate", {
        method: "POST",
      }),
  },

  // ── Message Picker ──────────────────────────────────────────────
  messagePicker: {
    get: (leadId: string) =>
      request<{
        templates: { id: string; name: string; message: string; is_default?: boolean }[];
        dailyQuota: { used: number; limit: number };
        lead: Record<string, unknown>;
      }>(`/message-picker?leadId=${encodeURIComponent(leadId)}`),

    send: (data: { leadId: string; templateId?: string; channel: string; message: string }) =>
      request<{ url?: string }>("/message-picker/send", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    saveTemplate: (data: { name: string; message: string }) =>
      request<{ id: string; name: string; message: string }>("/message-picker/templates", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // ── Notifications ───────────────────────────────────────────────────────
  notifications: {
    list: () =>
      request<{ notifications: any[]; unreadCount: number }>("/notifications"),

    markRead: (id: string) =>
      request<any>(`/notifications/${id}`, { method: "PATCH" }),

    markAllRead: () =>
      request<{ ok: boolean }>("/notifications", { method: "PATCH" }),
  },

  // ── Replies ────────────────────────────────────────────────────────────
  replies: {
    list: (leadId: string) =>
      request<{ replies: any[] }>(`/leads/${leadId}/replies`),
  },

  // ── Utility: map raw search leads to frontend-friendly shape ──────────────
  mapSearchResult(backendResult: BackendSearchResult) {
    return backendResult.results.map((r, idx) => ({
      id: `search-${idx}`,
      business_name: r.business_name,
      contact_name: "",
      email: "",
      phone: r.phone ?? "",
      website_url: r.website_url ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      country: r.country ?? "",
      category: r.category ?? "",
      industry: r.category ?? "",
      rating: r.rating,
      review_count: r.review_count,
      hot_score: r.hot_score ?? 0,
      readiness_flags: r.readiness_flags ?? [],
      status: "new" as const,
      source: (r.source ?? "outscraper") as LeadSource,
      tags: [] as string[],
      metadata: {} as Record<string, unknown>,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_website: !!r.website_url,
      place_id: r.place_id ?? undefined,
      data_id: r.data_id ?? undefined,
      gmb_reviews_url: r.gmb_reviews_url ?? undefined,
    }));
  },
};

export type { Lead, AIGeneratedEmail, LeadActivity, Sequence, DashboardKPI };
