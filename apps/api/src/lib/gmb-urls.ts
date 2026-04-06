export interface GmbLeadLike {
  place_id?: string | null;
  data_id?: string | null;
  name?: string | null;
  address?: string | null;
  gmb_reviews_url?: string | null;
}

export const buildGmbUrl = (lead: GmbLeadLike): string => {
  if (lead.place_id) return `https://www.google.com/maps/place/?q=place_id:${lead.place_id}`;
  if (lead.gmb_reviews_url) return lead.gmb_reviews_url;
  const q = [lead.name, lead.address].filter(Boolean).join(' ');
  if (q) return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
  return 'https://www.google.com/maps';
};

export const buildGmbReviewsUrl = (data_id: string): string => {
  return `https://www.google.com/maps/search/?api=1&query=${data_id}`;
};
