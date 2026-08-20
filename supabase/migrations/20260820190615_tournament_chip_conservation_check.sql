-- 2026-08-20: a standing check that a live tournament holds exactly the chips
-- it issued.
--
-- Total chips in play must equal
--   players x starting_chips  +  rebuys x rebuy_chips  +  add-ons x addon_chips
--
-- Nothing verified this before. Measured on 7 RUNNING tournaments: 5 exact to
-- the chip, and the two MULTI-TABLE ones carrying a small excess -- Prime Time
-- Main Event 2,190,261 against 2,190,000 expected (+261, 0.012%) and Evening
-- Mystery Bounty 300,100 against 300,000 (+100, 0.033%).
--
-- Those same two are the ONLY tournaments holding FRACTIONAL seat stacks
-- (6 seats and 3 seats respectively; every single-table event has none). A
-- tournament should never have a fractional chip: the hand engine splits pots
-- to two decimals like cash money, so a tournament accrues fractions at every
-- odd-chip split. That is a genuine defect in its own right, and it is the
-- clearest lead on the drift.
--
-- The drift is CONSTANT rather than per-hand -- it stayed at ~258-261 while
-- rebuys went 65 -> 67 and hands played reached 1,194 -- and a 200,000-hand
-- fuzz of ChipConservation.property.test surfaced only an eligibility
-- MISALLOCATION, never net creation. So the cause is not yet established and
-- this function REPORTS rather than corrects. Adjusting pot-splitting maths on
-- a guess would corrupt every hand at every table.
--
-- Seat stacks are the authority here, not tournament_players.chips: that
-- column is INTEGER and the sync floors it, so it trails the true stack by a
-- chip or two per table by design.
--
-- Tolerance is per player, not absolute, because a large field legitimately
-- accumulates flooring noise across many tables. At 1 chip/player the two
-- events above are flagged (1.74 and 1.67 per player); at 5 chips/player
-- nothing is.
--
-- Bounded by construction: RUNNING tournaments only, which is single digits.
-- Called every settler cycle from RakebackSettlerService (Club Arena
-- cb56aaafe).
--
-- Applied to production via Supabase MCP apply_migration as
-- 'tournament_chip_conservation_check' on 2026-08-20.

CREATE OR REPLACE FUNCTION public.fn_tournament_chip_conservation_check(
  p_tolerance_per_player numeric DEFAULT 1)
RETURNS TABLE(
  tournament_id uuid,
  name text,
  players bigint,
  expected_chips numeric,
  actual_chips numeric,
  drift numeric,
  drift_per_player numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH live AS (
    SELECT t.id,
           t.name,
           COALESCE(t.starting_chips, 0) AS starting_chips,
           COALESCE(t.rebuy_chips, 0)    AS rebuy_chips,
           COALESCE(t.addon_chips, 0)    AS addon_chips,
           (SELECT count(*) FROM tournament_players tp
             WHERE tp.tournament_id = t.id) AS players,
           (SELECT COALESCE(sum(tp.rebuys), 0) FROM tournament_players tp
             WHERE tp.tournament_id = t.id) AS rebuys,
           (SELECT count(*) FROM tournament_players tp
             WHERE tp.tournament_id = t.id AND tp.add_on) AS addons,
           (SELECT COALESCE(sum(ts.stack), 0)
              FROM table_seats ts
              JOIN tables tb ON tb.id = ts.table_id
             WHERE tb.tournament_id = t.id AND ts.left_at IS NULL) AS seat_stacks
      FROM tournaments t
     WHERE t.status = 'RUNNING'
  ),
  calc AS (
    SELECT l.id, l.name, l.players,
           (l.players * l.starting_chips)
             + (l.rebuys * l.rebuy_chips)
             + (l.addons * l.addon_chips) AS expected_chips,
           l.seat_stacks AS actual_chips
      FROM live l
  )
  SELECT c.id, c.name, c.players,
         round(c.expected_chips, 2),
         round(c.actual_chips, 2),
         round(c.actual_chips - c.expected_chips, 2),
         round((c.actual_chips - c.expected_chips) / NULLIF(c.players, 0), 3)
    FROM calc c
   WHERE c.players > 0
     AND abs(c.actual_chips - c.expected_chips)
         > (GREATEST(p_tolerance_per_player, 0) * c.players)
   ORDER BY abs(c.actual_chips - c.expected_chips) DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_tournament_chip_conservation_check(numeric)
  FROM PUBLIC, anon, authenticated;
