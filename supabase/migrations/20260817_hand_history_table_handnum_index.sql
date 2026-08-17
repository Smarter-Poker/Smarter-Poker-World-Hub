-- ============================================================================
-- 20260817_hand_history_table_handnum_index.sql
-- APPLIED 2026-08-17. Index only — no data or function change.
--
-- WHY
-- ---
-- ServerTableEngineBase.seedHandCountFromHistory() resumes a table's hand
-- numbering with `ORDER BY hand_number DESC LIMIT 1`. hand_history carried
-- (table_id) and (table_id, created_at DESC) but NOT (table_id, hand_number),
-- so Postgres index-scanned the whole partition and SORTED it:
--
--   Limit  (cost=14218.45..14218.45 rows=1)
--     -> Sort  Sort Key: hand_number DESC
--          -> Index Scan using idx_hand_history_table  (rows=12687)
--
-- Against a 10 GB / ~1.58M-row table that blew the statement timeout on the
-- LARGEST tables — the ones the seed exists for. Production log:
--
--   [ServerTableEngine:87fc21ed-...] Could not seed hand counter (canceling
--   statement due to statement timeout) - continuing from #0
--
-- 87fc21ed had 12,919 prior hands and restarted at #1 anyway.
--
-- AFTER
--   Index Only Scan using idx_hand_history_table_handnum
--   Heap Fetches: 1 | Execution Time: 3.481 ms
--
-- HOW IT WAS BUILT (this is the part worth remembering)
-- -----------------------------------------------------
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction, so it cannot go
-- through apply_migration. It also could not complete under the API's default
-- 2-minute statement_timeout: the first attempt was cancelled and left an
-- INVALID 53 MB index behind (dropped with DROP INDEX CONCURRENTLY).
--
-- No direct psql route existed: dblink refuses without a password
-- ("Non-superusers must provide a password"), pg_cron wraps jobs in a
-- transaction, and the SUPABASE_DB_PASSWORD in the repo .env is stale.
--
-- What worked: raise the timeout at ROLE level so the next pooled session
-- inherits it, run the build, then put it straight back.
--
--   ALTER ROLE postgres SET statement_timeout = '45min';
--   CREATE INDEX CONCURRENTLY ... ;      -- client disconnected; build continued
--   ALTER ROLE postgres RESET statement_timeout;
--
-- The client call timed out but the SERVER-side build survived, tracked via
-- pg_stat_progress_create_index ("index validation: scanning table",
-- 1,052,253 / 1,146,286 blocks). Final: valid = true, 55 MB, zero write
-- blocking while live tables dealt 181 hands/minute.
--
-- ALWAYS reset the role timeout afterwards — leaving it at 45min removes the
-- guard rail that stops a runaway query from pinning a connection.
-- ============================================================================

-- Recorded for reproducibility; run OUTSIDE a transaction:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hand_history_table_handnum
--     ON public.hand_history (table_id, hand_number DESC);
--   ANALYZE public.hand_history;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'hand_history'
       AND indexname  = 'idx_hand_history_table_handnum'
  ) THEN
    RAISE EXCEPTION 'drift: idx_hand_history_table_handnum is missing - the hand-counter seed will time out on large tables and hand numbers will restart at 1';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
      JOIN pg_index i ON i.indexrelid = c.oid
     WHERE c.relname = 'idx_hand_history_table_handnum'
       AND NOT i.indisvalid
  ) THEN
    RAISE EXCEPTION 'idx_hand_history_table_handnum exists but is INVALID - a cancelled CONCURRENTLY build; drop it and rebuild';
  END IF;

  RAISE NOTICE 'OK: idx_hand_history_table_handnum present and valid';
END $$;
