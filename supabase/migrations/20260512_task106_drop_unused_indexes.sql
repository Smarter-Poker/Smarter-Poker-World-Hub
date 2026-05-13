-- =======================================================================
-- 20260512_task106_drop_unused_indexes.sql
-- TIER 2 (DDL drop, idempotent via IF EXISTS)
-- AFFECTS: ~86 indexes, ~303MB freed
--
-- Pre-flight run on 2026-05-12:
--   86 non-unique, non-primary indexes with idx_scan=0 since DB creation
--   (stats_reset = NULL, accumulated since 2026-01-06 ~4.5 months).
--   Phase 39 (2026-05-03) dropped an earlier cohort; these are either
--   newer indexes that were never scanned, or indexes that survived the
--   last soak window and still show zero usage.
--
-- Excluded (4):
--   mv_active_poker_locations_geog        -- materialized view refresh path
--   mv_active_poker_locations_activity    -- materialized view refresh path
--   mv_active_poker_locations_city        -- materialized view refresh path
--   autofix_attempts_status_next_retry_idx -- deploy-monitor index, kept warm
--
-- Rollback: indexes can be re-created from migration history if any
-- query latency regression is observed post-drop.
-- =======================================================================
DO $$
DECLARE
    r RECORD;
    v_pre_count    integer := 0;
    v_pre_size     bigint  := 0;
    v_dropped      integer := 0;
    v_dropped_size bigint  := 0;
    v_excluded     text[]  := ARRAY[
        'mv_active_poker_locations_geog',
        'mv_active_poker_locations_activity',
        'mv_active_poker_locations_city',
        'autofix_attempts_status_next_retry_idx'
    ];
BEGIN
    -- Pre-flight: count and measure what we are about to drop
    FOR r IN
        SELECT s.indexrelname AS indexname,
               s.relname      AS tablename,
               pg_relation_size(s.indexrelid) AS bytes
        FROM   pg_stat_user_indexes s
        JOIN   pg_index i ON i.indexrelid = s.indexrelid
        WHERE  s.schemaname = 'public'
          AND  s.idx_scan   = 0
          AND  NOT i.indisunique
          AND  NOT i.indisprimary
          AND  pg_relation_size(s.indexrelid) > 32 * 1024
          AND  NOT (s.indexrelname = ANY(v_excluded))
        ORDER BY pg_relation_size(s.indexrelid) DESC
    LOOP
        v_pre_count := v_pre_count + 1;
        v_pre_size  := v_pre_size  + r.bytes;
    END LOOP;

    RAISE NOTICE 'Task-106 pre-flight: % indexes, % bytes to drop', v_pre_count, v_pre_size;

    IF v_pre_count = 0 THEN
        RAISE NOTICE 'Nothing to drop -- all zero-scan indexes already removed';
        RETURN;
    END IF;

    -- Drop pass
    FOR r IN
        SELECT s.indexrelname AS indexname,
               s.relname      AS tablename,
               pg_relation_size(s.indexrelid) AS bytes
        FROM   pg_stat_user_indexes s
        JOIN   pg_index i ON i.indexrelid = s.indexrelid
        WHERE  s.schemaname = 'public'
          AND  s.idx_scan   = 0
          AND  NOT i.indisunique
          AND  NOT i.indisprimary
          AND  pg_relation_size(s.indexrelid) > 32 * 1024
          AND  NOT (s.indexrelname = ANY(v_excluded))
        ORDER BY pg_relation_size(s.indexrelid) DESC
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
        v_dropped      := v_dropped      + 1;
        v_dropped_size := v_dropped_size + r.bytes;
        RAISE NOTICE 'Dropped % (table: %, size: % bytes)', r.indexname, r.tablename, r.bytes;
    END LOOP;

    RAISE NOTICE 'Task-106 complete: dropped %, freed % bytes (~% MB)',
        v_dropped, v_dropped_size, (v_dropped_size / 1048576);
END $$;
