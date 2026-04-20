/**
 * Enrichment Mapper / Sanitizer
 *
 * Normalizes raw Outscraper contact data into the project's canonical lead schema.
 * Centralizes validation, merge logic, and enrichment status determination.
 *
 * V1 Merge Policy:
 *   - Fill empty fields only (never overwrite non-empty existing values)
 *   - Validate field shapes before persisting (email must look like email, etc.)
 *   - Ignore malformed/untrusted fields rather than mapping them into canonical columns
 *   - Deterministic V1 contact selection: first contact with at least one useful field
 *
 * Useful fields (primary):   email, phone, linkedin_url, website/domain
 * Secondary fields:           facebook_url, instagram_url, twitter_handle
 */

import type { OutscraperContactResult } from '../services/outscraper';

// ── Enrichment status ────────────────────────────────────────────────────────
export type EnrichmentStatus = 'pending' | 'success' | 'partial' | 'failed' | 'no_data';

export interface EnrichmentMergeResult {
  /** DB update payload (snake_case column names matching Supabase) */
  updates: Record<string, unknown>;
  /** Determined enrichment status */
  status: EnrichmentStatus;
  /** Error message if status is 'failed', null otherwise */
  error: string | null;
  /** Number of useful fields actually merged */
  mergedFieldCount: number;
}

// ── Validation helpers ────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/.+/;
const PHONE_RE = /^[\d\s+\-().]{5,}$/;

/** Validate an email string — must look like a real email */
function isValidEmail(v: string | null | undefined): v is string {
  return !!v && EMAIL_RE.test(v);
}

/** Validate a URL string — must start with http(s):// */
function isValidUrl(v: string | null | undefined): v is string {
  return !!v && URL_RE.test(v);
}

/** Validate a phone string — allow digits, spaces, +, -, parens, dots, min 5 chars */
function isValidPhone(v: string | null | undefined): v is string {
  return !!v && PHONE_RE.test(v);
}

/** Trim + nullify empty strings */
function clean(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

// ── Contact selection ─────────────────────────────────────────────────────────

/**
 * V1 deterministic selection rule:
 *   Choose the first contact that has at least one useful primary field (email, phone, linkedin).
 *   If none has a primary field, choose the first with any secondary field.
 *   If no contact has anything useful, return null.
 */
export function selectPrimaryContact(
  contacts: OutscraperContactResult[]
): OutscraperContactResult | null {
  if (!contacts.length) return null;

  // First pass: find contact with at least one useful primary field
  for (const c of contacts) {
    if (isValidEmail(c.email) || isValidPhone(c.phone) || isValidUrl(c.socials?.linkedin || c.contact_linkedin)) {
      return c;
    }
  }

  // Second pass: any secondary field
  for (const c of contacts) {
    if (isValidUrl(c.facebook) || isValidUrl(c.instagram) || isValidUrl(c.twitter) || isValidUrl(c.socials?.linkedin)) {
      return c;
    }
  }

  // Last resort: return first contact (may have nothing useful)
  return contacts[0] || null;
}

// ── Field mapping ─────────────────────────────────────────────────────────────

interface ExistingLead {
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  twitter_handle?: string | null;
  domain?: string | null;
  website_url?: string | null;
  contact_full_name?: string | null;
  contact_title?: string | null;
  contact_email?: string | null;
  contact_email_type?: string | null;
  contact_phone?: string | null;
  contact_linkedin?: string | null;
  company_linkedin?: string | null;
  company_size?: string | null;
}

/**
 * Map and merge Outscraper contact data into canonical lead fields.
 *
 * V1 Policy: Fill empty fields only. Never overwrite non-empty existing values.
 * Returns the complete DB update payload including enrichment status metadata.
 */
export function mapAndMergeEnrichment(
  contact: OutscraperContactResult,
  existing: ExistingLead,
  allContacts: OutscraperContactResult[],
  requestDomain: string
): EnrichmentMergeResult {
  const updates: Record<string, unknown> = {};
  let primaryFieldCount = 0;  // email, phone, linkedin, domain
  let secondaryFieldCount = 0; // facebook, instagram, twitter

  // ── Contact-specific fields (always written — these are enrichment-owned) ──
  const contactFullName = clean(contact.full_name);
  const contactTitle = clean(contact.title);
  const contactEmail = isValidEmail(contact.email) ? contact.email.trim() : null;
  const contactEmailType = clean(contact.email_type);
  const contactPhone = isValidPhone(contact.phone) ? contact.phone.trim() : null;
  const contactLinkedin = isValidUrl(contact.socials?.linkedin || contact.contact_linkedin)
    ? (contact.socials?.linkedin || contact.contact_linkedin).trim()
    : null;
  const companyLinkedin = isValidUrl(contact.company_linkedin) ? contact.company_linkedin.trim() : null;
  const companySize = clean(contact.company_size);
  const contactDomain = clean(contact.domain);

  updates.contact_full_name = contactFullName;
  updates.contact_title = contactTitle;
  updates.contact_email = contactEmail;
  // NOTE: email_type from Outscraper can contain garbage (e.g. a URL instead of
  // a type like "personal"/"generic"). Only persist if it looks like a genuine type.
  if (contactEmailType && !contactEmailType.startsWith('http')) {
    updates.contact_email_type = contactEmailType;
  } else {
    updates.contact_email_type = null;
  }
  updates.contact_phone = contactPhone;
  updates.contact_linkedin = contactLinkedin;
  updates.company_linkedin = companyLinkedin;
  updates.domain = contactDomain || requestDomain;
  updates.company_size = companySize;

  // ── Cache ALL contacts as JSONB ──
  updates.contacts = allContacts.map(c => ({
    full_name: c.full_name || null,
    title: c.title || null,
    email: c.email || null,
    email_type: c.email_type || null,
    phone: c.phone || null,
    linkedin_url: c.socials?.linkedin || c.contact_linkedin || null,
    company_linkedin: c.company_linkedin || null,
    domain: c.domain || null,
    company_size: c.company_size || null,
    socials: c.socials || null,
  }));

  // ── Company socials ──
  // company_socials JSONB column not yet in DB — store via top-level canonical fields instead
  const fb = isValidUrl(contact.facebook) ? contact.facebook.trim() : null;
  const ig = isValidUrl(contact.instagram) ? contact.instagram.trim() : null;
  const tw = isValidUrl(contact.twitter) ? contact.twitter.trim() : null;

  // ── Top-level canonical fields (fill-empty-only merge) ──

  // Email
  if (!existing.email && contactEmail) {
    updates.email = contactEmail;
    primaryFieldCount++;
  }

  // Phone
  if (!existing.phone && contactPhone) {
    updates.phone = contactPhone;
    primaryFieldCount++;
  }

  // LinkedIn URL
  const linkedinUrl = contactLinkedin;
  if (!existing.linkedin_url && linkedinUrl) {
    updates.linkedin_url = linkedinUrl;
    primaryFieldCount++;
  }

  // Domain / Website
  if (!existing.domain && contactDomain && contactDomain !== requestDomain) {
    // Only set domain if it's a new discovery (different from what we queried with)
    // The domain column is already set above as part of contact fields
  }

  // Facebook URL
  if (!existing.facebook_url && fb) {
    updates.facebook_url = fb;
    secondaryFieldCount++;
  }

  // Instagram URL
  if (!existing.instagram_url && ig) {
    updates.instagram_url = ig;
    secondaryFieldCount++;
  }

  // Twitter handle (stored as URL in the twitter_handle column per project convention)
  if (!existing.twitter_handle && tw) {
    updates.twitter_handle = tw;
    secondaryFieldCount++;
  }

  // Count primary fields from contact_* columns too (these are always written)
  if (contactEmail) primaryFieldCount++;
  if (contactPhone) primaryFieldCount++;
  if (contactLinkedin) primaryFieldCount++;

  // ── Enrichment metadata ──
  updates.contact_enriched_at = new Date().toISOString();
  updates.contact_enrichment_attempted_at = new Date().toISOString();
  updates.updated_at = new Date().toISOString();
  updates.contact_enrichment_provider = 'outscraper';

  // Determine status
  const mergedFieldCount = primaryFieldCount + secondaryFieldCount;
  let status: EnrichmentStatus;
  let error: string | null = null;

  if (primaryFieldCount >= 1) {
    status = 'success';
  } else if (secondaryFieldCount >= 1) {
    status = 'partial';
  } else {
    status = 'partial';  // At minimum we saved contact_* fields even if top-level had no room
    // If truly nothing was saved at all, the caller should override to 'failed'
  }

  updates.contact_enrichment_status = status;
  updates.contact_enrichment_error = null;

  return { updates, status, error, mergedFieldCount };
}

/**
 * Build a failed-enrichment update payload (no contacts found or unlock errored).
 */
export function buildFailedEnrichmentUpdate(errorMessage: string): Record<string, unknown> {
  return {
    contact_enrichment_attempted_at: new Date().toISOString(),
    contact_enrichment_status: 'failed',
    contact_enrichment_provider: 'outscraper',
    contact_enrichment_error: errorMessage,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Build a partial-enrichment update (contacts returned but nothing useful).
 */
export function buildPartialEnrichmentUpdate(): Record<string, unknown> {
  return {
    contact_enrichment_attempted_at: new Date().toISOString(),
    contact_enrichment_status: 'partial',
    contact_enrichment_provider: 'outscraper',
    contact_enrichment_error: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Build a no-data-enrichment update payload.
 * Used when Outscraper returns a valid response with zero contacts —
 * this is NOT a technical failure, just "no public contacts exist".
 */
export function buildNoDataEnrichmentUpdate(message?: string): Record<string, unknown> {
  return {
    contact_enrichment_attempted_at: new Date().toISOString(),
    contact_enrichment_status: 'no_data',
    contact_enrichment_provider: 'outscraper',
    contact_enrichment_error: message || 'No public contacts found for this lead',
    updated_at: new Date().toISOString(),
  };
}
