-- Migration 029: Add loss_reason_notes text column
ALTER TABLE leads ADD COLUMN loss_reason_notes TEXT DEFAULT NULL;
