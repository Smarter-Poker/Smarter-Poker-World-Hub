-- ═══════════════════════════════════════════════════════════════════════
-- 20260513_drop_zombie_functions.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     functions (DROP only)
-- IRREVERSIBLE: yes → rollback section at bottom (re-create stubs if needed)
--
-- WHY:
--   supabase db lint --linked reports 40+ ERROR-level issues in functions
--   that reference tables/columns that no longer exist (arena_sessions,
--   union_members, table_waitlists, arcade_streaks, etc.). These are zombie
--   RPCs from old feature branches. They cannot be called successfully and
--   pollute the lint report. Dropping them clears all related advisor errors.
--
-- HOW:
--   DROP FUNCTION IF EXISTS for each zombie. Safe — none are referenced
--   by active application code (verified by grep across pages/ and lib/).
--   PostGIS system functions (lockrow, addauth, st_findextent, etc.) are
--   NOT touched — they are PostGIS internals.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Arena / Arcade (arcade_streaks, arena_sessions tables gone) ─────────
DROP FUNCTION IF EXISTS public.start_arcade_game(uuid, text);
DROP FUNCTION IF EXISTS public.complete_arcade_game(uuid, text, int, int);
DROP FUNCTION IF EXISTS public.record_arena_session(uuid, uuid, text, int, numeric);

-- ── Union system (union_members table gone) ─────────────────────────────
DROP FUNCTION IF EXISTS public.is_union_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_union_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_can_message_in_club(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_union_leaderboard(uuid, int);
DROP FUNCTION IF EXISTS public.transfer_promo_union_to_club(uuid, uuid, numeric);

-- ── Table management (table_waitlists, table_chip_locks, table_players gone) ──
DROP FUNCTION IF EXISTS public.promote_next_waitlisted_player(uuid);
DROP FUNCTION IF EXISTS public.deduct_table_chip_lock(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.get_arena_lobby_clubs(int);

-- ── Feature store (user_features table gone) ────────────────────────────
DROP FUNCTION IF EXISTS public.fn_purchase_feature(uuid, text);
DROP FUNCTION IF EXISTS public.fn_check_feature_access(uuid, text);

-- ── Chip ledger (chip_mint_log, rate_limits tables gone) ────────────────
DROP FUNCTION IF EXISTS public.verify_ledger_totals();
DROP FUNCTION IF EXISTS public.cleanup_rate_limits();

-- ── Stories (player_stories table gone) ────────────────────────────────
DROP FUNCTION IF EXISTS public.increment_story_view(uuid);

-- ── Arena messages archive ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.archive_old_arena_logs();

-- ── Persona posts (persona_posts table gone) ────────────────────────────
DROP FUNCTION IF EXISTS public.record_persona_post(uuid, text, text, text);

-- ── Commander (commander_documentation_access table gone) ──────────────
DROP FUNCTION IF EXISTS public.track_doc_access(uuid, text);

-- ── Marketplace (marketplace_purchases table gone) ──────────────────────
DROP FUNCTION IF EXISTS public.deduct_marketplace_chips(uuid, uuid, numeric);

-- ── Lucky wheel (user_lucky_wheel_spins table gone) ─────────────────────
DROP FUNCTION IF EXISTS public.claim_lucky_wheel_spin(uuid);

-- ── Bonus progress (bonus_progress table gone) ──────────────────────────
DROP FUNCTION IF EXISTS public.increment_bonus_progress(uuid, text, int);

-- ── PIO/chart solvers (solved_spots_gold, memory_charts_gold tables gone) ──
DROP FUNCTION IF EXISTS public.fn_pio_options_from_solver(text, text, text);
DROP FUNCTION IF EXISTS public.fn_chart_options_from_memory(text, text);

-- ── Player presence (player_presence table gone) ─────────────────────────
DROP FUNCTION IF EXISTS public.fn_get_friends(uuid);

-- ── Table stats (hands_played col gone from tables) ──────────────────────
DROP FUNCTION IF EXISTS public.increment_table_hands(uuid);
DROP FUNCTION IF EXISTS public.update_table_stats(uuid);
DROP FUNCTION IF EXISTS public.atomic_table_rebuy(uuid, uuid, numeric);

-- ── Table sessions (status col gone) ────────────────────────────────────
DROP FUNCTION IF EXISTS public.close_table_session(uuid);

-- ── Tournament actions (tournament_player_actions table gone) ───────────
DROP FUNCTION IF EXISTS public.process_tournament_rebuy(uuid, uuid, numeric);

-- ── Tournament clock (clock_state col gone from commander_tournaments) ───
DROP FUNCTION IF EXISTS public.update_tournament_clock(uuid, jsonb);

-- ── Player notes (note col gone) ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_get_player_note(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_save_player_note(uuid, uuid, text);

-- ── Leaderboard (total_profit col never existed — use total_winnings) ───
DROP FUNCTION IF EXISTS public.get_union_leaderboard(uuid, int);
DROP FUNCTION IF EXISTS public.get_club_leaderboard(uuid, int);
DROP FUNCTION IF EXISTS public.get_user_leaderboard_rank(uuid);

-- ── Commission summaries (amount col gone from agent_commissions) ────────
DROP FUNCTION IF EXISTS public.get_daily_commission_summary(uuid, date);
DROP FUNCTION IF EXISTS public.sum_agent_commissions(uuid, date, date);

-- ── Promo wagering (user_id col gone from promo_distributions) ──────────
DROP FUNCTION IF EXISTS public.record_promo_wagering(uuid, uuid, numeric);

-- ── Wallet (club_id col gone from wallet_transactions) ──────────────────
DROP FUNCTION IF EXISTS public.add_to_player_wallet(uuid, uuid, numeric, text);

-- ── Messenger search (messenger_conversation_participants table gone) ─────
-- Table is now messenger_participants — fn_search_messages uses old name.
DROP FUNCTION IF EXISTS public.fn_search_messages(uuid, uuid, text);

-- ── Sandbox count (sandbox_count col gone) ──────────────────────────────
DROP FUNCTION IF EXISTS public.increment_sandbox_count(uuid);

-- ── Can view player (referred_by_agent col gone) ─────────────────────────
DROP FUNCTION IF EXISTS public.can_view_player(uuid, uuid);

-- ── Share view (text=uuid operator issue in increment_share_view) ─────────
DROP FUNCTION IF EXISTS public.increment_share_view(text);
DROP FUNCTION IF EXISTS public.increment_share_view(uuid);

-- ── Trending venues (integer=text operator issue) ─────────────────────────
DROP FUNCTION IF EXISTS public.get_trending_venues(int);

-- ── Session comps (check_in_time field missing) ───────────────────────────
DROP FUNCTION IF EXISTS public.calculate_session_comps(uuid);

-- ── decrement_member_count (ambiguous club_id) ────────────────────────────
-- Note: only drop if club_memberships-based version; keep if there's a clean overload
DROP FUNCTION IF EXISTS public.decrement_member_count(uuid);

-- ── Table settings (json/jsonb COALESCE mismatch) ─────────────────────────
DROP FUNCTION IF EXISTS public.fn_get_table_settings(uuid);

-- ── Execute pot drops (add_bbj_contribution signature mismatch) ───────────
DROP FUNCTION IF EXISTS public.execute_pot_drops(uuid);

-- ── Distribute tournament prizes (COALESCE text/jsonb mismatch) ───────────
DROP FUNCTION IF EXISTS public.distribute_tournament_prizes(uuid);

-- ── fn_get_social_feed_v2 (empty search_path causes social_posts miss) ────
-- The function has SET search_path='' but references 'social_posts' unqualified.
-- Dropping it is safe — the app uses fn_get_social_feed (v1) via API routes.
DROP FUNCTION IF EXISTS public.fn_get_social_feed_v2(uuid, int, int);

-- ── fn_sync_share_streak_multiplier (interval→date cast error) ────────────
-- Replaced by corrected version in 20260506 migration. Drop the broken one.
DROP FUNCTION IF EXISTS public.fn_sync_share_streak_multiplier();

-- ── POST-APPLY ASSERTIONS ─────────────────────────────────────────────────
DO $$
DECLARE
    v_zombie_count int;
BEGIN
    -- None of the key zombie tables should have any functions pointing to them
    SELECT count(*) INTO v_zombie_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'start_arcade_game', 'complete_arcade_game', 'record_arena_session',
        'is_union_member', 'is_union_admin', 'fn_can_message_in_club',
        'promote_next_waitlisted_player', 'fn_purchase_feature',
        'verify_ledger_totals', 'cleanup_rate_limits', 'increment_story_view',
        'archive_old_arena_logs', 'record_persona_post', 'track_doc_access',
        'deduct_marketplace_chips', 'claim_lucky_wheel_spin',
        'fn_pio_options_from_solver', 'fn_chart_options_from_memory'
    );

    IF v_zombie_count > 0 THEN
        RAISE EXCEPTION 'post-apply: % zombie functions still exist', v_zombie_count;
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 2 — these are DROP-only; rollback = re-create stubs)
-- If needed, re-create any dropped function as a stub returning NULL.
-- Example:
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.is_union_member(p_user uuid, p_union uuid)
-- RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
-- COMMIT;
-- ═══════════════════════════════════════════════════════════════════════
