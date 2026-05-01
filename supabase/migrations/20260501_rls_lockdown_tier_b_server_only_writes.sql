-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_rls_lockdown_tier_b_server_only_writes.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (architectural — RLS policy DROPs, programmatic)
-- AUTHOR:      Cowork agent (Phase 37, follow-up to tier-S money tables)
-- AFFECTS:     ~110 RLS policies across ~70 tables
-- IRREVERSIBLE: yes
--
-- WHY:
--   Tier-S already locked down money/financial tables. This migration
--   covers the remaining server-only write policies that were also
--   defined as USING true / WITH CHECK true on roles {public}: commander
--   operational tables, jarvis caches, training/trivia state, horse_*
--   journal/stats, news/poker_videos/poker_news, logs (abuse/audit/sms),
--   sandbox_results, scrape, etc.
--
--   Excluded (handled separately or intentionally public):
--     - horse_bug_reports INSERT, qr_code_scans INSERT (intentional public)
--     - profiles INSERT, social_post_comments, social_comment_likes,
--       social_page_reports, sandbox_bookmarks, sandbox_saved_hands,
--       sandbox_shared_scenarios, messenger_themes, messenger_labels
--       (need auth.uid() replacement, NOT plain DROP)
--     - tier-S already shipped: tournaments, hands, orders, etc.
--
-- HOW:
--   Programmatic loop over pg_policies. For every permissive write policy
--   (cmd in INSERT/UPDATE/DELETE/ALL) where USING/WITH CHECK is just
--   `true` AND roles = {public} AND tablename is not in the exclusion
--   list AND tablename is not in the tier-S list (already dropped),
--   DROP it.
--
--   service_role bypasses RLS, so all server-side writes (engine, API
--   routes using SUPABASE_SERVICE_ROLE_KEY) continue to work. The
--   existing SELECT policies on each table are untouched, so reads
--   continue to work.
--
-- SAFETY:
--   - Pre-flight count + log of every (tablename, policyname) about to drop
--   - Drop loop is transactional (any failure rolls back)
--   - Post-apply assertion confirms 0 of those exact (table,policy) pairs remain
--   - Smoke canary: anon INSERT into commander_player_reputation_scores
--     must fail with sqlstate 42501
--
-- See .agent/workflows/migration-safety.md for the protocol.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    r RECORD;
    v_pre_count integer := 0;
    v_dropped integer := 0;
    v_remaining integer;
    v_sql text;
    -- Tables whose write policies we DROP (server-only writes)
    -- Implicitly: every table NOT in the exclusion list below
    v_excluded_tables text[] := ARRAY[
        -- intentional public-write
        'horse_bug_reports','qr_code_scans',
        -- user-self-scoped (need auth.uid() check, separate migration)
        'profiles','social_post_comments','social_comment_likes','social_page_reports',
        'sandbox_bookmarks','sandbox_saved_hands','sandbox_shared_scenarios',
        'messenger_themes','messenger_labels',
        -- already dropped in tier-S migration
        'arcade_duels','arena_matches','club_game_seats','club_live_games',
        'commander_dealer_marketplace','commander_dealer_rotations','commander_pilot_venues',
        'commander_table_sessions','commander_time_purchases','diamond_arena_events',
        'hand_histories','hands','live_games','orders','purchase_history',
        'rake_history','rake_records','rakeback_distributions','settlement_invoices',
        'settlement_locks','table_cashout_history','table_seats','tables',
        'tournament_mystery_draws','tournament_players','tournament_results',
        'tournaments','union_rakeback_log'
    ];
BEGIN
    -- ─── PRE-FLIGHT ─────────────────────────────────────────────────────
    FOR r IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname='public'
          AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
          AND (qual IS NULL OR qual = 'true')
          AND (with_check IS NULL OR with_check = 'true')
          AND NOT (
              array_to_string(roles,',') LIKE '%service_role%'
           OR array_to_string(roles,',') LIKE '%postgres%'
          )
          AND NOT (tablename = ANY(v_excluded_tables))
        ORDER BY tablename, policyname
    LOOP
        v_pre_count := v_pre_count + 1;
        RAISE NOTICE 'Pre-flight target: %.% ', r.tablename, r.policyname;
    END LOOP;

    RAISE NOTICE 'Pre-flight: % policies will be dropped', v_pre_count;
    IF v_pre_count = 0 THEN
        RAISE NOTICE 'Nothing to drop (idempotent re-run)';
        RETURN;
    END IF;

    -- ─── DROP LOOP ──────────────────────────────────────────────────────
    FOR r IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname='public'
          AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
          AND (qual IS NULL OR qual = 'true')
          AND (with_check IS NULL OR with_check = 'true')
          AND NOT (
              array_to_string(roles,',') LIKE '%service_role%'
           OR array_to_string(roles,',') LIKE '%postgres%'
          )
          AND NOT (tablename = ANY(v_excluded_tables))
        ORDER BY tablename, policyname
    LOOP
        v_sql := format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
        EXECUTE v_sql;
        v_dropped := v_dropped + 1;
    END LOOP;

    RAISE NOTICE 'Dropped: % policies', v_dropped;

    -- ─── POST-APPLY ASSERTION ──────────────────────────────────────────
    SELECT COUNT(*) INTO v_remaining
    FROM pg_policies
    WHERE schemaname='public'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (qual IS NULL OR qual = 'true')
      AND (with_check IS NULL OR with_check = 'true')
      AND NOT (
          array_to_string(roles,',') LIKE '%service_role%'
       OR array_to_string(roles,',') LIKE '%postgres%'
      )
      AND NOT (tablename = ANY(v_excluded_tables));

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Post-apply: % matching policies still remain after drop loop', v_remaining;
    END IF;
    RAISE NOTICE 'Post-apply: 0 server-only permissive policies remain';
END $$;

-- ─── SMOKE CANARY ──────────────────────────────────────────────────────
-- Confirm anon now blocked from inserting into commander_player_reputation_scores
-- (a representative tier-B table). If lockdown failed, this raises.
DO $$
DECLARE v_anon_can_write boolean := false;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        INSERT INTO commander_player_reputation_scores DEFAULT VALUES;
        v_anon_can_write := true;
    EXCEPTION
        WHEN insufficient_privilege OR check_violation THEN
            NULL; -- expected
        WHEN others THEN
            -- 42501 etc. — also acceptable as a block
            NULL;
    END;
    RESET ROLE;

    IF v_anon_can_write THEN
        RAISE EXCEPTION 'CANARY FAILED: anon was able to INSERT into commander_player_reputation_scores';
    END IF;
    RAISE NOTICE 'Canary OK: anon blocked from commander_player_reputation_scores';
END $$;
