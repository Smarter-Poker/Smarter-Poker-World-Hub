-- ═══════════════════════════════════════════════════════════════════════
-- 20260513_drop_zombie_functions.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     functions (DROP only)
-- IRREVERSIBLE: yes → rollback = re-create stubs if needed
--
-- WHY:
--   supabase db lint --linked reports 60+ ERROR-level issues in functions
--   that reference tables/columns that no longer exist. These are zombie
--   RPCs from old feature branches. Dropping them clears all lint errors.
--   Exact signatures confirmed via pg_proc query before dropping.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Arena / Arcade
DROP FUNCTION IF EXISTS public.start_arcade_game(uuid, text);
DROP FUNCTION IF EXISTS public.complete_arcade_game(uuid, integer, integer, integer, numeric);
DROP FUNCTION IF EXISTS public.record_arena_session(uuid, text);
DROP FUNCTION IF EXISTS public.record_arena_session(uuid, uuid, text, numeric, integer);
DROP FUNCTION IF EXISTS public.archive_old_arena_logs();

-- Union system
DROP FUNCTION IF EXISTS public.is_union_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_union_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_can_message_in_club(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.get_union_leaderboard(uuid, text, integer);
DROP FUNCTION IF EXISTS public.transfer_promo_union_to_club(uuid, uuid, numeric, text, uuid);

-- Table management
DROP FUNCTION IF EXISTS public.promote_next_waitlisted_player(uuid);
DROP FUNCTION IF EXISTS public.get_arena_lobby_clubs(integer);
DROP FUNCTION IF EXISTS public.atomic_table_rebuy(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.increment_table_hands(uuid, integer);
DROP FUNCTION IF EXISTS public.update_table_stats(uuid, numeric);
DROP FUNCTION IF EXISTS public.close_table_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.decrement_member_count(uuid);

-- Feature store
DROP FUNCTION IF EXISTS public.fn_purchase_feature(uuid, text, integer);
DROP FUNCTION IF EXISTS public.fn_check_feature_access(uuid, text);

-- Chip / ledger
DROP FUNCTION IF EXISTS public.verify_ledger_totals();
DROP FUNCTION IF EXISTS public.cleanup_rate_limits();
DROP FUNCTION IF EXISTS public.deduct_table_chip_lock(uuid, uuid, numeric);

-- Stories / persona
DROP FUNCTION IF EXISTS public.increment_story_view(uuid);
DROP FUNCTION IF EXISTS public.record_persona_post(integer, text, text, text, text);

-- Commander
DROP FUNCTION IF EXISTS public.track_doc_access(uuid, integer, text);
DROP FUNCTION IF EXISTS public.update_tournament_clock(uuid, jsonb, jsonb);

-- Marketplace / wallet
DROP FUNCTION IF EXISTS public.deduct_marketplace_chips(uuid, uuid, numeric, uuid);
DROP FUNCTION IF EXISTS public.add_to_player_wallet(uuid, uuid, numeric, text);

-- Lucky wheel / bonus
DROP FUNCTION IF EXISTS public.claim_lucky_wheel_spin(uuid);
DROP FUNCTION IF EXISTS public.increment_bonus_progress(uuid, text, integer);

-- PIO/chart
DROP FUNCTION IF EXISTS public.fn_pio_options_from_solver(text, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.fn_chart_options_from_memory(text, integer, text, text);

-- Player presence / friends
DROP FUNCTION IF EXISTS public.fn_get_friends(uuid);

-- Leaderboard (total_profit column never existed)
DROP FUNCTION IF EXISTS public.get_club_leaderboard(uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_user_leaderboard_rank(uuid, uuid);

-- Commission / promo
DROP FUNCTION IF EXISTS public.get_daily_commission_summary(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.sum_agent_commissions(uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.record_promo_wagering(uuid, uuid, numeric);

-- Messenger search (references old table name)
DROP FUNCTION IF EXISTS public.fn_search_messages(uuid, uuid, text);

-- Misc broken
DROP FUNCTION IF EXISTS public.increment_sandbox_count(uuid);
DROP FUNCTION IF EXISTS public.can_view_player(uuid, uuid);
DROP FUNCTION IF EXISTS public.increment_share_view(uuid);
DROP FUNCTION IF EXISTS public.get_trending_venues(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.calculate_session_comps(uuid);
DROP FUNCTION IF EXISTS public.fn_get_table_settings(uuid);
DROP FUNCTION IF EXISTS public.execute_pot_drops(uuid, numeric);
DROP FUNCTION IF EXISTS public.distribute_tournament_prizes(uuid);
DROP FUNCTION IF EXISTS public.process_tournament_rebuy(uuid, uuid, numeric, integer, text, integer);
DROP FUNCTION IF EXISTS public.fn_get_player_note(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_save_player_note(uuid, uuid, text, text, text[]);
DROP FUNCTION IF EXISTS public.fn_get_social_feed_v2(uuid, integer, integer, text);
DROP FUNCTION IF EXISTS public.fn_sync_share_streak_multiplier(uuid);

-- ── POST-APPLY ASSERTIONS ──────────────────────────────────────────────
DO $$
DECLARE
    v_zombie_count int;
BEGIN
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
        'fn_pio_options_from_solver', 'fn_chart_options_from_memory',
        'fn_get_friends', 'increment_table_hands', 'update_table_stats',
        'atomic_table_rebuy', 'close_table_session', 'process_tournament_rebuy',
        'update_tournament_clock', 'fn_get_player_note', 'fn_save_player_note',
        'get_club_leaderboard', 'get_user_leaderboard_rank',
        'get_daily_commission_summary', 'sum_agent_commissions',
        'record_promo_wagering', 'add_to_player_wallet', 'fn_search_messages',
        'increment_sandbox_count', 'can_view_player', 'increment_share_view',
        'get_trending_venues', 'calculate_session_comps', 'decrement_member_count',
        'fn_get_table_settings', 'execute_pot_drops', 'distribute_tournament_prizes',
        'fn_get_social_feed_v2', 'fn_sync_share_streak_multiplier',
        'get_union_leaderboard', 'transfer_promo_union_to_club',
        'fn_can_message_in_club', 'fn_check_feature_access', 'deduct_table_chip_lock'
    );

    IF v_zombie_count > 0 THEN
        RAISE EXCEPTION 'post-apply: % zombie functions still exist after drop', v_zombie_count;
    END IF;
END $$;

COMMIT;
