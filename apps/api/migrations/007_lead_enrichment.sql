-- Sprint 7: Lead enrichment (GMB URLs, social links, owner names)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS place_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gmb_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gmb_reviews_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_first_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_name_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_attempted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_place_id ON leads(place_id);
CREATE INDEX IF NOT EXISTS idx_leads_data_id ON leads(data_id);
