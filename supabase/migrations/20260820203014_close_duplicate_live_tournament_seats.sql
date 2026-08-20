-- 2026-08-20: five players are holding TWO live seats in the same tournament.
--
-- Origin: the table-move rollback in TournamentManager re-activated the
-- SOURCE seat whenever the destination seat write returned an error --
-- including when that write had actually COMMITTED and only the client saw a
-- failure (statement timeout / dropped connection). The signature is
-- unmistakable: both rows carry an identical stack.
--
--   Late Night Grind (PLO4)          1113/1113, 796/796, 1950/1950
--   Night Owl Special (NLH)          58,250 stale vs 373,625.50 real
--   Union Grand Championship (NLH)   15,000 stale vs 2,728,737 real
--
-- Why it matters: the chip sync and process_tournament_rebuy both had to pick
-- one row. With no ORDER BY the planner was free to return the STALE one, so
-- an add-on could land on a seat nobody plays (erasing the purchase) or a
-- player's stack could be reported as 15,000 when it is really 2,728,737.
--
-- Fixed at source in the same push:
--   * Club Arena b75aecc6b -- TournamentManager re-reads the destination seat
--     before restoring the source, and treats a committed-but-errored write as
--     a completed move. Guarded by TournamentFixes.guard.test.ts, which the
--     deploy gate runs before it ships.
--   * Migration 20260821u -- process_tournament_rebuy picks the newest live
--     seat on a still-open table, deterministically, instead of a bare LIMIT 1.
--
-- This migration cleans the rows that already exist. Restricted to
-- tournaments that are NOT RUNNING so no live table is altered mid-hand; all
-- five current cases are COMPLETED with closed tables. Keeps the newest live
-- seat on a still-open table -- which in both non-identical cases is the row
-- matching tournament_players.chips -- and closes the rest.
--
-- Idempotent: re-running finds no duplicates and updates nothing.
--
-- Verified after apply: duplicate_live_seats_remaining = 0.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'close_duplicate_live_tournament_seats' on 2026-08-20.

WITH ranked AS (
  SELECT s.id,
         row_number() OVER (
           PARTITION BY s.user_id, tb.tournament_id
           ORDER BY (tb.status IS DISTINCT FROM 'closed') DESC,
                    s.joined_at DESC NULLS LAST, s.id DESC) AS rn
    FROM table_seats s
    JOIN tables tb ON tb.id = s.table_id
    JOIN tournaments t ON t.id = tb.tournament_id
   WHERE s.left_at IS NULL
     AND t.status <> 'RUNNING'
     AND EXISTS (
       SELECT 1 FROM table_seats s2
         JOIN tables tb2 ON tb2.id = s2.table_id
        WHERE s2.left_at IS NULL
          AND s2.user_id = s.user_id
          AND tb2.tournament_id = tb.tournament_id
          AND s2.id <> s.id)
)
UPDATE table_seats ts
   SET left_at = now()
  FROM ranked r
 WHERE ts.id = r.id AND r.rn > 1;
