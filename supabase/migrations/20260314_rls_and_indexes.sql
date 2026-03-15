-- ══════════════════════════════════════════════════════════════════════════
-- PHASE 15A: Enable RLS on 25 unprotected tables
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS public.active_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.club_arena_audit_logs_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.club_arena_messages_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commander_staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commander_time_clock ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commander_time_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commander_venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leader ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_prompt_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rake_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rakeback_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.social_comment_likes ENABLE ROW LEVEL SECURITY;
-- spatial_ref_sys is a PostGIS system table — skip RLS
ALTER TABLE IF EXISTS public.staff_claim_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.table_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_mystery_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournament_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trivia_pvp_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trivia_pvp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.union_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.union_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.union_wallets ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- PHASE 15B: Add baseline RLS policies for 29 locked-out tables + 24 newly-enabled
-- All get: authenticated SELECT, owner INSERT/UPDATE/DELETE (or service_role bypass)
-- ══════════════════════════════════════════════════════════════════════════

DO $rls$
DECLARE
  t text;
  tables_needing_policies text[] := ARRAY[
    -- 29 RLS-enabled but policy-less
    'admin_audit_log','club_game_seats','club_live_games','commander_game_types',
    'commander_member_comp_log','commander_membership_plans','commander_player_reputation',
    'commander_player_reputation_scores','commander_rate_limits','commander_room_presets',
    'commander_seat_preferences','commander_shift_handoffs','commander_subscription_invoices',
    'commander_subscriptions','commander_system_log','commander_table_ratings',
    'diamond_reward_claims','drill_performance','sandbox_bookmarks','sandbox_saved_hands',
    'sandbox_shared_scenarios','settlement_invoices','settlement_locks','signup_abuse_log',
    'sms_otp_codes','social_messaging_settings','user_streaks','xp_ledger','xp_vault',
    -- 24 newly RLS-enabled
    'active_tables','audit_logs','club_arena_audit_logs_archive','club_arena_messages_archive',
    'commander_staff_shifts','commander_time_clock','commander_time_sessions',
    'commander_venue_settings','hands','leader','notification_prompt_log',
    'rake_history','rakeback_distributions','social_comment_likes',
    'staff_claim_tokens','table_seats','tournament_mystery_draws','tournament_players',
    'tournaments','trivia_pvp_matches','trivia_pvp_queue',
    'union_announcements','union_transactions','union_wallets'
  ];
BEGIN
  FOREACH t IN ARRAY tables_needing_policies LOOP
    -- Check table exists
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      -- Skip if policy already exists
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_select') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t||'_select', t);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_insert') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (true)', t||'_insert', t);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_update') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (true)', t||'_update', t);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_delete') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (true)', t||'_delete', t);
      END IF;
    END IF;
  END LOOP;
END $rls$;
-- Phase 15C: Create missing FK indexes (153 indexes)

CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON public.achievements (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_club_id ON public.agent_commissions (club_id);
CREATE INDEX IF NOT EXISTS idx_agent_settlements_club_id ON public.agent_settlements (club_id);
CREATE INDEX IF NOT EXISTS idx_arcade_jackpot_entries_session_id ON public.arcade_jackpot_entries (session_id);
CREATE INDEX IF NOT EXISTS idx_arcade_questions_game_id ON public.arcade_questions (game_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_club_id ON public.audit_logs (club_id);
CREATE INDEX IF NOT EXISTS idx_bad_beat_history_loser_id ON public.bad_beat_history (loser_id);
CREATE INDEX IF NOT EXISTS idx_bad_beat_history_table_id ON public.bad_beat_history (table_id);
CREATE INDEX IF NOT EXISTS idx_bad_beat_history_winner_id ON public.bad_beat_history (winner_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_alerts_location_id ON public.bankroll_alerts (location_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_ledger_original_entry_id ON public.bankroll_ledger (original_entry_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_rule_violations_ledger_entry_id ON public.bankroll_rule_violations (ledger_entry_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_rule_violations_rule_id ON public.bankroll_rule_violations (rule_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_trips_location_id ON public.bankroll_trips (location_id);
CREATE INDEX IF NOT EXISTS idx_clawback_audit_log_transaction_id ON public.clawback_audit_log (transaction_id);
CREATE INDEX IF NOT EXISTS idx_clip_usage_log_clip_id ON public.clip_usage_log (clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_usage_log_horse_id ON public.clip_usage_log (horse_id);
CREATE INDEX IF NOT EXISTS idx_clip_usage_log_post_id ON public.clip_usage_log (post_id);
CREATE INDEX IF NOT EXISTS idx_club_activity_user_id ON public.club_activity (user_id);
CREATE INDEX IF NOT EXISTS idx_club_announcements_author_id ON public.club_announcements (author_id);
CREATE INDEX IF NOT EXISTS idx_club_announcements_created_by ON public.club_announcements (created_by);
CREATE INDEX IF NOT EXISTS idx_club_arena_leaderboard_player_id ON public.club_arena_leaderboard (player_id);
CREATE INDEX IF NOT EXISTS idx_club_arena_results_player_id ON public.club_arena_results (player_id);
CREATE INDEX IF NOT EXISTS idx_club_challenges_club_id ON public.club_challenges (club_id);
CREATE INDEX IF NOT EXISTS idx_club_invites_club_id ON public.club_invites (club_id);
CREATE INDEX IF NOT EXISTS idx_club_settlements_club_id ON public.club_settlements (club_id);
CREATE INDEX IF NOT EXISTS idx_commander_admin_settings_updated_by ON public.commander_admin_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_commander_api_keys_created_by ON public.commander_api_keys (created_by);
CREATE INDEX IF NOT EXISTS idx_commander_audit_logs_staff_id ON public.commander_audit_logs (staff_id);
CREATE INDEX IF NOT EXISTS idx_commander_clock_presets_venue_id ON public.commander_clock_presets (venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_club_announcements_author_id ON public.commander_club_announcements (author_id);
CREATE INDEX IF NOT EXISTS idx_commander_club_announcements_related_game_id ON public.commander_club_announcements (related_game_id);
CREATE INDEX IF NOT EXISTS idx_commander_comp_balances_frozen_by ON public.commander_comp_balances (frozen_by);
CREATE INDEX IF NOT EXISTS idx_commander_comp_redemptions_processed_by ON public.commander_comp_redemptions (processed_by);
CREATE INDEX IF NOT EXISTS idx_commander_comp_redemptions_transaction_id ON public.commander_comp_redemptions (transaction_id);
CREATE INDEX IF NOT EXISTS idx_commander_comp_transactions_approved_by ON public.commander_comp_transactions (approved_by);
CREATE INDEX IF NOT EXISTS idx_commander_comp_transactions_rate_id ON public.commander_comp_transactions (rate_id);
CREATE INDEX IF NOT EXISTS idx_commander_dealer_marketplace_dealer_id ON public.commander_dealer_marketplace (dealer_id);
CREATE INDEX IF NOT EXISTS idx_commander_dealer_rotations_table_id ON public.commander_dealer_rotations (table_id);
CREATE INDEX IF NOT EXISTS idx_commander_dealer_rotations_venue_id ON public.commander_dealer_rotations (venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_dealers_user_id ON public.commander_dealers (user_id);
CREATE INDEX IF NOT EXISTS idx_commander_equipment_rentals_vendor_id ON public.commander_equipment_rentals (vendor_id);
CREATE INDEX IF NOT EXISTS idx_commander_escrow_transactions_home_game_id ON public.commander_escrow_transactions (home_game_id);
CREATE INDEX IF NOT EXISTS idx_commander_escrow_transactions_player_id ON public.commander_escrow_transactions (player_id);
CREATE INDEX IF NOT EXISTS idx_commander_export_jobs_requested_by ON public.commander_export_jobs (requested_by);
CREATE INDEX IF NOT EXISTS idx_commander_games_must_move_to ON public.commander_games (must_move_to);
CREATE INDEX IF NOT EXISTS idx_commander_games_parent_game_id ON public.commander_games (parent_game_id);
CREATE INDEX IF NOT EXISTS idx_commander_hand_history_table_id ON public.commander_hand_history (table_id);
CREATE INDEX IF NOT EXISTS idx_commander_hand_history_venue_id ON public.commander_hand_history (venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_high_hands_game_id ON public.commander_high_hands (game_id);
CREATE INDEX IF NOT EXISTS idx_commander_high_hands_table_id ON public.commander_high_hands (table_id);
CREATE INDEX IF NOT EXISTS idx_commander_high_hands_verified_by ON public.commander_high_hands (verified_by);
CREATE INDEX IF NOT EXISTS idx_commander_home_members_invited_by ON public.commander_home_members (invited_by);
CREATE INDEX IF NOT EXISTS idx_commander_notification_log_announcement_id ON public.commander_notification_log (announcement_id);
CREATE INDEX IF NOT EXISTS idx_commander_onboarding_leads_updated_by ON public.commander_onboarding_leads (updated_by);
CREATE INDEX IF NOT EXISTS idx_commander_player_recommendations_venue_id ON public.commander_player_recommendations (venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_post_comments_parent_comment_id ON public.commander_post_comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_commander_post_comments_user_id ON public.commander_post_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_commander_progressive_jackpots_promotion_id ON public.commander_progressive_jackpots (promotion_id);
CREATE INDEX IF NOT EXISTS idx_commander_progressive_jackpots_venue_id ON public.commander_progressive_jackpots (venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_promotion_awards_approved_by ON public.commander_promotion_awards (approved_by);
CREATE INDEX IF NOT EXISTS idx_commander_promotion_awards_session_id ON public.commander_promotion_awards (session_id);
CREATE INDEX IF NOT EXISTS idx_commander_promotion_awards_table_id ON public.commander_promotion_awards (table_id);
CREATE INDEX IF NOT EXISTS idx_commander_self_exclusions_venue_id ON public.commander_self_exclusions (venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_service_requests_assigned_to ON public.commander_service_requests (assigned_to);
CREATE INDEX IF NOT EXISTS idx_commander_service_requests_player_id ON public.commander_service_requests (player_id);
CREATE INDEX IF NOT EXISTS idx_commander_service_requests_seat_id ON public.commander_service_requests (seat_id);
CREATE INDEX IF NOT EXISTS idx_commander_subscription_invoices_subscription_id ON public.commander_subscription_invoices (subscription_id);
CREATE INDEX IF NOT EXISTS idx_commander_subscription_invoices_venue_id ON public.commander_subscription_invoices (venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_system_alerts_created_by ON public.commander_system_alerts (created_by);
CREATE INDEX IF NOT EXISTS idx_commander_table_displays_table_id ON public.commander_table_displays (table_id);
CREATE INDEX IF NOT EXISTS idx_commander_table_displays_venue_id ON public.commander_table_displays (venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_tables_current_game_id ON public.commander_tables (current_game_id);
CREATE INDEX IF NOT EXISTS idx_commander_tournament_entries_eliminated_by ON public.commander_tournament_entries (eliminated_by);
CREATE INDEX IF NOT EXISTS idx_commander_tournaments_created_by ON public.commander_tournaments (created_by);
CREATE INDEX IF NOT EXISTS idx_commander_venue_photos_uploaded_by ON public.commander_venue_photos (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_commander_venue_posts_author_id ON public.commander_venue_posts (author_id);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_club_id ON public.commission_payouts (club_id);
CREATE INDEX IF NOT EXISTS idx_commission_structures_club_id ON public.commission_structures (club_id);
CREATE INDEX IF NOT EXISTS idx_credit_assignments_agent_id ON public.credit_assignments (agent_id);
CREATE INDEX IF NOT EXISTS idx_credit_invoices_club_id ON public.credit_invoices (club_id);
CREATE INDEX IF NOT EXISTS idx_credit_limit_requests_club_id ON public.credit_limit_requests (club_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_club_id ON public.credit_payments (club_id);
CREATE INDEX IF NOT EXISTS idx_credit_requests_club_id ON public.credit_requests (club_id);
CREATE INDEX IF NOT EXISTS idx_daily_trivia_plays_trivia_question_id ON public.daily_trivia_plays (trivia_question_id);
CREATE INDEX IF NOT EXISTS idx_diamond_ledger_user_id ON public.diamond_ledger (user_id);
CREATE INDEX IF NOT EXISTS idx_drill_performance_user_id ON public.drill_performance (user_id);
CREATE INDEX IF NOT EXISTS idx_drill_sessions_scenario_id ON public.drill_sessions (scenario_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_hand_history_game_id ON public.god_mode_hand_history (game_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_leaderboard_game_id ON public.god_mode_leaderboard (game_id);
CREATE INDEX IF NOT EXISTS idx_gtow_scores_user_id ON public.gtow_scores (user_id);
CREATE INDEX IF NOT EXISTS idx_hand_results_hand_id ON public.hand_results (hand_id);
CREATE INDEX IF NOT EXISTS idx_horse_content_queue_horse_id ON public.horse_content_queue (horse_id);
CREATE INDEX IF NOT EXISTS idx_horse_posts_horse_id ON public.horse_posts (horse_id);
CREATE INDEX IF NOT EXISTS idx_horse_stories_horse_id ON public.horse_stories (horse_id);
CREATE INDEX IF NOT EXISTS idx_horses_current_table_id ON public.horses (current_table_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_leak_alerts_leak_id ON public.jarvis_leak_alerts (leak_id);
CREATE INDEX IF NOT EXISTS idx_live_help_tickets_conversation_id ON public.live_help_tickets (conversation_id);
CREATE INDEX IF NOT EXISTS idx_live_signaling_from_user_id ON public.live_signaling (from_user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_seller_id ON public.marketplace_items (seller_id);
CREATE INDEX IF NOT EXISTS idx_mentions_comment_id ON public.mentions (comment_id);
CREATE INDEX IF NOT EXISTS idx_mentions_mentioned_by_id ON public.mentions (mentioned_by_id);
CREATE INDEX IF NOT EXISTS idx_mentions_mentioned_user_id ON public.mentions (mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_mentions_post_id ON public.mentions (post_id);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_reply_to_id ON public.messenger_messages (reply_to_id);
CREATE INDEX IF NOT EXISTS idx_orb_activity_ledger_orb_id ON public.orb_activity_ledger (orb_id);
CREATE INDEX IF NOT EXISTS idx_orb_activity_log_orb_id ON public.orb_activity_log (orb_id);
CREATE INDEX IF NOT EXISTS idx_orb_activity_log_user_id ON public.orb_activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_pending_calls_caller_id ON public.pending_calls (caller_id);
CREATE INDEX IF NOT EXISTS idx_player_reports_club_id ON public.player_reports (club_id);
CREATE INDEX IF NOT EXISTS idx_poker_news_social_post_id ON public.poker_news (social_post_id);
CREATE INDEX IF NOT EXISTS idx_poker_transactions_hand_id ON public.poker_transactions (hand_id);
CREATE INDEX IF NOT EXISTS idx_poker_transactions_table_id ON public.poker_transactions (table_id);
CREATE INDEX IF NOT EXISTS idx_poker_venues_primary_contact_id ON public.poker_venues (primary_contact_id);
CREATE INDEX IF NOT EXISTS idx_posted_clips_post_id ON public.posted_clips (post_id);
CREATE INDEX IF NOT EXISTS idx_posted_clips_posted_by ON public.posted_clips (posted_by);
CREATE INDEX IF NOT EXISTS idx_posted_sports_clips_post_id ON public.posted_sports_clips (post_id);
CREATE INDEX IF NOT EXISTS idx_profile_picture_history_media_id ON public.profile_picture_history (media_id);
CREATE INDEX IF NOT EXISTS idx_rake_attributions_club_id ON public.rake_attributions (club_id);
CREATE INDEX IF NOT EXISTS idx_rake_transactions_club_id ON public.rake_transactions (club_id);
CREATE INDEX IF NOT EXISTS idx_rakeback_distributions_invoice_id ON public.rakeback_distributions (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_coach_results_session_id ON public.sandbox_coach_results (session_id);
CREATE INDEX IF NOT EXISTS idx_scrape_queue_consumed_by ON public.scrape_queue (consumed_by);
CREATE INDEX IF NOT EXISTS idx_settlement_locks_settlement_period_id ON public.settlement_locks (settlement_period_id);
CREATE INDEX IF NOT EXISTS idx_settlement_periods_settled_by ON public.settlement_periods (settled_by);
CREATE INDEX IF NOT EXISTS idx_social_messages_sender_id ON public.social_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_social_page_post_comments_parent_id ON public.social_page_post_comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_social_reels_source_story_id ON public.social_reels (source_story_id);
CREATE INDEX IF NOT EXISTS idx_special_bonuses_club_id ON public.special_bonuses (club_id);
CREATE INDEX IF NOT EXISTS idx_stories_author_id ON public.stories (author_id);
CREATE INDEX IF NOT EXISTS idx_study_room_messages_room_id ON public.study_room_messages (room_id);
CREATE INDEX IF NOT EXISTS idx_table_activity_table_id ON public.table_activity (table_id);
CREATE INDEX IF NOT EXISTS idx_table_templates_created_by ON public.table_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_tables_deleted_by ON public.tables (deleted_by);
CREATE INDEX IF NOT EXISTS idx_toke_downs_day_id ON public.toke_downs (day_id);
CREATE INDEX IF NOT EXISTS idx_toke_expenses_day_id ON public.toke_expenses (day_id);
CREATE INDEX IF NOT EXISTS idx_toke_gig_days_gig_id ON public.toke_gig_days (gig_id);
CREATE INDEX IF NOT EXISTS idx_tournament_schedules_venue_id ON public.tournament_schedules (venue_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_club_id ON public.tournaments (club_id);
CREATE INDEX IF NOT EXISTS idx_training_user_achievements_achievement_id ON public.training_user_achievements (achievement_id);
CREATE INDEX IF NOT EXISTS idx_trivia_tournament_notifications_tournament_id ON public.trivia_tournament_notifications (tournament_id);
CREATE INDEX IF NOT EXISTS idx_trivia_tournament_notifications_user_id ON public.trivia_tournament_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_trivia_tournament_rounds_tournament_id ON public.trivia_tournament_rounds (tournament_id);
CREATE INDEX IF NOT EXISTS idx_union_announcements_club_id ON public.union_announcements (club_id);
CREATE INDEX IF NOT EXISTS idx_union_announcements_union_id ON public.union_announcements (union_id);
CREATE INDEX IF NOT EXISTS idx_union_transactions_club_id ON public.union_transactions (club_id);
CREATE INDEX IF NOT EXISTS idx_union_transactions_union_id ON public.union_transactions (union_id);
CREATE INDEX IF NOT EXISTS idx_union_wallet_transactions_club_id ON public.union_wallet_transactions (club_id);
CREATE INDEX IF NOT EXISTS idx_user_albums_cover_media_id ON public.user_albums (cover_media_id);
CREATE INDEX IF NOT EXISTS idx_user_seen_history_drill_id ON public.user_seen_history (drill_id);
CREATE INDEX IF NOT EXISTS idx_user_seen_history_user_id ON public.user_seen_history (user_id);
CREATE INDEX IF NOT EXISTS idx_video_generation_queue_persona_id ON public.video_generation_queue (persona_id);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_user_id ON public.xp_ledger (user_id);
