// ════════════════════════════════════════════
// Core shared types for LeadGen App
// ════════════════════════════════════════════

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'closed'
  | 'not_interested'
  | 'archived';

export type LeadSource = 'outscraper' | 'csv' | 'apollo' | 'manual';

export type EmailTone = 'professional' | 'friendly' | 'direct';

export const STATUS_ORDER: LeadStatus[] = [
  'new', 'contacted', 'replied', 'interested', 'closed', 'not_interested', 'archived'
];

export interface Lead {
  id: string;
  business_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  website_url?: string;
  address?: string;
  city?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  industry?: string;
  company_size?: string;
  linkedin_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  twitter_handle?: string;
  has_website: boolean;
  rating?: number;
  review_count?: number;
  hot_score: number;
  readiness_flags: string[];
  status: LeadStatus;
  source: LeadSource;
  notes?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_contacted?: string;
  sequence_ended?: string;
  // Sprint 7: Enrichment fields
  owner_name?: string;
  owner_first_name?: string;
  owner_name_source?: string;
  place_id?: string;
  data_id?: string;
  gmb_url?: string;
  gmb_reviews_url?: string;
  enriched_at?: string;
  enrichment_attempted_at?: string;
  email_status?: string;
  email_status_checked_at?: string;
  // Sprint 8: Contact enrichment fields
  contact_full_name?: string;
  contact_title?: string;
  contact_email?: string;
  contact_email_type?: string;
  contact_phone?: string;
  contact_linkedin?: string;
  company_linkedin?: string;
  domain?: string;
  contact_enriched_at?: string;
  contacts?: Record<string, unknown>[];
  company_socials?: Record<string, unknown>;
  // AI bio (generated on-demand, cached per lead)
  ai_bio?: string;
  ai_bio_generated_at?: string;
  // Sprint 9: Reply tracking token
  reply_token?: string;
  // Enrichment status tracking
  contact_enrichment_status?: 'pending' | 'success' | 'partial' | 'failed';
  contact_enrichment_provider?: string;
  contact_enrichment_error?: string;
  // Review insights (AI-extracted from Google Maps reviews)
  review_summary?: ReviewSummary;
  reviews_fetched_at?: string;
}

export interface ReviewSummary {
  owner_name: string | null;
  owner_confidence: number;
  owner_evidence: string | null;
  staff_names: string[];
  themes: string[];
  usp_candidates: string[];
  pain_points: string[];
  fetched_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;    // reply_received | reply_classified | lead_moved
  title: string;
  body?: string;
  lead_id?: string;
  read: boolean;
  created_at: string;
}

export interface CSVLeadMapping {
  csvColumn: string;
  leadField: string;
}

export interface SearchParams {
  businessType: string;
  location: string;
  maxResults: number;
  noWebsiteOnly: boolean;
}

export interface RawLead {
  business_name: string;
  phone?: string;
  website_url?: string;
  address?: string;
  rating?: number;
  review_count?: number;
  category?: string;
  latitude?: number;
  longitude?: number;
}

export interface HotScore {
  score: number;
  flags: string[];
}

export interface SequenceStep {
  id: string;
  subject_template: string;
  body_template: string;
  delay_days: number;
}

export interface Sequence {
  id: string;
  name: string;
  steps: SequenceStep[];
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: 'created' | 'updated' | 'email_drafted' | 'emailed' | 'replied' | 'status_changed' | 'imported' | 'bio_generated';
  description: string;
  created_at: string;
}

export interface AIGeneratedEmail {
  subject_lines: string[];
  body: string;
}

export interface DashboardKPI {
  total_leads: number;
  contacted_this_week: number;
  replies: number;
  open_sequences: number;
}
