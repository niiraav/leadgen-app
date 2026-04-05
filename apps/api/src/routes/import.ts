import { Hono } from 'hono';
import { createLead, createActivity } from '../db';
import type { JsonValue } from '../db';

const router = new Hono();

// ─── POST /import/csv ────────────────────────────────────────────────────────
// Accepts JSON body with { mappings, leads }.
// mappings: Array of { csvColumn, leadField }
// leads: Array of raw lead data objects

router.post('/csv', async (c) => {
  try {
    const contentType = c.req.header('content-type') ?? '';

    const now = new Date().toISOString();
    let imported = 0;

    if (contentType.includes('multipart/form-data')) {
      // Handle form data (if frontend sends FormData)
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return c.json({ error: 'No file provided' }, 400);
      }

      // For CSV file uploads, just return count - full CSV parser would be added
      // For now, expect JSON body route
      return c.json({ imported: 0, message: 'CSV file parsing not yet implemented, use JSON body' });
    }

    // JSON body: { mappings, leads }
    const body = await c.req.json();
    const { mappings, leads } = body as {
      mappings?: Array<{ csvColumn: string; leadField: string }>;
      leads: Record<string, unknown>[];
    };

    if (!leads || !Array.isArray(leads)) {
      return c.json({ error: 'Invalid request: leads array is required' }, 400);
    }

    const fieldMap = (mappings ?? []).reduce(
      (acc, m) => {
        acc[m.leadField] = m.csvColumn;
        return acc;
      },
      {} as Record<string, string>
    );

    // If no mappings, assume lead field names match directly
    const directFields = Object.keys(leads[0] ?? {});

    for (const rawLead of leads) {
      const businessName =
        rawLead.business_name ||
        rawLead.businessName ||
        rawLead.name ||
        rawLead.company ||
        (mappings
          ? rawLead[fieldMap['business_name'] ?? fieldMap['businessName']]
          : null);

      if (!businessName) continue;

      const email = (
        rawLead.email ||
        (mappings ? rawLead[fieldMap['email']] : null)
      ) as string | null;

      const phone = (
        rawLead.phone ||
        rawLead.Phone ||
        (mappings ? rawLead[fieldMap['phone']] : null)
      ) as string | null;

      const websiteUrl = (
        rawLead.website_url ||
        rawLead.website ||
        rawLead.websiteUrl ||
        (mappings ? rawLead[fieldMap['website_url']] : null)
      ) as string | null;

      const address = (
        rawLead.address ||
        rawLead.Address ||
        (mappings ? rawLead[fieldMap['address']] : null)
      ) as string | null;

      const city = (
        rawLead.city ||
        rawLead.City ||
        (mappings ? rawLead[fieldMap['city']] : null)
      ) as string | null;

      const country = (
        rawLead.country ||
        rawLead.Country ||
        (mappings ? rawLead[fieldMap['country']] : null)
      ) as string | null;

      const category = (
        rawLead.category ||
        rawLead.Category ||
        (mappings ? rawLead[fieldMap['category']] : null)
      ) as string | null;

      const rating = rawLead.rating ? Number(rawLead.rating) : null;
      const reviewCount = rawLead.review_count ? Number(rawLead.review_count) : 0;

      try {
        const result = await createLead({
          business_name: String(businessName),
          email: email ? String(email) : null,
          phone: phone ? String(phone) : null,
          website_url: websiteUrl ? String(websiteUrl) : null,
          address: address ? String(address) : null,
          city: city ? String(city) : null,
          country: country ? String(country) : null,
          category: category ? String(category) : null,
          rating,
          review_count: reviewCount,
          hot_score: 0,
          readiness_flags: [],
          status: 'new',
          source: 'csv',
          notes: null,
          tags: [] as string[],
          metadata: {} as Record<string, JsonValue>,
        });

        // Log activity
        await createActivity({
          lead_id: result.id,
          type: 'imported',
          description: `Lead imported via CSV`,
        });

        imported++;
      } catch (err) {
        console.warn('[Import] Failed to insert lead:', err instanceof Error ? err.message : err);
      }
    }

    return c.json({ imported }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Import POST /csv] Error:', message);
    return c.json({ error: 'Import failed', details: message }, 500);
  }
});

export default router;
