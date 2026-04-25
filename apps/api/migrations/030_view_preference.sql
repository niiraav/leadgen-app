-- Migration 030: Add view_preference to profiles table
-- Sprint E: Save user board/list view preference

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS view_preference TEXT CHECK (view_preference IN ('board', 'list')) DEFAULT 'board';
