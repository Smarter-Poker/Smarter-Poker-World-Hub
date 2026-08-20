-- P1-3 (2026-08-20): 1,015 cash-outs written with table_id = NULL between
-- 2026-08-19 03:33:39 and 23:30:27 UTC (1,365,360.08 chips) are invisible to
-- the union P&L's chip_flows (which joins union tables on ct.table_id). The
-- write path was fixed at the 2026-08-19 23:33 UTC cutover (0 NULL-table
-- cashouts since).
--
-- Attribution evidence, in the order tried:
--   * table_cashout_history: EMPTY (dead schema, written by nothing).
--   * seat-leave within +/-5s: 70 unique matches.
--   * seat-session containment (user seated at exactly ONE table at the
--     cashout instant, sessions since 2026-08-18): 153 unique matches
--     (superset of the +/-5s set; includes 32 of the 250 "Union migration:
--     table restarted under union ownership" bulk rows from 16:01:34).
--   * buy-in history: useless (horses buy in at many tables/day; 1,014 of
--     1,015 ambiguous).
-- Per the handoff rule, ONLY unambiguous matches get a table_id; the
-- remaining 862 rows are marked permanently unattributable — no guessing.
-- Note: the settlement chain anchor (2026-08-20 03:42:22 UTC) is AFTER this
-- window, so Monday's settlement is unaffected; this is for historical
-- windows and analytics, which now must treat 'unattributable' rows
-- explicitly rather than silently dropping them.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'backfill_unkeyed_cashouts_20260819' on 2026-08-20. Result: 153
-- backfilled, 862 unattributable, 0 unmarked. Governance + conservation
-- CLEAN afterwards.

-- 1. Backfill the unambiguous seat-session matches.
WITH unkeyed AS (
  SELECT id, to_user_id, created_at
    FROM chip_transactions
   WHERE transaction_type = 'cashout' AND table_id IS NULL
     AND created_at >= '2026-08-19 03:33:00+00' AND created_at <= '2026-08-19 23:31:00+00'
),
uniq AS (
  SELECT u.id, min(s.table_id::text)::uuid AS table_id
    FROM unkeyed u
    JOIN table_seats s
      ON s.user_id = u.to_user_id
     AND s.joined_at <= u.created_at
     AND (s.left_at IS NULL OR s.left_at >= u.created_at - interval '10 minutes')
     AND s.joined_at >= '2026-08-18 00:00:00+00'
   GROUP BY u.id
  HAVING count(DISTINCT s.table_id) = 1
)
UPDATE chip_transactions ct
   SET table_id = uniq.table_id,
       metadata = COALESCE(ct.metadata, '{}'::jsonb)
                  || jsonb_build_object('table_attribution', 'backfilled_from_table_seats',
                                        'backfilled_at', '2026-08-20')
  FROM uniq
 WHERE ct.id = uniq.id;

-- 2. Mark everything still unkeyed in the window as permanently unattributable.
UPDATE chip_transactions ct
   SET metadata = COALESCE(ct.metadata, '{}'::jsonb)
                  || jsonb_build_object('table_attribution', 'unattributable',
                                        'reason', 'no unambiguous seat/cashout-history match; see 20260820 backfill migration')
 WHERE ct.transaction_type = 'cashout' AND ct.table_id IS NULL
   AND ct.created_at >= '2026-08-19 03:33:00+00' AND ct.created_at <= '2026-08-19 23:31:00+00';
