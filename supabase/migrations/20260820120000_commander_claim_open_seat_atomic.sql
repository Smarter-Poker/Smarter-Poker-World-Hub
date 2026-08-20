-- Atomic Seat Claim For Tournament Entries
-- Applied To Production Via Supabase MCP apply_migration On 2026-08-20.
--
-- WHY: findOpenSeat() in the API read the occupied seats, picked a gap, then
-- wrote it in a separate statement. Two concurrent promotions, a promotion
-- racing a late registration, or two TD tablets acting at once could read the
-- same gap and both write it. Production already held 53 duplicate seat
-- assignments across live tournaments, so this was not theoretical.
--
-- This function picks AND claims the seat inside one statement, taking a row
-- lock on the tournament so concurrent callers serialize instead of colliding.
-- Returns the claimed seat, or no row when the floor is genuinely full or the
-- entry is no longer in the expected status.
--
-- Verified in production with a two-claim DO block: distinct seats returned,
-- starting chips granted, existing stacks preserved, test rows cleaned up.

CREATE OR REPLACE FUNCTION commander_claim_open_seat(
  p_entry_id uuid,
  p_tournament_id uuid,
  p_expected_status text DEFAULT NULL
)
RETURNS TABLE (table_number integer, seat_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id integer;
  v_starting_chips integer;
  v_seat record;
  v_current_status text;
BEGIN
  -- Serialize concurrent seat claims for this tournament.
  SELECT venue_id, starting_chips INTO v_venue_id, v_starting_chips
  FROM commander_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament % not found', p_tournament_id;
  END IF;

  SELECT status INTO v_current_status
  FROM commander_tournament_entries
  WHERE id = p_entry_id AND tournament_id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF p_expected_status IS NOT NULL AND v_current_status IS DISTINCT FROM p_expected_status THEN
    RETURN;
  END IF;

  -- Candidate seats: every seat on every table assigned to this tournament
  -- (falling back to tables players already occupy), minus occupied seats.
  WITH pool AS (
    SELECT ct.table_number, COALESCE(ct.max_seats, 9) AS max_seats
    FROM commander_tables ct
    WHERE ct.venue_id = v_venue_id
      AND ct.tournament_id = p_tournament_id
      AND ct.status IS DISTINCT FROM 'closed'
    UNION
    SELECT e.table_number, 9
    FROM commander_tournament_entries e
    WHERE e.tournament_id = p_tournament_id
      AND e.status IN ('seated','active')
      AND e.table_number IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM commander_tables ct2
        WHERE ct2.venue_id = v_venue_id AND ct2.tournament_id = p_tournament_id
      )
  ),
  occupancy AS (
    SELECT p.table_number, p.max_seats,
           (SELECT count(*) FROM commander_tournament_entries e
             WHERE e.tournament_id = p_tournament_id
               AND e.status IN ('seated','active')
               AND e.table_number = p.table_number) AS seated_count
    FROM pool p
  ),
  candidates AS (
    SELECT o.table_number, s.seat_number, o.seated_count
    FROM occupancy o
    CROSS JOIN LATERAL generate_series(1, o.max_seats) AS s(seat_number)
    WHERE NOT EXISTS (
      SELECT 1 FROM commander_tournament_entries e
      WHERE e.tournament_id = p_tournament_id
        AND e.status IN ('seated','active')
        AND e.table_number = o.table_number
        AND e.seat_number = s.seat_number
    )
  )
  SELECT c.table_number, c.seat_number INTO v_seat
  FROM candidates c
  ORDER BY c.seated_count ASC, c.table_number ASC, c.seat_number ASC
  LIMIT 1;

  IF v_seat IS NULL THEN
    RETURN;
  END IF;

  UPDATE commander_tournament_entries e
  SET table_number = v_seat.table_number,
      seat_number  = v_seat.seat_number,
      status       = CASE WHEN e.status = 'active' THEN 'active' ELSE 'seated' END,
      current_chips = CASE
                        WHEN COALESCE(e.current_chips, 0) > 0 THEN e.current_chips
                        ELSE COALESCE(v_starting_chips, 0)
                      END
  WHERE e.id = p_entry_id AND e.tournament_id = p_tournament_id;

  table_number := v_seat.table_number;
  seat_number  := v_seat.seat_number;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION commander_claim_open_seat(uuid, uuid, text) FROM anon, authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'commander_claim_open_seat') <> 1 THEN
    RAISE EXCEPTION 'commander_claim_open_seat not created';
  END IF;
END $$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS commander_claim_open_seat(uuid, uuid, text);
