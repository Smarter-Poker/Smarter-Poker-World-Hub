-- Phase 43 add — restore 11 user-facing realtime tables to publication
-- Bug-hunt found these had subscribers in code but were NOT in supabase_realtime
-- → silent live-update breakage for trivia bracket, messenger group chat + calls,
--   live poker table chat, spectator chat, diamond arena schedule, commander
--   leaderboards/leagues, training leaderboard, venue live-tables feed.
-- Applied via Supabase MCP on 2026-05-03.
ALTER PUBLICATION supabase_realtime ADD TABLE
    public.trivia_tournaments,
    public.trivia_tournament_rounds,
    public.messenger_messages,
    public.messenger_call_signals,
    public.table_chat,
    public.session_chat_messages,
    public.diamond_arena_events,
    public.commander_leaderboard_entries,
    public.commander_leagues,
    public.training_leaderboard,
    public.venue_live_tables;
