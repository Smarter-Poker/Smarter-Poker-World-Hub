-- Atomic Finish Position + Seat Occupancy Corrections
-- Applied To Production Via Supabase MCP apply_migration On 2026-08-20.
--
-- PART 1: commander_claim_finish_position
--
-- eliminate.js counted the remaining field, then probed whether that finish
-- position was already taken. Two separate statements, so two players busting
-- at the same instant on different tables could both read "5 remaining", both
-- find 5 unclaimed (neither had written yet), and both be recorded in 5th. The
-- finishing order was then wrong, and because payouts are derived from finish
-- position, so was the money. The old JS loop narrowed the window; it could not
-- close it.
--
-- This counts the field, picks the highest unclaimed place, and performs the
-- elimination in ONE statement behind a lock on the tournament row.
--
-- Payout math deliberately stays in JS: it needs the structure, the pool, the
-- guarantee and any recorded deal. This function owns only the part that must
-- be atomic, which is WHICH PLACE the player finished in.
--
-- Verified in production with three sequential claims: distinct sequential
-- positions, seat released, re-claim of an already eliminated entry rejected.
--
-- PART 2: commander_claim_open_seat corrections
--
-- (a) OCCUPANCY MUST COUNT 'registered'. A player seated before the clock
--     starts keeps status 'registered' until play begins, and production had
--     52 such entries holding real table/seat pairs. The RPC only treated
--     'seated' and 'active' as occupying, so it would hand a late registrant,
--     a promoted alternate or a restored player a chair that already had
--     somebody in it, recreating the duplicate-seat data the repair tool was
--     written to clean up. Verified after the change against a real
--     registered-held seat: the claim avoided it.
--
-- (b) 'maintenance' NOT 'closed'. The pool filtered
--     `status IS DISTINCT FROM 'closed'`, but commander_tables_status_check
--     allows only available/in_use/reserved/maintenance ('closed' belongs to
--     the legacy `tables` table), so the predicate excluded nothing.
--     'maintenance' is the state that means "do not seat anyone here";
--     'reserved' stays in the pool. This matches the corrected JS predicates
--     in seat-draw.js and tournamentSeating.findOpenSeat.
--
-- 'bagged' still does NOT occupy a seat anywhere: a multi-day player has their
-- chips in a bag and their chair released overnight.

CREATE OR REPLACE FUNCTION commander_claim_finish_position(
  p_entry_id uuid,
  p_tournament_id uuid,
  p_eliminated_by uuid DEFAULT NULL
)
RETURNS TABLE (finish_position integer, remaining_after integer, entry jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
  v_pos integer;
  v_row commander_tournament_entries%ROWTYPE;
BEGIN
  PERFORM 1 FROM commander_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament % not found', p_tournament_id;
  END IF;

  -- FIELD COUNT, not seat occupancy: a 'bagged' player is still alive and must
  -- count, otherwise the field is short and this bust takes a place that is
  -- already spoken for.
  SELECT count(*) INTO v_remaining
  FROM commander_tournament_entries e
  WHERE e.tournament_id = p_tournament_id
    AND e.status IN ('seated', 'active', 'bagged');

  IF v_remaining IS NULL OR v_remaining < 1 THEN
    v_remaining := 1;
  END IF;

  -- Highest place at or below the field size that nobody else holds.
  -- The subquery is aliased because the OUT parameter finish_position would
  -- otherwise be ambiguous against the column (error 42702).
  v_pos := v_remaining;
  WHILE v_pos > 1 AND EXISTS (
    SELECT 1 FROM commander_tournament_entries e
    WHERE e.tournament_id = p_tournament_id
      AND e.finish_position = v_pos
      AND e.id <> p_entry_id
  ) LOOP
    v_pos := v_pos - 1;
  END LOOP;

  UPDATE commander_tournament_entries e
  SET status = 'eliminated',
      eliminated_at = now(),
      eliminated_by = COALESCE(p_eliminated_by, e.eliminated_by),
      finish_position = v_pos,
      table_number = NULL,
      seat_number = NULL
  WHERE e.id = p_entry_id
    AND e.tournament_id = p_tournament_id
    AND e.status IN ('registered', 'seated', 'active', 'bagged')
  RETURNING e.* INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  finish_position := v_pos;
  remaining_after := GREATEST(v_remaining - 1, 0);
  entry := to_jsonb(v_row);
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION commander_claim_finish_position(uuid, uuid, uuid) FROM anon, authenticated;

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

  WITH pool AS (
    SELECT ct.table_number, COALESCE(ct.max_seats, 9) AS max_seats
    FROM commander_tables ct
    WHERE ct.venue_id = v_venue_id
      AND ct.tournament_id = p_tournament_id
      AND ct.status IS DISTINCT FROM 'maintenance'
    UNION
    SELECT e.table_number, 9
    FROM commander_tournament_entries e
    WHERE e.tournament_id = p_tournament_id
      AND e.status IN ('registered','seated','active')
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
               AND e.status IN ('registered','seated','active')
               AND e.seat_number IS NOT NULL
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
        AND e.status IN ('registered','seated','active')
        AND e.table_number = o.table_number
        AND e.seat_number = s.seat_number
        AND e.id <> p_entry_id
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

-- Post-Apply Assertions
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'commander_claim_finish_position') <> 1 THEN
    RAISE EXCEPTION 'commander_claim_finish_position not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'commander_claim_open_seat'
      AND pg_get_functiondef(p.oid) LIKE '%IS DISTINCT FROM ''maintenance''%'
  ) THEN
    RAISE EXCEPTION 'commander_claim_open_seat maintenance filter not applied';
  END IF;
END $$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS commander_claim_finish_position(uuid, uuid, uuid);
-- (commander_claim_open_seat: restore the prior definition from
--  20260820120000_commander_claim_open_seat_atomic.sql)
