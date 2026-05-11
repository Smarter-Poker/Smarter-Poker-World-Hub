-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_deep_audit_round3_viewer_heartbeat_and_ban_audit
-- Version:   20260511020000
-- Applied:   2026-05-11 via Supabase MCP apply_migration
-- Audit:     Streaming deep audit round 3 (post PR #315)
--
-- Findings addressed
-- ───────────────────
-- L-3 (HIGH): live_viewers rows live forever. There's no heartbeat from the
--   client and no cleanup on the server. Force-quit, mobile-signal drop,
--   tab crash all leave ghost viewers in the table indefinitely. Over time
--   this skews the named-viewer list shown in LiveViewerList.jsx and bloats
--   queries.
--
--   Fix: add `last_seen_at` column (defaults to now()). New
--   fn_cleanup_stale_viewers() RPC deletes live_viewers rows where
--   last_seen_at < now() - 5 minutes. Server-side broadcasters can also
--   refresh their viewer rows via the existing update path; client
--   heartbeat lands in this PR via LiveStreamService.
--
-- M-3 (HIGH): broadcaster's ban_user action does not actively disconnect
--   the banned viewer from the LiveKit room. RLS blocks the banned user
--   from inserting new comments/reactions/gifts (per round 2 + earlier),
--   but they keep watching until their token expires (8h). Bans should
--   be immediate.
--
--   No DB change needed for M-3 itself — the LiveKit RoomServiceClient
--   call lives in /api/live/moderate.js. But we add a live_ban_audit table
--   so we can see, post-mortem, that the kick was attempted, succeeded,
--   or failed. Important for incident response when a viewer disputes a
--   ban or claims it didn't apply.
--
-- M-9 (DEFERRED IN ROUND 3): co-host moderation. Defers to a separate PR
--   because the right RBAC model (co-host vs broadcaster) needs design
--   alignment with the invite-code flow. Co-hosts CAN currently publish
--   (they hold a guest_invite_code that grants canPublish via /api/live/token),
--   but they cannot moderate. We document the gap here and revisit.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- L-3: live_viewers heartbeat column + stale-row cleanup RPC
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.live_viewers
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

-- Backfill existing rows (in case the column was added with NULL default
-- on a future schema migration — defensive idempotency).
UPDATE public.live_viewers SET last_seen_at = COALESCE(last_seen_at, joined_at, now())
 WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_viewers_last_seen_at
  ON public.live_viewers (last_seen_at);

COMMENT ON COLUMN public.live_viewers.last_seen_at IS
  'Most recent heartbeat from the viewer. Refreshed every ~30s by LiveStreamService while the viewer is actively connected. fn_cleanup_stale_viewers prunes rows older than 5 minutes.';


CREATE OR REPLACE FUNCTION public.fn_cleanup_stale_viewers(p_timeout_minutes integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted_count integer := 0;
BEGIN
  -- Delete viewer rows older than p_timeout_minutes since last heartbeat.
  -- The broadcaster's StreamPreviewCapture refreshes preview_updated_at
  -- every ~25s while alive; named viewers heartbeat every ~30s from the
  -- LiveStreamService viewer loop. 5 minutes is a comfortable margin: a
  -- viewer with a 30s cellular dropout doesn't get pruned, but a tab
  -- crash 5+ minutes ago does.
  WITH stale AS (
    DELETE FROM public.live_viewers
     WHERE last_seen_at < now() - (p_timeout_minutes || ' minutes')::interval
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_count FROM stale;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'timeout_minutes', p_timeout_minutes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cleanup_stale_viewers(integer) FROM PUBLIC;
-- service_role only — invoked from /api/cron/cleanup-stale-streams (the
-- same 5-minute cron that prunes stale streams). End-user roles have no
-- business calling this.

COMMENT ON FUNCTION public.fn_cleanup_stale_viewers IS
  'Deletes live_viewers rows older than p_timeout_minutes since last_seen_at. Invoked from /api/cron/cleanup-stale-streams. service_role only. Defends against ghost viewers from force-quit / signal drop / tab crash.';


-- A SECURITY DEFINER heartbeat RPC. Lets a viewer refresh their OWN row
-- without going through PostgREST (which would require a write policy on
-- live_viewers + a column GRANT for last_seen_at). The RPC checks
-- auth.uid() == viewer_id to prevent a logged-in user from refreshing
-- someone else's row.
CREATE OR REPLACE FUNCTION public.fn_heartbeat_live_viewer(p_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthenticated');
  END IF;

  -- Idempotent upsert. The unique constraint on (stream_id, viewer_id)
  -- means INSERT … ON CONFLICT DO UPDATE refreshes last_seen_at on the
  -- existing row. last_seen_at is the only column touched on conflict.
  INSERT INTO public.live_viewers (stream_id, viewer_id, last_seen_at)
       VALUES (p_stream_id, v_user_id, now())
  ON CONFLICT (stream_id, viewer_id)
  DO UPDATE SET last_seen_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'rows', v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_heartbeat_live_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_heartbeat_live_viewer(uuid) TO authenticated;
-- anon viewers DO NOT heartbeat — they don't exist in live_viewers (the
-- table requires a profile FK). They show up in viewer_count via the
-- LiveKit-room participant count, which IS authoritative for the badge,
-- and that count is refreshed by the broadcaster's own _updateViewerCount.

COMMENT ON FUNCTION public.fn_heartbeat_live_viewer IS
  'Viewer self-heartbeat. Idempotent upsert of (stream_id, auth.uid()) with last_seen_at = now(). Used by LiveStreamService to keep the named-viewers list fresh.';


-- ───────────────────────────────────────────────────────────────────────────
-- M-3: ban audit log
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_ban_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  banned_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  livekit_kick_status text NOT NULL CHECK (livekit_kick_status IN ('attempted','succeeded','failed','skipped')),
  livekit_kick_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_ban_audit_stream ON public.live_ban_audit (stream_id);
CREATE INDEX IF NOT EXISTS idx_live_ban_audit_banned_user ON public.live_ban_audit (banned_user_id);

ALTER TABLE public.live_ban_audit ENABLE ROW LEVEL SECURITY;

-- The audit log is internal — only service_role reads it (via API endpoint
-- /api/admin/ban-audit, not yet built but the table is ready). No public
-- policies. RLS enabled with no policies means end-user roles see nothing.

COMMENT ON TABLE public.live_ban_audit IS
  'Audit trail for ban-with-LiveKit-kick attempts. Used for incident response: did the broadcaster ban this user? Did the LiveKit kick succeed? RLS-locked: service_role only.';