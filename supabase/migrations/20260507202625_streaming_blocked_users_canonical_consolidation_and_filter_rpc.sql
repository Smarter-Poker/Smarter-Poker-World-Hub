-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_blocked_users_canonical_consolidation_and_filter_rpc
-- Version:   20260507202625
-- Applied:   2026-05-07 via Supabase MCP apply_migration
-- Audit:     Streaming + blocks integration audit
--
-- Findings (verified line-by-line via grep + pg_proc introspection):
--   B1: 1 orphaned row in user_blocks not synced to canonical blocked_users
--       (writer in pages/hub/user/[username].js was hitting wrong table)
--   B3: LiveStreamService.getLiveStreams returned streams from blocked
--       broadcasters — no block filter on the social feed Live Now section
--   B4: LiveStreamViewer comment query showed messages from users the
--       viewer had blocked OR who had blocked the viewer
--
-- B2 (writer site fix in pages/hub/user/[username].js to write to canonical
-- blocked_users table) is a code-only change; no SQL needed for it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- B1: One-shot orphan migration
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.blocked_users (blocker_id, blocked_id, created_at)
SELECT ub.blocker_id, ub.blocked_id, ub.created_at
FROM public.user_blocks ub
LEFT JOIN public.blocked_users bu
  ON bu.blocker_id = ub.blocker_id AND bu.blocked_id = ub.blocked_id
WHERE bu.id IS NULL
ON CONFLICT (blocker_id, blocked_id) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────────
-- B3: get_visible_live_streams() — replaces LiveStreamService.getLiveStreams
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_visible_live_streams()
RETURNS TABLE (
  id                    uuid,
  broadcaster_id        uuid,
  title                 text,
  description           text,
  thumbnail_url         text,
  preview_clip_url      text,
  preview_updated_at    timestamptz,
  status                text,
  viewer_count          integer,
  peak_viewers          integer,
  reaction_count        integer,
  category              text,
  started_at            timestamptz,
  livekit_room          text,
  broadcaster_username  text,
  broadcaster_full_name text,
  broadcaster_avatar    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 
    s.id, s.broadcaster_id, s.title, s.description, s.thumbnail_url,
    s.preview_clip_url, s.preview_updated_at, s.status, s.viewer_count,
    s.peak_viewers, s.reaction_count, s.category, s.started_at, s.livekit_room,
    p.username, p.full_name, p.avatar_url
  FROM public.live_streams s
  LEFT JOIN public.profiles p ON p.id = s.broadcaster_id
  WHERE s.status = 'live'
    AND (
      auth.uid() IS NULL
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.blocked_users b
          WHERE b.blocker_id = auth.uid() AND b.blocked_id = s.broadcaster_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.blocked_users b
          WHERE b.blocker_id = s.broadcaster_id AND b.blocked_id = auth.uid()
        )
      )
    )
  ORDER BY s.started_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_visible_live_streams() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visible_live_streams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_live_streams() TO anon;

COMMENT ON FUNCTION public.get_visible_live_streams IS
  'Live-feed list excluding mutually-blocked broadcaster/viewer pairs. Replaces LiveStreamService.getLiveStreams direct SELECT. Anonymous (auth.uid() IS NULL) callers get the unfiltered list to preserve existing public-read behaviour.';


-- ───────────────────────────────────────────────────────────────────────────
-- B4: get_visible_live_comments() — replaces LiveStreamViewer comment query
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_visible_live_comments(
  p_stream_id uuid,
  p_limit     integer DEFAULT 50,
  p_before    timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  stream_id   uuid,
  user_id     uuid,
  author_name text,
  text        text,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT lc.id, lc.stream_id, lc.user_id, lc.author_name, lc.text, lc.created_at
  FROM public.live_comments lc
  WHERE lc.stream_id = p_stream_id
    AND (p_before IS NULL OR lc.created_at < p_before)
    AND (
      auth.uid() IS NULL
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.blocked_users b
          WHERE b.blocker_id = auth.uid() AND b.blocked_id = lc.user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.blocked_users b
          WHERE b.blocker_id = lc.user_id AND b.blocked_id = auth.uid()
        )
      )
    )
  ORDER BY lc.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$function$;

REVOKE ALL ON FUNCTION public.get_visible_live_comments(uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visible_live_comments(uuid, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_live_comments(uuid, integer, timestamptz) TO anon;

COMMENT ON FUNCTION public.get_visible_live_comments IS
  'Paginated live-stream comments excluding mutually-blocked (caller, author) pairs. Used by LiveStreamViewer.';


-- ───────────────────────────────────────────────────────────────────────────
-- Defense-in-depth: unique constraint on blocked_users so duplicate inserts
-- can't pile up and so the ON CONFLICT clause above is honored.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'blocked_users'
      AND c.contype = 'u'
      AND c.conname = 'blocked_users_blocker_blocked_uniq'
  ) THEN
    ALTER TABLE public.blocked_users
      ADD CONSTRAINT blocked_users_blocker_blocked_uniq
      UNIQUE (blocker_id, blocked_id);
  END IF;
END$$;
