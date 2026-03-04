-- Fix tournament stats trigger to not exclude eliminated players from current_entries
-- This ensures the prize pool is calculated correctly even when players bust out,
-- while 'cancelled' players (refunded/voided) are still correctly excluded.

CREATE OR REPLACE FUNCTION update_tournament_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE commander_tournaments
  SET
    current_entries = (
      SELECT COUNT(*) FROM commander_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status != 'cancelled'
    ),
    players_remaining = (
      SELECT COUNT(*) FROM commander_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status IN ('seated', 'active')
    ),
    total_chips_in_play = (
      SELECT COALESCE(SUM(current_chips), 0) FROM commander_tournament_entries
      WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
      AND status IN ('seated', 'active')
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  -- Calculate average stack
  UPDATE commander_tournaments
  SET average_stack = CASE
    WHEN players_remaining > 0 THEN total_chips_in_play / players_remaining
    ELSE 0
  END
  WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
