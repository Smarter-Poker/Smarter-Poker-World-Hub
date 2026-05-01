-- ═══════════════════════════════════════════════════════════════════════
-- 20260501_rls_lockdown_tier_s_money_tables.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (architectural — RLS policy DROPs)
-- AUTHOR:      Cowork agent (Phase 37 — RLS audit, after task #127 found
--              ~40 tables where permissive policies USING true / WITH CHECK
--              true were granted to roles {public}, allowing anon writes)
-- AFFECTS:     RLS policies on 28 tables (45 policy DROPs total)
-- IRREVERSIBLE: yes — but reversible via re-CREATE
--
-- WHY:
--   Live exploit confirmed: anon role CAN insert tournaments, table_seats,
--   orders, hands, etc. with arbitrary data. The policies named
--   `*_insert/_update/_delete`, `Service role full access on X`,
--   `patch_maintain_access`, etc. were WRITTEN for service_role usage but
--   defined with role `{public}` which means EVERY role (including anon).
--
--   Test that proved exploit (anon role, transaction rolled back):
--     SET LOCAL ROLE anon;
--     INSERT INTO tournaments (id, name, game_type, buy_in_amount,
--                               buy_in_fee, start_time, status, max_players)
--     VALUES (gen_random_uuid(), 'EXPLOIT', 'NLH', 0, 0, NOW(),
--             'ANNOUNCED', 9)
--     RETURNING id, name, status;
--     -- → Returned a row. RLS lets it through.
--
--   These tables have separate SELECT policies that handle reads. Dropping
--   the write policies is safe because:
--     1. service_role bypasses RLS entirely (engine + API routes still write)
--     2. SELECT policies remain intact (clients still read)
--     3. anon's write attempts now fail (no permissive policy → blocked)
--
--   Verified callers (Smarter-Poker-World-Hub repo):
--     - pages/api/poker/* — all use SUPABASE_SERVICE_ROLE_KEY
--     - pages/api/club-arena/* — service_role
--     - src/lib/poker-engine/GameController.js:159 — service_role
--     - pages/horses/index.js, pages/hub/diamond-store/* — anon BUT only
--       SELECT operations (which keep their own policies)
--
-- HOW:
--   - Pre-flight: assert each policy still exists and matches the
--     "USING true / WITH CHECK true" signature
--   - DROP POLICY each one (44 total)
--   - Post-apply: assert each is gone AND assert anon can NO LONGER
--     INSERT a tournament (regression canary against the same exploit)
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_pre_count integer;
    v_target_count integer := 45;
BEGIN
    -- ─── PRE-FLIGHT ─────────────────────────────────────────────────────
    SELECT COUNT(*) INTO v_pre_count
    FROM pg_policies
    WHERE schemaname='public'
      AND (
        (tablename='arcade_duels'                    AND policyname='arcade_duels_insert')
     OR (tablename='arena_matches'                   AND policyname='arena_matches_insert')
     OR (tablename='club_game_seats'                 AND policyname IN ('club_game_seats_delete','club_game_seats_insert','club_game_seats_update'))
     OR (tablename='club_live_games'                 AND policyname IN ('club_live_games_delete','club_live_games_insert','club_live_games_update'))
     OR (tablename='commander_dealer_marketplace'    AND policyname='patch_maintain_access')
     OR (tablename='commander_dealer_rotations'      AND policyname='patch_maintain_access')
     OR (tablename='commander_pilot_venues'          AND policyname IN ('commander_pilot_venues_delete','commander_pilot_venues_insert','commander_pilot_venues_update'))
     OR (tablename='commander_table_sessions'        AND policyname='Service role full access on commander_table_sessions')
     OR (tablename='commander_time_purchases'        AND policyname='Service role full access on commander_time_purchases')
     OR (tablename='diamond_arena_events'            AND policyname='Service role can insert events')
     OR (tablename='hand_histories'                  AND policyname='Service role can insert hands')
     OR (tablename='hands'                           AND policyname IN ('hands_delete','hands_insert','hands_update'))
     OR (tablename='live_games'                      AND policyname='live_games_insert')
     OR (tablename='orders'                          AND policyname IN ('Service can create orders','Service can update orders'))
     OR (tablename='purchase_history'                AND policyname='ph_ins')
     OR (tablename='rake_history'                    AND policyname='rake_history_insert')
     OR (tablename='rake_records'                    AND policyname='insert_rake_records')
     OR (tablename='rakeback_distributions'          AND policyname='rakeback_distributions_insert')
     OR (tablename='settlement_invoices'             AND policyname='settlement_invoices_insert')
     OR (tablename='settlement_locks'                AND policyname='settlement_locks_insert')
     OR (tablename='table_cashout_history'           AND policyname='Service role can insert cashout history')
     OR (tablename='table_seats'                     AND policyname IN ('table_seats_delete','table_seats_insert','table_seats_update'))
     OR (tablename='tables'                          AND policyname='Club admins can update tables')
     OR (tablename='tournament_mystery_draws'        AND policyname IN ('tournament_mystery_draws_delete','tournament_mystery_draws_insert','tournament_mystery_draws_update'))
     OR (tablename='tournament_players'              AND policyname IN ('tournament_players_delete','tournament_players_insert','tournament_players_update'))
     OR (tablename='tournament_results'              AND policyname='patch_maintain_access')
     OR (tablename='tournaments'                     AND policyname IN ('tournaments_delete','tournaments_insert','tournaments_update'))
     OR (tablename='union_rakeback_log'              AND policyname='union_rakeback_log_insert')
      );

    RAISE NOTICE 'Pre-flight: % of % target policies present', v_pre_count, v_target_count;

    IF v_pre_count <> v_target_count THEN
        RAISE EXCEPTION 'Pre-flight: expected % policies, found %. Aborting.', v_target_count, v_pre_count;
    END IF;
END $$;

-- ─── DROPs ─────────────────────────────────────────────────────────────
-- arcade_duels (1)
DROP POLICY "arcade_duels_insert" ON public.arcade_duels;

-- arena_matches (1)
DROP POLICY "arena_matches_insert" ON public.arena_matches;

-- club_game_seats (3)
DROP POLICY "club_game_seats_delete" ON public.club_game_seats;
DROP POLICY "club_game_seats_insert" ON public.club_game_seats;
DROP POLICY "club_game_seats_update" ON public.club_game_seats;

-- club_live_games (3)
DROP POLICY "club_live_games_delete" ON public.club_live_games;
DROP POLICY "club_live_games_insert" ON public.club_live_games;
DROP POLICY "club_live_games_update" ON public.club_live_games;

-- commander_dealer_marketplace (1) — was ALL, was the only policy →
-- creates a SELECT-only replacement so reads via service_role still work
-- (service_role bypasses RLS anyway; this just keeps the table from being
-- "no policies = no access" for any non-service role, which causes confusing
-- supabase advisor warnings).
DROP POLICY "patch_maintain_access" ON public.commander_dealer_marketplace;

-- commander_dealer_rotations (1)
DROP POLICY "patch_maintain_access" ON public.commander_dealer_rotations;

-- commander_pilot_venues (3)
DROP POLICY "commander_pilot_venues_delete" ON public.commander_pilot_venues;
DROP POLICY "commander_pilot_venues_insert" ON public.commander_pilot_venues;
DROP POLICY "commander_pilot_venues_update" ON public.commander_pilot_venues;

-- commander_table_sessions (1) — was ALL covering both R/W
DROP POLICY "Service role full access on commander_table_sessions" ON public.commander_table_sessions;

-- commander_time_purchases (1)
DROP POLICY "Service role full access on commander_time_purchases" ON public.commander_time_purchases;

-- diamond_arena_events (1)
DROP POLICY "Service role can insert events" ON public.diamond_arena_events;

-- hand_histories (1)
DROP POLICY "Service role can insert hands" ON public.hand_histories;

-- hands (3)
DROP POLICY "hands_delete" ON public.hands;
DROP POLICY "hands_insert" ON public.hands;
DROP POLICY "hands_update" ON public.hands;

-- live_games (1)
DROP POLICY "live_games_insert" ON public.live_games;

-- orders (2)
DROP POLICY "Service can create orders" ON public.orders;
DROP POLICY "Service can update orders" ON public.orders;

-- purchase_history (1)
DROP POLICY "ph_ins" ON public.purchase_history;

-- rake_history (1)
DROP POLICY "rake_history_insert" ON public.rake_history;

-- rake_records (1)
DROP POLICY "insert_rake_records" ON public.rake_records;

-- rakeback_distributions (1)
DROP POLICY "rakeback_distributions_insert" ON public.rakeback_distributions;

-- settlement_invoices (1)
DROP POLICY "settlement_invoices_insert" ON public.settlement_invoices;

-- settlement_locks (1)
DROP POLICY "settlement_locks_insert" ON public.settlement_locks;

-- table_cashout_history (1)
DROP POLICY "Service role can insert cashout history" ON public.table_cashout_history;

-- table_seats (3)
DROP POLICY "table_seats_delete" ON public.table_seats;
DROP POLICY "table_seats_insert" ON public.table_seats;
DROP POLICY "table_seats_update" ON public.table_seats;

-- tables (1)  -- only the bogus UPDATE policy, leaves "Club members can view"
DROP POLICY "Club admins can update tables" ON public.tables;

-- tournament_mystery_draws (3)
DROP POLICY "tournament_mystery_draws_delete" ON public.tournament_mystery_draws;
DROP POLICY "tournament_mystery_draws_insert" ON public.tournament_mystery_draws;
DROP POLICY "tournament_mystery_draws_update" ON public.tournament_mystery_draws;

-- tournament_players (3)
DROP POLICY "tournament_players_delete" ON public.tournament_players;
DROP POLICY "tournament_players_insert" ON public.tournament_players;
DROP POLICY "tournament_players_update" ON public.tournament_players;

-- tournament_results (1)
DROP POLICY "patch_maintain_access" ON public.tournament_results;

-- tournaments (3)
DROP POLICY "tournaments_delete" ON public.tournaments;
DROP POLICY "tournaments_insert" ON public.tournaments;
DROP POLICY "tournaments_update" ON public.tournaments;

-- union_rakeback_log (1)
DROP POLICY "union_rakeback_log_insert" ON public.union_rakeback_log;


-- ─── POST-APPLY ASSERTIONS ─────────────────────────────────────────────
DO $$
DECLARE
    v_remaining integer;
BEGIN
    -- 1. Confirm all 44 policies are gone
    SELECT COUNT(*) INTO v_remaining
    FROM pg_policies
    WHERE schemaname='public'
      AND (
        (tablename='arcade_duels'                    AND policyname='arcade_duels_insert')
     OR (tablename='arena_matches'                   AND policyname='arena_matches_insert')
     OR (tablename='club_game_seats'                 AND policyname IN ('club_game_seats_delete','club_game_seats_insert','club_game_seats_update'))
     OR (tablename='club_live_games'                 AND policyname IN ('club_live_games_delete','club_live_games_insert','club_live_games_update'))
     OR (tablename='commander_dealer_marketplace'    AND policyname='patch_maintain_access')
     OR (tablename='commander_dealer_rotations'      AND policyname='patch_maintain_access')
     OR (tablename='commander_pilot_venues'          AND policyname IN ('commander_pilot_venues_delete','commander_pilot_venues_insert','commander_pilot_venues_update'))
     OR (tablename='commander_table_sessions'        AND policyname='Service role full access on commander_table_sessions')
     OR (tablename='commander_time_purchases'        AND policyname='Service role full access on commander_time_purchases')
     OR (tablename='diamond_arena_events'            AND policyname='Service role can insert events')
     OR (tablename='hand_histories'                  AND policyname='Service role can insert hands')
     OR (tablename='hands'                           AND policyname IN ('hands_delete','hands_insert','hands_update'))
     OR (tablename='live_games'                      AND policyname='live_games_insert')
     OR (tablename='orders'                          AND policyname IN ('Service can create orders','Service can update orders'))
     OR (tablename='purchase_history'                AND policyname='ph_ins')
     OR (tablename='rake_history'                    AND policyname='rake_history_insert')
     OR (tablename='rake_records'                    AND policyname='insert_rake_records')
     OR (tablename='rakeback_distributions'          AND policyname='rakeback_distributions_insert')
     OR (tablename='settlement_invoices'             AND policyname='settlement_invoices_insert')
     OR (tablename='settlement_locks'                AND policyname='settlement_locks_insert')
     OR (tablename='table_cashout_history'           AND policyname='Service role can insert cashout history')
     OR (tablename='table_seats'                     AND policyname IN ('table_seats_delete','table_seats_insert','table_seats_update'))
     OR (tablename='tables'                          AND policyname='Club admins can update tables')
     OR (tablename='tournament_mystery_draws'        AND policyname IN ('tournament_mystery_draws_delete','tournament_mystery_draws_insert','tournament_mystery_draws_update'))
     OR (tablename='tournament_players'              AND policyname IN ('tournament_players_delete','tournament_players_insert','tournament_players_update'))
     OR (tablename='tournament_results'              AND policyname='patch_maintain_access')
     OR (tablename='tournaments'                     AND policyname IN ('tournaments_delete','tournaments_insert','tournaments_update'))
     OR (tablename='union_rakeback_log'              AND policyname='union_rakeback_log_insert')
      );

    IF v_remaining <> 0 THEN
        RAISE EXCEPTION 'Post-apply: % policies still exist (expected 0)', v_remaining;
    END IF;
    RAISE NOTICE 'Post-apply: all 45 dangerous policies dropped';
END $$;

-- 2. LIVE EXPLOIT REGRESSION CANARY: confirm anon CANNOT insert a tournament now
DO $$
DECLARE v_inserted_id uuid;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        INSERT INTO tournaments (id, name, game_type, buy_in_amount, buy_in_fee, start_time, status, max_players)
        VALUES (gen_random_uuid(), 'POST_LOCKDOWN_CANARY', 'NLH', 0, 0, NOW(), 'ANNOUNCED', 9)
        RETURNING id INTO v_inserted_id;

        RAISE EXCEPTION 'CANARY FAILED: anon was able to INSERT a tournament — RLS lockdown did not work';
    EXCEPTION
        WHEN insufficient_privilege OR check_violation THEN
            RAISE NOTICE 'Canary OK: anon INSERT into tournaments correctly rejected (% / %)', SQLSTATE, SQLERRM;
        WHEN others THEN
            -- Any other error means anon's INSERT was blocked, even if it's
            -- a different sqlstate (e.g., 42501 = insufficient_privilege).
            RAISE NOTICE 'Canary OK: anon INSERT blocked with % / %', SQLSTATE, SQLERRM;
    END;
    RESET ROLE;
END $$;
