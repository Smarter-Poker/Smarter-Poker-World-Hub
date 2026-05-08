-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_audit_live_comments_select_block_filter_and_zombie_stream_guard
-- Version:   20260508003119
-- Applied:   2026-05-07 via Supabase MCP apply_migration
-- Audit:     Streaming 4-pass rigor audit
--
-- Findings
--   A5 (high): live_comments SELECT policy was qual=true. Mutual-block filter
--              was applied client-side only — Realtime postgres_changes +
--              direct REST queries bypassed it. An adversary subscribing
--              directly to postgres_changes received raw INSERTs from users
--              who had blocked them. Fix: enforce the mutual-block filter
--              at the RLS layer so Realtime + REST + the client filter all
--              respect it consistently.
--
--   E5 (medium): no UNIQUE constraint preventing one broadcaster from
--                owning multiple status='live' rows. Two-tab Go Live race
--                produced zombie streams. Partial UNIQUE INDEX seals it
--                at the DB layer; LiveStreamService surfaces the resulting
--                23505 unique_violation as a friendly "you're already live
--                in another tab" message.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- A5: live_comments SELECT — mutual-block filter at RLS layer
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS lc_sel ON public.live_comments;
CREATE POLICY lc_sel
  ON public.live_comments
  FOR SELECT
  USING (
    auth.uid() IS NULL
    OR (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.live_streams s
      WHERE s.id = live_comments.stream_id 
        AND s.broadcaster_id = (SELECT auth.uid())
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.blocked_users b
        WHERE b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = live_comments.user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_users b
        WHERE b.blocker_id = live_comments.user_id AND b.blocked_id = (SELECT auth.uid())
      )
    )
  );

COMMENT ON POLICY lc_sel ON public.live_comments IS
  'A5 fix: mutual-block filter enforced at RLS layer so Realtime postgres_changes payloads also respect blocks. Broadcaster sees all comments in their own stream (for moderation). Service-role bypass intact for server-side moderation paths.';

-- ───────────────────────────────────────────────────────────────────────────
-- E5: prevent multi-tab dup live broadcasts via partial unique index
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname='public' AND indexname='live_streams_one_live_per_broadcaster'
  ) THEN
    CREATE UNIQUE INDEX live_streams_one_live_per_broadcaster
      ON public.live_streams (broadcaster_id)
      WHERE status = 'live';
  END IF;
END $$;

COMMENT ON INDEX public.live_streams_one_live_per_broadcaster IS
  'E5 fix: partial unique index — at most one live row per broadcaster. Prevents dup-tab zombie streams. Second concurrent Go Live raises unique_violation (23505) which LiveStreamService surfaces to the user.';
