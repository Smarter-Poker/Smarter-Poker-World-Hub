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
END $$;
