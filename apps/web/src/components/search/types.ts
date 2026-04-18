// ════════════════════════════════════════════
// Search-specific shared types (frontend only)
// Cross-app enums live in packages/shared/src/types.ts
// ════════════════════════════════════════════

import type { EmailLockState, ContactAvailability, ScoreTier } from '@leadgen/shared';

/** A single search result from Google Maps (Outscraper) */
export interface SearchResult {
  place_id: string;
  data_id?: string;
  name: string;
  city: string;
  category: string;
  subtypes: string[];
  rating: number;
  reviews: number;
  has_website: boolean;
  business_status: string;
  hot_score: number;
  /** Phone from Outscraper — available at search time */
  phone?: string;
  site?: string;
  full_address?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  gmb_reviews_url?: string;
  description?: string;
  /** True if this result is already saved as a lead */
  duplicate?: boolean;
  /** If duplicate, the existing lead's ID for navigation */
  existingLeadId?: string;
  /** Email lock state — unknown until enrichment */
  emailState: EmailLockState;
  /** Phone availability — known from search data */
  phoneAvailability: ContactAvailability;
}

/** Search-time filter state (fields the API can filter on) */
export interface SearchFilters {
  businessType: string;
  location: string;
  leadCount: number;
  hasWebsite?: boolean;
  minRating?: number;
  maxReviews?: number;
}

/** Collapsed search summary for the compact bar */
export interface SearchSummary {
  filters: SearchFilters;
  resultCount: number;
  searchedAt: number; // Date.now()
}

/** Props for the collapsed summary bar */
export interface CollapsedSearchBarProps {
  summary: SearchSummary;
  onRefine: () => void;
  onClear: () => void;
}

/** Props for the search filter bar */
export interface SearchFilterBarProps {
  onSearch: (filters: SearchFilters) => void;
  loading: boolean;
  initialFilters?: Partial<SearchFilters>;
  onClearForm: () => void;
}
