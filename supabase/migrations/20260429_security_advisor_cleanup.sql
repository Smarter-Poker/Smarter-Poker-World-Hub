-- ═══════════════════════════════════════════════════════════════════════════════
-- SUPABASE SECURITY ADVISOR CLEANUP — 2026-04-29
-- ═══════════════════════════════════════════════════════════════════════════════
-- Resolves ALL advisor errors, warnings, and performance issues:
--   • 4 CRITICAL: Views without security_invoker
--   • 1 CRITICAL: spatial_ref_sys RLS (PostGIS-owned, handled separately)
--   • 81 HIGH: SECURITY DEFINER functions without search_path
--   • 7 MEDIUM: Tables with anon access but no RLS policies
--   • 135 PERF: Duplicate indexes consuming storage and slowing writes
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: CRITICAL — Fix views without security_invoker = true
-- ─────────────────────────────────────────────────────────────────────────────

ALTER VIEW public.club_memberships SET (security_invoker = true);
ALTER VIEW public.home_game_members SET (security_invoker = true);
ALTER VIEW public.live_stream_analytics SET (security_invoker = true);
ALTER VIEW public.video_library_health SET (security_invoker = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: CRITICAL — Enable RLS on spatial_ref_sys (PostGIS table)
-- spatial_ref_sys is owned by the supabase_admin/extension owner.
-- We need superuser-level access which postgres role has.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Try to enable RLS on spatial_ref_sys
  BEGIN
    ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
    
    -- Add permissive read policy so PostGIS keeps working
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys'
      AND policyname = 'spatial_ref_sys_read_all'
    ) THEN
      CREATE POLICY "spatial_ref_sys_read_all" ON public.spatial_ref_sys
        FOR SELECT USING (true);
    END IF;
    
    RAISE NOTICE 'spatial_ref_sys: RLS enabled with read-all policy';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'spatial_ref_sys: Skipped (requires superuser). Enable via Supabase dashboard.';
  END;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: HIGH — Set search_path on 81 SECURITY DEFINER functions
-- Prevents search_path injection attacks on privilege-escalated functions.
-- Uses a bulk DO block to safely handle overloaded functions.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  fixed_count INTEGER := 0;
  err_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid, 
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (p.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%'
    ))
    ORDER BY p.proname
  LOOP
    BEGIN
      -- PostGIS functions need pg_catalog in search_path
      IF r.proname LIKE 'st_%' THEN
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_catalog', r.proname, r.args);
      ELSE
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', r.proname, r.args);
      END IF;
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not fix %(%): %', r.proname, r.args, SQLERRM;
      err_count := err_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE 'search_path fix: % functions fixed, % errors', fixed_count, err_count;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: MEDIUM — Add RLS policies to unprotected tables with anon access
-- ─────────────────────────────────────────────────────────────────────────────

-- Autofix tables — internal system, block all API access
DO $$ BEGIN
  ALTER TABLE public.autofix_budget ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'autofix_budget' AND policyname = 'autofix_budget_service_only') THEN
    CREATE POLICY "autofix_budget_service_only" ON public.autofix_budget FOR ALL USING (false);
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'autofix_budget: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE public.autofix_config ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'autofix_config' AND policyname = 'autofix_config_service_only') THEN
    CREATE POLICY "autofix_config_service_only" ON public.autofix_config FOR ALL USING (false);
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'autofix_config: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE public.autofix_projects ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'autofix_projects' AND policyname = 'autofix_projects_service_only') THEN
    CREATE POLICY "autofix_projects_service_only" ON public.autofix_projects FOR ALL USING (false);
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'autofix_projects: %', SQLERRM;
END $$;

-- Commander home group logs — authenticated insert + read own
DO $$ BEGIN
  ALTER TABLE public.commander_home_group_share_log ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commander_home_group_share_log' AND policyname = 'share_log_insert_authenticated') THEN
    CREATE POLICY "share_log_insert_authenticated" ON public.commander_home_group_share_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commander_home_group_share_log' AND policyname = 'share_log_read_own') THEN
    CREATE POLICY "share_log_read_own" ON public.commander_home_group_share_log FOR SELECT USING (auth.uid() = user_id);
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'commander_home_group_share_log: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE public.commander_home_group_view_log ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commander_home_group_view_log' AND policyname = 'view_log_insert_authenticated') THEN
    CREATE POLICY "view_log_insert_authenticated" ON public.commander_home_group_view_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commander_home_group_view_log' AND policyname = 'view_log_read_own') THEN
    CREATE POLICY "view_log_read_own" ON public.commander_home_group_view_log FOR SELECT USING (auth.uid() = user_id);
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'commander_home_group_view_log: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE public.commander_home_join_attempts ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commander_home_join_attempts' AND policyname = 'join_attempts_insert_authenticated') THEN
    CREATE POLICY "join_attempts_insert_authenticated" ON public.commander_home_join_attempts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commander_home_join_attempts' AND policyname = 'join_attempts_read_own') THEN
    CREATE POLICY "join_attempts_read_own" ON public.commander_home_join_attempts FOR SELECT USING (auth.uid() = user_id);
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'commander_home_join_attempts: %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: PERFORMANCE — Drop duplicate indexes
-- Wrapped in individual exception blocks for safety.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  idx TEXT;
  drop_count INTEGER := 0;
  skip_count INTEGER := 0;
BEGIN
  -- List of duplicate indexes to drop (keeping the constraint/canonical ones)
  FOR idx IN
    SELECT unnest(ARRAY[
      -- action_log
      'idx_action_log_table_seq',
      -- agents
      'idx_agents_club_user',
      -- autofix_attempts
      'autofix_attempts_issue_idx',
      -- bbj_pools
      'idx_bbj_pools_club',
      -- bot_profiles
      'idx_bot_profiles_player_number',
      'idx_bot_profiles_username',
      -- chip_transactions
      'idx_chip_transactions_club',
      -- club_announcements
      'idx_club_announcements_club_id',
      'idx_club_announcements_club',
      -- club_diamond_wallets
      'idx_club_diamond_wallets_club',
      -- club_members
      'idx_club_members_club_role_status',
      'idx_cm_club_user',
      'idx_cm_club_id',
      'idx_cm_agent_id',
      'idx_cm_user_id',
      -- club_wallets
      'idx_club_wallets_club_id',
      -- clubs
      'idx_clubs_owner_id',
      'idx_clubs_club_id',
      -- commander_analytics_daily
      'idx_analytics_daily_venue',
      'idx_captain_analytics_venue_date',
      -- commander_home_groups
      'idx_home_groups_city',
      'idx_home_groups_club_code',
      'idx_home_groups_invite',
      -- commander_home_invite_tokens
      'idx_home_invite_tokens_token_active',
      -- commander_home_post_comments
      'idx_commander_home_post_comments_visible',
      -- commander_home_posts
      'idx_commander_home_posts_visible',
      -- commander_home_seats
      'idx_commander_home_seats_empty_by_table',
      -- commander_leaderboard_entries
      'idx_leaderboard_entries_rank',
      -- commander_league_standings
      'idx_league_standings_league',
      'idx_league_standings_player',
      -- commander_player_sessions
      'idx_cmd_player_sessions_venue',
      'idx_cmd_player_sessions_active',
      -- commander_self_exclusions
      'idx_captain_exclusions_player',
      -- commander_spending_limits
      'idx_spending_limits_player',
      -- commander_streams
      'idx_streams_venue',
      -- commander_tournament_entries
      'idx_tournament_entries_finish',
      'idx_tournament_entries_tournament_status',
      'idx_captain_tournament_entries_player',
      -- commander_tournaments
      'idx_tournaments_venue_status',
      -- commander_venue_posts
      'idx_commander_venue_posts_venue_created',
      'idx_commander_venue_posts_author_published',
      -- commander_venue_reviews
      'idx_commander_venue_reviews_venue_created',
      -- crews
      'idx_crews_code',
      -- diamond_reward_claims
      'idx_unique_daily_login',
      'idx_unique_social_post',
      -- diamond_wallets
      'idx_diamond_wallets_user',
      -- endless_high_scores
      'idx_endless_high_scores_user_id',
      -- engine_state_snapshot
      'idx_engine_snap_table_seq',
      -- follows
      'follows_unique_pair',
      -- grok_explanation_cache
      'idx_grok_explanation_cache_lookup',
      -- jarvis_response_cache
      'idx_jarvis_cache_key',
      -- messenger_messages
      'idx_messenger_messages_sender_id',
      -- messenger_participants
      'idx_participants_conv',
      'idx_messenger_participants_user_id',
      -- messenger_scheduled
      'idx_messenger_scheduled_sender',
      -- newsletter_subscribers
      'idx_newsletter_subscribers_email',
      -- notification_prompt_log
      'idx_notification_prompt_ip',
      -- page_followers
      'idx_page_followers_unique',
      -- player_notes
      'idx_player_notes_user_id',
      'idx_player_notes_target',
      'idx_player_notes_user_target',
      -- poker_news
      'idx_poker_news_source_url',
      -- poker_venues
      'idx_poker_venues_type',
      'idx_poker_venues_slug',
      'uniq_poker_venues_slug',
      'trgm_idx_pv_state',
      'trgm_idx_pv_city',
      'idx_poker_venues_name_trgm',
      -- posted_clips
      'idx_posted_clips_video_id',
      -- posted_sports_clips
      'idx_posted_sports_clips_video_id',
      -- profiles
      'idx_profiles_username',
      'idx_profiles_mfa_required',
      -- promo_codes
      'idx_promo_codes_code',
      -- rake_records
      'idx_rake_records_created',
      -- referrals
      'idx_referrals_referee',
      -- sandbox results
      'idx_sandbox_coach_user',
      'idx_sandbox_equity_user',
      'idx_sandbox_quiz_user',
      -- signup_abuse_log
      'idx_signup_abuse_email_hash_unique',
      -- social_comments
      'social_comments_post_id_idx',
      -- social_interactions
      'idx_social_interactions_unique_report',
      'idx_social_interactions_post_id',
      -- social_likes
      'social_likes_post_id_user_id_reaction_key',
      'idx_social_likes_post_id',
      -- social_message_reads
      'social_message_reads_message_user_uk',
      -- social_pages
      'idx_social_pages_linked_venue_id',
      'idx_social_pages_slug',
      'ux_social_pages_one_per_home_group',
      -- social_posts
      'idx_social_posts_created_at',
      'idx_social_posts_has_media',
      'idx_social_posts_feed_main',
      -- social_reels
      'idx_social_reels_author_id',
      -- social_stories
      'idx_social_stories_expires',
      -- staff_claim_tokens
      'idx_claim_token',
      -- survival_progress
      'idx_survival_progress_user_id',
      -- table_hole_cards
      'idx_table_hole_cards_lookup',
      'table_hole_cards_table_hand_user_unique',
      -- table_seats
      'idx_table_seats_one_active_per_user_per_table',
      'idx_table_seats_active',
      -- table_templates
      'idx_table_templates_club',
      -- tables
      'idx_tables_tournament_active',
      'idx_tables_club_id',
      -- tour_event_details
      'idx_ted_tour_code',
      -- tour_schedule_registry
      'idx_tsr_name',
      -- tour_source_registry
      'idx_tour_registry_code',
      -- tournament_alert_preferences
      'idx_tournament_alert_preferences_user_id',
      -- tournament_players
      'idx_tournament_players_unique_registration',
      'idx_tournament_players_active',
      -- tournament_series
      'idx_tournament_series_dates',
      -- tournaments
      'idx_tournaments_is_pinned',
      -- training_leaderboard
      'idx_training_leaderboard_user_period',
      -- training_progress
      'idx_training_progress_user_id',
      'idx_training_progress_user_game',
      -- training_sessions
      'idx_training_sessions_created',
      -- training_streaks
      'idx_training_streaks_user_id',
      'idx_training_streaks_user',
      -- trivia_questions
      'idx_trivia_mtt',
      'idx_trivia_cash',
      'idx_trivia_icm',
      'idx_trivia_gto_scenarios',
      -- union_wallets
      'idx_union_wallets_union',
      -- user_avatars
      'user_avatars_user_id_key',
      -- user_mfa_factors
      'idx_user_mfa_factors_user_id',
      -- user_poker_stats
      'idx_user_poker_stats_user_id',
      -- user_preferences
      'idx_user_preferences_user_id',
      -- user_seen_questions
      'idx_user_seen_questions_lookup',
      -- venue_daily_tournaments
      'idx_venue_daily_tournaments_day_venue',
      'idx_venue_daily_tournaments_day',
      'idx_venue_daily_tournaments_venue_id',
      -- venue_live_history
      'idx_venue_live_history_bravo_snapshot',
      'idx_venue_live_history_slug_snapshot',
      -- video_library_videos
      'idx_vlv_yt_id',
      -- vip_subscriptions
      'idx_vip_subscriptions_stripe_sub_id',
      'idx_vip_subscriptions_user',
      'idx_vip_subscriptions_user_id',
      -- wallet_transactions
      'idx_wallet_tx_created',
      'idx_wallet_tx_user',
      -- youtube_embed_failures
      'idx_yt_failures_video_id'
    ])
  LOOP
    BEGIN
      EXECUTE format('DROP INDEX IF EXISTS public.%I', idx);
      drop_count := drop_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop index %: %', idx, SQLERRM;
      skip_count := skip_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE 'Index cleanup: % dropped, % skipped', drop_count, skip_count;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF SECURITY ADVISOR CLEANUP
-- ═══════════════════════════════════════════════════════════════════════════════
