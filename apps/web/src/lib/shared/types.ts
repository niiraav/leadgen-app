import { z } from 'zod';

// ════════════════════════════════════════════
// Core shared types for LeadGen App
// ════════════════════════════════════════════

// TECH DEBT: LeadStatus currently combines engagement statuses
// (new, contacted, replied, interested, not_interested),
// pipeline stages (qualified, proposal_sent, converted, lost),
// compliance statuses (out_of_office, do_not_contact),
// and lifecycle states (closed, archived).
// Phase 2 adds domain-specific columns: engagement_status, pipeline_stage,
// lifecycle_state, do_not_contact (boolean). Old `status` column stays
// writable during dual-write (Phase 4). Do not drop `status` until
// Phase 6 backfill confirms completeness.

// LeadStatus is derived from leadStatusSchema in schemas.ts.
// The single source of truth is leadStatusSchema — this type is
// re-exported from there for convenience. Do NOT add values here
// without updating leadStatusSchema first.
export type LeadStatus = z.infer<typeof import('./schemas').leadStatusSchema>;

// Phase 2 domain types — canonical definitions live in schemas.ts
type EngagementStatus = z.infer<typeof import('./schemas').engagementStatusSchema>;
type PipelineStage = z.infer<typeof import('./schemas').pipelineStageSchema>;
type LifecycleState = z.infer<typeof import('./schemas').lifecycleStateSchema>;

export type LeadSource = 'outscraper' | 'csv' | 'apollo' | 'manual';

export type EmailTone = 'professional' | 'friendly' | 'direct';

export const STATUS_ORDER: LeadStatus[] = [
  'new', 'contacted', 'replied', 'interested', 'not_interested',
  'qualified', 'proposal_sent', 'converted', 'closed', 'lost',
  'archived', 'out_of_office', 'do_not_contact'
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
  // Phase 2: domain-specific status columns (nullable until backfilled)
  // Types are exported from schemas.ts: EngagementStatus, PipelineStage, LifecycleState
  engagementStatus?: EngagementStatus;
  pipelineStage?: PipelineStage;
  lifecycleState?: LifecycleState;
  doNotContact: boolean;
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
  // Sprint P2: temporal urgency system
  followUpDate?: string;
  followUpSource?: string;
  dealValue?: number;
  lossReason?: string;
  // Enrichment status tracking
  contact_enrichment_status?: 'pending' | 'success' | 'partial' | 'failed' | 'no_data';
  contact_enrichment_provider?: string;
  contact_enrichment_error?: string;
  // Review insights (AI-extracted from Google Maps reviews)
  review_summary?: ReviewSummary;
  reviews_fetched_at?: string;
  // Derived: email deliverability (mapped from raw email_status)
  email_deliverability?: EmailDeliverabilityState;
  // Last activity summary (for Saved Leads Table)
  lastActivity?: ActivityEntry | null;
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
  type: 'created' | 'updated' | 'enriched' | 'email_verified' | 'email_drafted' | 'emailed' | 'whatsapp_sent' | 'replied' | 'status_changed' | 'email_logged' | 'imported' | 'reply_classified' | 'bio_generated';
  description: string;
  label?: string | null;
  timestamp: string;
  reply_intent?: string | null;
  triggered_by?: string | null;
  field?: ActivityField | null;
  created_at: string;
}

// ── Activity Entry (for Last Activity column in Saved Leads Table) ────────
export type ReplyIntent = 'interested' | 'question' | 'objection' | 'not_now' | 'not_interested';

export type ActivityField = 'engagement_status' | 'pipeline_stage' | 'lifecycle_state' | 'do_not_contact';

export interface ActivityEntry {
  label: string;
  timestamp: Date;
  replyIntent?: ReplyIntent;
  field?: ActivityField | null;
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

// ════════════════════════════════════════════
// Search & contact status enums
// ════════════════════════════════════════════

/** Email availability state — used in search results and lead cards */
export type EmailLockState =
  | 'unknown'     // Not enriched yet, no data
  | 'available'   // Enrichment found an email (still masked until credit spend)
  | 'verified'    // Email exists and passed verification
  | 'unavailable' // Enrichment ran, no email found
  | 'locked';     // Email exists but requires credit to reveal

/** Email deliverability state — provider-agnostic, mapped from vendor email_status.
 *  Used by Saved Leads Table to drive UI and send-blocking logic. */
export type EmailDeliverabilityState =
  | 'none'          // no email on record
  | 'verifying'     // enrichment or verification in progress
  | 'deliverable'   // verified, safe to send
  | 'risky'         // catch-all, uncertain deliverability
  | 'undeliverable'; // invalid, disposable, or spamtrap

/** Contact channel availability — for phone/WhatsApp/socials icons */
export type ContactAvailability =
  | 'available'   // Known to exist (e.g., phone from search data)
  | 'unavailable' // Known to not exist
  | 'unknown';    // Not checked yet

/** Quality score tier — drives color in score bars and badges */
export type ScoreTier = 'hot' | 'warm' | 'cold';

/** Map a numeric hot_score (0-100) to a ScoreTier */
export function getScoreTier(score: number): ScoreTier {
  if (score >= 80) return 'hot';
  if (score >= 50) return 'warm';
  return 'cold';
}
