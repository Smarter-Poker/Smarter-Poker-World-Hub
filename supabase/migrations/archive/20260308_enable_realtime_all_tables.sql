-- ================================================================
-- MIGRATION: Enable Supabase Realtime for all subscribed tables
-- Run in Supabase SQL Editor: Dashboard > SQL Editor > New Query
-- Date: 2026-03-08
-- ================================================================
-- These tables have active postgres_changes subscriptions in the
-- frontend codebase. They must be added to the supabase_realtime
-- publication so the DB change events are broadcast.
-- ================================================================

-- Core Club Arena tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS agents;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS cashout_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS chip_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS club_members;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS club_shop_items;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS club_shop_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS club_tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS clubs;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS tables;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS settlement_periods;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS tournament_registrations;

-- Union tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS unions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS union_admins;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS union_clubs;

-- Arcade
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS arcade_duel_queue;

-- Profiles
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS profiles;

-- Commander tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_checkins;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_club_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_comp_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_comp_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_dealer_rotations;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_games;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_home_games;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_home_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_home_members;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_home_rsvps;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_members;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_player_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_promotions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_service_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_staff_shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_table_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS commander_waitlist;

-- Social & Messaging
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS follows;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS social_interactions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS social_page_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS social_pages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS social_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS social_reels;

-- Bankroll
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS bankroll_ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS bankroll_trips;

-- Training / Trivia / Games
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS daily_trivia_plays;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS diamond_arena_events;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS diamond_arena_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS hand_histories;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS jarvis_training_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS memory_game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS memory_leaderboards;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS orders;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS training_streaks;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS trivia_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS trivia_streaks;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS trivia_survival_runs;

-- ================================================================
-- RLS POLICIES: Ensure all realtime-enabled tables allow the
-- authenticated user to see their own rows via SELECT policies.
-- These are additive (IF NOT EXISTS guards).
-- ================================================================

-- club_members: users can see their own membership
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'club_members' AND policyname = 'Members can read own club memberships'
  ) THEN
    CREATE POLICY "Members can read own club memberships" ON club_members
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- agents: agents can read own row
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agents' AND policyname = 'Agents can read own agent row'
  ) THEN
    CREATE POLICY "Agents can read own agent row" ON agents
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- cashout_requests: users can see own requests
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cashout_requests' AND policyname = 'Users can read own cashout requests'
  ) THEN
    CREATE POLICY "Users can read own cashout requests" ON cashout_requests
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- tournament_registrations: users can see own registrations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tournament_registrations' AND policyname = 'Users can read own tournament registrations'
  ) THEN
    CREATE POLICY "Users can read own tournament registrations" ON tournament_registrations
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- ================================================================
-- PERFORMANCE: Indexes for realtime filter columns
-- Supabase realtime filters hit the DB on every change event.
-- These indexes prevent seq scans on filtered subscriptions.
-- ================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_club_user ON agents (club_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cashout_requests_club ON cashout_requests (club_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chip_transactions_club ON chip_transactions (club_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tournament_regs_user ON tournament_registrations (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tournament_regs_tournament ON tournament_registrations (tournament_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settlement_periods_club ON settlement_periods (club_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_union_clubs_union ON union_clubs (union_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_union_admins_union ON union_admins (union_id);
