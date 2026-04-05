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
  gps_coordinates?: { latitude: number; longitude: number };
  rating?: number;
  reviews?: number;
  address?: string;
  phone?: string;
  website?: string;
  type?: string;
  service_options?: { online_appointments?: boolean };
};

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
      business_name: place.title || 'Unknown Business',
      phone: place.phone || undefined,
      website_url: place.website || undefined,
      address: place.address || undefined,
      city: addressParts.length > 1 ? addressParts[addressParts.length - 2] : undefined,
      country: undefined,
      category: place.type || undefined,
      rating: place.rating || undefined,
      review_count: place.reviews || 0,
      source: 'serpapi' as const,
    };
  });

  return rawLeads;
}
