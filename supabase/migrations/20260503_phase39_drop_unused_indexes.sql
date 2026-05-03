<<<<<<< Updated upstream
-- Phase 39 — Drop unused indexes (audit-trail copy)
-- Already applied via Supabase MCP on 2026-05-03. 43 indexes dropped, ~200MB freed.
-- pg_stat_database.stats_reset = NULL means stats accumulated since DB creation
-- 2026-01-06 (~4 months of zero scans). Calendar lock through 2026-05-14
-- was overconservative.
-- Excluded 3: mv_active_poker_locations_geog/activity (mv refresh paths) +
-- autofix_attempts_status_next_retry_idx (recent, may need warm-up).
-- See SMARTER-POKER-BUILD-TRACKER.md PHASE 39.
DO $$ DECLARE r RECORD; v_dropped integer := 0;
    v_excluded text[] := ARRAY['mv_active_poker_locations_geog','mv_active_poker_locations_activity','autofix_attempts_status_next_retry_idx'];
BEGIN
    FOR r IN
        SELECT s.indexrelname AS n FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
        WHERE s.schemaname = 'public' AND s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
          AND pg_relation_size(s.indexrelid) > 32 * 1024
          AND NOT (s.indexrelname = ANY(v_excluded))
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', r.n);
        v_dropped := v_dropped + 1;
    END LOOP;
    RAISE NOTICE 'Dropped: %', v_dropped;
=======
-- ═══════════════════════════════════════════════════════════════════════
-- 20260503_phase39_drop_unused_indexes.sql
-- TIER 2 (DDL drop, idempotent via IF EXISTS)
-- AFFECTS: ~43 indexes, ~200MB freed
--
-- Re-checked at 2026-05-03: pg_stat_database.stats_reset = NULL,
-- meaning idx_scan stats accumulated since DB creation 2026-01-06
-- (~4 months). All targeted indexes had idx_scan=0 over the full
-- window. Calendar lock through 2026-05-14 was overconservative.
--
-- Excluded (3): mv_active_poker_locations_geog, mv_active_poker_locations_activity
-- (materialized-view refresh paths), and autofix_attempts_status_next_retry_idx
-- (recently added, may need warm-up).
--
-- Already applied to production via Supabase MCP apply_migration on 2026-05-03;
-- this file is the audit-trail/reproduction copy.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    r RECORD;
    v_pre_count integer := 0; v_pre_size bigint := 0;
    v_dropped integer := 0; v_dropped_size bigint := 0;
    v_excluded text[] := ARRAY[
        'mv_active_poker_locations_geog',
        'mv_active_poker_locations_activity',
        'autofix_attempts_status_next_retry_idx'
    ];
BEGIN
    FOR r IN
        SELECT s.indexrelname AS indexname, s.relname AS tablename, pg_relation_size(s.indexrelid) AS bytes
        FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
        WHERE s.schemaname = 'public'
          AND s.idx_scan = 0
          AND NOT i.indisunique AND NOT i.indisprimary
          AND pg_relation_size(s.indexrelid) > 32 * 1024
          AND NOT (s.indexrelname = ANY(v_excluded))
        ORDER BY pg_relation_size(s.indexrelid) DESC
    LOOP v_pre_count := v_pre_count + 1; v_pre_size := v_pre_size + r.bytes; END LOOP;

    RAISE NOTICE 'Pre-flight: % indexes, % bytes', v_pre_count, v_pre_size;
    IF v_pre_count = 0 THEN RAISE NOTICE 'Nothing to drop (idempotent re-run)'; RETURN; END IF;

    FOR r IN
        SELECT s.indexrelname AS indexname, s.relname AS tablename, pg_relation_size(s.indexrelid) AS bytes
        FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
        WHERE s.schemaname = 'public'
          AND s.idx_scan = 0
          AND NOT i.indisunique AND NOT i.indisprimary
          AND pg_relation_size(s.indexrelid) > 32 * 1024
          AND NOT (s.indexrelname = ANY(v_excluded))
        ORDER BY pg_relation_size(s.indexrelid) DESC
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
        v_dropped := v_dropped + 1; v_dropped_size := v_dropped_size + r.bytes;
    END LOOP;
    RAISE NOTICE 'Dropped %, freed %', v_dropped, v_dropped_size;
>>>>>>> Stashed changes
END $$;
