-- RPC function to transactionally update sequence steps
-- Used by PATCH /sequences/:id when steps are edited

CREATE OR REPLACE FUNCTION update_sequence_steps(
  p_sequence_id UUID,
  p_steps JSONB
) RETURNS VOID AS $$
BEGIN
  DELETE FROM sequence_steps WHERE sequence_id = p_sequence_id;
  INSERT INTO sequence_steps (sequence_id, step_order, subject_template, body_template, delay_days)
  SELECT 
    p_sequence_id,
    (s->>'step_order')::INT,
    s->>'subject_template',
    s->>'body_template',
    COALESCE((s->>'delay_days')::INT, 0)
  FROM jsonb_array_elements(p_steps) AS s;
END;
$$ LANGUAGE plpgsql;
