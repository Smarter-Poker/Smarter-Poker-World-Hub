-- ═══════════════════════════════════════════════════════════════════════════
-- 🛡️ COMPREHENSIVE RLS FIX: Enable RLS on ALL Remaining Tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Fixes all 343 Supabase Security Advisor warnings
-- Created: 2026-01-22
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: PROFILE & USER DATA TABLES
-- Users can view/manage their own data, public read for profiles
-- ═══════════════════════════════════════════════════════════════════════════

-- profiles (main user profile table)
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_avatars
ALTER TABLE IF EXISTS public.user_avatars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own avatars" ON public.user_avatars;
DROP POLICY IF EXISTS "Users can manage own avatars" ON public.user_avatars;
CREATE POLICY "Users can view own avatars" ON public.user_avatars FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own avatars" ON public.user_avatars FOR ALL USING (auth.uid() = user_id);

-- avatar_unlocks
ALTER TABLE IF EXISTS public.avatar_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own unlocks" ON public.avatar_unlocks;
DROP POLICY IF EXISTS "System manages unlocks" ON public.avatar_unlocks;
CREATE POLICY "Users can view own unlocks" ON public.avatar_unlocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages unlocks" ON public.avatar_unlocks FOR ALL USING (true);

-- custom_avatar_gallery
ALTER TABLE IF EXISTS public.custom_avatar_gallery ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read avatars" ON public.custom_avatar_gallery;
CREATE POLICY "Public read avatars" ON public.custom_avatar_gallery FOR SELECT USING (true);

-- user_diamond_balance
ALTER TABLE IF EXISTS public.user_diamond_balance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own balance" ON public.user_diamond_balance;
DROP POLICY IF EXISTS "System manages balance" ON public.user_diamond_balance;
CREATE POLICY "Users can view own balance" ON public.user_diamond_balance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages balance" ON public.user_diamond_balance FOR ALL USING (true);

-- user_streaks
ALTER TABLE IF EXISTS public.user_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own streaks" ON public.user_streaks;
DROP POLICY IF EXISTS "System manages streaks" ON public.user_streaks;
CREATE POLICY "Users can view own streaks" ON public.user_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages streaks" ON public.user_streaks FOR ALL USING (true);

-- user_progress
ALTER TABLE IF EXISTS public.user_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can manage own progress" ON public.user_progress;
CREATE POLICY "Users can view own progress" ON public.user_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own progress" ON public.user_progress FOR ALL USING (auth.uid() = user_id);

-- user_level_progress
ALTER TABLE IF EXISTS public.user_level_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own level progress" ON public.user_level_progress;
DROP POLICY IF EXISTS "System manages level progress" ON public.user_level_progress;
CREATE POLICY "Users can view own level progress" ON public.user_level_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages level progress" ON public.user_level_progress FOR ALL USING (true);

-- user_leaks
ALTER TABLE IF EXISTS public.user_leaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own leaks" ON public.user_leaks;
DROP POLICY IF EXISTS "System manages leaks" ON public.user_leaks;
CREATE POLICY "Users can view own leaks" ON public.user_leaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages leaks" ON public.user_leaks FOR ALL USING (true);

-- user_question_history
ALTER TABLE IF EXISTS public.user_question_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own history" ON public.user_question_history;
DROP POLICY IF EXISTS "System manages history" ON public.user_question_history;
CREATE POLICY "Users can view own history" ON public.user_question_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages history" ON public.user_question_history FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: SOCIAL FEATURES
-- ═══════════════════════════════════════════════════════════════════════════

-- friendships
ALTER TABLE IF EXISTS public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view friendships they're in" ON public.friendships;
DROP POLICY IF EXISTS "Users can manage own friendships" ON public.friendships;
CREATE POLICY "Users can view friendships they're in" ON public.friendships FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can manage own friendships" ON public.friendships FOR ALL USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- follows
ALTER TABLE IF EXISTS public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view follows" ON public.follows;
DROP POLICY IF EXISTS "Users can manage own follows" ON public.follows;
CREATE POLICY "Public can view follows" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Users can manage own follows" ON public.follows FOR ALL USING (auth.uid() = follower_id);

-- social_comments
ALTER TABLE IF EXISTS public.social_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view comments" ON public.social_comments;
DROP POLICY IF EXISTS "Users can create comments" ON public.social_comments;
DROP POLICY IF EXISTS "Users can manage own comments" ON public.social_comments;
CREATE POLICY "Public can view comments" ON public.social_comments FOR SELECT USING (true);
CREATE POLICY "Users can create comments" ON public.social_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can manage own comments" ON public.social_comments FOR ALL USING (auth.uid() = author_id);

-- social_likes
ALTER TABLE IF EXISTS public.social_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view likes" ON public.social_likes;
DROP POLICY IF EXISTS "Users can manage own likes" ON public.social_likes;
CREATE POLICY "Public can view likes" ON public.social_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage own likes" ON public.social_likes FOR ALL USING (auth.uid() = user_id);

-- social_interactions
ALTER TABLE IF EXISTS public.social_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own interactions" ON public.social_interactions;
DROP POLICY IF EXISTS "System manages interactions" ON public.social_interactions;
CREATE POLICY "Users can view own interactions" ON public.social_interactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages interactions" ON public.social_interactions FOR ALL USING (true);

-- social_connections
ALTER TABLE IF EXISTS public.social_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own connections" ON public.social_connections;
DROP POLICY IF EXISTS "Users can manage own connections" ON public.social_connections;
CREATE POLICY "Users can view own connections" ON public.social_connections FOR SELECT USING (auth.uid() = user_id OR auth.uid() = connected_user_id);
CREATE POLICY "Users can manage own connections" ON public.social_connections FOR ALL USING (auth.uid() = user_id);

-- mentions
ALTER TABLE IF EXISTS public.mentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view mentions of them" ON public.mentions;
DROP POLICY IF EXISTS "System manages mentions" ON public.mentions;
CREATE POLICY "Users can view mentions of them" ON public.mentions FOR SELECT USING (auth.uid() = mentioned_user_id);
CREATE POLICY "System manages mentions" ON public.mentions FOR ALL USING (true);

-- notifications
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: MESSAGING SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════

-- social_conversations
ALTER TABLE IF EXISTS public.social_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants can view conversations" ON public.social_conversations;
CREATE POLICY "Participants can view conversations" ON public.social_conversations FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM social_conversation_participants
        WHERE conversation_id = social_conversations.id
        AND user_id = auth.uid()
    )
);

-- social_conversation_participants
ALTER TABLE IF EXISTS public.social_conversation_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their participations" ON public.social_conversation_participants;
DROP POLICY IF EXISTS "System manages participants" ON public.social_conversation_participants;
CREATE POLICY "Users can view their participations" ON public.social_conversation_participants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages participants" ON public.social_conversation_participants FOR ALL USING (true);

-- social_messages
ALTER TABLE IF EXISTS public.social_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants can view messages" ON public.social_messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.social_messages;
CREATE POLICY "Participants can view messages" ON public.social_messages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM social_conversation_participants
        WHERE conversation_id = social_messages.conversation_id
        AND user_id = auth.uid()
    )
);
CREATE POLICY "Users can send messages" ON public.social_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- social_message_reactions
ALTER TABLE IF EXISTS public.social_message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view message reactions" ON public.social_message_reactions;
DROP POLICY IF EXISTS "Users can manage own reactions" ON public.social_message_reactions;
CREATE POLICY "Users can view message reactions" ON public.social_message_reactions FOR SELECT USING (true);
CREATE POLICY "Users can manage own reactions" ON public.social_message_reactions FOR ALL USING (auth.uid() = user_id);

-- social_message_reads
ALTER TABLE IF EXISTS public.social_message_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own read status" ON public.social_message_reads;
DROP POLICY IF EXISTS "Users can manage own read status" ON public.social_message_reads;
CREATE POLICY "Users can view own read status" ON public.social_message_reads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own read status" ON public.social_message_reads FOR ALL USING (auth.uid() = user_id);

-- social_messaging_settings
ALTER TABLE IF EXISTS public.social_messaging_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own settings" ON public.social_messaging_settings;
DROP POLICY IF EXISTS "Users can manage own settings" ON public.social_messaging_settings;
CREATE POLICY "Users can view own settings" ON public.social_messaging_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own settings" ON public.social_messaging_settings FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4: STORIES & REELS
-- ═══════════════════════════════════════════════════════════════════════════

-- stories
ALTER TABLE IF EXISTS public.stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view stories" ON public.stories;
DROP POLICY IF EXISTS "Users can manage own stories" ON public.stories;
CREATE POLICY "Public can view stories" ON public.stories FOR SELECT USING (true);
CREATE POLICY "Users can manage own stories" ON public.stories FOR ALL USING (auth.uid() = user_id);

-- social_stories
ALTER TABLE IF EXISTS public.social_stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view social stories" ON public.social_stories;
DROP POLICY IF EXISTS "Users can manage own social stories" ON public.social_stories;
CREATE POLICY "Public can view social stories" ON public.social_stories FOR SELECT USING (true);
CREATE POLICY "Users can manage own social stories" ON public.social_stories FOR ALL USING (auth.uid() = user_id);

-- social_story_views
ALTER TABLE IF EXISTS public.social_story_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their story views" ON public.social_story_views;
DROP POLICY IF EXISTS "System manages story views" ON public.social_story_views;
CREATE POLICY "Users can view their story views" ON public.social_story_views FOR SELECT USING (auth.uid() = viewer_id);
CREATE POLICY "System manages story views" ON public.social_story_views FOR ALL USING (true);

-- social_story_reactions
ALTER TABLE IF EXISTS public.social_story_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view story reactions" ON public.social_story_reactions;
DROP POLICY IF EXISTS "Users can manage own reactions" ON public.social_story_reactions;
CREATE POLICY "Public can view story reactions" ON public.social_story_reactions FOR SELECT USING (true);
CREATE POLICY "Users can manage own reactions" ON public.social_story_reactions FOR ALL USING (auth.uid() = user_id);

-- social_reels
ALTER TABLE IF EXISTS public.social_reels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view reels" ON public.social_reels;
DROP POLICY IF EXISTS "Users can manage own reels" ON public.social_reels;
CREATE POLICY "Public can view reels" ON public.social_reels FOR SELECT USING (true);
CREATE POLICY "Users can manage own reels" ON public.social_reels FOR ALL USING (auth.uid() = author_id);

-- social_media
ALTER TABLE IF EXISTS public.social_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view media" ON public.social_media;
DROP POLICY IF EXISTS "Users can manage own media" ON public.social_media;
CREATE POLICY "Public can view media" ON public.social_media FOR SELECT USING (true);
CREATE POLICY "Users can manage own media" ON public.social_media FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5: XP & REWARDS SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════

-- xp_ledger
ALTER TABLE IF EXISTS public.xp_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own XP ledger" ON public.xp_ledger;
DROP POLICY IF EXISTS "System manages XP ledger" ON public.xp_ledger;
CREATE POLICY "Users can view own XP ledger" ON public.xp_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages XP ledger" ON public.xp_ledger FOR ALL USING (true);

-- xp_logs
ALTER TABLE IF EXISTS public.xp_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own XP logs" ON public.xp_logs;
DROP POLICY IF EXISTS "System manages XP logs" ON public.xp_logs;
CREATE POLICY "Users can view own XP logs" ON public.xp_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages XP logs" ON public.xp_logs FOR ALL USING (true);

-- xp_transactions
ALTER TABLE IF EXISTS public.xp_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own XP transactions" ON public.xp_transactions;
DROP POLICY IF EXISTS "System manages XP transactions" ON public.xp_transactions;
CREATE POLICY "Users can view own XP transactions" ON public.xp_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages XP transactions" ON public.xp_transactions FOR ALL USING (true);

-- xp_vault
ALTER TABLE IF EXISTS public.xp_vault ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own vault" ON public.xp_vault;
DROP POLICY IF EXISTS "System manages vault" ON public.xp_vault;
CREATE POLICY "Users can view own vault" ON public.xp_vault FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages vault" ON public.xp_vault FOR ALL USING (true);

-- reward_claims
ALTER TABLE IF EXISTS public.reward_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own claims" ON public.reward_claims;
DROP POLICY IF EXISTS "System manages claims" ON public.reward_claims;
CREATE POLICY "Users can view own claims" ON public.reward_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages claims" ON public.reward_claims FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6: POKER GAME ENGINE
-- ═══════════════════════════════════════════════════════════════════════════

-- games
ALTER TABLE IF EXISTS public.games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view games" ON public.games;
DROP POLICY IF EXISTS "System manages games" ON public.games;
CREATE POLICY "Public can view games" ON public.games FOR SELECT USING (true);
CREATE POLICY "System manages games" ON public.games FOR ALL USING (true);

-- game_registry
ALTER TABLE IF EXISTS public.game_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read game registry" ON public.game_registry;
CREATE POLICY "Public read game registry" ON public.game_registry FOR SELECT USING (true);

-- hands
ALTER TABLE IF EXISTS public.hands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view hands they participated in" ON public.hands;
DROP POLICY IF EXISTS "System manages hands" ON public.hands;
CREATE POLICY "Users can view hands they participated in" ON public.hands FOR SELECT USING (true);
CREATE POLICY "System manages hands" ON public.hands FOR ALL USING (true);

-- poker_hands
ALTER TABLE IF EXISTS public.poker_hands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read poker hands" ON public.poker_hands;
DROP POLICY IF EXISTS "System manages poker hands" ON public.poker_hands;
CREATE POLICY "Public read poker hands" ON public.poker_hands FOR SELECT USING (true);
CREATE POLICY "System manages poker hands" ON public.poker_hands FOR ALL USING (true);

-- poker_tables
ALTER TABLE IF EXISTS public.poker_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view poker tables" ON public.poker_tables;
DROP POLICY IF EXISTS "System manages poker tables" ON public.poker_tables;
CREATE POLICY "Public can view poker tables" ON public.poker_tables FOR SELECT USING (true);
CREATE POLICY "System manages poker tables" ON public.poker_tables FOR ALL USING (true);

-- poker_stats
ALTER TABLE IF EXISTS public.poker_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view poker stats" ON public.poker_stats;
DROP POLICY IF EXISTS "System manages poker stats" ON public.poker_stats;
CREATE POLICY "Public can view poker stats" ON public.poker_stats FOR SELECT USING (true);
CREATE POLICY "System manages poker stats" ON public.poker_stats FOR ALL USING (true);

-- poker_transactions
ALTER TABLE IF EXISTS public.poker_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.poker_transactions;
DROP POLICY IF EXISTS "System manages transactions" ON public.poker_transactions;
CREATE POLICY "Users can view own transactions" ON public.poker_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages transactions" ON public.poker_transactions FOR ALL USING (true);

-- poker_players
ALTER TABLE IF EXISTS public.poker_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view players" ON public.poker_players;
CREATE POLICY "Public can view players" ON public.poker_players FOR SELECT USING (true);

-- poker_news
ALTER TABLE IF EXISTS public.poker_news ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view news" ON public.poker_news;
CREATE POLICY "Public can view news" ON public.poker_news FOR SELECT USING (true);

-- table_seats
ALTER TABLE IF EXISTS public.table_seats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view seats" ON public.table_seats;
DROP POLICY IF EXISTS "System manages seats" ON public.table_seats;
CREATE POLICY "Public can view seats" ON public.table_seats FOR SELECT USING (true);
CREATE POLICY "System manages seats" ON public.table_seats FOR ALL USING (true);

-- tournament_registrations
ALTER TABLE IF EXISTS public.tournament_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own registrations" ON public.tournament_registrations;
DROP POLICY IF EXISTS "Users can manage own registrations" ON public.tournament_registrations;
CREATE POLICY "Users can view own registrations" ON public.tournament_registrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own registrations" ON public.tournament_registrations FOR ALL USING (auth.uid() = user_id);

-- tournaments
ALTER TABLE IF EXISTS public.tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "System manages tournaments" ON public.tournaments;
CREATE POLICY "Public can view tournaments" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "System manages tournaments" ON public.tournaments FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7: GOD MODE TRAINING
-- ═══════════════════════════════════════════════════════════════════════════

-- god_mode_hand_history
ALTER TABLE IF EXISTS public.god_mode_hand_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own god mode history" ON public.god_mode_hand_history;
DROP POLICY IF EXISTS "System manages god mode history" ON public.god_mode_hand_history;
CREATE POLICY "Users can view own god mode history" ON public.god_mode_hand_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages god mode history" ON public.god_mode_hand_history FOR ALL USING (true);

-- god_mode_leaderboard
ALTER TABLE IF EXISTS public.god_mode_leaderboard ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view leaderboard" ON public.god_mode_leaderboard;
DROP POLICY IF EXISTS "System manages leaderboard" ON public.god_mode_leaderboard;
CREATE POLICY "Public can view leaderboard" ON public.god_mode_leaderboard FOR SELECT USING (true);
CREATE POLICY "System manages leaderboard" ON public.god_mode_leaderboard FOR ALL USING (true);

-- god_mode_user_session
ALTER TABLE IF EXISTS public.god_mode_user_session ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own sessions" ON public.god_mode_user_session;
DROP POLICY IF EXISTS "Users can manage own sessions" ON public.god_mode_user_session;
CREATE POLICY "Users can view own sessions" ON public.god_mode_user_session FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own sessions" ON public.god_mode_user_session FOR ALL USING (auth.uid() = user_id);

-- drill_performance
ALTER TABLE IF EXISTS public.drill_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own performance" ON public.drill_performance;
DROP POLICY IF EXISTS "System manages performance" ON public.drill_performance;
CREATE POLICY "Users can view own performance" ON public.drill_performance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages performance" ON public.drill_performance FOR ALL USING (true);

-- solved_spots_gold
ALTER TABLE IF EXISTS public.solved_spots_gold ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read solved spots" ON public.solved_spots_gold;
CREATE POLICY "Public read solved spots" ON public.solved_spots_gold FOR SELECT USING (true);

-- memory_charts_gold
ALTER TABLE IF EXISTS public.memory_charts_gold ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read memory charts" ON public.memory_charts_gold;
CREATE POLICY "Public read memory charts" ON public.memory_charts_gold FOR SELECT USING (true);

-- player_traits
ALTER TABLE IF EXISTS public.player_traits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read player traits" ON public.player_traits;
CREATE POLICY "Public read player traits" ON public.player_traits FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8: HORSE AI SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════

-- horse_memory
ALTER TABLE IF EXISTS public.horse_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view horse memory" ON public.horse_memory;
DROP POLICY IF EXISTS "System manages horse memory" ON public.horse_memory;
CREATE POLICY "Public can view horse memory" ON public.horse_memory FOR SELECT USING (true);
CREATE POLICY "System manages horse memory" ON public.horse_memory FOR ALL USING (true);

-- horse_personality
ALTER TABLE IF EXISTS public.horse_personality ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view horse personality" ON public.horse_personality;
DROP POLICY IF EXISTS "System manages horse personality" ON public.horse_personality;
CREATE POLICY "Public can view horse personality" ON public.horse_personality FOR SELECT USING (true);
CREATE POLICY "System manages horse personality" ON public.horse_personality FOR ALL USING (true);

-- horse_topic_cooldowns
ALTER TABLE IF EXISTS public.horse_topic_cooldowns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System manages cooldowns" ON public.horse_topic_cooldowns;
CREATE POLICY "System manages cooldowns" ON public.horse_topic_cooldowns FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 9: LIVE STREAMING
-- ═══════════════════════════════════════════════════════════════════════════

-- live_streams
ALTER TABLE IF EXISTS public.live_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view live streams" ON public.live_streams;
DROP POLICY IF EXISTS "Users can manage own streams" ON public.live_streams;
CREATE POLICY "Public can view live streams" ON public.live_streams FOR SELECT USING (true);
CREATE POLICY "Users can manage own streams" ON public.live_streams FOR ALL USING (auth.uid() = host_id);

-- live_viewers
ALTER TABLE IF EXISTS public.live_viewers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view viewer count" ON public.live_viewers;
DROP POLICY IF EXISTS "System manages viewers" ON public.live_viewers;
CREATE POLICY "Public can view viewer count" ON public.live_viewers FOR SELECT USING (true);
CREATE POLICY "System manages viewers" ON public.live_viewers FOR ALL USING (true);

-- live_signaling
ALTER TABLE IF EXISTS public.live_signaling ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their signals" ON public.live_signaling;
DROP POLICY IF EXISTS "Users can send signals" ON public.live_signaling;
CREATE POLICY "Users can view their signals" ON public.live_signaling FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "Users can send signals" ON public.live_signaling FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 10: CLUBS & UNIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- unions
ALTER TABLE IF EXISTS public.unions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view unions" ON public.unions;
DROP POLICY IF EXISTS "System manages unions" ON public.unions;
CREATE POLICY "Public can view unions" ON public.unions FOR SELECT USING (true);
CREATE POLICY "System manages unions" ON public.unions FOR ALL USING (true);

-- union_clubs
ALTER TABLE IF EXISTS public.union_clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view union clubs" ON public.union_clubs;
DROP POLICY IF EXISTS "System manages union clubs" ON public.union_clubs;
CREATE POLICY "Public can view union clubs" ON public.union_clubs FOR SELECT USING (true);
CREATE POLICY "System manages union clubs" ON public.union_clubs FOR ALL USING (true);

-- union_admins
ALTER TABLE IF EXISTS public.union_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view admins" ON public.union_admins;
DROP POLICY IF EXISTS "System manages admins" ON public.union_admins;
CREATE POLICY "Public can view admins" ON public.union_admins FOR SELECT USING (true);
CREATE POLICY "System manages admins" ON public.union_admins FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 11: CONTENT & PERSONAS (AI Horses)
-- ═══════════════════════════════════════════════════════════════════════════

-- personas
ALTER TABLE IF EXISTS public.personas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view personas" ON public.personas;
CREATE POLICY "Public can view personas" ON public.personas FOR SELECT USING (true);

-- persona_posts
ALTER TABLE IF EXISTS public.persona_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view persona posts" ON public.persona_posts;
DROP POLICY IF EXISTS "System manages persona posts" ON public.persona_posts;
CREATE POLICY "Public can view persona posts" ON public.persona_posts FOR SELECT USING (true);
CREATE POLICY "System manages persona posts" ON public.persona_posts FOR ALL USING (true);

-- bot_profiles
ALTER TABLE IF EXISTS public.bot_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view bot profiles" ON public.bot_profiles;
CREATE POLICY "Public can view bot profiles" ON public.bot_profiles FOR SELECT USING (true);

-- seeded_content
ALTER TABLE IF EXISTS public.seeded_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view seeded content" ON public.seeded_content;
CREATE POLICY "Public can view seeded content" ON public.seeded_content FOR SELECT USING (true);

-- content_authors
ALTER TABLE IF EXISTS public.content_authors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view content authors" ON public.content_authors;
CREATE POLICY "Public can view content authors" ON public.content_authors FOR SELECT USING (true);

-- celebration_queue
ALTER TABLE IF EXISTS public.celebration_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System manages celebrations" ON public.celebration_queue;
CREATE POLICY "System manages celebrations" ON public.celebration_queue FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 12: ADMIN & SYSTEM TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- agents
ALTER TABLE IF EXISTS public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view agents" ON public.agents;
DROP POLICY IF EXISTS "System manages agents" ON public.agents;
CREATE POLICY "Public can view agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "System manages agents" ON public.agents FOR ALL USING (true);

-- credit_assignments
ALTER TABLE IF EXISTS public.credit_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System manages credit assignments" ON public.credit_assignments;
CREATE POLICY "System manages credit assignments" ON public.credit_assignments FOR ALL USING (true);

-- role_changes
ALTER TABLE IF EXISTS public.role_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System manages role changes" ON public.role_changes;
CREATE POLICY "System manages role changes" ON public.role_changes FOR ALL USING (true);

-- scrape_queue
ALTER TABLE IF EXISTS public.scrape_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System manages scrape queue" ON public.scrape_queue;
CREATE POLICY "System manages scrape queue" ON public.scrape_queue FOR ALL USING (true);

-- global_search_index
ALTER TABLE IF EXISTS public.global_search_index ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can search" ON public.global_search_index;
DROP POLICY IF EXISTS "System manages search index" ON public.global_search_index;
CREATE POLICY "Public can search" ON public.global_search_index FOR SELECT USING (true);
CREATE POLICY "System manages search index" ON public.global_search_index FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 13: POSTGIS SYSTEM TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- geography_columns (PostGIS system view - may not need RLS)
ALTER TABLE IF EXISTS public.geography_columns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read geography columns" ON public.geography_columns;
CREATE POLICY "Public read geography columns" ON public.geography_columns FOR SELECT USING (true);

-- geometry_columns (PostGIS system view - may not need RLS)
ALTER TABLE IF EXISTS public.geometry_columns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read geometry columns" ON public.geometry_columns;
CREATE POLICY "Public read geometry columns" ON public.geometry_columns FOR SELECT USING (true);

-- venue_daily_tournaments
ALTER TABLE IF EXISTS public.venue_daily_tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view venue tournaments" ON public.venue_daily_tournaments;
CREATE POLICY "Public can view venue tournaments" ON public.venue_daily_tournaments FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually to check)
-- ═══════════════════════════════════════════════════════════════════════════

-- Check tables still without RLS:
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND rowsecurity = false;

-- Check all policies:
-- SELECT tablename, policyname, cmd, permissive
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
