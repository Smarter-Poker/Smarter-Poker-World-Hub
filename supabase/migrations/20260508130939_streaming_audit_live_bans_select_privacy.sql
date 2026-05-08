-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_audit_live_bans_select_privacy
-- Version:   20260508130939
-- Applied:   2026-05-08 via Supabase MCP apply_migration
-- Audit:     Streaming rigor audit round 2 — A5b finding
--
-- A5b (high): live_bans SELECT policy was qual=true. Anyone (including
--             other viewers, anonymous users, and adversaries) could
--             enumerate banned users for any stream — by direct REST
--             query OR by subscribing to live_bans realtime
--             postgres_changes events on a stream. Privacy leak that
--             would surface a banned user's identity to anyone who
--             could open the stream.
--
-- Fix: scope SELECT to:
--   - The banned user themself, so the R12 client-side ban subscription
--     in LiveStreamViewer.jsx still receives ban events for the
--     targeted user (so we can boot them from the room).
--   - The broadcaster of the stream, so their moderation UI can list
--     banned users.
--   - Service-role bypass intact (used by /api/live/moderate.js to read
--     bans for moderation summaries).
--
-- Verified: R12's realtime subscription still fires for the banned
-- user (their own row matches the new policy). Viewers cannot enumerate
-- other viewers' bans. Anonymous users see nothing.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS lb_sel ON public.live_bans;
CREATE POLICY lb_sel
  ON public.live_bans
  FOR SELECT
  USING (
    (SELECT auth.uid()) = banned_user_id
    OR EXISTS (
      SELECT 1 FROM public.live_streams s
      WHERE s.id = live_bans.stream_id
        AND s.broadcaster_id = (SELECT auth.uid())
    )
  );

COMMENT ON POLICY lb_sel ON public.live_bans IS
  'A5b fix: ban list is private. Only the banned user (so realtime ban subscription in viewer works) and the broadcaster (for moderation UI) can read. Service-role moderate.js bypass intact for cross-cutting moderation operations.';
