/* ------------------------------------------------------------------ */
/*  Service categories, roles, tones, signoffs & CTAs                  */
/*  Import these from everywhere — do NOT duplicate.                   */
/* ------------------------------------------------------------------ */

export const SERVICE_CATEGORIES = [
  { key: 'website_design',    label: 'Website Design',         emoji: '🌐' },
  { key: 'seo',               label: 'SEO / Google Ranking',   emoji: '📈' },
  { key: 'social_media',      label: 'Social Media',           emoji: '📱' },
  { key: 'paid_ads',          label: 'Paid Ads (Google/Meta)', emoji: '💰' },
  { key: 'branding',          label: 'Branding & Logo',        emoji: '🎨' },
  { key: 'email_marketing',   label: 'Email Marketing',        emoji: '📧' },
  { key: 'photography',       label: 'Photography / Video',    emoji: '📷' },
  { key: 'copywriting',       label: 'Copywriting',            emoji: '✏️' },
  { key: 'it_support',        label: 'IT Support',             emoji: '🔧' },
  { key: 'accounting',        label: 'Accounting / Finance',   emoji: '📊' },
  { key: 'legal',             label: 'Legal Services',         emoji: '⚖️' },
  { key: 'recruitment',       label: 'Recruitment / HR',       emoji: '👥' },
  { key: 'consulting',        label: 'Business Consulting',    emoji: '💼' },
  { key: 'trades',            label: 'Trades / Construction',  emoji: '🏗️' },
  { key: 'cleaning',          label: 'Cleaning Services',      emoji: '🧹' },
] as const;

export const SERVICE_LABELS: Record<string, string> = {
  website_design: 'Website Design',
  seo: 'SEO / Google Ranking',
  social_media: 'Social Media',
  paid_ads: 'Paid Ads (Google/Meta)',
  branding: 'Branding & Logo',
  email_marketing: 'Email Marketing',
  photography: 'Photography / Video',
  copywriting: 'Copywriting',
  it_support: 'IT Support',
  accounting: 'Accounting / Finance',
  legal: 'Legal Services',
  recruitment: 'Recruitment / HR',
  consulting: 'Business Consulting',
  trades: 'Trades / Construction',
  cleaning: 'Cleaning Services',
};

export const ROLE_OPTIONS = [
  { key: 'freelancer', label: 'Freelancer / Consultant', emoji: '👤' },
  { key: 'owner',      label: 'Business Owner',          emoji: '🏢' },
  { key: 'sales_rep',  label: 'Sales Rep',               emoji: '💼' },
  { key: 'agency',     label: 'Agency',                  emoji: '🏛️' },
] as const;

export const TONE_OPTIONS = [
  {
    key: 'friendly',
    label: 'Friendly & Casual',
    preview: '"Hey Sarah, quick one — I noticed..."',
  },
  {
    key: 'professional',
    label: 'Professional',
    preview: '"Hi Sarah, I wanted to reach out..."',
  },
  {
    key: 'direct',
    label: 'Direct & Punchy',
    preview: '"Sarah — no website? I can fix that."',
  },
] as const;

export const SIGNOFF_OPTIONS = [
  'Cheers', 'Best', 'Best regards', 'Kind regards', 'Thanks', 'Speak soon',
] as const;

export const CTA_OPTIONS = [
  { key: 'book_call',   label: 'Book a free call',        text: 'book a free call' },
  { key: 'reply_email', label: 'Reply to this email',     text: 'reply to this email' },
  { key: 'visit_site',  label: 'Visit my website',        text: 'visit my website' },
  { key: 'whatsapp',    label: 'Message me on WhatsApp',  text: 'message me on WhatsApp' },
] as const;

export const DAYS_OF_WEEK = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
] as const;

export type ServiceKey = typeof SERVICE_CATEGORIES[number]['key'];
export type RoleKey = typeof ROLE_OPTIONS[number]['key'];
export type ToneKey = typeof TONE_OPTIONS[number]['key'];
export type SignoffKey = typeof SIGNOFF_OPTIONS[number];
export type CTAKey = typeof CTA_OPTIONS[number]['key'];
export type DayKey = typeof DAYS_OF_WEEK[number]['key'];
