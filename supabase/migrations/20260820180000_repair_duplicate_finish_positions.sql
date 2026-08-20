-- Data Repair: Duplicate Finish Positions
-- Applied To Production Via Supabase MCP On 2026-08-20.
--
-- WHAT WAS WRONG
-- 61 pairs of entries shared a finish_position inside the same tournament,
-- spread across 5 events (Wednesday Bounty Brawl 21, Ladies Night Turbo 20,
-- Thursday PLO Turbo 9, Nightly Turbo NLH 9, PLO Bounty Special 2). Two players
-- cannot finish 7th in the same tournament, and because payouts are derived
-- from finish position, a duplicate place makes the prize table ambiguous.
--
-- WHERE IT CAME FROM
-- The pre-2026-08-20 elimination path counted the remaining field and probed
-- whether a place was taken in two separate statements, so simultaneous busts
-- could claim the same place. That race is now closed by
-- commander_claim_finish_position (migration 20260820160000), which counts,
-- picks and writes inside one statement behind a lock on the tournament row.
-- Verified before this repair: 0 duplicates in any live tournament and 0
-- arising from real eliminations (every affected row had eliminated_at NULL,
-- i.e. bulk-seeded rather than produced by an actual bust).
--
-- THE REPAIR
-- Renumbered each affected tournament into a clean 1..N sequence.
-- ORDERING RULE: a player who was PAID keeps priority, ordered by payout
-- amount descending, so the money already recorded still lines up with the
-- finishing order. Unpaid finishers follow in their prior relative order.
-- payout_amount is never modified; payout_position is realigned only for rows
-- that actually carry money.
--
-- VERIFIED AFTER: 0 duplicate finish positions, 0 duplicate seats, total
-- payouts identical at $10,800.00 before and after, 0 rows with a changed
-- payout_amount, 0 paid players left without a position, and every completed
-- event now has ranked == last_place with the largest payout in 1st.
--
-- ROLLBACK DATA is preserved in commander_finish_position_backup_20260820
-- (133 rows across 6 tournaments, captured immediately before the update).
-- That table is intentionally NOT dropped.
--
-- This script is idempotent: with no duplicates present the CTE selects no
-- tournaments and the UPDATE affects zero rows.

CREATE TABLE IF NOT EXISTS commander_finish_position_backup_20260820 AS
SELECT id, tournament_id, player_name, finish_position, payout_amount, payout_position,
       status, eliminated_at, now() AS backed_up_at
FROM commander_tournament_entries
WHERE finish_position IS NOT NULL;

WITH ranked AS (
  SELECT e.id,
         ROW_NUMBER() OVER (
           PARTITION BY e.tournament_id
           ORDER BY COALESCE(e.payout_amount, 0) DESC,
                    e.finish_position ASC,
                    e.eliminated_at ASC NULLS LAST,
                    e.id ASC
         ) AS new_pos
  FROM commander_tournament_entries e
  WHERE e.finish_position IS NOT NULL
    AND e.tournament_id IN (
      SELECT a.tournament_id
      FROM commander_tournament_entries a
      JOIN commander_tournament_entries b
        ON a.tournament_id = b.tournament_id
       AND a.finish_position = b.finish_position
       AND a.id < b.id
      WHERE a.finish_position IS NOT NULL
    )
)
UPDATE commander_tournament_entries e
SET finish_position = r.new_pos,
    payout_position = CASE WHEN COALESCE(e.payout_amount, 0) > 0 THEN r.new_pos ELSE e.payout_position END
FROM ranked r
WHERE e.id = r.id
  AND e.finish_position IS DISTINCT FROM r.new_pos;

-- Post-Apply Assertions
DO $$
DECLARE
  v_dups integer;
BEGIN
  SELECT count(*) INTO v_dups
  FROM commander_tournament_entries a
  JOIN commander_tournament_entries b
    ON a.tournament_id = b.tournament_id
   AND a.finish_position = b.finish_position
   AND a.id < b.id
  WHERE a.finish_position IS NOT NULL;

  IF v_dups > 0 THEN
    RAISE EXCEPTION 'duplicate finish positions remain: %', v_dups;
  END IF;

  IF EXISTS (SELECT 1 FROM commander_tournament_entries
             WHERE payout_amount > 0 AND finish_position IS NULL) THEN
    RAISE EXCEPTION 'a paid player has no finish position';
  END IF;
END $$;

-- ROLLBACK:
-- UPDATE commander_tournament_entries e
-- SET finish_position = b.finish_position,
--     payout_position = b.payout_position
-- FROM commander_finish_position_backup_20260820 b
-- WHERE b.id = e.id;
