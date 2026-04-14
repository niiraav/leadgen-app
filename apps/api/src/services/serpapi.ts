import type { RawLead } from '../db/schema';

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

if (!SERPAPI_KEY) {
  console.warn('[SerpAPI] SERPAPI_KEY not set — searches will fail');
}

type SerpApiClientRequest = {
  businessType: string;
  location: string;
  maxResults?: number;
};

type SerpApiPlace = {
  title?: string;
  place_id?: string;
  data_id?: string;
  reviews_link?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  rating?: number;
  reviews?: number;
  address?: string;
  phone?: string;
  website?: string;
  type?: string;
  service_options?: { online_appointments?: boolean };
};


/**
 * SerpAPI titles are dirty: "24/7 ☎️LONDON CITY ROOFING ⭐⭐⭐⭐⭐| ROOFERS WEST"
 * This extracts just the actual business name.
 */
function cleanBusinessName(raw: string): string {
  let name = raw;

  // 1. Take the first part before any pipe separator
  name = name.split('|')[0].trim();

  // 2. Strip emojis and unicode symbols (everything outside basic Latin + common punct)
  //    Keep: A-Z, a-z, 0-9, spaces, dots, hyphens, ampersand, apostrophe, slash, comma
  name = name.replace(/[^\w\s.\-',/&\$#@()]/gu, '').trim();

  // 3. Remove 24/7, 24hr, 24-hour style open-times from the name
  name = name.replace(/\b(24\/7|24h|24\s*hr|24\s*hours?)\b/gi, '').trim();

  // 4. Remove leading/trailing punctuation leftovers
  name = name.replace(/^[^\w]+|[^\w]+$/g, '').trim();

  // 5. Collapse multiple spaces
  name = name.replace(/\s{2,}/g, ' ').trim();

  // 6. Remove the category repetition if it starts/ends with the same word as the service
  //    e.g. "ROOFERS LONDON" → just keep if it's not purely the service keyword repeated
  //    We just cap at 60 chars to prevent keyword-stuffed names
  if (name.length > 60) {
    // Take first 60 chars and end at word boundary
    name = name.substring(0, 60).replace(/\s+\S*$/, '').trim();
  }

  // 7. Title case
  name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return name || 'Unknown Business';
}

export async function serpApiSearch({
  businessType,
  location,
  maxResults = 20,
}: SerpApiClientRequest): Promise<RawLead[]> {
  const query = encodeURIComponent(`${businessType} in ${location}`);

  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('engine', 'google_maps');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', SERPAPI_KEY);
  url.searchParams.set('num', String(maxResults));
  url.searchParams.set('hl', 'en');

  console.log(`[SerpAPI] Fetching: ${url.origin}/search`);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`SerpAPI returned ${response.status}: ${errorText}`);
  }

  const data = await response.json() as Record<string, unknown>;

  if (data.error as string) {
    throw new Error(`SerpAPI error: ${data.error}`);
  }

  // SerpAPI returns local_results as a flat array of 20 items
  const localResults = data.local_results as SerpApiPlace[] | undefined;
  if (!localResults || !Array.isArray(localResults) || localResults.length === 0) {
    console.log('[SerpAPI] No results found');
    return [];
  }

  console.log(`[SerpAPI] Found ${localResults.length} results`);

  // Map SerpAPI results to RawLead
  const rawLeads: RawLead[] = localResults.map((place) => {
    const addressParts = place.address?.split(',').map((s) => s.trim()) ?? [];

    return {
      business_name: cleanBusinessName(place.title ?? ''),
      phone: place.phone || undefined,
      website_url: place.website || undefined,
      address: place.address || undefined,
      city: addressParts.length > 1 ? addressParts[addressParts.length - 2] : undefined,
      country: undefined,
      category: place.type || undefined,
      rating: place.rating || undefined,
      review_count: typeof place.reviews === 'string' ? parseInt(place.reviews, 10) || 0 : place.reviews || 0,
      source: 'serpapi' as const,
      place_id: place.place_id || null,
      data_id: place.data_id || null,
      gmb_reviews_url: place.reviews_link || null,
    };
  });

  return rawLeads;
}
