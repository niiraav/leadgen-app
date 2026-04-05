const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

import { createBrowserSupabaseClient } from "./supabase";
import type {
  Lead,
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
}

/** A raw search result from SerpAPI (before it becomes a Lead) */
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

function mapBackendLead(raw: BackendLead): Lead {
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
    company_size: undefined,
    linkedin_url: undefined,
    facebook_url: undefined,
    instagram_url: undefined,
    twitter_handle: undefined,
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
  };
}

// ─── Generic request helper ──────────────────────────────────────────────────

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Attach Supabase JWT if available
  try {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  } catch {
    // Not logged in — let the API return 401
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
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message ||
          errorData.error ||
          `API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as Promise<T>;
  } catch (err) {
    // Re-throw network errors so callers can handle them
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
    }) =>
      request<BackendAIEmailResponse>(`/leads/${leadId}/ai-email`, {
        method: "POST",
        body: JSON.stringify(params),
      }),
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

  // ── Utility: map raw search leads to frontend-friendly shape ──
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
      source: "serpapi" as const,
      tags: [] as string[],
      metadata: {} as Record<string, unknown>,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_website: !!r.website_url,
    }));
  },
};

export type { Lead, AIGeneratedEmail, LeadActivity, Sequence, DashboardKPI };
