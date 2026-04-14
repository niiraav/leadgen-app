/**
 * Backfill data_id/place_id for existing leads that were imported before
 * the enrichment column mapping was added.
 * Strips UK postcodes from city/address. Tries SerpAPI with
 * business_name only and business_name + city.
 *
 * Usage: cd apps/api && npx tsx scripts/backfill-geo-data.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { supabaseAdmin } from '../src/db';

const SERPAPI_KEY = process.env.SERPAPI_KEY || '';
if (!SERPAPI_KEY) {
  console.error('[Backfill] SERPAPI_KEY not set');
  process.exit(1);
}

function stripPostcode(s: string): string {
  if (!s) return '';
  // Remove UK postcodes from the end of strings
  return s.replace(/\s*[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/gi, '').trim();
}

// Try a SerpAPI google_maps search, return first result with data_id
async function gmbSearch(query: string): Promise<{
  place_id: string | null;
  data_id: string | null;
  gmb_reviews_url: string | null;
  matched_title: string;
} | null> {
  const params = new URLSearchParams({
    engine: 'google_maps', q: query, hl: 'en', gl: 'uk',
    api_key: SERPAPI_KEY, num: '3',
  });
  const resp = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  const data = await resp.json() as Record<string, any>;
  if (data.error) return null;

  const results = Array.isArray(data.local_results) ? data.local_results : [];
  for (const r of results) {
    if (r.data_id) {
      return {
        place_id: r.place_id || null,
        data_id: r.data_id || null,
        gmb_reviews_url: r.reviews_link || null,
        matched_title: r.title || '',
      };
    }
  }
  return null;
}

async function main() {
  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, city, address, data_id')
    .is('data_id', null)
    .limit(500);

  if (error || !leads?.length) {
    console.log(error ? `DB error: ${error.message}` : 'No leads missing data_id');
    return;
  }

  console.log(`Found ${leads.length} leads missing data_id\n`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const name = lead.business_name;
    // Clean city and address — strip postcodes that break SerpAPI
    const cleanCity = stripPostcode(lead.city || '');
    const cleanAddressFirst = stripPostcode(
      lead.address ? lead.address.split(',')[0] : ''
    );
    const city = cleanCity || cleanAddressFirst || '';

    console.log(`[${i + 1}/${leads.length}] "${name}" | city="${city}"`);

    // Strategy 1: business name + city
    let result: Awaited<ReturnType<typeof gmbSearch>> = null;
    if (city.length > 1) {
      result = await gmbSearch(`${name} ${city}`);
    }
    // Strategy 2: business name alone
    if (!result) {
      result = await gmbSearch(name);
    }

    if (!result) {
      console.log('  ❌ not found\n');
      skipped++;
      if (i < leads.length - 1) await new Promise((r) => setTimeout(r, 1200));
      continue;
    }

    await supabaseAdmin.from('leads').update({
      place_id: result.place_id,
      data_id: result.data_id,
      gmb_reviews_url: result.gmb_reviews_url,
    }).eq('id', lead.id);

    console.log(`  ✅ data_id=${result.data_id?.substring(0, 14)}… matched: "${result.matched_title}"\n`);
    updated++;

    // Rate-limit: ~1 qps for SerpAPI free tier
    if (i < leads.length - 1) await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`Done — ${updated} updated, ${skipped} skipped`);
}

main().catch(console.error);
