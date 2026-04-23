import { z } from 'zod';
export type LeadStatus = z.infer<typeof import('./schemas').leadStatusSchema>;
export type LeadSource = 'outscraper' | 'csv' | 'apollo' | 'manual';
export type EmailTone = 'professional' | 'friendly' | 'direct';
export declare const STATUS_ORDER: LeadStatus[];
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
    ai_bio?: string;
    ai_bio_generated_at?: string;
    reply_token?: string;
    contact_enrichment_status?: 'pending' | 'success' | 'partial' | 'failed' | 'no_data';
    contact_enrichment_provider?: string;
    contact_enrichment_error?: string;
    review_summary?: ReviewSummary;
    reviews_fetched_at?: string;
    email_deliverability?: EmailDeliverabilityState;
    lastActivity?: ActivityEntry | null;
    followUpDate?: string;
    followUpSource?: string;
    dealValue?: number;
    lossReason?: string;
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
    type: string;
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
    field?: 'engagement_status' | 'pipeline_stage' | 'lifecycle_state' | 'do_not_contact' | null;
    created_at: string;
}
export type ActivityField = 'engagement_status' | 'pipeline_stage' | 'lifecycle_state' | 'do_not_contact';
export type ReplyIntent = 'interested' | 'question' | 'objection' | 'not_now' | 'not_interested';
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
/** Email availability state — used in search results and lead cards */
export type EmailLockState = 'unknown' | 'available' | 'verified' | 'unavailable' | 'locked';
/** Email deliverability state — provider-agnostic, mapped from vendor email_status.
 *  Used by Saved Leads Table to drive UI and send-blocking logic. */
export type EmailDeliverabilityState = 'none' | 'verifying' | 'deliverable' | 'risky' | 'undeliverable';
/** Contact channel availability — for phone/WhatsApp/socials icons */
export type ContactAvailability = 'available' | 'unavailable' | 'unknown';
/** Quality score tier — drives color in score bars and badges */
export type ScoreTier = 'hot' | 'warm' | 'cold';
/** Map a numeric hot_score (0-100) to a ScoreTier */
export declare function getScoreTier(score: number): ScoreTier;
//# sourceMappingURL=types.d.ts.map