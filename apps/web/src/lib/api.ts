const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

import type { Lead, LeadActivity, Sequence, AIGeneratedEmail, DashboardKPI } from "@leadgen/shared";

export interface SearchResults {
  leads: Lead[];
  total: number;
}

export interface PaginatedLeads {
  leads: Lead[];
  nextCursor?: string;
  total: number;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Google Maps search
  search: {
    googleMaps: (params: {
      query: string;
      location: string;
      maxResults?: number;
      noWebsite?: boolean;
    }) =>
      request<SearchResults>("/search/google-maps", {
        method: "POST",
        body: JSON.stringify({
          query: params.query,
          location: params.location,
          maxResults: params.maxResults || 50,
          noWebsite: params.noWebsite || false,
        }),
      }),
  },

  // Leads CRUD
  leads: {
    list: (params?: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.status) qs.set("status", params.status);
      if (params?.search) qs.set("search", params.search);
      return request<PaginatedLeads>(`/leads?${qs.toString()}`);
    },
    get: (id: string) => request<Lead>(`/leads/${id}`),
    create: (data: Record<string, unknown>) =>
      request<Lead>("/leads", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      request<Lead>(`/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/leads/${id}`, { method: "DELETE" }),
  },

  // Pipeline
  pipeline: {
    list: () => request<Lead[]>("/pipeline"),
    update: (id: string, data: { status: string }) =>
      request<Lead>(`/pipeline/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // Sequences
  sequences: {
    list: () => request<Sequence[]>("/sequences"),
    create: (data: Record<string, unknown>) =>
      request<Sequence>("/sequences", { method: "POST", body: JSON.stringify(data) }),
  },

  // AI Email composition
  ai: {
    composeEmail: (params: {
      leadId: string; 
      context?: string;
      tone?: string;
    }) =>
      request<AIGeneratedEmail>("/ai/compose-email", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },

  // Import
  import: {
    csv: (data: FormData) => request<{ imported: number }>("/import/csv", { 
      method: "POST", 
      body: data,
    }),
  },
};
