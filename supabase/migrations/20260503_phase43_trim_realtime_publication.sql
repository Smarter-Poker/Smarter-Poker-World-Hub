-- Phase 43 — trim realtime publication (audit-trail copy)
-- Dropped 15 zero-anon-subscriber tables from supabase_realtime publication.
-- Already applied via Supabase MCP on 2026-05-03.
-- See Cowork artifact `realtime-publication-audit` for the per-table analysis.
-- Reverse with: ALTER PUBLICATION supabase_realtime ADD TABLE public.<X>;
ALTER PUBLICATION supabase_realtime DROP TABLE
    public.financial_alerts,
    public.commander_members,
    public.conversations,
    public.commander_promotions,
    public.cashout_requests,
    public.club_arena_audit_logs,
    public.commander_home_poll_votes,
    public.commander_home_polls,
    public.commander_home_post_comments,
    public.commander_home_post_likes,
    public.follows,
    public.live_gifts,
    public.pending_calls,
    public.video_favorites,
    public.video_watch_history;
