-- ============================================================================
-- 20260817_rakeback_settlement_sargable_and_indexes.sql
-- TIER 3 (money function body change). APPLIED 2026-08-17. Behaviour-preserving.
--
-- WHY
-- ---
-- From the live engine log on 2026-08-17:
--   [RakebackSettler.fetch_failed] Error: canceling statement due to statement
--   timeout at RakebackSettlerService._runSettlementInner
--
-- The rakeback settler -- the daemon that PAYS players -- was dying on the
-- statement timeout. Cause: fn_close_settlement_period filtered with
-- `r.created_at::date >= v_period.period_start`. Casting the column destroys
-- sargability, so no created_at index could be used and Postgres scanned the
-- entire club partition for every user-period.
--
-- MEASURED (one user-period, real club, 7-day window)
--   ::date cast                 5140 ms   Rows Removed by Filter: 198,229
--   half-open range             2265 ms   created_at index usable
--   range + both new indexes      96 ms   BitmapAnd, Heap Blocks: 869
--   -> 53x faster
--
-- Selectivity is why a btree alone was not enough. In the 7-day window:
--   all clubs            254,744 rows
--   this club            125,363 rows   <- club_id is NOT selective (49%)
--   this club + user       1,042 rows   <- the jsonb ? test does the filtering
-- So the GIN index is the one that matters; the composite narrows the other side.
-- Both are used together in a BitmapAnd.
--
-- INDEXES (built CONCURRENTLY, outside this file, because CREATE INDEX
-- CONCURRENTLY cannot run inside a transaction and apply_migration wraps one.
-- Recorded here so the schema is reproducible):
--
--   CREATE INDEX CONCURRENTLY idx_rake_records_contribs_gin
--     ON public.rake_records USING gin (player_contributions);
--
--   CREATE INDEX CONCURRENTLY idx_rake_records_club_created
--     ON public.rake_records (club_id, created_at) WHERE rake_amount > 0;
--
-- jsonb_ops (the default) is REQUIRED — jsonb_path_ops does NOT index the `?`
-- operator, which is exactly what the eligibility test uses.
-- Run ANALYZE public.rake_records after building; the planner ignored both
-- indexes until statistics were refreshed.
--
-- EQUIVALENCE
-- -----------
-- period_start/period_end are DATE. `created_at::date BETWEEN start AND end`
-- selects exactly `created_at >= start::timestamptz AND created_at <
-- (end+1)::timestamptz` — the cast truncates to midnight, and the upper bound
-- is exclusive of the following midnight. Proven against 25 real unpaid
-- periods before shipping:
--
--   periods_compared 25 | MISMATCHES 0 | max_abs_diff 0.000000
--   total_old 6416.99   | total_new   6416.99
--
-- Everything else is untouched: the equal-share denominator over every player
-- dealt in (DECISION D-001), the tier rates, the payout, the wallet credit.
--
-- ROLLBACK
-- --------
-- Re-apply the previous body with these two lines restored:
--     AND r.created_at::date >= v_period.period_start
--     AND r.created_at::date <= v_period.period_end
-- and drop the two indexes. Rollback only reintroduces the timeout; it moves
-- no money, since the two forms select identical rows.
-- ============================================================================

-- The full CREATE OR REPLACE body, pre-flight and post-apply assertion blocks
-- were applied via Supabase apply_migration under the name
-- "rakeback_settlement_sargable_date_range". Assertions enforced:
--   PRE : function exists; ::date cast present; dealt-in denominator present
--   POST: ::date cast gone; denominator intact; half-open upper bound present
-- All passed. See list_migrations for the applied record.

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_close_settlement_period';
  IF v_def LIKE '%created_at::date%' THEN
    RAISE EXCEPTION 'drift: fn_close_settlement_period still uses the ::date cast';
  END IF;
  IF v_def NOT LIKE '%jsonb_object_keys(r.player_contributions)%' THEN
    RAISE EXCEPTION 'drift: dealt-in denominator missing from fn_close_settlement_period';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                   AND indexname='idx_rake_records_contribs_gin') THEN
    RAISE EXCEPTION 'drift: idx_rake_records_contribs_gin is missing - settlement will time out';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                   AND indexname='idx_rake_records_club_created') THEN
    RAISE EXCEPTION 'drift: idx_rake_records_club_created is missing';
  END IF;
  RAISE NOTICE 'OK: sargable settlement window + both supporting indexes present';
END $$;
