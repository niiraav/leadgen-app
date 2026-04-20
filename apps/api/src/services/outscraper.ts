// Outscraper service — raw fetch (npm package crashes on their auth rejection)

const API_KEY = process.env.OUTSCRAPER_API_KEY!
const BASE = 'https://api.outscraper.cloud'
const APP_BASE = 'https://api.app.outscraper.com'

// ── Async result polling ────────────────────────────────────────────
async function pollOutscraperResult(resultsLocation: string, apiKey: string, maxRetries = 20, intervalMs = 5000): Promise<Record<string, any>> {
  for (let i = 0; i < maxRetries; i++) {
    console.log(`[Outscraper] Poll ${i + 1}/${maxRetries}: ${resultsLocation}`)
    await new Promise(r => setTimeout(r, intervalMs))
    const res = await fetch(resultsLocation, {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey },
    })
    if (!res.ok) {
      console.error('[Outscraper] Poll failed:', res.status, await res.text())
      throw new Error(`Outscraper poll failed (${res.status})`)
    }
    const data = await res.json() as Record<string, any>
    if (data.status === 'Success') return data
    if (data.status === 'Failed' || data.status === 'Error') {
      throw new Error(`Outscraper request failed: ${data.status}`)
    }
  }
  throw new Error('Outscraper timed out waiting for results')
}

async function fetchOutscraper(url: string): Promise<Record<string, any> | null> {
  const res = await fetch(url, { method: 'GET', headers: { 'X-API-KEY': API_KEY } })
  if (!res.ok) {
    const body = await res.text()
    console.error('[Outscraper] Request failed:', res.status, body)
    return null
  }
  const data = await res.json() as Record<string, any>
  if (data.status === 'Pending' && data.results_location) {
    console.log('[Outscraper] Async request, polling:', data.results_location)
    return await pollOutscraperResult(data.results_location, API_KEY)
  }
  return data
}

// ── Category normalisation ─────────────────────────────────────────
export const CATEGORY_MAP: Record<string, string> = {
  plumber: 'Plumbing', heating_contractor: 'Plumbing', boiler: 'Plumbing',
  dentist: 'Dental', dental_clinic: 'Dental',
  estate_agent: 'Real Estate', letting_agent: 'Real Estate', realtor: 'Real Estate',
  accountant: 'Finance', bookkeeper: 'Finance', financial_advisor: 'Finance',
  solicitor: 'Legal', lawyer: 'Legal', law_firm: 'Legal',
  restaurant: 'Hospitality', cafe: 'Hospitality', takeaway: 'Hospitality', pub: 'Hospitality',
  electrician: 'Electrical', electrical_contractor: 'Electrical',
  builder: 'Construction', construction_company: 'Construction',
  cleaner: 'Cleaning', cleaning_service: 'Cleaning',
  hairdresser: 'Beauty', beauty_salon: 'Beauty', barber: 'Beauty',
  gym: 'Health & Fitness', personal_trainer: 'Health & Fitness',
  physiotherapist: 'Healthcare', gp: 'Healthcare', pharmacy: 'Healthcare',
  web_designer: 'Digital', marketing_agency: 'Digital', seo: 'Digital',
}

export function normaliseCategory(subtypes: string[]): string {
  if (!subtypes || subtypes.length === 0) return 'Other'
  for (const sub of subtypes) {
    const key = sub.toLowerCase().replace(/\s+/g, '_')
    for (const [pattern, category] of Object.entries(CATEGORY_MAP)) {
      if (key.includes(pattern)) return category
    }
  }
  return subtypes[0]
}

// ── Google Maps search ─────────────────────────────────────────────
export interface OutscraperSearchResult {
  place_id: string; name: string; full_address: string; street: string
  city: string; postal_code: string; latitude: number; longitude: number
  phone: string; site: string; category: string; subtypes: string[]
  description: string; business_status: string; verified: boolean
  rating: number; reviews: number; reviews_link: string; photo_count: number
  price_range: string; working_hours: Record<string, string>; logo: string
}

export async function searchGoogleMaps(query: string, location: string, limit: number): Promise<OutscraperSearchResult[]> {
  const url = `${BASE}/google-maps-search?query=${encodeURIComponent(query + ', ' + location)}&limit=${limit}&language=en&region=GB&async=false`
  const res = await fetch(url, { method: 'GET', headers: { 'X-API-KEY': API_KEY } })
  if (!res.ok) {
    throw new Error(`Outscraper search failed (${res.status}). Check your API key.`)
  }
  const data = await res.json() as Record<string, any>
  const rows = data?.data?.[0] ?? []
  return rows.map((r: any) => ({
    place_id: r.place_id ?? '', name: r.name ?? '', full_address: r.full_address ?? '',
    street: r.street ?? '', city: r.city ?? '', postal_code: r.postal_code ?? '',
    latitude: r.latitude ?? 0, longitude: r.longitude ?? 0, phone: r.phone ?? '',
    site: r.website ?? '',
    category: normaliseCategory(r.subtypes ? r.subtypes.split(',').map((s: string) => s.trim()) : []),
    subtypes: r.subtypes ? r.subtypes.split(',').map((s: string) => s.trim()) : [],
    description: r.description ?? '', business_status: r.business_status ?? 'OPERATIONAL',
    verified: r.verified ?? false, rating: r.rating ?? 0, reviews: r.reviews ?? 0,
    reviews_link: r.reviews_link ?? '', photo_count: r.photos_count ?? 0,
    price_range: r.range ?? '', working_hours: r.working_hours ?? {}, logo: r.logo ?? '',
  }))
}

// ── Contact enrichment ─────────────────────────────────────────────
export interface SocialProfiles {
  linkedin?: string; facebook?: string; twitter?: string; instagram?: string
}

export interface OutscraperContactResult {
  full_name: string; title: string; email: string; email_type: string
  phone: string; contact_linkedin: string; company_linkedin: string
  domain: string; company_size: string; technologies: string[]
  facebook: string; instagram: string; twitter: string; socials?: SocialProfiles
}

export interface OutscraperContactPreview {
  total_contacts: number; direct_emails: number; generic_emails: number
  linkedin_profiles: number
  first_name: string | null  // masked
  first_email: string | null // masked
  contacts: OutscraperContactResult[]
}

// ── Parser: normalize any Outscraper contacts-and-leads entry into our unified format ──
function parseContactsAndLeadsEntry(
  entry: Record<string, any>,
  domain: string
): { contacts: OutscraperContactResult[]; companySocials: SocialProfiles; phones: string[] } {
  const rawContacts: any[] = entry.contacts || []
  const companySocials: SocialProfiles = entry.socials || {}
  const allEntries = entry.details as { employees?: string } | undefined
  const companySize = allEntries?.employees ?? ''

  const seenEmails = new Set<string>()
  const contacts: OutscraperContactResult[] = []

  for (const c of rawContacts) {
    const emails: any[] = c.emails || []
    const primaryEmail = emails[0]?.value ?? ''
    const emailSource = emails[0]?.source ?? ''
    const socials: SocialProfiles = c.socials || {}

    if (primaryEmail && !seenEmails.has(primaryEmail.toLowerCase())) {
      seenEmails.add(primaryEmail.toLowerCase())
    } else if (!primaryEmail) {
      // no email — still include
    } else {
      continue // duplicate
    }

    contacts.push({
      full_name: c.full_name ?? '',
      title: c.title ?? '',
      email: primaryEmail,
      email_type: emailSource,
      phone: '',
      contact_linkedin: socials.linkedin ?? '',
      company_linkedin: companySocials.linkedin ?? '',
      domain,
      company_size: companySize,
      technologies: [],
      facebook: socials.facebook ?? companySocials.facebook ?? '',
      instagram: socials.instagram ?? companySocials.instagram ?? '',
      twitter: socials.twitter ?? companySocials.twitter ?? '',
      socials,
    })
  }

  // Attach phone numbers
  const rawPhones: any[] = entry.phones || []
  const phoneValues: string[] = []
  for (const p of rawPhones) {
    const val = p.value ?? p.phone ?? ''
    if (val) {
      phoneValues.push(val)
      if (contacts.length > 0 && !contacts[0].phone) {
        contacts[0].phone = val
      }
    }
  }

  // ── Fallback: no named contacts but top-level emails exist ──
  if (contacts.length === 0) {
    const topEmails: any[] = entry.emails || []
    for (const e of topEmails) {
      const emailVal = e.value ?? ''
      if (!emailVal || seenEmails.has(emailVal.toLowerCase())) continue
      seenEmails.add(emailVal.toLowerCase())
      contacts.push({
        full_name: '',
        title: '',
        email: emailVal,
        email_type: e.source ?? '',
        phone: phoneValues[0] ?? '',
        contact_linkedin: '',
        company_linkedin: companySocials.linkedin ?? '',
        domain,
        company_size: companySize,
        technologies: [],
        facebook: companySocials.facebook ?? '',
        instagram: companySocials.instagram ?? '',
        twitter: companySocials.twitter ?? '',
        socials: companySocials,
      })
    }
    // Give first contact remaining phones
    if (contacts.length > 0 && phoneValues.length > 1 && !contacts[0].phone) {
      contacts[0].phone = phoneValues[0]
    }
  }

  return { contacts, companySocials, phones: phoneValues }
}

// ── Preview (free, no credit spent) ────────────────────────────────
export async function contactsPreview(
  businessName: string,
  domain: string,
  city: string
): Promise<OutscraperContactPreview> {
  try {
    const query = domain || businessName
    const params = new URLSearchParams()
    params.set('query', query)
    if (city) params.set('city', city)
    params.set('limit', '20')
    params.set('async', 'false')

    const data = await fetchOutscraper(`${BASE}/contacts-and-leads?${params.toString()}`)
    if (!data) return { total_contacts: 0, direct_emails: 0, generic_emails: 0, linkedin_profiles: 0, first_name: null, first_email: null, contacts: [] }

    const entry = data?.data?.[0]
    if (!entry) return { total_contacts: 0, direct_emails: 0, generic_emails: 0, linkedin_profiles: 0, first_name: null, first_email: null, contacts: [] }

    const { contacts, companySocials } = parseContactsAndLeadsEntry(entry, domain)

    // Count direct vs generic
    const directEmails = contacts.filter(c => {
      const e = (c.email).toLowerCase()
      return e && !['info@', 'contact@', 'hello@', 'support@', 'sales@', 'office@', 'admin@'].some(p => e.startsWith(p))
    }).length
    const genericEmails = contacts.length - directEmails

    const first = contacts[0] ?? null
    let maskedName: string | null = null
    let maskedEmail: string | null = null
    if (first) {
      const parts = first.full_name.split(' ')
      maskedName = parts.map(p => p[0] + '****' + (p.length > 1 ? p.slice(-1) : '')).join(' ')
      const em = first.email ?? ''
      if (em) {
        const [local, domainPart] = em.split('@')
        maskedEmail = local[0] + '****' + (local.length > 1 ? local.slice(-1) : '') + '@' + (domainPart ?? '')
      }
    }

    const linkedinCount = contacts.filter(c => c.socials?.linkedin || (companySocials.linkedin && !c.socials?.linkedin)).length

    return {
      total_contacts: contacts.length,
      direct_emails: directEmails,
      generic_emails: genericEmails,
      linkedin_profiles: linkedinCount,
      first_name: maskedName,
      first_email: maskedEmail,
      contacts: [],
    }
  } catch (err: any) {
    console.error('[Outscraper] contactsPreview error:', err.message)
    return { total_contacts: 0, direct_emails: 0, generic_emails: 0, linkedin_profiles: 0, first_name: null, first_email: null, contacts: [] }
  }
}

// ── Enrich (paid, 1 credit) ────────────────────────────────────────
export async function enrichContact(businessName: string, domain: string, city: string): Promise<OutscraperContactResult | null> {
  const contacts = await enrichmentMultiple(businessName, domain, city, 1)
  return contacts.length > 0 ? contacts[0] : null
}

// ── Multi-contact enrichment ───────────────────────────────────────
export async function enrichmentMultiple(
  businessName: string,
  domain: string,
  city: string,
  limit: number = 20
): Promise<OutscraperContactResult[]> {
  try {
    const query = domain || businessName
    const params = new URLSearchParams()
    params.set('query', query)
    if (city) params.set('city', city)
    params.set('limit', String(limit))
    params.set('async', 'false')

    console.log(`[Outscraper] Fetching contacts: query=${query}, city=${city}, limit=${limit}`)
    const data = await fetchOutscraper(`${BASE}/contacts-and-leads?${params.toString()}`)
    if (!data) return []

    const entry = data?.data?.[0]
    if (!entry) return []

    console.log(`[Outscraper] Entry:`, JSON.stringify({
      contactsCount: entry.contacts?.length,
      companyName: entry.details?.name,
      domain: entry.domain,
    }))

    const { contacts, companySocials, phones } = parseContactsAndLeadsEntry(entry, domain)

    // Ensure company socials are propagated to all contacts that don't have their own
    for (const c of contacts) {
      if (companySocials.linkedin && !c.socials?.linkedin) {
        c.company_linkedin = companySocials.linkedin
        c.facebook = companySocials.facebook || c.facebook
        c.instagram = companySocials.instagram || c.instagram
        c.twitter = companySocials.twitter || c.twitter
      }
      c.company_size = entry.details?.type ?? c.company_size
    }

    console.log(`[Outscraper] enrichmentMultiple: found ${contacts.length} contacts for ${entry.details?.name ?? domain}`)
    return contacts
  } catch (err: any) {
    console.error('[Outscraper] enrichmentMultiple error:', err.message)
    return []
  }
}

// ── Email Verification ────────────────────────────────────────────
export interface EmailVerificationResult {
  email: string
  email_status: 'valid' | 'invalid' | 'unknown' | 'catch-all' | 'disposable' | 'accept_all'
  verified: boolean
  confidence: number
  reason: string
  source: 'outscraper'
  status_details: string | null
}

// Outscraper status -> our unified status mapping
const EMAIL_STATUS_MAP: Record<string, EmailVerificationResult['email_status']> = {
  RECEIVING: 'valid',
  DELIVERABLE: 'valid',
  VALID: 'valid',
  INVALID: 'invalid',
  UNDELIVERABLE: 'invalid',
  BOUNCED: 'invalid',
  DISPOSABLE: 'disposable',
  'CATCH-ALL': 'catch-all',
  'ACCEPT-ALL': 'accept_all',
  'ACCEPT.ALL': 'accept_all',
  UNKNOWN: 'unknown',
  RISKY: 'unknown',
  SPAMTRAP: 'invalid',
}

const EMAIL_CONFIDENCE_MAP: Record<string, number> = {
  valid: 0.95,
  invalid: 0,
  disposable: 0.4,
  'catch-all': 0.5,
  'accept_all': 0.5,
  unknown: 0.3,
}

const EMAIL_REASON_MAP: Record<string, string> = {
  valid: 'valid_mx_record',
  invalid: 'invalid_email',
  disposable: 'disposable_provider',
  'catch-all': 'catch_all_domain',
  'accept_all': 'catch_all_domain',
  unknown: 'unknown_reason',
}

/**
 * Verify a single email address via Outscraper Email Validator API.
 * Uses async=false for synchronous (single email, fast response).
 * Falls back to async polling if Outscraper returns Pending.
 */
export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  try {
    const url = `${APP_BASE}/email-validator?query=${encodeURIComponent(email)}&async=false`
    console.log(`[Outscraper] Verifying email: ${email}`)

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-KEY': API_KEY },
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[Outscraper] Email verification failed:', res.status, body.slice(0, 200))
      return {
        email,
        email_status: 'unknown',
        verified: false,
        confidence: 0,
        reason: 'verification_service_error',
        source: 'outscraper',
        status_details: `HTTP ${res.status}`,
      }
    }

    const raw = await res.text()
    const data = safeJsonParse<Record<string, any>>(raw, {})

    // Handle async pending — poll for result
    if (data.status === 'Pending' && data.results_location) {
      console.log('[Outscraper] Email verification pending, polling:', data.results_location)
      try {
        const polled = await pollOutscraperResult(data.results_location, API_KEY, 12, 5000)
        return parseEmailVerificationResponse(email, polled)
      } catch (pollErr: any) {
        console.error('[Outscraper] Email verification poll failed:', pollErr.message)
        return {
          email,
          email_status: 'unknown',
          verified: false,
          confidence: 0,
          reason: 'verification_timeout',
          source: 'outscraper',
          status_details: pollErr.message,
        }
      }
    }

    return parseEmailVerificationResponse(email, data)
  } catch (err: any) {
    console.error('[Outscraper] verifyEmail error:', err.message)
    return {
      email,
      email_status: 'unknown',
      verified: false,
      confidence: 0,
      reason: 'server_error',
      source: 'outscraper',
      status_details: err.message,
    }
  }
}

function parseEmailVerificationResponse(email: string, data: Record<string, any>): EmailVerificationResult {
  const entry = data?.data?.[0]
  if (!entry) {
    console.error('[Outscraper] No email verification data in response:', JSON.stringify(data).slice(0, 300))
    return {
      email,
      email_status: 'unknown',
      verified: false,
      confidence: 0,
      reason: 'no_data_returned',
      source: 'outscraper',
      status_details: null,
    }
  }

  const rawStatus = (entry.status ?? 'UNKNOWN').toUpperCase()
  const emailStatus = EMAIL_STATUS_MAP[rawStatus] ?? 'unknown'
  const verified = emailStatus === 'valid'

  return {
    email,
    email_status: emailStatus,
    verified,
    confidence: EMAIL_CONFIDENCE_MAP[emailStatus] ?? 0.3,
    reason: EMAIL_REASON_MAP[emailStatus] ?? 'unknown_reason',
    source: 'outscraper',
    status_details: entry.status_details ?? null,
  }
}

// Safe JSON parse — returns fallback instead of throwing
function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    if (!text || !text.trim()) return fallback
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

// ── Reviews fetch (Google Maps reviews-v3) ────────────────────────
export interface ReviewItem {
  text: string;
  rating: number;
  reviewer_name: string;
  date: string;
}

/**
 * Fetch up to 10 Google Maps reviews for a lead via Outscraper reviews-v3 API.
 * Uses the same async poll pattern as searchGoogleMaps / contactsPreview.
 *
 * NOTE: Outscraper reviews-v3 does NOT return data when queried with
 * `place_id:XXX` — it returns an empty data array. We must use a text
 * query (business name + location) instead. The place_id is accepted
 * as a fallback but is currently not used in the API query.
 *
 * @param placeId — Google Maps place_id (kept for compatibility, not used in query)
 * @param businessName — Business name (e.g. "Tower of London")
 * @param location — City or address (e.g. "London, UK")
 * @returns Array of review objects (max 10)
 */
export async function fetchReviewsForPlace(
  placeId: string,
  businessName?: string,
  location?: string,
): Promise<ReviewItem[]> {
  // Build a text query — place_id:XXX returns empty data on reviews-v3
  const query = businessName
    ? location
      ? `${businessName}, ${location}`
      : businessName
    : `place_id:${placeId}`;

  const params = new URLSearchParams();
  params.set('query', query);
  params.set('reviewsLimit', '10');
  params.set('sort', 'newest');
  // Do NOT set async=false — reviews-v3 returns empty data with sync mode.
  // The fetchOutscraper helper handles async polling automatically.

  const url = `${APP_BASE}/maps/reviews-v3?${params.toString()}`;
  console.log(`[Outscraper] Fetching reviews for query: "${query}" (place_id: ${placeId})`);

  const data = await fetchOutscraper(url);
  if (!data) throw new Error('Outscraper reviews request failed — no data returned');

  const rows = data?.data?.[0]?.reviews_data;
  if (!rows || !Array.isArray(rows)) {
    console.warn('[Outscraper] No reviews_data in response:', JSON.stringify(data).slice(0, 300));
    throw new Error('No reviews found for this business on Google Maps');
  }

  const reviews: ReviewItem[] = rows.slice(0, 10).map((r: any) => ({
    text: (r.review_text || '').slice(0, 300),
    rating: r.review_rating ?? r.rating ?? 0,
    reviewer_name: r.reviewer_name || 'Anonymous',
    date: r.review_datetime_utc || r.review_date || '',
  }));

  console.log(`[Outscraper] Fetched ${reviews.length} reviews for query: "${query}"`);
  return reviews;
}
