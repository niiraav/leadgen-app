-- ============================================================================
-- Migration 028: Reply Enhancement (Pipeline Visual Cues + Reply Management)
-- ============================================================================
-- Adds sender_name, reply_status lifecycle, read/handled timestamps,
-- original email linkage, and an RPC for efficient pipeline reply fetching.
-- ============================================================================

-- ─── 1. New columns on reply_events ─────────────────────────────────────────

ALTER TABLE reply_events
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS reply_status TEXT NOT NULL DEFAULT 'new'
    CHECK (reply_status IN ('new', 'read', 'replied', 'snoozed', 'archived')),
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_step_execution_id UUID
    REFERENCES sequence_step_executions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_reply_draft TEXT;

-- Backfill existing rows: processed (classified) → 'read', unprocessed → 'new'
UPDATE reply_events
SET reply_status = CASE WHEN processed_at IS NOT NULL THEN 'read' ELSE 'new' END
WHERE reply_status = 'new';   -- covers both the default and genuinely new rows

-- ─── 2. Indexes ────────────────────────────────────────────────────────────

-- Fast lookup of latest reply per lead (used by RPC + card snippet fetch)
CREATE INDEX IF NOT EXISTS idx_reply_events_lead_received
  ON reply_events (lead_id, received_at DESC);

-- Fast unread count per lead (used by Pipeline column header badge)
CREATE INDEX IF NOT EXISTS idx_reply_events_lead_unread
  ON reply_events (lead_id, reply_status)
  WHERE reply_status = 'new';

-- ─── 3. RPC: Efficient pipeline lead fetch with reply metadata ──────────────

-- Returns all leads for a user plus:
--   - latest_reply: full reply_events row as JSONB (null if no replies)
--   - unread_reply_count: number of 'new' replies for this lead
--   - sequence_paused: whether the lead has a paused sequence enrollment
--
-- Consumed by: GET /pipeline/leads (new endpoint) → replaces the old
-- two-step fetch (leads list + separate activity/reply queries).

CREATE OR REPLACE FUNCTION get_pipeline_leads_with_replies(p_user_id UUID)
RETURNS TABLE (
  lead            JSONB,
  latest_reply    JSONB,
  unread_reply_count BIGINT,
  sequence_paused BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_jsonb(l.*)                                                          AS lead,
    (
      SELECT to_jsonb(r.*)
      FROM reply_events r
      WHERE r.lead_id = l.id
      ORDER BY r.received_at DESC
      LIMIT 1
    )                                                                      AS latest_reply,
    (
      SELECT COUNT(*)
      FROM reply_events r2
      WHERE r2.lead_id = l.id
        AND r2.reply_status = 'new'
    )                                                                      AS unread_reply_count,
    EXISTS (
      SELECT 1
      FROM sequence_enrollments se
      WHERE se.lead_id = l.id
        AND se.status = 'paused'
    )                                                                      AS sequence_paused
  FROM leads l
  WHERE l.user_id = p_user_id
  ORDER BY l.created_at DESC;
END;
$$;

-- Grant execute to the authenticated role so PostgREST can call it
GRANT EXECUTE ON FUNCTION get_pipeline_leads_with_replies(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pipeline_leads_with_replies(UUID) TO service_role;
