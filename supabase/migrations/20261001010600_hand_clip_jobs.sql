-- ═══════════════════════════════════════════════════════════════════════
-- 20261001010100_hand_clip_jobs.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (one new table with RLS and two indexes, four SECURITY
--              DEFINER functions with their grants; no existing table is
--              altered and no row is written by this file)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4, agent p9-hub),
--              Fleet Content Programme Phase 9.1 "The hand replay renderer"
-- AFFECTS:     new table: public.hand_clip_jobs (the render queue: one row per
--                hand, author and style; states queued, rendering, ready,
--                published, failed; RLS: an author reads own rows, writes go
--                through the functions, service_role manages)
--              new indexes: public.idx_hand_clip_jobs_state_created,
--                public.idx_hand_clip_jobs_author
--              new functions (all SECURITY DEFINER, search_path public):
--                fn_hand_clip_request(uuid, text)   authenticated and service_role
--                fn_hand_clip_claim()               service_role only
--                fn_hand_clip_finish(uuid, text, text, text, integer, integer,
--                  integer, integer, integer, text)  service_role only
--                fn_p9_publish_hand_clip(uuid)      service_role only
--              read at run time, never written: public.hand_history,
--                public.profiles, public.content_settings,
--                public.horse_post_modes, public.social_reels
--              written at run time by fn_p9_publish_hand_clip only: one
--                public.social_posts row per published horse clip (the
--                installed mirror trigger creates its social_reels row)
-- IRREVERSIBLE: no (the ROLLBACK block at the end drops exactly what this
--              file creates)
--
-- WHY:
--   Phase 9 renders a 15 to 40 second clip of one hand on the real Club Arena
--   felt. The renderer is a Vercel cron (/api/cron/render-hand-clips) that
--   drains ONE job per fire, so the queue has to live in the database: a
--   human presses "Share As Video" on a hand they played and the fleet route
--   enqueues one horse hand per hour. Both land here. A failed job stays
--   failed with its reason: nothing retries it; a person (or the next natural
--   request) re-queues it. Horses are players: the request function reads the
--   hand_history RLS predicate and nothing else, so a horse requesting its own
--   hand walks the same path a human does.
--
-- HOW:
--   - hand_clip_jobs: UNIQUE (hand_id, author_id, style) makes a repeat
--     request return the same row and makes the hourly fleet enqueue a no-op.
--   - fn_hand_clip_request(p_hand_id, p_style): authenticated; the caller must
--     be a player of the hand (players @> [{"userId": auth.uid()}], the same
--     predicate as hand_history_authenticated_select); inserts a queued user
--     job or returns the existing row; an existing failed row is re-queued by
--     the explicit request; ready and published rows come back unchanged.
--   - fn_hand_clip_claim(): service_role; finalises rendering rows older than
--     12 minutes as failed render_timeout (a state correction, not a retry),
--     then claims the oldest queued row with FOR UPDATE SKIP LOCKED and marks
--     it rendering. Returns NULL when the queue is empty.
--   - fn_hand_clip_finish(...): service_role; ready or failed, and only from
--     rendering. A ready finish carries the two public URLs and the measured
--     duration, size, frame count and render time (the Phase 10 measurement).
--   - fn_p9_publish_hand_clip(p_job_id): service_role; a horse job that is
--     ready, auto_publish and unpublished. The engine switch and the
--     hand_clip mode row are read first: either off returns the row unchanged
--     (the clip stays ready and unpublished, no error). The author must be a
--     horse. One social_posts row is inserted with exactly the column list
--     publish_user_video_reel uses (origin horse, playback native, rights
--     owned, topic poker, topics {poker, hand}, thumbnail = poster, metadata
--     with hand_id, hand_clip_job_id, style, publication_contract and the
--     fleet publication_key when the route supplied one); the mirror trigger
--     creates the reel, which is read back by source_post_id; the job becomes
--     published. The post text must carry no emoji, no em dash and no en dash
--     and at most 2000 characters (fail closed, the Phase 6 output law).
--   - Order of DDL: the policies are created BEFORE the foreign key to
--     profiles is added. In this database CREATE POLICY takes an exclusive
--     lock on auth.users; holding a fresh lock on profiles while asking for
--     it deadlocked the Phase 7 install twice. The end state is identical.
--
-- EVIDENCE (production kuklfnapbkmacvwxktbh, 2026-09-30, SELECT only):
--   information_schema.columns: social_posts carries author_id uuid NOT NULL,
--   content text NOT NULL (<= 2000 chars by social_posts_content_check),
--   content_type, media_urls jsonb, visibility, audience_mode, thumbnail_url,
--   metadata jsonb, topics text[], origin_type (CHECK includes horse),
--   playback_type (native), rights_status (owned), topic (poker),
--   canonical_asset_key, youtube_video_id, link_url; publication_key must
--   stay NULL outside the video library (managed_library_integrity_check).
--   pg_get_functiondef(publish_user_video_reel): the insert column list
--   mirrored here. Triggers on social_posts: trg_social_posts_video_contract
--   _defaults (service role keeps rights owned for a platform storage URL),
--   trg_social_posts_video_to_reel_mirror (AFTER INSERT creates the reel),
--   trg_social_posts_zz_derive_topics (keeps the supplied hand facet).
--   horse_post_modes: mode text PK, enabled boolean NOT NULL DEFAULT false,
--   description text NOT NULL, approved_by, approved_at, created_at.
--   content_settings: one row, engine_enabled boolean (read as the workers
--   do: ORDER BY created_at ASC LIMIT 1). profiles.is_horse boolean.
--   hand_history RLS: hand_history_authenticated_select = players @>
--   jsonb_build_array(jsonb_build_object('userId', auth.uid()::text)).
--   pg_proc: none of the four functions exists; pg_class: no hand_clip_jobs;
--   horse_post_modes: no hand_clip row.
--   Design: agent-evidence/fleet-p6-closeout-20260920/agents/p9-research/
--   design.md sections 2, 3 and 7.2 (contract C5).
-- ═══════════════════════════════════════════════════════════════════════

-- A bounded lock wait turns a busy moment into a clean, retryable failure.
SET lock_timeout = '10s';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRE-FLIGHT: everything this file reads or writes exists; nothing it
--    creates exists yet.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text;
  n int;
BEGIN
  SELECT string_agg(required.table_name || '.' || required.column_name, ', ' ORDER BY 1)
    INTO v_missing
    FROM (VALUES
      ('hand_history', 'id'), ('hand_history', 'players'), ('hand_history', 'game_variant'),
      ('hand_history', 'big_blind'), ('hand_history', 'pot_size'),
      ('profiles', 'id'), ('profiles', 'is_horse'),
      ('content_settings', 'engine_enabled'), ('content_settings', 'created_at'),
      ('horse_post_modes', 'mode'), ('horse_post_modes', 'enabled'),
      ('social_posts', 'author_id'), ('social_posts', 'content'), ('social_posts', 'content_type'),
      ('social_posts', 'media_urls'), ('social_posts', 'visibility'), ('social_posts', 'audience_mode'),
      ('social_posts', 'thumbnail_url'), ('social_posts', 'metadata'), ('social_posts', 'topics'),
      ('social_posts', 'origin_type'), ('social_posts', 'playback_type'), ('social_posts', 'topic'),
      ('social_posts', 'rights_status'), ('social_posts', 'youtube_video_id'),
      ('social_posts', 'canonical_asset_key'), ('social_posts', 'link_url'),
      ('social_reels', 'id'), ('social_reels', 'source_post_id'), ('social_reels', 'created_at')
    ) AS required(table_name, column_name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = required.table_name
        AND c.column_name = required.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: required columns missing: %', v_missing;
  END IF;

  SELECT string_agg(required.rolname, ', ' ORDER BY 1)
    INTO v_missing
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS required(rolname)
   WHERE NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = required.rolname);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: required roles missing: %', v_missing;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'auth' AND p.proname IN ('uid', 'role');
  IF n < 2 THEN
    RAISE EXCEPTION 'pre-flight failed: auth.uid() and auth.role() are required';
  END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relname = 'hand_clip_jobs';
  IF n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: public.hand_clip_jobs already exists';
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public'
     AND p.proname IN ('fn_hand_clip_request', 'fn_hand_clip_claim', 'fn_hand_clip_finish', 'fn_p9_publish_hand_clip');
  IF n <> 0 THEN
    RAISE EXCEPTION 'pre-flight failed: a Phase 9 hand clip function already exists (% found)', n;
  END IF;
END $preflight$;

-- ---------------------------------------------------------------------------
-- 2. THE QUEUE TABLE (the foreign key to profiles is added in step 4, after
--    the policies: see HOW above)
-- ---------------------------------------------------------------------------
CREATE TABLE public.hand_clip_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id uuid NOT NULL,
  author_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('horse','user')),
  style text NOT NULL DEFAULT 'felt-720p' CHECK (style IN ('felt-720p')),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','rendering','ready','published','failed')),
  auto_publish boolean NOT NULL DEFAULT false,
  publication_key text,
  caption text,
  requested_by uuid,
  video_url text,
  poster_url text,
  duration_ms integer,
  width integer,
  height integer,
  frames integer,
  render_ms integer,
  social_post_id uuid,
  social_reel_id uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  rendered_at timestamptz,
  published_at timestamptz,
  UNIQUE (hand_id, author_id, style)
);

CREATE INDEX idx_hand_clip_jobs_state_created ON public.hand_clip_jobs (state, created_at);
CREATE INDEX idx_hand_clip_jobs_author ON public.hand_clip_jobs (author_id, created_at DESC);

COMMENT ON TABLE public.hand_clip_jobs IS
  'Phase 9 hand clip render queue: one row per hand, author and style. States queued, rendering, ready, published, failed. Writes go through fn_hand_clip_request (authenticated), fn_hand_clip_claim, fn_hand_clip_finish and fn_p9_publish_hand_clip (service role). A failed row stays failed until a person or the next natural request re-queues it.';
COMMENT ON COLUMN public.hand_clip_jobs.kind IS 'horse: enqueued by the fleet route; user: requested by the player through fn_hand_clip_request';
COMMENT ON COLUMN public.hand_clip_jobs.auto_publish IS 'true only on horse jobs the fleet route enqueues; the renderer publishes those through fn_p9_publish_hand_clip when the mode is on';
COMMENT ON COLUMN public.hand_clip_jobs.publication_key IS 'fleet:<horse>:<slot> from the fleet route, or NULL';
COMMENT ON COLUMN public.hand_clip_jobs.caption IS 'the horse route caption; NULL for user jobs';
COMMENT ON COLUMN public.hand_clip_jobs.requested_by IS 'auth.uid() of the requesting player for user jobs';
COMMENT ON COLUMN public.hand_clip_jobs.error IS 'the short failure reason of a failed job (render_timeout, clip_too_long, clip_not_ready, clip_timeout, hero_not_in_hand, or the ffmpeg or upload error)';

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY: an author reads own rows; nobody but the functions
--    and the service role writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hand_clip_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hand_clip_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.hand_clip_jobs TO authenticated;
GRANT ALL ON TABLE public.hand_clip_jobs TO service_role;

CREATE POLICY hand_clip_jobs_author_select ON public.hand_clip_jobs
  FOR SELECT TO authenticated
  USING (author_id = (SELECT auth.uid()));

CREATE POLICY hand_clip_jobs_service_all ON public.hand_clip_jobs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. THE FOREIGN KEY (last, so the profiles lock is the last lock taken)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hand_clip_jobs
  ADD CONSTRAINT hand_clip_jobs_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);

-- ---------------------------------------------------------------------------
-- 5. REQUEST: a player asks for a clip of a hand they played
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hand_clip_request(p_hand_id uuid, p_style text DEFAULT 'felt-720p')
RETURNS public.hand_clip_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_style text := lower(btrim(COALESCE(p_style, 'felt-720p')));
  v_job public.hand_clip_jobs;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'fn_hand_clip_request requires an authenticated user';
  END IF;

  IF p_hand_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'a hand id is required';
  END IF;

  IF v_style <> 'felt-720p' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'unknown clip style';
  END IF;

  -- The hand must exist and the caller must be one of its players: the same
  -- predicate as hand_history_authenticated_select. A horse is a player.
  IF NOT EXISTS (
    SELECT 1
      FROM public.hand_history h
     WHERE h.id = p_hand_id
       AND h.players @> jsonb_build_array(jsonb_build_object('userId', v_uid::text))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'the hand does not exist or the caller is not a player of it';
  END IF;

  -- One row per hand, author and style. A failed row is re-queued by this
  -- explicit request; a queued, rendering, ready or published row comes back
  -- unchanged.
  INSERT INTO public.hand_clip_jobs (hand_id, author_id, kind, style, auto_publish, requested_by)
  VALUES (p_hand_id, v_uid, 'user', v_style, false, v_uid)
  ON CONFLICT (hand_id, author_id, style) DO UPDATE SET
    state        = CASE WHEN hand_clip_jobs.state = 'failed' THEN 'queued' ELSE hand_clip_jobs.state END,
    error        = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.error END,
    video_url    = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.video_url END,
    poster_url   = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.poster_url END,
    duration_ms  = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.duration_ms END,
    width        = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.width END,
    height       = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.height END,
    frames       = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.frames END,
    render_ms    = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.render_ms END,
    claimed_at   = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.claimed_at END,
    rendered_at  = CASE WHEN hand_clip_jobs.state = 'failed' THEN NULL ELSE hand_clip_jobs.rendered_at END,
    requested_by = CASE WHEN hand_clip_jobs.state = 'failed' THEN v_uid ELSE hand_clip_jobs.requested_by END,
    updated_at   = CASE WHEN hand_clip_jobs.state = 'failed' THEN now() ELSE hand_clip_jobs.updated_at END
  RETURNING * INTO v_job;

  RETURN v_job;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_hand_clip_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hand_clip_request(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hand_clip_request(uuid, text) IS
  'Phase 9: a player requests a clip of a hand they played (hand_history players predicate). Inserts a queued user job or returns the existing row for (hand, caller, style); a failed row is re-queued by the explicit request. Authenticated and service role.';

-- ---------------------------------------------------------------------------
-- 6. CLAIM: the renderer takes the oldest queued job
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hand_clip_claim()
RETURNS public.hand_clip_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.hand_clip_jobs;
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'fn_hand_clip_claim requires the service role';
  END IF;

  -- A render that never finished is finalised, not retried: the function has
  -- a 300 s ceiling, so a rendering row older than 12 minutes is dead.
  UPDATE public.hand_clip_jobs
     SET state = 'failed',
         error = 'render_timeout',
         updated_at = now()
   WHERE state = 'rendering'
     AND claimed_at < now() - interval '12 minutes';

  SELECT * INTO v_job
    FROM public.hand_clip_jobs
   WHERE state = 'queued'
   ORDER BY created_at ASC, id ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.hand_clip_jobs
     SET state = 'rendering',
         claimed_at = now(),
         updated_at = now()
   WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_hand_clip_claim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hand_clip_claim() TO service_role;

COMMENT ON FUNCTION public.fn_hand_clip_claim() IS
  'Phase 9: finalises rendering rows older than 12 minutes as failed render_timeout, then claims the oldest queued row (FOR UPDATE SKIP LOCKED) as rendering and returns it; NULL when the queue is empty. Service role only.';

-- ---------------------------------------------------------------------------
-- 7. FINISH: ready or failed, only from rendering
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hand_clip_finish(
  p_job_id uuid,
  p_state text,
  p_video_url text,
  p_poster_url text,
  p_duration_ms integer,
  p_width integer,
  p_height integer,
  p_frames integer,
  p_render_ms integer,
  p_error text
)
RETURNS public.hand_clip_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_state text := lower(btrim(COALESCE(p_state, '')));
  v_job public.hand_clip_jobs;
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'fn_hand_clip_finish requires the service role';
  END IF;

  IF v_state NOT IN ('ready', 'failed') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'a hand clip job finishes as ready or failed';
  END IF;

  SELECT * INTO v_job
    FROM public.hand_clip_jobs
   WHERE id = p_job_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'hand clip job not found';
  END IF;

  IF v_job.state <> 'rendering' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('only a rendering hand clip job can be finished (state %s)', v_job.state);
  END IF;

  IF v_state = 'ready' THEN
    IF NULLIF(btrim(COALESCE(p_video_url, '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(p_poster_url, '')), '') IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'a ready hand clip carries a video URL and a poster URL';
    END IF;

    UPDATE public.hand_clip_jobs
       SET state = 'ready',
           video_url = btrim(p_video_url),
           poster_url = btrim(p_poster_url),
           duration_ms = p_duration_ms,
           width = p_width,
           height = p_height,
           frames = p_frames,
           render_ms = p_render_ms,
           error = NULL,
           rendered_at = now(),
           updated_at = now()
     WHERE id = v_job.id
    RETURNING * INTO v_job;
  ELSE
    UPDATE public.hand_clip_jobs
       SET state = 'failed',
           error = left(COALESCE(NULLIF(btrim(p_error), ''), 'render_failed'), 500),
           render_ms = p_render_ms,
           updated_at = now()
     WHERE id = v_job.id
    RETURNING * INTO v_job;
  END IF;

  RETURN v_job;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_hand_clip_finish(uuid, text, text, text, integer, integer, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hand_clip_finish(uuid, text, text, text, integer, integer, integer, integer, integer, text) TO service_role;

COMMENT ON FUNCTION public.fn_hand_clip_finish(uuid, text, text, text, integer, integer, integer, integer, integer, text) IS
  'Phase 9: the renderer finishes a rendering job as ready (video URL, poster URL, duration, width, height, frames, render time) or failed (short reason). Only a rendering row can be finished. Service role only.';

-- ---------------------------------------------------------------------------
-- 8. PUBLISH: a ready horse clip becomes one native video post
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_p9_publish_hand_clip(p_job_id uuid)
RETURNS public.hand_clip_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_job public.hand_clip_jobs;
  v_engine boolean;
  v_mode boolean;
  v_is_horse boolean;
  v_content text;
  v_variant text;
  v_big_blind numeric;
  v_pot numeric;
  v_bb_text text;
  v_pot_bb text;
  v_metadata jsonb;
  v_post_id uuid;
  v_reel_id uuid;
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'fn_p9_publish_hand_clip requires the service role';
  END IF;

  SELECT * INTO v_job
    FROM public.hand_clip_jobs
   WHERE id = p_job_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'hand clip job not found';
  END IF;

  IF v_job.kind <> 'horse' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'only a horse hand clip job is published by the fleet; a player posts a clip from their own session';
  END IF;

  IF v_job.state <> 'ready' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('a hand clip job is published from ready only (state %s)', v_job.state);
  END IF;

  IF v_job.auto_publish IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'this hand clip job is not marked for publication';
  END IF;

  IF v_job.social_post_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'this hand clip job already carries a post';
  END IF;

  -- The two switches, read fail closed: an unreadable switch publishes
  -- nothing. Either off returns the row unchanged; the clip stays ready.
  SELECT s.engine_enabled INTO v_engine
    FROM public.content_settings s
   ORDER BY s.created_at ASC NULLS LAST
   LIMIT 1;

  SELECT m.enabled INTO v_mode
    FROM public.horse_post_modes m
   WHERE m.mode = 'hand_clip';

  IF v_engine IS DISTINCT FROM true OR v_mode IS DISTINCT FROM true THEN
    RETURN v_job;
  END IF;

  SELECT p.is_horse INTO v_is_horse
    FROM public.profiles p
   WHERE p.id = v_job.author_id;

  IF v_is_horse IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'hand clip publication requires a horse author';
  END IF;

  IF NULLIF(btrim(COALESCE(v_job.video_url, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(v_job.poster_url, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'a ready hand clip carries a video URL and a poster URL';
  END IF;

  -- The post text: the route caption, or a plain line from the hand row
  -- (variant, blinds, pot in big blinds). Only numbers from the row and
  -- fixed words; never a name.
  v_content := btrim(COALESCE(v_job.caption, ''));
  IF v_content = '' THEN
    SELECT h.game_variant, h.big_blind, h.pot_size
      INTO v_variant, v_big_blind, v_pot
      FROM public.hand_history h
     WHERE h.id = v_job.hand_id;

    v_variant := NULLIF(btrim(replace(COALESCE(v_variant, ''), '_', ' ')), '');
    IF v_big_blind IS NOT NULL AND v_big_blind > 0 THEN
      v_bb_text := v_big_blind::text;
      IF v_bb_text LIKE '%.%' THEN
        v_bb_text := rtrim(rtrim(v_bb_text, '0'), '.');
      END IF;
      v_pot_bb := CASE WHEN v_pot IS NOT NULL THEN round(v_pot / v_big_blind, 1)::text ELSE NULL END;
      v_content := format('Hand clip: %s at %s big blinds.', COALESCE(v_variant, 'poker'), v_bb_text);
      IF v_pot_bb IS NOT NULL THEN
        v_content := v_content || format(' Pot %s BB.', v_pot_bb);
      END IF;
    ELSE
      v_content := format('Hand clip: %s.', COALESCE(v_variant, 'poker'));
    END IF;
  END IF;

  -- The Phase 6 output law, fail closed: no em dash, no en dash, no emoji,
  -- and the social_posts content check (2000 characters).
  IF v_content ~ '[\U00002013\U00002014]' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'hand clip caption must not contain an em dash or an en dash';
  END IF;
  IF v_content ~ '[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0000FE0F]' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'hand clip caption must not contain an emoji';
  END IF;
  IF char_length(v_content) = 0 OR char_length(v_content) > 2000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'hand clip caption must contain 1 to 2000 characters';
  END IF;

  v_metadata := jsonb_build_object(
    'scheduler', 'phase9',
    'hand_id', v_job.hand_id,
    'hand_clip_job_id', v_job.id,
    'style', v_job.style,
    'publication_contract', 'p9_hand_clip'
  );
  IF NULLIF(btrim(COALESCE(v_job.publication_key, '')), '') IS NOT NULL THEN
    v_metadata := v_metadata || jsonb_build_object('publication_key', btrim(v_job.publication_key));
  END IF;

  -- The same column list publish_user_video_reel inserts. The contract trigger
  -- keeps rights owned for the service role on a platform storage URL; the
  -- mirror trigger creates the reel; the topics rule keeps the hand facet.
  INSERT INTO public.social_posts (
    author_id,
    content,
    content_type,
    media_urls,
    visibility,
    audience_mode,
    thumbnail_url,
    metadata,
    topics,
    origin_type,
    playback_type,
    topic,
    rights_status,
    youtube_video_id,
    canonical_asset_key
  ) VALUES (
    v_job.author_id,
    v_content,
    'video',
    jsonb_build_array(v_job.video_url),
    'public',
    'public',
    v_job.poster_url,
    v_metadata,
    ARRAY['poker', 'hand']::text[],
    'horse',
    'native',
    'poker',
    'owned',
    NULL,
    'native:' || md5(v_job.video_url)
  )
  RETURNING id INTO v_post_id;

  SELECT r.id INTO v_reel_id
    FROM public.social_reels r
   WHERE r.source_post_id = v_post_id
   ORDER BY r.created_at ASC NULLS LAST, r.id ASC
   LIMIT 1;

  IF v_reel_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'hand clip publication did not create a linked reel';
  END IF;

  -- The deep link is publication state (publish_user_video_reel pattern).
  UPDATE public.social_posts p
     SET link_url = '/hub/reels?id=' || v_reel_id::text
   WHERE p.id = v_post_id;

  UPDATE public.hand_clip_jobs
     SET state = 'published',
         social_post_id = v_post_id,
         social_reel_id = v_reel_id,
         published_at = now(),
         updated_at = now()
   WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_p9_publish_hand_clip(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_p9_publish_hand_clip(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_p9_publish_hand_clip(uuid) IS
  'Phase 9: publishes a ready, auto_publish horse hand clip job as one native video post (origin horse, rights owned, topic poker, topics poker and hand, thumbnail = poster) and records the post and the mirrored reel on the job. Returns the row unchanged when content_settings.engine_enabled or the hand_clip mode is off. Service role only.';

-- ---------------------------------------------------------------------------
-- 9. POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $postapply$
DECLARE
  n int;
  v_rls boolean;
  fn text;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relname = 'hand_clip_jobs';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'post-apply: hand_clip_jobs is missing or RLS is off';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hand_clip_jobs';
  IF n <> 2 THEN
    RAISE EXCEPTION 'post-apply: expected 2 policies on hand_clip_jobs, found %', n;
  END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.hand_clip_jobs'::regclass
     AND conname = 'hand_clip_jobs_author_id_fkey' AND contype = 'f';
  IF n <> 1 THEN
    RAISE EXCEPTION 'post-apply: the author foreign key is missing';
  END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.hand_clip_jobs'::regclass AND contype = 'u';
  IF n <> 1 THEN
    RAISE EXCEPTION 'post-apply: expected one unique key (hand_id, author_id, style), found %', n;
  END IF;

  SELECT count(*) INTO n FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indrelid = 'public.hand_clip_jobs'::regclass
     AND c.relname IN ('idx_hand_clip_jobs_state_created', 'idx_hand_clip_jobs_author')
     AND i.indisvalid;
  IF n <> 2 THEN
    RAISE EXCEPTION 'post-apply: expected the two queue indexes, found %', n;
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public'
     AND p.proname IN ('fn_hand_clip_request', 'fn_hand_clip_claim', 'fn_hand_clip_finish', 'fn_p9_publish_hand_clip')
     AND p.prosecdef
     AND p.proconfig @> ARRAY['search_path=public'];
  IF n <> 4 THEN
    RAISE EXCEPTION 'post-apply: expected four SECURITY DEFINER functions with search_path=public, found %', n;
  END IF;

  IF has_table_privilege('anon', 'public.hand_clip_jobs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.hand_clip_jobs', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hand_clip_jobs', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hand_clip_jobs', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.hand_clip_jobs', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.hand_clip_jobs', 'INSERT') THEN
    RAISE EXCEPTION 'post-apply: hand_clip_jobs table privileges are wrong';
  END IF;

  IF has_function_privilege('anon', 'public.fn_hand_clip_request(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_hand_clip_request(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_hand_clip_request(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: fn_hand_clip_request execute privileges are wrong';
  END IF;

  FOREACH fn IN ARRAY ARRAY[
    'public.fn_hand_clip_claim()',
    'public.fn_hand_clip_finish(uuid, text, text, text, integer, integer, integer, integer, integer, text)',
    'public.fn_p9_publish_hand_clip(uuid)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'post-apply: % execute privileges are wrong', fn;
    END IF;
  END LOOP;

  -- The migration runner carries no service role claim: the claim refuses.
  BEGIN
    PERFORM public.fn_hand_clip_claim();
    RAISE EXCEPTION 'post-apply: fn_hand_clip_claim ran without the service role';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT count(*) INTO n FROM public.hand_clip_jobs;
  IF n <> 0 THEN
    RAISE EXCEPTION 'post-apply: the new queue must be empty, found % rows', n;
  END IF;
END $postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed: drops exactly what this file created)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_p9_publish_hand_clip(uuid);
-- DROP FUNCTION IF EXISTS public.fn_hand_clip_finish(uuid, text, text, text, integer, integer, integer, integer, integer, text);
-- DROP FUNCTION IF EXISTS public.fn_hand_clip_claim();
-- DROP FUNCTION IF EXISTS public.fn_hand_clip_request(uuid, text);
-- DROP POLICY IF EXISTS hand_clip_jobs_service_all ON public.hand_clip_jobs;
-- DROP POLICY IF EXISTS hand_clip_jobs_author_select ON public.hand_clip_jobs;
-- DROP INDEX IF EXISTS public.idx_hand_clip_jobs_author;
-- DROP INDEX IF EXISTS public.idx_hand_clip_jobs_state_created;
-- DROP TABLE IF EXISTS public.hand_clip_jobs;
-- COMMIT;
