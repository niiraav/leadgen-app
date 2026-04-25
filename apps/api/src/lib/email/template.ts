/**
 * Template variable substitution with HTML escaping.
 * Used by sequence worker, preview endpoint, and reply draft generator.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function substituteTemplate(
  template: string,
  lead: Record<string, any>,
  profile: Record<string, any> | null,
): string {
  const vars: Record<string, string> = {
    business_name: lead.business_name || '',
    name: lead.contact_full_name || lead.owner_name || '',
    city: lead.city || '',
    email: lead.email || '',
    phone: lead.phone || '',
    website: lead.website_url || lead.website || '',
    category: lead.category || '',
    my_name: profile?.full_name || '',
    my_company: profile?.company_name || '',
    my_email: profile?.user_email || '',
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const raw = vars[key] ?? '';
    return escapeHtml(raw);
  });
}
