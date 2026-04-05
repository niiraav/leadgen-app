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

export type LeadSource = 'serpapi' | 'csv' | 'apollo';

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
  type: 'created' | 'updated' | 'email_drafted' | 'emailed' | 'replied' | 'status_changed' | 'imported';
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
