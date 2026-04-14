-- Sprint 8b: Add company_socials column for storing company-level social profiles
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_socials JSONB DEFAULT '{}';
