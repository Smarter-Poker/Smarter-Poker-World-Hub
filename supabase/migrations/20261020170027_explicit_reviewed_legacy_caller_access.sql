-- TIER: 2. Explicit existing caller grants, independent of Supabase defaults.
-- Source/role/operation decisions: scripts/ci/reviewed-legacy-table-access.json.
-- Actual JS/TS syntax (comments excluded), embedded relation reads, Realtime
-- consumers and current row policies were reviewed across Hub and Club Arena.
-- This declares only privileges already held in the production ACL snapshot.
-- It never copies broad ALL grants, changes a policy, column grant, default,
-- function, row, trigger or game state. Three unused direct-reader candidates
-- require no grant; service-only and denied/dead browser paths stay separate.
-- scraper_runs alone uses bigserial here, so only its actual service writer
-- receives the separate sequence USAGE. Identity columns need no such grant.
-- This is permission-transition qualification, not a claim that the complete
-- historical schemas were restored or all business RLS was re-certified.
-- Rollback: remove only a privilege proved absent before this migration, in a
-- new migration. Never revoke a preexisting production privilege.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $pre$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'anti_farming_ips',
    'arena_sessions',
    'bankroll_assistant_memory',
    'bankroll_sessions',
    'bus_event_log',
    'club_announcements',
    'club_challenges',
    'club_chat',
    'commander_home_game_tables',
    'credit_requests',
    'crew_members',
    'crews',
    'cron_health_log',
    'engine_maintenance_thaws',
    'friend_challenges',
    'home_game_vouches',
    'live_ban_audit',
    'live_comments',
    'live_gifts',
    'live_reactions',
    'live_sessions',
    'messages',
    'messenger_admin_messages',
    'messenger_bookmarks',
    'messenger_call_signals',
    'messenger_conversation_labels',
    'messenger_conversations',
    'messenger_favorites',
    'messenger_labels',
    'messenger_messages',
    'messenger_participants',
    'messenger_reactions',
    'messenger_reminders',
    'messenger_reports',
    'messenger_scheduled',
    'messenger_templates',
    'messenger_themes',
    'notification_preferences',
    'notifications',
    'pb_calibration_profiles',
    'pb_hands',
    'pb_sessions',
    'player_notes',
    'poker_seat_preferences',
    'poker_session_stats',
    'poker_sessions',
    'poker_table_layouts',
    'promotion_claims',
    'referral_codes',
    'referrals',
    'scraper_runs',
    'session_chat_messages',
    'session_history',
    'social_follows',
    'social_page_comment_likes',
    'table_chat',
    'table_templates',
    'throw_usage',
    'tour_stop_events',
    'tournament_deal_votes',
    'tournament_registration_approvals',
    'training_custom_drills',
    'training_events',
    'training_hand_history',
    'trips',
    'union_applications',
    'union_clubs',
    'union_leave_requests',
    'unions',
    'user_blocks',
    'user_feedback',
    'user_leaks',
    'user_reports',
    'user_table_settings',
    'user_venue_checkins',
    'venue_daily_tournaments',
    'venue_game_alerts',
    'venue_reviews',
    'video_playlist_items',
    'video_playlists',
    'w2g_forms',
    'wallets',
    'training_user_achievements'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relkind='r'
        AND c.relrowsecurity AND pg_get_userbyid(c.relowner)='postgres'
    ) THEN
      RAISE EXCEPTION 'Expected postgres-owned public.% base table with RLS',t;
    END IF;
    -- Table-level grants must never override a column-privacy contract.
    IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=('public.'||t)::regclass
              AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL) THEN
      RAISE EXCEPTION 'Column ACL on public.% requires a separate per-column review',t;
    END IF;
  END LOOP;
  IF pg_get_serial_sequence('public.scraper_runs','id') IS DISTINCT FROM 'public.scraper_runs_id_seq'
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.scraper_runs_id_seq'::regclass
                     AND relkind='S' AND pg_get_userbyid(relowner)='postgres') THEN
    RAISE EXCEPTION 'Expected existing postgres-owned scraper_runs.id serial sequence';
  END IF;
END $pre$;
GRANT INSERT, SELECT ON TABLE public.anti_farming_ips TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.arena_sessions TO authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public.bankroll_assistant_memory TO authenticated;
GRANT SELECT ON TABLE public.bankroll_sessions TO service_role;
GRANT INSERT ON TABLE public.bus_event_log TO anon;
GRANT INSERT ON TABLE public.bus_event_log TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.club_announcements TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.club_announcements TO service_role;
GRANT SELECT ON TABLE public.club_challenges TO authenticated;
GRANT INSERT, SELECT ON TABLE public.club_chat TO authenticated;
GRANT INSERT, SELECT ON TABLE public.club_chat TO service_role;
GRANT SELECT ON TABLE public.commander_home_game_tables TO authenticated;
GRANT INSERT, SELECT ON TABLE public.credit_requests TO authenticated;
GRANT SELECT ON TABLE public.crew_members TO authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public.crew_members TO service_role;
GRANT SELECT ON TABLE public.crews TO authenticated;
GRANT INSERT, SELECT ON TABLE public.crews TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.cron_health_log TO service_role;
GRANT SELECT ON TABLE public.engine_maintenance_thaws TO service_role;
GRANT INSERT, SELECT ON TABLE public.friend_challenges TO authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public.home_game_vouches TO service_role;
GRANT INSERT ON TABLE public.live_ban_audit TO service_role;
GRANT SELECT ON TABLE public.live_comments TO anon;
GRANT SELECT ON TABLE public.live_comments TO authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public.live_comments TO service_role;
GRANT SELECT ON TABLE public.live_gifts TO service_role;
GRANT INSERT ON TABLE public.live_reactions TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.live_sessions TO service_role;
GRANT SELECT, UPDATE ON TABLE public.messages TO authenticated;
GRANT INSERT, SELECT ON TABLE public.messenger_admin_messages TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.messenger_bookmarks TO authenticated;
GRANT INSERT, SELECT ON TABLE public.messenger_call_signals TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.messenger_conversation_labels TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.messenger_conversations TO authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public.messenger_favorites TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.messenger_labels TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.messenger_messages TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.messenger_participants TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.messenger_reactions TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.messenger_reminders TO authenticated;
GRANT INSERT ON TABLE public.messenger_reports TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.messenger_scheduled TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.messenger_templates TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.messenger_themes TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.notification_preferences TO service_role;
GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.notifications TO service_role;
GRANT DELETE, INSERT, SELECT ON TABLE public.pb_calibration_profiles TO service_role;
GRANT SELECT ON TABLE public.pb_hands TO authenticated;
GRANT SELECT ON TABLE public.pb_hands TO service_role;
GRANT SELECT ON TABLE public.pb_sessions TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.player_notes TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.player_notes TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.poker_seat_preferences TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.poker_session_stats TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.poker_session_stats TO service_role;
GRANT SELECT ON TABLE public.poker_sessions TO service_role;
GRANT DELETE, INSERT, SELECT ON TABLE public.poker_table_layouts TO authenticated;
GRANT INSERT, SELECT ON TABLE public.promotion_claims TO authenticated;
GRANT INSERT, SELECT ON TABLE public.referral_codes TO authenticated;
GRANT INSERT, SELECT ON TABLE public.referrals TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.scraper_runs TO service_role;
GRANT SELECT ON TABLE public.session_chat_messages TO authenticated;
GRANT INSERT, SELECT ON TABLE public.session_chat_messages TO service_role;
GRANT INSERT, SELECT ON TABLE public.session_history TO authenticated;
GRANT SELECT ON TABLE public.social_follows TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.social_follows TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.social_follows TO service_role;
GRANT SELECT ON TABLE public.social_page_comment_likes TO anon;
GRANT SELECT ON TABLE public.social_page_comment_likes TO authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public.social_page_comment_likes TO service_role;
GRANT INSERT, SELECT ON TABLE public.table_chat TO authenticated;
GRANT INSERT, SELECT ON TABLE public.table_chat TO service_role;
GRANT DELETE, INSERT, SELECT ON TABLE public.table_templates TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.table_templates TO service_role;
GRANT SELECT ON TABLE public.throw_usage TO authenticated;
GRANT SELECT ON TABLE public.tour_stop_events TO service_role;
GRANT SELECT ON TABLE public.tournament_deal_votes TO authenticated;
GRANT SELECT ON TABLE public.tournament_deal_votes TO service_role;
GRANT DELETE, INSERT, SELECT ON TABLE public.tournament_registration_approvals TO authenticated;
GRANT INSERT, SELECT ON TABLE public.training_custom_drills TO authenticated;
GRANT INSERT ON TABLE public.training_events TO authenticated;
GRANT INSERT ON TABLE public.training_events TO service_role;
GRANT SELECT, UPDATE ON TABLE public.training_hand_history TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.trips TO authenticated;
GRANT SELECT ON TABLE public.trips TO service_role;
GRANT SELECT ON TABLE public.union_applications TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.union_applications TO service_role;
GRANT SELECT ON TABLE public.union_clubs TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.union_clubs TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.union_leave_requests TO service_role;
GRANT SELECT ON TABLE public.unions TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.unions TO service_role;
GRANT DELETE, INSERT, SELECT ON TABLE public.user_blocks TO authenticated;
GRANT INSERT ON TABLE public.user_feedback TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.user_leaks TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public.user_leaks TO service_role;
GRANT INSERT ON TABLE public.user_reports TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.user_reports TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.user_table_settings TO authenticated;
GRANT SELECT ON TABLE public.user_table_settings TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.user_venue_checkins TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.venue_daily_tournaments TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.venue_game_alerts TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.venue_reviews TO service_role;
GRANT DELETE, SELECT ON TABLE public.video_playlist_items TO authenticated;
GRANT INSERT, SELECT ON TABLE public.video_playlists TO authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public.w2g_forms TO authenticated;
GRANT SELECT ON TABLE public.w2g_forms TO service_role;
GRANT SELECT ON TABLE public.wallets TO service_role;
GRANT SELECT ON TABLE public.training_user_achievements TO authenticated;
GRANT USAGE ON SEQUENCE public.scraper_runs_id_seq TO service_role;
DO $post$
DECLARE r record; op text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('anti_farming_ips','service_role',ARRAY['INSERT','SELECT']),
    ('arena_sessions','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('bankroll_assistant_memory','authenticated',ARRAY['DELETE','INSERT','SELECT']),
    ('bankroll_sessions','service_role',ARRAY['SELECT']),
    ('bus_event_log','anon',ARRAY['INSERT']),
    ('bus_event_log','authenticated',ARRAY['INSERT']),
    ('club_announcements','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('club_announcements','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('club_challenges','authenticated',ARRAY['SELECT']),
    ('club_chat','authenticated',ARRAY['INSERT','SELECT']),
    ('club_chat','service_role',ARRAY['INSERT','SELECT']),
    ('commander_home_game_tables','authenticated',ARRAY['SELECT']),
    ('credit_requests','authenticated',ARRAY['INSERT','SELECT']),
    ('crew_members','authenticated',ARRAY['SELECT']),
    ('crew_members','service_role',ARRAY['DELETE','INSERT','SELECT']),
    ('crews','authenticated',ARRAY['SELECT']),
    ('crews','service_role',ARRAY['INSERT','SELECT']),
    ('cron_health_log','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('engine_maintenance_thaws','service_role',ARRAY['SELECT']),
    ('friend_challenges','authenticated',ARRAY['INSERT','SELECT']),
    ('home_game_vouches','service_role',ARRAY['DELETE','INSERT','SELECT']),
    ('live_ban_audit','service_role',ARRAY['INSERT']),
    ('live_comments','anon',ARRAY['SELECT']),
    ('live_comments','authenticated',ARRAY['SELECT']),
    ('live_comments','service_role',ARRAY['DELETE','INSERT','SELECT']),
    ('live_gifts','service_role',ARRAY['SELECT']),
    ('live_reactions','authenticated',ARRAY['INSERT']),
    ('live_sessions','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('messages','authenticated',ARRAY['SELECT','UPDATE']),
    ('messenger_admin_messages','authenticated',ARRAY['INSERT','SELECT']),
    ('messenger_bookmarks','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('messenger_call_signals','authenticated',ARRAY['INSERT','SELECT']),
    ('messenger_conversation_labels','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('messenger_conversations','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('messenger_favorites','authenticated',ARRAY['DELETE','INSERT','SELECT']),
    ('messenger_labels','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('messenger_messages','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('messenger_participants','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('messenger_reactions','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('messenger_reminders','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('messenger_reports','authenticated',ARRAY['INSERT']),
    ('messenger_scheduled','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('messenger_templates','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('messenger_themes','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('notification_preferences','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('notifications','authenticated',ARRAY['SELECT','UPDATE']),
    ('notifications','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('pb_calibration_profiles','service_role',ARRAY['DELETE','INSERT','SELECT']),
    ('pb_hands','authenticated',ARRAY['SELECT']),
    ('pb_hands','service_role',ARRAY['SELECT']),
    ('pb_sessions','service_role',ARRAY['SELECT']),
    ('player_notes','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('player_notes','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('poker_seat_preferences','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('poker_session_stats','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('poker_session_stats','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('poker_sessions','service_role',ARRAY['SELECT']),
    ('poker_table_layouts','authenticated',ARRAY['DELETE','INSERT','SELECT']),
    ('promotion_claims','authenticated',ARRAY['INSERT','SELECT']),
    ('referral_codes','authenticated',ARRAY['INSERT','SELECT']),
    ('referrals','service_role',ARRAY['INSERT','SELECT']),
    ('scraper_runs','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('session_chat_messages','authenticated',ARRAY['SELECT']),
    ('session_chat_messages','service_role',ARRAY['INSERT','SELECT']),
    ('session_history','authenticated',ARRAY['INSERT','SELECT']),
    ('social_follows','anon',ARRAY['SELECT']),
    ('social_follows','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('social_follows','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('social_page_comment_likes','anon',ARRAY['SELECT']),
    ('social_page_comment_likes','authenticated',ARRAY['SELECT']),
    ('social_page_comment_likes','service_role',ARRAY['DELETE','INSERT','SELECT']),
    ('table_chat','authenticated',ARRAY['INSERT','SELECT']),
    ('table_chat','service_role',ARRAY['INSERT','SELECT']),
    ('table_templates','authenticated',ARRAY['DELETE','INSERT','SELECT']),
    ('table_templates','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('throw_usage','authenticated',ARRAY['SELECT']),
    ('tour_stop_events','service_role',ARRAY['SELECT']),
    ('tournament_deal_votes','authenticated',ARRAY['SELECT']),
    ('tournament_deal_votes','service_role',ARRAY['SELECT']),
    ('tournament_registration_approvals','authenticated',ARRAY['DELETE','INSERT','SELECT']),
    ('training_custom_drills','authenticated',ARRAY['INSERT','SELECT']),
    ('training_events','authenticated',ARRAY['INSERT']),
    ('training_events','service_role',ARRAY['INSERT']),
    ('training_hand_history','authenticated',ARRAY['SELECT','UPDATE']),
    ('trips','authenticated',ARRAY['SELECT','UPDATE']),
    ('trips','service_role',ARRAY['SELECT']),
    ('union_applications','authenticated',ARRAY['SELECT']),
    ('union_applications','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('union_clubs','authenticated',ARRAY['SELECT']),
    ('union_clubs','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('union_leave_requests','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('unions','authenticated',ARRAY['SELECT']),
    ('unions','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('user_blocks','authenticated',ARRAY['DELETE','INSERT','SELECT']),
    ('user_feedback','authenticated',ARRAY['INSERT']),
    ('user_leaks','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('user_leaks','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('user_reports','authenticated',ARRAY['INSERT']),
    ('user_reports','service_role',ARRAY['SELECT','UPDATE']),
    ('user_table_settings','authenticated',ARRAY['INSERT','SELECT','UPDATE']),
    ('user_table_settings','service_role',ARRAY['SELECT']),
    ('user_venue_checkins','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('venue_daily_tournaments','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('venue_game_alerts','service_role',ARRAY['INSERT','SELECT','UPDATE']),
    ('venue_reviews','service_role',ARRAY['DELETE','INSERT','SELECT','UPDATE']),
    ('video_playlist_items','authenticated',ARRAY['DELETE','SELECT']),
    ('video_playlists','authenticated',ARRAY['INSERT','SELECT']),
    ('w2g_forms','authenticated',ARRAY['DELETE','INSERT','SELECT']),
    ('w2g_forms','service_role',ARRAY['SELECT']),
    ('wallets','service_role',ARRAY['SELECT']),
    ('training_user_achievements','authenticated',ARRAY['SELECT'])
  ) AS rights(tbl,role_name,operations) LOOP
    FOREACH op IN ARRAY r.operations LOOP
      IF NOT has_table_privilege(r.role_name,'public.'||r.tbl,op) THEN
        RAISE EXCEPTION 'Explicit caller privilege missing: %.% %',r.role_name,r.tbl,op;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT has_sequence_privilege('service_role','public.scraper_runs_id_seq','USAGE') THEN
    RAISE EXCEPTION 'Service scraper-run insert sequence privilege missing';
  END IF;
END $post$;
COMMIT;
