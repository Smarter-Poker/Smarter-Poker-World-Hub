-- ═══════════════════════════════════════════════════════════════════════
-- 20260520000001_security_advisor_full_remediation.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     functions (search_path + public EXECUTE grants)
-- IRREVERSIBLE: no
--
-- WHY:
--   Supabase Security Advisor shows:
--   • 1 ERROR: fn_get_or_create_conversation and fn_submit_bug_report_to_admin
--     have no fixed search_path → SQL injection risk (search_path hijack).
--   • 364 WARNINGS: "Public Can Execute SECURITY DEFINER" — all SECDEF
--     functions are callable by the anon/public role, which means an
--     unauthenticated user can invoke financial, internal, and admin RPCs.
--   • Extension in Public (postgis, pg_trgm, plpgsql_check, vector) —
--     Supabase-managed, cannot be moved; accepted as expected.
--   • spatial_ref_sys has RLS disabled — PostGIS-owned, cannot enable RLS.
--
-- HOW:
--   1. Fix fn_get_or_create_conversation — add SET search_path = public.
--   2. Fix fn_submit_bug_report_to_admin — add SET search_path = public.
--   3. REVOKE EXECUTE ON all SECURITY DEFINER functions from the public role.
--      Then re-GRANT only to 'authenticated' where needed, and to
--      'service_role' for internal/cron RPCs.
--      Trigger functions (trg_fn_*, tup_*, fn_notify_*, fn_enforce_*,
--      fn_social_reels_*) only need service_role/internal invocation.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Fix ERROR: fn_get_or_create_conversation — add SET search_path
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(
    p_user_id uuid,
    p_other_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_existing_id uuid;
    v_new_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_other_user_id IS NULL OR p_user_id = p_other_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid user pair');
    END IF;

    SELECT c.id INTO v_existing_id
      FROM social_conversations c
      JOIN social_conversation_participants p1 ON p1.conversation_id = c.id
      JOIN social_conversation_participants p2 ON p2.conversation_id = c.id
     WHERE c.is_group = false
       AND p1.user_id = p_user_id
       AND p2.user_id = p_other_user_id
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'conversation_id', v_existing_id, 'created', false);
    END IF;

    INSERT INTO social_conversations (is_group) VALUES (false) RETURNING id INTO v_new_id;
    INSERT INTO social_conversation_participants (conversation_id, user_id)
    VALUES (v_new_id, p_user_id), (v_new_id, p_other_user_id);

    RETURN jsonb_build_object('success', true, 'conversation_id', v_new_id, 'created', true);
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Fix ERROR: fn_submit_bug_report_to_admin — add SET search_path
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_submit_bug_report_to_admin(
    p_sender_id uuid,
    p_subject text,
    p_description text,
    p_priority text,
    p_current_page text,
    p_user_agent text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_admin_id UUID;
    v_conversation_id UUID := NULL;
    v_conversation_json JSONB;
    v_message_id UUID := NULL;
    v_message_json JSONB;
    v_ticket_id UUID;
    v_content TEXT;
BEGIN
    -- 1. Find Support user ID by exact email or username
    SELECT id INTO v_admin_id FROM auth.users WHERE email ILIKE 'support@smarter.poker' LIMIT 1;
    
    -- Fallback to searching profiles if auth lookup fails
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM public.profiles WHERE username ILIKE 'support' LIMIT 1;
    END IF;

    -- 2. Prevent race conditions: create the core ticket completely first.
    INSERT INTO public.live_help_tickets (
        user_id, subject, description, priority, status
    ) VALUES (
        p_sender_id,
        '[BUG] ' || p_subject,
        p_description || E'\n\n---\nPage: ' || COALESCE(p_current_page, 'unknown') || E'\nUser Agent: ' || COALESCE(p_user_agent, 'unknown') || E'\nReported: ' || now()::text,
        COALESCE(p_priority, 'medium'),
        'open'
    ) RETURNING id INTO v_ticket_id;

    -- 3. Only attempt real-time DM insertion if we have both users.
    IF p_sender_id IS NOT NULL AND v_admin_id IS NOT NULL AND p_sender_id != v_admin_id THEN
        
        -- Retrieve or provision a safe P2P direct message room
        v_conversation_json := public.fn_get_or_create_conversation(p_sender_id, v_admin_id);
        
        IF (v_conversation_json->>'success')::boolean = true THEN
            v_conversation_id := (v_conversation_json->>'conversation_id')::uuid;
            
            -- Build formatted message content to look beautiful in the Messenger UI
            v_content := '🚨 **BUG REPORT** [' || upper(p_priority) || ']' || E'\n' ||
                         '**Subject:** ' || p_subject || E'\n' ||
                         '**Ticket:** BUG-' || upper(substr(v_ticket_id::text, 1, 8)) || E'\n\n' ||
                         p_description;

            -- Send via messaging system, which natively triggers the real-time pipeline event
            v_message_json := public.fn_send_message(v_conversation_id, p_sender_id, v_content);
            IF (v_message_json->>'success')::boolean = true THEN
                v_message_id := (v_message_json->>'message_id')::uuid;
                
                -- Update the ticket with the newly established conversation ID
                UPDATE public.live_help_tickets
                SET conversation_id = v_conversation_id
                WHERE id = v_ticket_id;
            END IF;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'ticket_id', v_ticket_id,
        'message_id', v_message_id,
        'conversation_id', v_conversation_id,
        'support_id', v_admin_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────
-- 3. REVOKE EXECUTE from public role on all SECURITY DEFINER functions.
--    PostgreSQL default grants EXECUTE to PUBLIC for all functions.
--    For SECURITY DEFINER functions this is dangerous — anon users can
--    invoke admin/financial RPCs. We revoke from public, then re-grant
--    only to authenticated or service_role as appropriate.
-- ──────────────────────────────────────────────────────────────────────

-- ── Trigger functions (only called internally by Postgres, never by users)
REVOKE EXECUTE ON FUNCTION public.auto_connect_to_dan_bekavac() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_live_comment_author_name() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_home_group_polymorphic_refs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_rate_limit_comments() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_rate_limit_invites() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_rate_limit_members() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_rate_limit_posts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_rate_limit_rsvps() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_rsvp_deadline() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_seat_reservation_deadline() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_filtered_too_long_delete_reel() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_notify_friend_accepted() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_notify_interaction_share() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_notify_post_share() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_social_posts_video_to_reel_mirror() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_social_reels_block_too_long() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_social_reels_yt_intercept() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_social_reels_yt_queue_job() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_user_in_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_v2_create_wallet() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_fn_autocreate_club_social_page() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_fn_autocreate_home_group_social_page() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_fn_live_invite_notification() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tup_apply_session() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tup_revert_session() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_venue_follower_count() FROM PUBLIC, anon;

-- ── Internal/Admin-only functions (service_role only, not user-callable)
REVOKE EXECUTE ON FUNCTION public.create_memory_matrix_tables() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_auto_end_stale_streams(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_blacklists_audit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_expire_stale_cashouts(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_reset_broken_streak_multipliers() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_users_by_email(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_func_source(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.settle_club_rakeback(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.signup_audit_check(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sum_agent_volume(uuid, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sum_anti_farming_ips(text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sum_chip_transactions(uuid, text, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sum_diamond_transactions(uuid, text[], timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.training_leaderboard_refresh() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_home_games_health() FROM PUBLIC, anon;

-- ── Financial/sensitive functions — revoke anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.credit_club_wallet_rake(uuid, numeric, numeric, uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_diamonds(uuid, integer, text, text, text, jsonb, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_award_share_streak_diamonds(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_check_anti_farming_gift_cap(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_check_anti_farming_gift_cap(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_stream_gift(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_wallet_diamond_transfer(uuid, integer, text, text) FROM PUBLIC, anon;

-- ── Auth-guarded user functions — revoke anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.fn_are_friends(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_get_conversations(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_get_user_conversations(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_user_is_active_staff_at_venue(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_user_is_conversation_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_user_is_venue_manager(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_home_group_ical(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_commander_access_details(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_chip_summary(uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_max_player_number() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_full_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_profile_picture_history(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_unique_players_24h(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_visible_live_streams() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_commander_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_trivia_skipped(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_club_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_god_mode() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pb_end_session(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pb_save_profile(text, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pb_start_session(text, integer, text, text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_list_public_tournaments(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_memory_dashboard(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_training_weekly_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_profile_picture(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.training_dashboard_30day_stats(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.training_dashboard_last_session(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.training_dashboard_lifetime_stats(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.training_hand_replay_recent(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_hub_preferences(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_live_metrics(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_live_peak_viewers(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_page_preferences(uuid, text, jsonb) FROM PUBLIC, anon;

-- ── Home game functions — revoke anon
REVOKE EXECUTE ON FUNCTION public.get_horse_memories(integer, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_horse_personality(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_home_groups(text, text, text, text, text, float8, float8, numeric, boolean, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_home_groups_v2(text, text, text, text, text, text[], numeric, numeric, integer, boolean, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.track_home_group_share_click(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.track_home_group_view(uuid) FROM PUBLIC, anon;

-- ── Live stream functions — revoke anon
REVOKE EXECUTE ON FUNCTION public.get_visible_live_comments(uuid, integer, timestamptz) FROM PUBLIC, anon;

-- ── Functions that MUST remain accessible to anon (pre-auth flows)
-- check_username_available, check_username_with_suggestions — needed at signup
-- claim_social_profile — needed for new user onboarding
-- get_daily_challenge — public trivia
-- get_home_group_public_detail — public group discovery
-- get_public_profile_by_username — public profiles
-- get_source_tier_available — public training
-- get_venue_public_detail — public venue pages
-- find_live_games_nearby — public map
-- find_similar_questions — public trivia
-- fn_submit_bug_report_to_admin — bug reports before auth
-- pb_log_hand (both overloads) — PokerBrain logging
-- These stay at PUBLIC level intentionally.

-- ── Horse admin functions — grant only to authenticated (already via service_role)
REVOKE EXECUTE ON FUNCTION public.fn_submit_bug_report_to_admin(uuid, text, text, text, text, text) FROM anon;

-- ── Internal live stream RPCs
REVOKE EXECUTE ON FUNCTION public.fn_auto_end_stale_streams(integer) FROM authenticated;

-- ── Re-grant specific authenticated-only RPCs that were over-revoked
GRANT EXECUTE ON FUNCTION public.fn_are_friends(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_conversations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_user_conversations(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_in_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_is_active_staff_at_venue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_is_conversation_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_is_venue_manager(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_home_group_ical(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commander_access_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_chip_summary(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_max_player_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_full_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_picture_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unique_players_24h(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_live_streams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_live_comments(uuid, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_commander_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_trivia_skipped(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_god_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_diamonds(uuid, integer, text, text, text, jsonb, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_award_share_streak_diamonds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_anti_farming_gift_cap(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_anti_farming_gift_cap(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_stream_gift(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_wallet_diamond_transfer(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_picture(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_end_session(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_save_profile(text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pb_start_session(text, integer, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hg_list_public_tournaments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_memory_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_training_weekly_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_dashboard_30day_stats(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_dashboard_last_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_dashboard_lifetime_stats(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_hand_replay_recent(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_leaderboard_refresh() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_hub_preferences(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_live_metrics(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_live_peak_viewers(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_page_preferences(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_home_groups(text, text, text, text, text, float8, float8, numeric, boolean, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_home_groups_v2(text, text, text, text, text, text[], numeric, numeric, integer, boolean, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_home_group_share_click(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_home_group_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_horse_memories(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_horse_personality(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_bug_report_to_admin(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sum_agent_volume(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_anti_farming_ips(text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_chip_transactions(uuid, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_diamond_transactions(uuid, text[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_club_rakeback(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_club_wallet_rake(uuid, numeric, numeric, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_users_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_auto_end_stale_streams(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_expire_stale_cashouts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_blacklists_audit() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reset_broken_streak_multipliers() TO service_role;
GRANT EXECUTE ON FUNCTION public.training_leaderboard_refresh() TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_home_games_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.signup_audit_check(text) TO service_role;

-- ── POST-APPLY ASSERTIONS ──────────────────────────────────────────────
DO $$
DECLARE
    v_fn_name text;
    v_has_search_path boolean;
BEGIN
    -- Assert fn_get_or_create_conversation has search_path
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_get_or_create_conversation'
          AND array_to_string(p.proconfig, ',') LIKE '%search_path%'
    ) INTO v_has_search_path;
    IF NOT v_has_search_path THEN
        RAISE EXCEPTION 'post-apply: fn_get_or_create_conversation still missing search_path';
    END IF;

    -- Assert fn_submit_bug_report_to_admin has search_path
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_submit_bug_report_to_admin'
          AND array_to_string(p.proconfig, ',') LIKE '%search_path%'
    ) INTO v_has_search_path;
    IF NOT v_has_search_path THEN
        RAISE EXCEPTION 'post-apply: fn_submit_bug_report_to_admin still missing search_path';
    END IF;
END $$;

COMMIT;
