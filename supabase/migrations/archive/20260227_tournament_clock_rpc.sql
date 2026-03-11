-- Create a function to update tournament clock_state
-- This bypasses PostgREST schema cache issues with JSONB columns
CREATE OR REPLACE FUNCTION update_tournament_clock(
  p_tournament_id UUID,
  p_clock_state JSONB,
  p_updates JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Apply status/level updates if provided
  IF p_updates ? 'status' THEN
    UPDATE commander_tournaments SET status = p_updates->>'status' WHERE id = p_tournament_id;
  END IF;
  
  IF p_updates ? 'current_level' THEN
    UPDATE commander_tournaments SET current_level = (p_updates->>'current_level')::INTEGER WHERE id = p_tournament_id;
  END IF;
  
  IF p_updates ? 'actual_start' THEN
    UPDATE commander_tournaments SET actual_start = (p_updates->>'actual_start')::TIMESTAMPTZ WHERE id = p_tournament_id;
  END IF;
  
  IF p_updates ? 'ended_at' THEN
    UPDATE commander_tournaments SET ended_at = (p_updates->>'ended_at')::TIMESTAMPTZ WHERE id = p_tournament_id;
  END IF;

  -- Always update clock_state
  UPDATE commander_tournaments 
  SET clock_state = p_clock_state, updated_at = now()
  WHERE id = p_tournament_id;

  -- Return the updated tournament
  SELECT to_jsonb(t) INTO result
  FROM commander_tournaments t
  WHERE t.id = p_tournament_id;

  RETURN result;
END;
$$;
