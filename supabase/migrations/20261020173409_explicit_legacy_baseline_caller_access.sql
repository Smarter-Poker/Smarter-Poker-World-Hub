-- TIER: 2. Legacy baseline caller permissions independent of default grants.
-- Actor/operation evidence: scripts/ci/reviewed-baseline-caller-access.json.
-- These declarations come from maintained actual query expressions and client
-- factories, not policy existence or copies of broad production ACLs. All
-- proposed privileges are already held in the saved current direct ACLs.
-- Preserve RLS, protected columns, functions, financial guards and all rows.
-- Browser self-issued premium access, ledger fallback INSERT and users mirror
-- INSERT are intentionally excluded. An uncalled horse assignment helper gets
-- no privileges. This is not complete business-RLS or historical-reset proof.
-- Only the TWO current serial defaults reached by actual INSERT actors need
-- explicit sequence USAGE; three other serial tables have only read/delete
-- callers and receive none. Current metadata, not historical CREATE syntax,
-- determines those sequences. Identity columns require no sequence grant.
-- Rollback: a NEW migration may revoke only a right proved absent beforehand;
-- never revoke current production rights as a synthetic rollback.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $pre$
DECLARE t text; r record;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'accounting_cash_source_receipts',
  'accounting_cash_source_work',
  'accounting_period_recompute_requests',
  'article_bookmarks',
  'bankroll_alerts',
  'bankroll_goals',
  'bankroll_ledger',
  'bankroll_locations',
  'bankroll_rule_violations',
  'bankroll_rules',
  'bankroll_segments',
  'bankroll_transfers',
  'bankroll_trips',
  'blocked_users',
  'ca_ledger_day_manifests',
  'club_shop_items',
  'commander_api_keys',
  'commander_clock_presets',
  'commander_club_announcements',
  'commander_comp_rates',
  'commander_comp_redemptions',
  'commander_comp_transactions',
  'commander_dealer_marketplace',
  'commander_dealer_rotations',
  'commander_dealers',
  'commander_equipment_rentals',
  'commander_export_jobs',
  'commander_floor_calls',
  'commander_hand_history',
  'commander_home_game_reviews',
  'commander_home_games',
  'commander_home_posts',
  'commander_home_rsvps',
  'commander_incidents',
  'commander_leaderboards',
  'commander_notifications',
  'commander_player_preferences',
  'commander_player_sessions',
  'commander_player_stats',
  'commander_progressive_jackpots',
  'commander_promotion_awards',
  'commander_promotions',
  'commander_push_subscriptions',
  'commander_self_exclusions',
  'commander_service_requests',
  'commander_spending_limits',
  'commander_staff',
  'commander_streams',
  'commander_table_displays',
  'commander_table_seats',
  'commander_table_sessions',
  'commander_time_purchases',
  'commander_tournament_points',
  'commander_tournament_templates',
  'commander_tournaments',
  'commander_venue_followers',
  'commander_venue_reviews',
  'commander_waitlist_group_members',
  'commander_waitlist_groups',
  'custom_avatar_gallery',
  'dealer_calendar_events',
  'dealer_documents',
  'diamond_platform_budget',
  'diamond_reward_catalog',
  'diamond_transactions',
  'geeves_conversations',
  'geofence_visits',
  'hand_private_state',
  'horse_hand_history',
  'horse_opponent_journals',
  'jarvis_leak_alerts',
  'live_bans',
  'live_help_conversations',
  'live_help_messages',
  'live_help_tickets',
  'live_pins',
  'live_viewers',
  'news_bookmarks',
  'news_read_later',
  'newsletter_subscribers',
  'notification_reads',
  'page_activity',
  'page_followers',
  'poker_events',
  'poker_near_me_favorites',
  'poker_near_me_search_history',
  'premium_feature_access',
  'push_subscriptions',
  'qr_code_scans',
  'sandbox_analytics',
  'sandbox_bookmarks',
  'sandbox_equity_history',
  'sandbox_quiz_results',
  'sandbox_saved_hands',
  'sandbox_sessions',
  'sandbox_shared_scenarios',
  'sandbox_templates',
  'saved_reels',
  'scheduled_lives',
  'sms_otp_codes',
  'social_comment_likes',
  'social_comments',
  'social_interactions',
  'social_likes',
  'social_media',
  'social_messages',
  'social_page_followers',
  'social_page_post_comments',
  'social_page_post_likes',
  'social_page_posts',
  'social_page_reports',
  'social_page_reviews',
  'social_pages',
  'social_stories',
  'solution_bookmarks',
  'staking_arrangements',
  'staking_sessions',
  'table_chat_mutes',
  'table_hole_cards',
  'toke_downs',
  'toke_expenses',
  'toke_gig_days',
  'toke_gigs',
  'tournament_alert_preferences',
  'tournament_series',
  'training_scenarios',
  'trivia_tournament_notifications',
  'user_assistant_stats',
  'user_avatars',
  'user_media',
  'user_mfa_factors',
  'user_notification_preferences',
  'user_poker_stats',
  'user_preferences',
  'user_sessions',
  'user_training_leaks',
  'users',
  'venue_checkins',
  'venue_live_tables',
  'venue_verification_log',
  'venues',
  'video_analysis',
  'video_favorites',
  'video_watch_history',
  'video_watch_later',
  'vip_feature_dismissals',
  'wishlists'
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=t AND c.relkind='r'
      AND c.relrowsecurity AND pg_get_userbyid(c.relowner)='postgres') THEN
   RAISE EXCEPTION 'Expected postgres-owned public.% base table with RLS',t;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||t)::regclass
    AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL) THEN
   RAISE EXCEPTION 'Column ACL on public.% requires separate column review',t;
  END IF;
 END LOOP;
 FOR r IN SELECT * FROM (VALUES
  ('page_followers','id','page_followers_id_seq'),
  ('qr_code_scans','id','qr_code_scans_id_seq')
 ) AS expected(tbl,col,seq) LOOP
  IF pg_get_serial_sequence('public.'||r.tbl,r.col) IS DISTINCT FROM 'public.'||r.seq
    OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=('public.'||r.seq)::regclass
      AND c.relkind='S' AND pg_get_userbyid(c.relowner)='postgres') THEN
   RAISE EXCEPTION 'Expected reviewed current serial default %.% -> %',r.tbl,r.col,r.seq;
  END IF;
 END LOOP;
END $pre$;
GRANT SELECT ON TABLE public.accounting_cash_source_receipts TO service_role;
GRANT SELECT ON TABLE public.accounting_cash_source_work TO service_role;
GRANT SELECT ON TABLE public.accounting_period_recompute_requests TO service_role;
GRANT DELETE,SELECT ON TABLE public.article_bookmarks TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.bankroll_alerts TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.bankroll_goals TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.bankroll_ledger TO authenticated;
GRANT SELECT ON TABLE public.bankroll_ledger TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.bankroll_locations TO authenticated;
GRANT SELECT ON TABLE public.bankroll_locations TO service_role;
GRANT INSERT ON TABLE public.bankroll_rule_violations TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.bankroll_rules TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.bankroll_segments TO authenticated;
GRANT INSERT ON TABLE public.bankroll_transfers TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.bankroll_trips TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.blocked_users TO authenticated;
GRANT SELECT ON TABLE public.blocked_users TO service_role;
GRANT SELECT ON TABLE public.ca_ledger_day_manifests TO service_role;
GRANT SELECT ON TABLE public.club_shop_items TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.club_shop_items TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_api_keys TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_clock_presets TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_club_announcements TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_comp_rates TO service_role;
GRANT SELECT ON TABLE public.commander_comp_redemptions TO service_role;
GRANT SELECT ON TABLE public.commander_comp_transactions TO service_role;
GRANT INSERT,SELECT ON TABLE public.commander_dealer_marketplace TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_dealer_rotations TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_dealers TO service_role;
GRANT INSERT,SELECT ON TABLE public.commander_equipment_rentals TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_export_jobs TO service_role;
GRANT SELECT ON TABLE public.commander_floor_calls TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_floor_calls TO service_role;
GRANT SELECT ON TABLE public.commander_hand_history TO service_role;
GRANT INSERT,SELECT ON TABLE public.commander_home_game_reviews TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_home_games TO service_role;
GRANT SELECT ON TABLE public.commander_home_posts TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_home_posts TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_home_rsvps TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_incidents TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_leaderboards TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_notifications TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_player_preferences TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_player_sessions TO service_role;
GRANT SELECT ON TABLE public.commander_player_stats TO service_role;
GRANT SELECT ON TABLE public.commander_progressive_jackpots TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_promotion_awards TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_promotions TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_push_subscriptions TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_self_exclusions TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_service_requests TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_spending_limits TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_staff TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_streams TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_table_displays TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_table_seats TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_table_sessions TO service_role;
GRANT INSERT ON TABLE public.commander_time_purchases TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_tournament_points TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_tournament_templates TO service_role;
GRANT SELECT ON TABLE public.commander_tournaments TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_tournaments TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.commander_venue_followers TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.commander_venue_reviews TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_waitlist_group_members TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.commander_waitlist_groups TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.custom_avatar_gallery TO authenticated;
GRANT SELECT,UPDATE ON TABLE public.custom_avatar_gallery TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.dealer_calendar_events TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.dealer_documents TO authenticated;
GRANT SELECT ON TABLE public.diamond_platform_budget TO service_role;
GRANT SELECT ON TABLE public.diamond_reward_catalog TO service_role;
GRANT SELECT ON TABLE public.diamond_transactions TO authenticated;
GRANT INSERT,SELECT ON TABLE public.diamond_transactions TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.geeves_conversations TO service_role;
GRANT INSERT,SELECT ON TABLE public.geofence_visits TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.hand_private_state TO service_role;
GRANT INSERT ON TABLE public.horse_hand_history TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.horse_opponent_journals TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.jarvis_leak_alerts TO authenticated;
GRANT SELECT,UPDATE ON TABLE public.jarvis_leak_alerts TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.live_bans TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.live_help_conversations TO service_role;
GRANT INSERT,SELECT ON TABLE public.live_help_messages TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.live_help_tickets TO service_role;
GRANT SELECT ON TABLE public.live_pins TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.live_pins TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.live_viewers TO authenticated;
GRANT DELETE,SELECT ON TABLE public.live_viewers TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.news_bookmarks TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.news_read_later TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.newsletter_subscribers TO service_role;
GRANT INSERT,SELECT ON TABLE public.notification_reads TO service_role;
GRANT INSERT,SELECT ON TABLE public.page_activity TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.page_followers TO service_role;
GRANT SELECT ON TABLE public.poker_events TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.poker_near_me_favorites TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.poker_near_me_search_history TO authenticated;
GRANT SELECT ON TABLE public.poker_near_me_search_history TO service_role;
GRANT SELECT ON TABLE public.premium_feature_access TO authenticated;
GRANT SELECT ON TABLE public.premium_feature_access TO service_role;
GRANT DELETE,SELECT ON TABLE public.push_subscriptions TO authenticated;
GRANT SELECT,UPDATE ON TABLE public.push_subscriptions TO service_role;
GRANT INSERT,SELECT ON TABLE public.qr_code_scans TO service_role;
GRANT INSERT,SELECT ON TABLE public.sandbox_analytics TO service_role;
GRANT SELECT ON TABLE public.sandbox_bookmarks TO authenticated;
GRANT INSERT,SELECT ON TABLE public.sandbox_equity_history TO service_role;
GRANT INSERT,SELECT ON TABLE public.sandbox_quiz_results TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.sandbox_saved_hands TO service_role;
GRANT SELECT ON TABLE public.sandbox_sessions TO authenticated;
GRANT SELECT ON TABLE public.sandbox_sessions TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.sandbox_shared_scenarios TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.sandbox_templates TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.saved_reels TO authenticated;
GRANT SELECT ON TABLE public.saved_reels TO service_role;
GRANT SELECT ON TABLE public.scheduled_lives TO anon;
GRANT SELECT ON TABLE public.scheduled_lives TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.scheduled_lives TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.sms_otp_codes TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.social_comment_likes TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_comments TO authenticated;
GRANT INSERT,SELECT ON TABLE public.social_comments TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.social_interactions TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.social_interactions TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_likes TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_likes TO service_role;
GRANT DELETE,SELECT,UPDATE ON TABLE public.social_media TO authenticated;
GRANT INSERT,SELECT ON TABLE public.social_messages TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_messages TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_page_followers TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_page_post_comments TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_page_post_likes TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_page_posts TO service_role;
GRANT INSERT ON TABLE public.social_page_reports TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.social_page_reviews TO service_role;
GRANT SELECT ON TABLE public.social_pages TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.social_pages TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.social_stories TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.solution_bookmarks TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.staking_arrangements TO authenticated;
GRANT INSERT,SELECT ON TABLE public.staking_sessions TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.table_chat_mutes TO service_role;
GRANT SELECT ON TABLE public.table_hole_cards TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.table_hole_cards TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.toke_downs TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.toke_expenses TO authenticated;
GRANT SELECT,UPDATE ON TABLE public.toke_gig_days TO authenticated;
GRANT SELECT,UPDATE ON TABLE public.toke_gigs TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.tournament_alert_preferences TO service_role;
GRANT SELECT ON TABLE public.tournament_series TO authenticated;
GRANT SELECT ON TABLE public.tournament_series TO service_role;
GRANT SELECT,UPDATE ON TABLE public.training_scenarios TO authenticated;
GRANT INSERT ON TABLE public.trivia_tournament_notifications TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.user_assistant_stats TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.user_avatars TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.user_media TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.user_mfa_factors TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.user_notification_preferences TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.user_notification_preferences TO service_role;
GRANT SELECT ON TABLE public.user_poker_stats TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.user_preferences TO authenticated;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.user_sessions TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.user_training_leaks TO authenticated;
GRANT SELECT,UPDATE ON TABLE public.user_training_leaks TO service_role;
GRANT SELECT,UPDATE ON TABLE public.users TO authenticated;
GRANT INSERT,SELECT ON TABLE public.venue_checkins TO service_role;
GRANT SELECT ON TABLE public.venue_live_tables TO service_role;
GRANT SELECT ON TABLE public.venue_verification_log TO service_role;
GRANT SELECT ON TABLE public.venues TO service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public.video_analysis TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.video_favorites TO authenticated;
GRANT SELECT ON TABLE public.video_favorites TO service_role;
GRANT DELETE,INSERT,SELECT,UPDATE ON TABLE public.video_watch_history TO authenticated;
GRANT SELECT ON TABLE public.video_watch_history TO service_role;
GRANT DELETE,INSERT,SELECT ON TABLE public.video_watch_later TO authenticated;
GRANT INSERT,SELECT,UPDATE ON TABLE public.vip_feature_dismissals TO authenticated;
GRANT DELETE,INSERT,SELECT ON TABLE public.wishlists TO authenticated;
GRANT USAGE ON SEQUENCE public.page_followers_id_seq TO service_role;
GRANT USAGE ON SEQUENCE public.qr_code_scans_id_seq TO service_role;
DO $post$
DECLARE r record; op text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('accounting_cash_source_receipts','service_role',ARRAY['SELECT']),
  ('accounting_cash_source_work','service_role',ARRAY['SELECT']),
  ('accounting_period_recompute_requests','service_role',ARRAY['SELECT']),
  ('article_bookmarks','authenticated',ARRAY['DELETE','SELECT']),
  ('bankroll_alerts','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('bankroll_goals','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('bankroll_ledger','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('bankroll_ledger','service_role',ARRAY['SELECT']),
  ('bankroll_locations','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('bankroll_locations','service_role',ARRAY['SELECT']),
  ('bankroll_rule_violations','authenticated',ARRAY['INSERT']),
  ('bankroll_rules','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('bankroll_segments','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('bankroll_transfers','authenticated',ARRAY['INSERT']),
  ('bankroll_trips','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('blocked_users','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('blocked_users','service_role',ARRAY['SELECT']),
  ('ca_ledger_day_manifests','service_role',ARRAY['SELECT']),
  ('club_shop_items','authenticated',ARRAY['SELECT']),
  ('club_shop_items','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_api_keys','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_clock_presets','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_club_announcements','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_comp_rates','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_comp_redemptions','service_role',ARRAY['SELECT']),
  ('commander_comp_transactions','service_role',ARRAY['SELECT']),
  ('commander_dealer_marketplace','service_role',ARRAY['INSERT','SELECT']),
  ('commander_dealer_rotations','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_dealers','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_equipment_rentals','service_role',ARRAY['INSERT','SELECT']),
  ('commander_export_jobs','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_floor_calls','authenticated',ARRAY['SELECT']),
  ('commander_floor_calls','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_hand_history','service_role',ARRAY['SELECT']),
  ('commander_home_game_reviews','service_role',ARRAY['INSERT','SELECT']),
  ('commander_home_games','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_home_posts','authenticated',ARRAY['SELECT']),
  ('commander_home_posts','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_home_rsvps','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_incidents','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_leaderboards','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_notifications','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_player_preferences','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_player_sessions','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_player_stats','service_role',ARRAY['SELECT']),
  ('commander_progressive_jackpots','service_role',ARRAY['SELECT']),
  ('commander_promotion_awards','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_promotions','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_push_subscriptions','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_self_exclusions','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_service_requests','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_spending_limits','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_staff','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_streams','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_table_displays','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_table_seats','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_table_sessions','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_time_purchases','service_role',ARRAY['INSERT']),
  ('commander_tournament_points','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_tournament_templates','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_tournaments','authenticated',ARRAY['SELECT']),
  ('commander_tournaments','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_venue_followers','service_role',ARRAY['DELETE','INSERT','SELECT']),
  ('commander_venue_reviews','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('commander_waitlist_group_members','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('commander_waitlist_groups','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('custom_avatar_gallery','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('custom_avatar_gallery','service_role',ARRAY['SELECT','UPDATE']),
  ('dealer_calendar_events','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('dealer_documents','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('diamond_platform_budget','service_role',ARRAY['SELECT']),
  ('diamond_reward_catalog','service_role',ARRAY['SELECT']),
  ('diamond_transactions','authenticated',ARRAY['SELECT']),
  ('diamond_transactions','service_role',ARRAY['INSERT','SELECT']),
  ('geeves_conversations','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('geofence_visits','service_role',ARRAY['INSERT','SELECT']),
  ('hand_private_state','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('horse_hand_history','service_role',ARRAY['INSERT']),
  ('horse_opponent_journals','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('jarvis_leak_alerts','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('jarvis_leak_alerts','service_role',ARRAY['SELECT','UPDATE']),
  ('live_bans','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('live_help_conversations','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('live_help_messages','service_role',ARRAY['INSERT','SELECT']),
  ('live_help_tickets','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('live_pins','authenticated',ARRAY['SELECT']),
  ('live_pins','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('live_viewers','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('live_viewers','service_role',ARRAY['DELETE','SELECT']),
  ('news_bookmarks','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('news_read_later','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('newsletter_subscribers','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('notification_reads','service_role',ARRAY['INSERT','SELECT']),
  ('page_activity','service_role',ARRAY['INSERT','SELECT']),
  ('page_followers','service_role',ARRAY['DELETE','INSERT','SELECT']),
  ('poker_events','service_role',ARRAY['SELECT']),
  ('poker_near_me_favorites','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('poker_near_me_search_history','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('poker_near_me_search_history','service_role',ARRAY['SELECT']),
  ('premium_feature_access','authenticated',ARRAY['SELECT']),
  ('premium_feature_access','service_role',ARRAY['SELECT']),
  ('push_subscriptions','authenticated',ARRAY['DELETE','SELECT']),
  ('push_subscriptions','service_role',ARRAY['SELECT','UPDATE']),
  ('qr_code_scans','service_role',ARRAY['INSERT','SELECT']),
  ('sandbox_analytics','service_role',ARRAY['INSERT','SELECT']),
  ('sandbox_bookmarks','authenticated',ARRAY['SELECT']),
  ('sandbox_equity_history','service_role',ARRAY['INSERT','SELECT']),
  ('sandbox_quiz_results','service_role',ARRAY['INSERT','SELECT']),
  ('sandbox_saved_hands','service_role',ARRAY['DELETE','INSERT','SELECT']),
  ('sandbox_sessions','authenticated',ARRAY['SELECT']),
  ('sandbox_sessions','service_role',ARRAY['SELECT']),
  ('sandbox_shared_scenarios','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('sandbox_templates','service_role',ARRAY['DELETE','INSERT','SELECT']),
  ('saved_reels','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('saved_reels','service_role',ARRAY['SELECT']),
  ('scheduled_lives','anon',ARRAY['SELECT']),
  ('scheduled_lives','authenticated',ARRAY['SELECT']),
  ('scheduled_lives','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('sms_otp_codes','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_comment_likes','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('social_comments','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_comments','service_role',ARRAY['INSERT','SELECT']),
  ('social_interactions','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('social_interactions','service_role',ARRAY['DELETE','INSERT','SELECT']),
  ('social_likes','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_likes','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_media','authenticated',ARRAY['DELETE','SELECT','UPDATE']),
  ('social_messages','authenticated',ARRAY['INSERT','SELECT']),
  ('social_messages','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_page_followers','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_page_post_comments','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_page_post_likes','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_page_posts','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_page_reports','service_role',ARRAY['INSERT']),
  ('social_page_reviews','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('social_pages','authenticated',ARRAY['SELECT']),
  ('social_pages','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('social_stories','service_role',ARRAY['DELETE','INSERT','SELECT']),
  ('solution_bookmarks','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('staking_arrangements','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('staking_sessions','authenticated',ARRAY['INSERT','SELECT']),
  ('table_chat_mutes','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('table_hole_cards','authenticated',ARRAY['SELECT']),
  ('table_hole_cards','service_role',ARRAY['DELETE','INSERT','SELECT']),
  ('toke_downs','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('toke_expenses','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('toke_gig_days','authenticated',ARRAY['SELECT','UPDATE']),
  ('toke_gigs','authenticated',ARRAY['SELECT','UPDATE']),
  ('tournament_alert_preferences','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('tournament_series','authenticated',ARRAY['SELECT']),
  ('tournament_series','service_role',ARRAY['SELECT']),
  ('training_scenarios','authenticated',ARRAY['SELECT','UPDATE']),
  ('trivia_tournament_notifications','service_role',ARRAY['INSERT']),
  ('user_assistant_stats','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('user_avatars','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('user_media','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('user_mfa_factors','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('user_notification_preferences','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('user_notification_preferences','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('user_poker_stats','service_role',ARRAY['SELECT']),
  ('user_preferences','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('user_sessions','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('user_training_leaks','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('user_training_leaks','service_role',ARRAY['SELECT','UPDATE']),
  ('users','authenticated',ARRAY['SELECT','UPDATE']),
  ('venue_checkins','service_role',ARRAY['INSERT','SELECT']),
  ('venue_live_tables','service_role',ARRAY['SELECT']),
  ('venue_verification_log','service_role',ARRAY['SELECT']),
  ('venues','service_role',ARRAY['SELECT']),
  ('video_analysis','service_role',ARRAY['INSERT','SELECT','UPDATE']),
  ('video_favorites','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('video_favorites','service_role',ARRAY['SELECT']),
  ('video_watch_history','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
  ('video_watch_history','service_role',ARRAY['SELECT']),
  ('video_watch_later','authenticated',ARRAY['DELETE','INSERT','SELECT']),
  ('vip_feature_dismissals','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
  ('wishlists','authenticated',ARRAY['DELETE','INSERT','SELECT'])
 ) AS expected(tbl,role_name,operations) LOOP
  FOREACH op IN ARRAY r.operations LOOP
   IF NOT has_table_privilege(r.role_name,'public.'||r.tbl,op) THEN
    RAISE EXCEPTION 'Missing explicit baseline caller privilege %.% %',r.role_name,r.tbl,op;
   END IF;
  END LOOP;
 END LOOP;
 IF NOT has_sequence_privilege('service_role','public.page_followers_id_seq','USAGE') THEN RAISE EXCEPTION 'Missing baseline serial USAGE page_followers_id_seq'; END IF;
 IF NOT has_sequence_privilege('service_role','public.qr_code_scans_id_seq','USAGE') THEN RAISE EXCEPTION 'Missing baseline serial USAGE qr_code_scans_id_seq'; END IF;
END $post$;
COMMIT;
