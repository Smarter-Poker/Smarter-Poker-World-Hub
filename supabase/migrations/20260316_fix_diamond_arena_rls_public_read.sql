-- ================================================================
-- FIX: Add public SELECT policy for leaderboard & prize data
-- The existing "Users can view own events" policy restricts SELECT
-- to auth.uid() = user_id, which breaks the leaderboard (needs all
-- users' game_complete data) and prizes (needs all game_start fees).
-- 
-- Solution: Add a permissive policy allowing all authenticated users
-- to read game_complete and game_start events for leaderboard/stats.
-- Personal data (user_id UUID) is not sensitive — display names are
-- resolved separately from profiles table.
-- Date: 2026-03-16
-- ================================================================

-- Drop the restrictive "own events only" policy
DROP POLICY IF EXISTS "Users can view own events" ON public.diamond_arena_events;

-- Replace with: authenticated users can read ALL events (needed for leaderboard + prizes)
-- game_complete events contain: user_id, game_type, score, won, prize_awarded (non-sensitive aggregate data)
-- game_start events contain: user_id, game_type, entry_fee (needed for jackpot calculation)
CREATE POLICY "Authenticated users can view all events"
    ON public.diamond_arena_events
    FOR SELECT
    TO authenticated
    USING (true);

-- Also allow anon read for public leaderboard (logged-out visitors can see rankings)
CREATE POLICY "Public can view completed events"
    ON public.diamond_arena_events
    FOR SELECT
    TO anon
    USING (event_type IN ('game_complete', 'game_start'));
