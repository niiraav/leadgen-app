CREATE TABLE IF NOT EXISTS lead_board_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  column_id text NOT NULL,
  position real NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, lead_id, column_id)
);

CREATE INDEX IF NOT EXISTS idx_board_positions_user_column ON lead_board_positions(user_id, column_id);
CREATE INDEX IF NOT EXISTS idx_board_positions_lead ON lead_board_positions(lead_id);

-- Enable RLS
ALTER TABLE lead_board_positions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own board positions
CREATE POLICY lead_board_positions_select_own ON lead_board_positions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own board positions
CREATE POLICY lead_board_positions_insert_own ON lead_board_positions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own board positions
CREATE POLICY lead_board_positions_update_own ON lead_board_positions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own board positions
CREATE POLICY lead_board_positions_delete_own ON lead_board_positions
  FOR DELETE USING (auth.uid() = user_id);
