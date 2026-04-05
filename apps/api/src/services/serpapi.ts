import type { RawLead } from '../db/schema';

const SERPAPI_BASE = 'https://serpapi.com/search';
const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

if (!SERPAPI_KEY) {
  console.warn('[SerpAPI] SERPAPI_KEY not set — searches will fail');
}

type SerpApiRequest = {
  businessType: string;
  location: string;
  maxResults?: number;
};

type SerpApiResponse = {
  local_results?: {
    places?: Array<{
      title?: string;
      gps_coordinates?: { latitude: number; longitude: number };
      rating?: number;
      reviews?: number;
      address?: string;
      phone?: string;
      website?: string;
      type?: string;
      service_options?: { online_appointments?: boolean };
    }>;
  };
  error?: string;
};

export async function serpApiSearch({
  businessType,
  location,
  maxResults = 20,
}: SerpApiRequest): Promise<RawLead[]> {
  const query = `${businessType} in ${location}`;

  const url = new URL(SERPAPI_BASE);
  url.searchParams.set('engine', 'google_maps');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', SERPAPI_KEY);
  url.searchParams.set('num', String(maxResults));
  url.searchParams.set('hl', 'en');

  console.log(`[SerpAPI] Fetching: ${url.origin}${url.pathname}`);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`SerpAPI returned ${response.status}: ${errorText}`);
  }

  const data: SerpApiResponse = await response.json();

  if (data.error) {
    throw new Error(`SerpAPI error: ${data.error}`);
  }

  const places = data.local_results?.places ?? [];

  if (places.length === 0) {
    console.log('[SerpAPI] No results found');
    return [];
  }

  console.log(`[SerpAPI] Found ${places.length} results`);

  // Map SerpAPI results to RawLead
  const rawLeads: RawLead[] = places.map((place) => {
    // Extract a rough location from address
    const addressParts = place.address?.split(',').map((s) => s.trim()) ?? [];

    return {
      business_name: place.title || 'Unknown Business',
      phone: place.phone || undefined,
      website_url: place.website || undefined,
      address: place.address || undefined,
      city: addressParts.length > 1 ? addressParts[addressParts.length - 2] : undefined,
      country: undefined, // SerpAPI Google Maps doesn't always include country
      category: place.type || undefined,
      rating: place.rating || undefined,
      review_count: place.reviews || 0,
      source: 'serpapi' as const,
    };
  });

  return rawLeads;
}
