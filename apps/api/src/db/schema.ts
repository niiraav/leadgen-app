// ─── Type Exports for compatibility ───────────────────────────────────────────

export type RawLead = {
  business_name: string;
  email?: string;
  phone?: string;
  website_url?: string;
  address?: string;
  city?: string;
  country?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  source: 'serpapi' | 'manual';
};
