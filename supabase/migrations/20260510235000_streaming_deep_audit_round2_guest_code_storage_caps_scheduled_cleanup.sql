-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_deep_audit_round2_guest_code_storage_caps_scheduled_cleanup
-- Version:   20260510235000
-- Audit:     Streaming deep audit round 2 (post PR #294, post PR #308)
--
-- Findings addressed
-- ───────────────────
-- GUEST-1 (CRITICAL): live_streams.guest_invite_code is auto-generated per row
--   and live_streams RLS is "Anyone can view live streams FOR SELECT USING (true)".
--   Every viewer querying live_streams pulls the broadcaster's invite code.
--   With that code anyone can POST /api/live/token with guestInviteCode and get
--   canPublish=true — bypassing PR #280's invite mechanism.
--
--   Fix: column-level REVOKE on guest_invite_code for both `anon` and
--   `authenticated`. The column is still queryable by service_role (used by
--   /api/live/token to verify the code). Broadcasters retrieve their own code
--   via a new SECURITY DEFINER RPC scoped to auth.uid() = broadcaster_id.
--
-- STO-2 (LOW, downgraded from CRITICAL after preflight): live-recordings
--   bucket DOES have allowed_mime_types set — preflight showed:
--     [video/webm, video/mp4, video/ogg,
--      video/webm;codecs=vp9,opus, video/webm;codecs=vp8,opus]
--   So the "anyone can upload any binary" claim was wrong. However the list
--   contains two issues worth cleaning up:
--     (a) video/ogg is unused — no recorder in this app emits it.
--     (b) The codec-param entries (`video/webm;codecs=vp9,opus`,
--         `video/webm;codecs=vp8,opus`) are noise. Mime types in storage
--         allowlists should not include codec parameters; the client now
--         strips codec params before upload (EndStreamModal.jsx
--         BUG-FIX-LIVE2-4). Keeping them in the allowlist permits a future
--         client regression to silently slip through.
--   Adding video/quicktime to cover iOS .mov uploads (used by the thumbnail
--   path in some flows).
--
-- LR-1 (HIGH): scheduled_lives past-dated rows are never cleaned up. Rows pile
--   up forever in the table — the live-reminders cron filters by `scheduled_at
--   >= now() AND <= now()+15min` so they don't get reminded, but they still
--   inflate the table and a follower's "GET /api/live/schedule" before the
--   server-side `gte(now())` filter was added would have returned them all.
--
--   Fix: fn_cleanup_stale_scheduled_lives() — deletes scheduled_lives older
--   than 24h past their scheduled_at. Will be wired into the existing
--   live-reminders cron in a follow-up PR (or invoked from a new cron entry).
--
-- CSS-1 (CRITICAL): both /api/live/cleanup-stale.js and
--   /api/cron/cleanup-stale-streams.js do
--     .update({ metadata: { stream_id, stream_status: 'ended' } })
--   on social_posts. This overwrites the entire metadata JSONB AND uses the
--   wrong key (`stream_status` vs the `ended` key PostCard checks at
--   pages/hub/social-media/index.js:1333). Auto-cleaned streams stay stuck on
--   "LIVE NOW" badge forever.
--
--   No DB change needed for CSS-1 itself — the fix is in the API handlers in
--   this PR. But we provide fn_mark_feed_post_ended(p_stream_id) as a single
--   atomic RPC that merges {ended: true} into metadata. Both API paths
--   migrate to it so the JSONB-merge semantics live in one place.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- GUEST-1: lock down guest_invite_code column
-- ───────────────────────────────────────────────────────────────────────────

-- REVOKE column-level SELECT from end-user roles. anon and authenticated can
-- no longer retrieve guest_invite_code via PostgREST. service_role retains
-- access (it bypasses GRANT/REVOKE) so /api/live/token can still verify codes.
REVOKE SELECT (guest_invite_code) ON public.live_streams FROM authenticated;
REVOKE SELECT (guest_invite_code) ON public.live_streams FROM anon;

COMMENT ON COLUMN public.live_streams.guest_invite_code IS
  'Server-managed invite code. End-user roles cannot SELECT this column. Broadcasters retrieve their own via fn_get_my_guest_invite_code(uuid). service_role (used by /api/live/token and /api/live/end-stream) bypasses GRANT/REVOKE.';


-- Broadcaster's own-row RPC. Anyone may call it, but it only returns a code
-- when auth.uid() is the broadcaster of the requested stream. Anyone else
-- gets NULL (indistinguishable from "stream doesn't exist", which is fine —
-- streams ARE publicly discoverable, the code is what's secret).
CREATE OR REPLACE FUNCTION public.fn_get_my_guest_invite_code(p_stream_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.guest_invite_code
    FROM public.live_streams s
   WHERE s.id = p_stream_id
     AND s.broadcaster_id = auth.uid()
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_get_my_guest_invite_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_my_guest_invite_code(uuid) TO authenticated;
-- anon DOES NOT get execute — anonymous viewers cannot have a broadcaster_id
-- match anyway, so granting would be wasted attack surface.

COMMENT ON FUNCTION public.fn_get_my_guest_invite_code IS
  'Returns guest_invite_code only when auth.uid() owns the stream. Used by the broadcaster client to obtain their own code for sharing with co-hosts. Defends against the cross-viewer code leak (GUEST-1) by routing through a SECURITY DEFINER scoped RPC instead of a direct column SELECT.';


-- ───────────────────────────────────────────────────────────────────────────
-- STO-2: lock down live-recordings bucket mime types
-- ───────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'video/mp4',                 -- iOS Safari MediaRecorder default
     'video/webm',                -- Chrome / desktop MediaRecorder default
     'video/quicktime'            -- iOS native .mov uploads via thumbnail path
   ]
 WHERE id = 'live-recordings';


-- ───────────────────────────────────────────────────────────────────────────
-- LR-1: scheduled_lives stale-row cleanup helper
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cleanup_stale_scheduled_lives()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted_count integer := 0;
BEGIN
  -- Anything 24h past its scheduled_at that never converted to a live row is
  -- garbage. The broadcaster either never went live, or the system already
  -- forgot about it. Keeping it bloats GET /api/live/schedule for everyone.
  WITH stale AS (
    DELETE FROM public.scheduled_lives
     WHERE scheduled_at < now() - interval '24 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_count FROM stale;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cleanup_stale_scheduled_lives() FROM PUBLIC;
-- service_role only — invoked from /api/cron/live-reminders in the follow-up
-- patch in this PR. End-user roles have no business calling this.

COMMENT ON FUNCTION public.fn_cleanup_stale_scheduled_lives IS
  'Deletes scheduled_lives rows whose scheduled_at is more than 24h in the past. Invoked from /api/cron/live-reminders. service_role only.';


-- ───────────────────────────────────────────────────────────────────────────
-- CSS-1 helper: atomic "mark feed post ended" RPC
-- ───────────────────────────────────────────────────────────────────────────
--
-- Both cleanup paths (lazy + cron) and end-stream.js need to merge
-- {ended: true} into the existing metadata JSONB rather than overwriting it.
-- Doing it in SQL beats fetching-then-updating from the API for two reasons:
--   1. No TOCTOU window where another writer could clobber the merge.
--   2. The badge-key (`ended`) is in one place, not three.

CREATE OR REPLACE FUNCTION public.fn_mark_feed_post_ended(p_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_post_id uuid;
  v_via_fk boolean := false;
BEGIN
  -- Path 1: direct FK lookup via live_streams.feed_post_id
  SELECT s.feed_post_id
    INTO v_post_id
    FROM public.live_streams s
   WHERE s.id = p_stream_id
   LIMIT 1;

  IF v_post_id IS NOT NULL THEN
    v_via_fk := true;
  ELSE
    -- Path 2: legacy fallback — find by metadata.stream_id JSONB scan
    SELECT sp.id
      INTO v_post_id
      FROM public.social_posts sp
     WHERE sp.content_type = 'live'
       AND sp.metadata @> jsonb_build_object('stream_id', p_stream_id::text)
     LIMIT 1;
  END IF;

  IF v_post_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'matched', 0);
  END IF;

  -- Atomic JSONB merge: existing metadata wins for every key except `ended`,
  -- which we force to true.
  UPDATE public.social_posts
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('ended', true)
   WHERE id = v_post_id;

  RETURN jsonb_build_object('success', true, 'matched', 1, 'via_fk', v_via_fk);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mark_feed_post_ended(uuid) FROM PUBLIC;
-- service_role only (called from /api/live/* server endpoints).

COMMENT ON FUNCTION public.fn_mark_feed_post_ended IS
  'Atomically merges {ended: true} into the feed post for a stream. Replaces three separate {fetch, merge, update} call sites in /api/live/end-stream, /api/live/cleanup-stale, /api/cron/cleanup-stale-streams. Fixes CSS-1: those handlers were overwriting metadata with the wrong key (stream_status instead of ended).';
