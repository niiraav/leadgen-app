-- Migration: Add loss_reason_notes column to leads table
-- Run this in Supabase SQL Editor

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS loss_reason_notes TEXT;

-- Index for analytics / health summary queries
CREATE INDEX IF NOT EXISTS idx_leads_loss_reason ON leads(loss_reason);

COMMENT ON COLUMN leads.loss_reason_notes IS 'Free-text notes explaining why a lead was lost (optional).';
