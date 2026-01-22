-- ═══════════════════════════════════════════════════════════════════════════
-- 🔍 FOREIGN KEY INDEXES: Add missing indexes for better query performance
-- ═══════════════════════════════════════════════════════════════════════════
-- Fixes Supabase Performance Advisor warnings for missing FK indexes
-- Created: 2026-01-22
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: USER-RELATED FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- profiles.id -> auth.users.id (usually exists, but ensure)
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);

-- user_avatars.user_id
CREATE INDEX IF NOT EXISTS idx_user_avatars_user_id ON public.user_avatars(user_id);

-- avatar_unlocks.user_id
CREATE INDEX IF NOT EXISTS idx_avatar_unlocks_user_id ON public.avatar_unlocks(user_id);

-- user_diamond_balance.user_id
CREATE INDEX IF NOT EXISTS idx_user_diamond_balance_user_id ON public.user_diamond_balance(user_id);

-- user_streaks.user_id
CREATE INDEX IF NOT EXISTS idx_user_streaks_user_id ON public.user_streaks(user_id);

-- user_progress.user_id
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON public.user_progress(user_id);

-- user_level_progress.user_id
CREATE INDEX IF NOT EXISTS idx_user_level_progress_user_id ON public.user_level_progress(user_id);

-- user_leaks.user_id
CREATE INDEX IF NOT EXISTS idx_user_leaks_user_id ON public.user_leaks(user_id);

-- user_mastery.user_id
CREATE INDEX IF NOT EXISTS idx_user_mastery_user_id ON public.user_mastery(user_id);

-- user_dna_profiles.user_id
CREATE INDEX IF NOT EXISTS idx_user_dna_profiles_user_id ON public.user_dna_profiles(user_id);

-- user_albums.user_id
CREATE INDEX IF NOT EXISTS idx_user_albums_user_id ON public.user_albums(user_id);

-- user_media.user_id
CREATE INDEX IF NOT EXISTS idx_user_media_user_id ON public.user_media(user_id);

-- user_seen_history.user_id
CREATE INDEX IF NOT EXISTS idx_user_seen_history_user_id ON public.user_seen_history(user_id);

-- user_question_history.user_id
CREATE INDEX IF NOT EXISTS idx_user_question_history_user_id ON public.user_question_history(user_id);

-- profile_picture_history.user_id
CREATE INDEX IF NOT EXISTS idx_profile_picture_history_user_id ON public.profile_picture_history(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: SOCIAL FEATURES FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- friendships
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships(friend_id);

-- follows
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

-- social_posts
CREATE INDEX IF NOT EXISTS idx_social_posts_author_id ON public.social_posts(author_id);

-- social_comments
CREATE INDEX IF NOT EXISTS idx_social_comments_author_id ON public.social_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_post_id ON public.social_comments(post_id);

-- social_likes
CREATE INDEX IF NOT EXISTS idx_social_likes_user_id ON public.social_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_social_likes_post_id ON public.social_likes(post_id);

-- social_interactions
CREATE INDEX IF NOT EXISTS idx_social_interactions_user_id ON public.social_interactions(user_id);

-- social_connections
CREATE INDEX IF NOT EXISTS idx_social_connections_user_id ON public.social_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_connected_user_id ON public.social_connections(connected_user_id);

-- mentions
CREATE INDEX IF NOT EXISTS idx_mentions_mentioned_user_id ON public.mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_mentions_post_id ON public.mentions(post_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: MESSAGING FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- social_conversation_participants
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON public.social_conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON public.social_conversation_participants(user_id);

-- social_messages
CREATE INDEX IF NOT EXISTS idx_social_messages_conversation_id ON public.social_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_social_messages_sender_id ON public.social_messages(sender_id);

-- social_message_reactions
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.social_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON public.social_message_reactions(user_id);

-- social_message_reads
CREATE INDEX IF NOT EXISTS idx_message_reads_user_id ON public.social_message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON public.social_message_reads(message_id);

-- social_messaging_settings.user_id
CREATE INDEX IF NOT EXISTS idx_messaging_settings_user_id ON public.social_messaging_settings(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4: STORIES & REELS FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- stories
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON public.stories(user_id);

-- social_stories
CREATE INDEX IF NOT EXISTS idx_social_stories_user_id ON public.social_stories(user_id);

-- social_story_views
CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON public.social_story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON public.social_story_views(viewer_id);

-- social_story_reactions
CREATE INDEX IF NOT EXISTS idx_story_reactions_story_id ON public.social_story_reactions(story_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_user_id ON public.social_story_reactions(user_id);

-- social_reels
CREATE INDEX IF NOT EXISTS idx_social_reels_author_id ON public.social_reels(author_id);

-- social_media
CREATE INDEX IF NOT EXISTS idx_social_media_user_id ON public.social_media(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5: XP & REWARDS FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- xp_ledger
CREATE INDEX IF NOT EXISTS idx_xp_ledger_user_id ON public.xp_ledger(user_id);

-- xp_logs
CREATE INDEX IF NOT EXISTS idx_xp_logs_user_id ON public.xp_logs(user_id);

-- xp_transactions
CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_id ON public.xp_transactions(user_id);

-- xp_vault
CREATE INDEX IF NOT EXISTS idx_xp_vault_user_id ON public.xp_vault(user_id);

-- social_xp_log
CREATE INDEX IF NOT EXISTS idx_social_xp_log_user_id ON public.social_xp_log(user_id);

-- social_diamond_rewards
CREATE INDEX IF NOT EXISTS idx_social_diamond_rewards_user_id ON public.social_diamond_rewards(user_id);

-- diamond_ledger
CREATE INDEX IF NOT EXISTS idx_diamond_ledger_user_id ON public.diamond_ledger(user_id);

-- reward_claims
CREATE INDEX IF NOT EXISTS idx_reward_claims_user_id ON public.reward_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_claims_reward_id ON public.reward_claims(reward_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6: POKER GAME ENGINE FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- game_tables
CREATE INDEX IF NOT EXISTS idx_game_tables_club_id ON public.game_tables(club_id);

-- table_seats
CREATE INDEX IF NOT EXISTS idx_table_seats_table_id ON public.table_seats(table_id);
CREATE INDEX IF NOT EXISTS idx_table_seats_user_id ON public.table_seats(user_id);
CREATE INDEX IF NOT EXISTS idx_table_seats_player_id ON public.table_seats(player_id);

-- hand_history
CREATE INDEX IF NOT EXISTS idx_hand_history_user_id ON public.hand_history(user_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_table_id ON public.hand_history(table_id);

-- poker_transactions
CREATE INDEX IF NOT EXISTS idx_poker_transactions_user_id ON public.poker_transactions(user_id);

-- tournament_registrations
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user_id ON public.tournament_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament_id ON public.tournament_registrations(tournament_id);

-- tournaments.club_id
CREATE INDEX IF NOT EXISTS idx_tournaments_club_id ON public.tournaments(club_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7: CLUBS FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- club_members
CREATE INDEX IF NOT EXISTS idx_club_members_club_id ON public.club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user_id ON public.club_members(user_id);

-- clubs.owner_id
CREATE INDEX IF NOT EXISTS idx_clubs_owner_id ON public.clubs(owner_id);

-- player_wallets
CREATE INDEX IF NOT EXISTS idx_player_wallets_club_id ON public.player_wallets(club_id);
CREATE INDEX IF NOT EXISTS idx_player_wallets_user_id ON public.player_wallets(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8: GOD MODE TRAINING FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- god_mode_hand_history
CREATE INDEX IF NOT EXISTS idx_god_mode_hand_history_user_id ON public.god_mode_hand_history(user_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_hand_history_game_id ON public.god_mode_hand_history(game_id);

-- god_mode_leaderboard
CREATE INDEX IF NOT EXISTS idx_god_mode_leaderboard_user_id ON public.god_mode_leaderboard(user_id);

-- god_mode_user_session
CREATE INDEX IF NOT EXISTS idx_god_mode_user_session_user_id ON public.god_mode_user_session(user_id);

-- drill_sessions
CREATE INDEX IF NOT EXISTS idx_drill_sessions_user_id ON public.drill_sessions(user_id);

-- drill_performance
CREATE INDEX IF NOT EXISTS idx_drill_performance_user_id ON public.drill_performance(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 9: LIVE STREAMING FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- live_streams
CREATE INDEX IF NOT EXISTS idx_live_streams_host_id ON public.live_streams(host_id);

-- live_viewers
CREATE INDEX IF NOT EXISTS idx_live_viewers_stream_id ON public.live_viewers(stream_id);
CREATE INDEX IF NOT EXISTS idx_live_viewers_user_id ON public.live_viewers(user_id);

-- live_signaling
CREATE INDEX IF NOT EXISTS idx_live_signaling_stream_id ON public.live_signaling(stream_id);
CREATE INDEX IF NOT EXISTS idx_live_signaling_from_user_id ON public.live_signaling(from_user_id);
CREATE INDEX IF NOT EXISTS idx_live_signaling_to_user_id ON public.live_signaling(to_user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 10: UNIONS FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- union_clubs
CREATE INDEX IF NOT EXISTS idx_union_clubs_union_id ON public.union_clubs(union_id);
CREATE INDEX IF NOT EXISTS idx_union_clubs_club_id ON public.union_clubs(club_id);

-- union_admins
CREATE INDEX IF NOT EXISTS idx_union_admins_union_id ON public.union_admins(union_id);
CREATE INDEX IF NOT EXISTS idx_union_admins_user_id ON public.union_admins(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 11: HORSE AI FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- horse_poker_sessions
CREATE INDEX IF NOT EXISTS idx_horse_poker_sessions_horse_id ON public.horse_poker_sessions(horse_id);

-- horse_poker_decisions
CREATE INDEX IF NOT EXISTS idx_horse_poker_decisions_session_id ON public.horse_poker_decisions(session_id);

-- horse_poker_stats
CREATE INDEX IF NOT EXISTS idx_horse_poker_stats_horse_id ON public.horse_poker_stats(horse_id);

-- horse_memory
CREATE INDEX IF NOT EXISTS idx_horse_memory_horse_id ON public.horse_memory(horse_id);

-- horse_personality
CREATE INDEX IF NOT EXISTS idx_horse_personality_horse_id ON public.horse_personality(horse_id);

-- horse_topic_cooldowns
CREATE INDEX IF NOT EXISTS idx_horse_topic_cooldowns_horse_id ON public.horse_topic_cooldowns(horse_id);

-- persona_posts
CREATE INDEX IF NOT EXISTS idx_persona_posts_persona_id ON public.persona_posts(persona_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 12: CONTENT & ACTIVITY FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- orb_activity_log
CREATE INDEX IF NOT EXISTS idx_orb_activity_log_orb_id ON public.orb_activity_log(orb_id);
CREATE INDEX IF NOT EXISTS idx_orb_activity_log_user_id ON public.orb_activity_log(user_id);

-- orb_activity_ledger
CREATE INDEX IF NOT EXISTS idx_orb_activity_ledger_orb_id ON public.orb_activity_ledger(orb_id);

-- credit_assignments
CREATE INDEX IF NOT EXISTS idx_credit_assignments_agent_id ON public.credit_assignments(agent_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 13: POKER VENUES & EVENTS FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- poker_events
CREATE INDEX IF NOT EXISTS idx_poker_events_venue_id ON public.poker_events(venue_id);
CREATE INDEX IF NOT EXISTS idx_poker_events_series_id ON public.poker_events(series_id);

-- poker_tournaments
CREATE INDEX IF NOT EXISTS idx_poker_tournaments_venue_id ON public.poker_tournaments(venue_id);
CREATE INDEX IF NOT EXISTS idx_poker_tournaments_series_id ON public.poker_tournaments(series_id);

-- venue_daily_tournaments
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_venue_id ON public.venue_daily_tournaments(venue_id);

-- tournament_series
CREATE INDEX IF NOT EXISTS idx_tournament_series_venue_id ON public.tournament_series(venue_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 14: COMPOSITE INDEXES FOR COMMON QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Social feed queries (posts by author, sorted by date)
CREATE INDEX IF NOT EXISTS idx_social_posts_author_created ON public.social_posts(author_id, created_at DESC);

-- Notifications (user's unread notifications)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read) WHERE read = false;

-- XP transactions (recent user transactions)
CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_created ON public.xp_transactions(user_id, created_at DESC);

-- Diamond ledger (recent user transactions)
CREATE INDEX IF NOT EXISTS idx_diamond_ledger_user_created ON public.diamond_ledger(user_id, created_at DESC);

-- Story views (stories viewed by user)
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_created ON public.social_story_views(viewer_id, viewed_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually to check)
-- ═══════════════════════════════════════════════════════════════════════════

-- Check for tables with foreign keys but no index:
-- SELECT
--     tc.table_name,
--     kcu.column_name,
--     ccu.table_name AS foreign_table_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--     ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--     ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--     AND tc.table_schema = 'public'
--     AND NOT EXISTS (
--         SELECT 1 FROM pg_indexes
--         WHERE tablename = tc.table_name
--         AND indexdef LIKE '%' || kcu.column_name || '%'
--     );
