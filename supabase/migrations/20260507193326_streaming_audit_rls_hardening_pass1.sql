-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_audit_rls_hardening_pass1
-- Version:   20260507193326
-- Applied:   2026-05-07 via Supabase MCP apply_migration
-- Audit:     Streaming audit pass — proactive RLS sweep after PR #240 + #244
--
-- Findings (verified line-by-line via pg_policies introspection):
--   A2: live_streams UPDATE policy had no with_check — broadcaster could
--       transplant their stream onto another user's id via direct UPDATE.
--   A3: live_streams UPDATE allowed broadcaster to mutate server-managed
--       metric columns (viewer_count, peak_viewers, reaction_count,
--       started_at, ended_at, livekit_room) for clout fraud.
--   A4: live_comments INSERT policy did not check live_bans — banned users
--       could still post comments via direct DB insert (moderation bypass).
--   A5: live_reactions INSERT policy same gap.
--
-- A1 (live_stream_analytics view) was a FALSE POSITIVE during audit — it
-- exists as a VIEW (relkind='v'); my earlier table query filtered to
-- relkind='r' and missed it.
--
-- See pass2 migration for the trigger relaxation that allows the
-- legitimate broadcaster-side writes (status, ended_at, livekit_room) to
-- continue working from client code while still blocking the metric-fraud
-- columns.
-- ═══════════════════════════════════════════════════════════════════════════

-- A2 + A3: live_streams UPDATE guard trigger
CREATE OR REPLACE FUNCTION public.fn_live_streams_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  is_end_user boolean := current_user = 'authenticated';
BEGIN
  IF NEW.broadcaster_id IS DISTINCT FROM OLD.broadcaster_id THEN
    RAISE EXCEPTION 'broadcaster_id is immutable' USING ERRCODE = '42501';
  END IF;

  IF is_end_user THEN
    IF NEW.viewer_count    IS DISTINCT FROM OLD.viewer_count    THEN
      RAISE EXCEPTION 'viewer_count is server-managed' USING ERRCODE = '42501';
    END IF;
    IF NEW.peak_viewers    IS DISTINCT FROM OLD.peak_viewers    THEN
      RAISE EXCEPTION 'peak_viewers is server-managed' USING ERRCODE = '42501';
    END IF;
    IF NEW.reaction_count  IS DISTINCT FROM OLD.reaction_count  THEN
      RAISE EXCEPTION 'reaction_count is server-managed' USING ERRCODE = '42501';
    END IF;
    IF NEW.started_at      IS DISTINCT FROM OLD.started_at      THEN
      RAISE EXCEPTION 'started_at is server-managed' USING ERRCODE = '42501';
    END IF;
    IF NEW.ended_at        IS DISTINCT FROM OLD.ended_at        THEN
      RAISE EXCEPTION 'ended_at is server-managed' USING ERRCODE = '42501';
    END IF;
    IF NEW.livekit_room    IS DISTINCT FROM OLD.livekit_room    THEN
      RAISE EXCEPTION 'livekit_room is server-managed' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_live_streams_guard_update ON public.live_streams;
CREATE TRIGGER trg_live_streams_guard_update
  BEFORE UPDATE ON public.live_streams
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_live_streams_guard_update();

-- Belt-and-suspenders: tighten RLS UPDATE policy with_check
DROP POLICY IF EXISTS "Users can update own streams" ON public.live_streams;
CREATE POLICY "Users can update own streams"
  ON public.live_streams
  FOR UPDATE
  USING ((SELECT auth.uid()) = broadcaster_id)
  WITH CHECK ((SELECT auth.uid()) = broadcaster_id);

-- A4: live_comments INSERT — block banned users
DROP POLICY IF EXISTS lc_ins ON public.live_comments;
CREATE POLICY lc_ins
  ON public.live_comments
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.live_bans b
      WHERE b.stream_id = live_comments.stream_id
        AND b.banned_user_id = (SELECT auth.uid())
    )
  );

-- A5: live_reactions INSERT — block banned users
DROP POLICY IF EXISTS live_reactions_insert ON public.live_reactions;
CREATE POLICY live_reactions_insert
  ON public.live_reactions
  FOR INSERT
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.live_bans b
      WHERE b.stream_id = live_reactions.stream_id
        AND b.banned_user_id = (SELECT auth.uid())
    )
  );
