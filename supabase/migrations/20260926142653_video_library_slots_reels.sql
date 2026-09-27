-- ===========================================================================
-- 20260926142653_video_library_slots_reels.sql
-- ===========================================================================
-- TIER:        2
-- AUTHOR:      Codex
-- AFFECTS:     RPCs fn_is_video_library_asset_eligible(uuid),
--              fn_has_fresh_public_youtube_verification(text),
--              publish_video_library_reel(text, uuid, text)
-- IRREVERSIBLE: no
--
-- WHY:
--   The canonical Video Library publisher admitted only cash and tournament
--   assets even though the managed library already contains verified slot
--   channels and the social Reels contract has a first-class `slots` topic.
--   That left the Casino And Slots rail empty and tempted callers to bypass
--   the atomic publisher. This forward migration admits `slots` through the
--   same official-account, fresh-verification, embed-only, failure-aware,
--   deduplicated post-plus-Reel transaction. It does not edit or replay the
--   installed 20260906235959 or 20260923120000 migrations.
--
-- HOW (high level):
--   - Extend the one managed-asset eligibility predicate to `slots`.
--   - Preserve the canonical service-only publisher and classify slot rows as
--     topic `slots`; cash/tournament rows retain the canonical `poker` topic.
--   - Preserve embed-only rights, fresh verification, unresolved-failure
--     rejection, official non-horse authorship, advisory-lock deduplication,
--     linked post/Reel atomicity, and existing interaction-bearing Reel IDs.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ===========================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $preflight$
DECLARE
  v_official constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF to_regprocedure('public.fn_is_video_library_asset_eligible(uuid)') IS NULL
     OR to_regprocedure('public.fn_has_fresh_public_youtube_verification(text)') IS NULL
     OR to_regprocedure('public.fn_is_video_library_lineage_eligible(uuid, text, text, text, text)') IS NULL
     OR to_regprocedure('public.publish_video_library_reel(text, uuid, text)') IS NULL
     OR to_regprocedure('public.fn_video_library_publisher_is_eligible(uuid)') IS NULL
     OR to_regprocedure('public.fn_extract_youtube_video_id(text)') IS NULL
  THEN
    RAISE EXCEPTION
      'pre-flight failed: the installed Video Library publication contract is incomplete';
  END IF;

  IF to_regclass('public.video_library_public_catalog') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_policy policy
       WHERE policy.polrelid = 'public.video_library_videos'::regclass
         AND policy.polname = 'video_library_public_read'
         AND pg_get_expr(policy.polqual, policy.polrelid)
           LIKE '%fn_is_video_library_asset_eligible%'
     )
  THEN
    RAISE EXCEPTION
      'pre-flight failed: managed catalog/RLS eligibility wiring is incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'publish_video_library_reel'
  ) <> 1 THEN
    RAISE EXCEPTION
      'pre-flight failed: publish_video_library_reel must have exactly one overload';
  END IF;

  IF NOT public.fn_video_library_publisher_is_eligible(v_official) THEN
    RAISE EXCEPTION
      'pre-flight failed: the official Smarter.Poker publisher is not eligible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.video_reels_pipeline_config c
    WHERE c.singleton_key = 'video_library'
      AND c.video_library_publisher_profile_id = v_official
  ) THEN
    RAISE EXCEPTION
      'pre-flight failed: Video Library publication is not configured for the official Smarter.Poker account';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = 'public.publish_video_library_reel(text, uuid, text)'::regprocedure
      AND p.prosecdef
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(setting)
        WHERE cfg.setting IN (
          'search_path=public, extensions',
          'search_path=public,extensions'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'pre-flight failed: publish_video_library_reel must be SECURITY DEFINER with a fixed search_path';
  END IF;
END
$preflight$;

-- 2. ACTUAL CHANGES

-- This function remains the sole source of truth for RLS, the public catalog,
-- lineage checks, visibility guards, and fail-closed asset updates.
CREATE OR REPLACE FUNCTION public.fn_is_video_library_asset_eligible(
  p_asset_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.video_library_videos v
    WHERE v.id = p_asset_id
      AND v.youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
      AND v.youtube_video_id NOT LIKE 'FAKE%'
      AND v.type IN ('cash', 'tournament', 'slots')
      AND v.availability_status = 'verified'
      AND v.embeddable IS TRUE
      AND v.availability_checked_at IS NOT NULL
      AND v.availability_checked_at >= now() - interval '7 days'
      AND v.availability_checked_at <= now() + interval '5 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM public.youtube_embed_failures f
        WHERE f.video_id = v.youtube_video_id
          AND f.verification_status = 'confirmed'
          AND f.resolved = false
      )
  )
$function$;

COMMENT ON FUNCTION public.fn_is_video_library_asset_eligible(uuid) IS
  'Fail-closed freshness, topic, embedding, and active-failure gate for managed poker and slots library assets.';

REVOKE ALL ON FUNCTION public.fn_is_video_library_asset_eligible(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_video_library_asset_eligible(uuid)
  TO anon, authenticated;

-- Non-managed embed playback shares this fresh-verification predicate. Make
-- the managed-library branch explicit so no unsupported library type gains a
-- public proof merely by carrying a current verifier timestamp.
CREATE OR REPLACE FUNCTION public.fn_has_fresh_public_youtube_verification(
  p_youtube_video_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  SELECT p_youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
    AND (
      EXISTS (
        SELECT 1
        FROM public.video_library_videos verified_asset
        WHERE verified_asset.youtube_video_id = p_youtube_video_id
          AND verified_asset.type IN ('cash', 'tournament', 'slots')
          AND verified_asset.availability_status = 'verified'
          AND verified_asset.embeddable IS TRUE
          AND verified_asset.availability_checked_at >= now() - interval '7 days'
          AND verified_asset.availability_checked_at <= now() + interval '5 minutes'
      )
      OR EXISTS (
        SELECT 1
        FROM public.youtube_embed_failures verified_source
        WHERE verified_source.video_id = p_youtube_video_id
          AND verified_source.verification_status = 'resolved'
          AND verified_source.resolved IS TRUE
          AND verified_source.last_verified_at >= now() - interval '7 days'
          AND verified_source.last_verified_at <= now() + interval '5 minutes'
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.youtube_embed_failures failed_source
      WHERE failed_source.video_id = p_youtube_video_id
        AND failed_source.verification_status = 'confirmed'
        AND failed_source.resolved = false
    )
$function$;

REVOKE ALL ON FUNCTION public.fn_has_fresh_public_youtube_verification(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.publish_video_library_reel(
  p_video_id text,
  p_author_id uuid,
  p_caption text DEFAULT NULL
)
RETURNS TABLE (
  social_post_id uuid,
  social_reel_id uuid,
  was_created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_asset public.video_library_videos%ROWTYPE;
  v_post_id uuid;
  v_reel_id uuid;
  v_post_created boolean := false;
  v_reel_created boolean := false;
  v_canonical_key text;
  v_publication_key text;
  v_caption text;
  v_video_url text;
  v_topic text;
  v_topics text[];
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'publish_video_library_reel requires the service role';
  END IF;

  IF (
    SELECT count(*)
    FROM public.video_reels_pipeline_controls c
    WHERE c.control_key IN (
      'video_library_reel_creation',
      'video_library_reel_publication'
    )
      AND c.enabled
  ) <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'video library Reel publication is disabled';
  END IF;

  IF p_author_id IS NULL
     OR NOT public.fn_video_library_publisher_is_eligible(p_author_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.video_reels_pipeline_config config
       JOIN public.profiles p
         ON p.id = config.video_library_publisher_profile_id
       WHERE config.singleton_key = 'video_library'
         AND config.video_library_publisher_profile_id = p_author_id
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'the configured official video-library publisher profile is required';
  END IF;

  SELECT v.*
  INTO v_asset
  FROM public.video_library_videos v
  WHERE v.youtube_video_id = btrim(p_video_id)
     OR v.id::text = btrim(p_video_id)
  ORDER BY CASE WHEN v.youtube_video_id = btrim(p_video_id) THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'video library asset was not found';
  END IF;

  -- Serialize every identifier spelling of the same source asset.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('video-library:' || v_asset.id::text, 0)
  );

  IF v_asset.type NOT IN ('cash', 'tournament', 'slots') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'only cash, tournament, and slots videos may be published as library Reels';
  END IF;

  IF v_asset.availability_status <> 'verified'
     OR v_asset.embeddable IS DISTINCT FROM true
     OR v_asset.availability_checked_at IS NULL
     OR v_asset.availability_checked_at < now() - interval '7 days'
     OR v_asset.availability_checked_at > now() + interval '5 minutes'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'video library asset must have a fresh verified embeddable result';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.youtube_embed_failures f
    WHERE f.video_id = v_asset.youtube_video_id
      AND f.verification_status = 'confirmed'
      AND f.resolved = false
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'video library asset has an active embed failure';
  END IF;

  IF public.fn_extract_youtube_video_id(v_asset.youtube_video_id) IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'video library asset has an invalid YouTube video id';
  END IF;

  v_canonical_key := 'youtube:' || v_asset.youtube_video_id;
  v_publication_key := 'video-library:' || v_asset.id::text;
  v_caption := COALESCE(NULLIF(btrim(p_caption), ''), v_asset.title);
  v_video_url := 'https://www.youtube.com/watch?v=' || v_asset.youtube_video_id;
  v_topic := CASE WHEN v_asset.type = 'slots' THEN 'slots' ELSE 'poker' END;
  v_topics := CASE
    WHEN v_asset.type = 'slots' THEN ARRAY['slots']::text[]
    ELSE ARRAY['poker', v_asset.type]::text[]
  END;

  -- The managed visibility guards require transaction-local proof that the
  -- canonical publisher completed every eligibility check above.
  PERFORM set_config(
    'app.video_library_publish_asset_id',
    v_asset.id::text,
    true
  );

  SELECT p.id
  INTO v_post_id
  FROM public.social_posts p
  WHERE p.origin_type = 'video_library'
    AND (
      p.source_asset_id = v_asset.id
      OR p.publication_key = v_publication_key
      OR p.canonical_asset_key = v_canonical_key
    )
  ORDER BY p.created_at ASC NULLS LAST, p.id ASC
  LIMIT 1
  FOR UPDATE;

  SELECT r.id
  INTO v_reel_id
  FROM public.social_reels r
  WHERE r.origin_type = 'video_library'
    AND (
      r.source_asset_id = v_asset.id
      OR r.publication_key = v_publication_key
      OR r.canonical_asset_key = v_canonical_key
    )
  ORDER BY r.created_at ASC NULLS LAST, r.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_post_id IS NULL THEN
    INSERT INTO public.social_posts (
      author_id,
      content,
      content_type,
      media_urls,
      visibility,
      audience_mode,
      thumbnail_url,
      link_url,
      link_title,
      metadata,
      topics,
      origin_type,
      playback_type,
      topic,
      rights_status,
      source_asset_id,
      youtube_video_id,
      canonical_asset_key,
      publication_key
    ) VALUES (
      p_author_id,
      v_caption,
      'video',
      jsonb_build_array(v_video_url),
      'public',
      'public',
      v_asset.thumbnail_url,
      v_video_url,
      v_asset.title,
      jsonb_build_object(
        'video_library_id', v_asset.id,
        'youtube_video_id', v_asset.youtube_video_id,
        'source_id', v_asset.source_id,
        'source_name', v_asset.source_name,
        'video_type', v_asset.type,
        'duration', v_asset.duration,
        'availability_checked_at', v_asset.availability_checked_at
      ),
      v_topics,
      'video_library',
      'youtube_embed',
      v_topic,
      'embed_only',
      v_asset.id,
      v_asset.youtube_video_id,
      v_canonical_key,
      v_publication_key
    )
    RETURNING id INTO v_post_id;
    v_post_created := true;
  END IF;

  -- The post mirror normally creates the Reel. Re-read before inserting so a
  -- pre-existing canonical Reel retains its ID and all engagement history.
  IF v_reel_id IS NULL THEN
    SELECT r.id
    INTO v_reel_id
    FROM public.social_reels r
    WHERE r.source_post_id = v_post_id
       OR (
         r.origin_type = 'video_library'
         AND r.canonical_asset_key = v_canonical_key
       )
    ORDER BY
      CASE WHEN r.source_post_id = v_post_id THEN 0 ELSE 1 END,
      r.created_at ASC NULLS LAST,
      r.id ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_reel_id IS NULL THEN
    INSERT INTO public.social_reels (
      author_id,
      video_url,
      thumbnail_url,
      caption,
      source_post_id,
      is_public,
      source_type,
      youtube_video_id,
      media_status,
      original_youtube_url,
      origin_type,
      playback_type,
      topic,
      rights_status,
      source_asset_id,
      canonical_asset_key,
      publication_key,
      native_processing_requested
    ) VALUES (
      p_author_id,
      v_video_url,
      v_asset.thumbnail_url,
      v_caption,
      v_post_id,
      true,
      'video_library',
      v_asset.youtube_video_id,
      'ready',
      v_video_url,
      'video_library',
      'youtube_embed',
      v_topic,
      'embed_only',
      v_asset.id,
      v_canonical_key,
      v_publication_key,
      false
    )
    RETURNING id INTO v_reel_id;
    v_reel_created := true;
  ELSE
    UPDATE public.social_reels r
    SET author_id = p_author_id,
        video_url = v_video_url,
        thumbnail_url = COALESCE(v_asset.thumbnail_url, r.thumbnail_url),
        caption = v_caption,
        source_post_id = v_post_id,
        is_public = true,
        source_type = 'video_library',
        youtube_video_id = v_asset.youtube_video_id,
        media_status = 'ready',
        original_youtube_url = v_video_url,
        origin_type = 'video_library',
        playback_type = 'youtube_embed',
        topic = v_topic,
        rights_status = 'embed_only',
        source_asset_id = v_asset.id,
        canonical_asset_key = v_canonical_key,
        publication_key = v_publication_key,
        native_processing_requested = false
    WHERE r.id = v_reel_id;
  END IF;

  UPDATE public.social_posts p
  SET author_id = p_author_id,
      content = v_caption,
      content_type = 'video',
      media_urls = jsonb_build_array(v_video_url),
      visibility = 'public',
      audience_mode = 'public',
      thumbnail_url = COALESCE(v_asset.thumbnail_url, p.thumbnail_url),
      link_url = '/hub/reels?id=' || v_reel_id::text,
      link_title = v_asset.title,
      metadata = COALESCE(p.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'video_library_id', v_asset.id,
          'youtube_video_id', v_asset.youtube_video_id,
          'social_reel_id', v_reel_id,
          'source_id', v_asset.source_id,
          'source_name', v_asset.source_name,
          'video_type', v_asset.type,
          'availability_checked_at', v_asset.availability_checked_at
        ),
      topics = v_topics,
      origin_type = 'video_library',
      playback_type = 'youtube_embed',
      topic = v_topic,
      rights_status = 'embed_only',
      source_asset_id = v_asset.id,
      youtube_video_id = v_asset.youtube_video_id,
      canonical_asset_key = v_canonical_key,
      publication_key = v_publication_key
  WHERE p.id = v_post_id;

  RETURN QUERY
  SELECT v_post_id, v_reel_id, (v_post_created OR v_reel_created);
END
$function$;

REVOKE ALL ON FUNCTION public.publish_video_library_reel(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_video_library_reel(text, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.publish_video_library_reel(text, uuid, text) IS
  'Service-only atomic/idempotent publisher for fresh verified poker and slots library embeds. Preserves and links an existing managed Reel.';

-- 3. POST-APPLY ASSERTIONS
DO $postflight$
DECLARE
  v_official constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_asset_def text;
  v_fresh_def text;
  v_publisher_def text;
BEGIN
  SELECT pg_get_functiondef(
    'public.fn_is_video_library_asset_eligible(uuid)'::regprocedure
  ) INTO v_asset_def;
  SELECT pg_get_functiondef(
    'public.fn_has_fresh_public_youtube_verification(text)'::regprocedure
  ) INTO v_fresh_def;
  SELECT pg_get_functiondef(
    'public.publish_video_library_reel(text, uuid, text)'::regprocedure
  ) INTO v_publisher_def;

  IF v_asset_def NOT LIKE '%v.type IN (''cash'', ''tournament'', ''slots'')%'
     OR v_fresh_def NOT LIKE
       '%verified_asset.type IN (''cash'', ''tournament'', ''slots'')%'
     OR v_publisher_def NOT LIKE '%v_asset.type NOT IN (''cash'', ''tournament'', ''slots'')%'
  THEN
    RAISE EXCEPTION
      'post-apply failed: slots are not admitted by both canonical gates';
  END IF;

  IF pg_get_viewdef('public.video_library_public_catalog'::regclass, true)
       NOT LIKE '%fn_is_video_library_asset_eligible%'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_policy policy
       WHERE policy.polrelid = 'public.video_library_videos'::regclass
         AND policy.polname = 'video_library_public_read'
         AND pg_get_expr(policy.polqual, policy.polrelid)
           LIKE '%fn_is_video_library_asset_eligible%'
     )
     OR pg_get_functiondef(
       'public.fn_is_video_library_lineage_eligible(uuid, text, text, text, text)'::regprocedure
     ) NOT LIKE '%fn_is_video_library_asset_eligible%'
  THEN
    RAISE EXCEPTION
      'post-apply failed: catalog, RLS, or managed lineage bypasses canonical eligibility';
  END IF;

  IF v_publisher_def NOT LIKE
       '%CASE WHEN v_asset.type = ''slots'' THEN ''slots'' ELSE ''poker'' END%'
     OR v_publisher_def NOT LIKE '%rights_status = ''embed_only''%'
     OR v_publisher_def NOT LIKE '%native_processing_requested = false%'
  THEN
    RAISE EXCEPTION
      'post-apply failed: slot topic or embed-only publication invariants are missing';
  END IF;

  IF NOT public.fn_video_library_publisher_is_eligible(v_official)
     OR NOT EXISTS (
       SELECT 1
       FROM public.video_reels_pipeline_config c
       WHERE c.singleton_key = 'video_library'
         AND c.video_library_publisher_profile_id = v_official
     )
  THEN
    RAISE EXCEPTION
      'post-apply failed: official non-horse publisher invariant was not preserved';
  END IF;

  IF has_function_privilege('anon',
       'public.publish_video_library_reel(text, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.publish_video_library_reel(text, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.publish_video_library_reel(text, uuid, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION
      'post-apply failed: canonical publisher execute grants are unsafe';
  END IF;

  IF NOT has_function_privilege('anon',
       'public.fn_is_video_library_asset_eligible(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.fn_is_video_library_asset_eligible(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION
      'post-apply failed: managed playback eligibility is not available to RLS clients';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid IN (
      'public.fn_is_video_library_asset_eligible(uuid)'::regprocedure,
      'public.fn_has_fresh_public_youtube_verification(text)'::regprocedure,
      'public.publish_video_library_reel(text, uuid, text)'::regprocedure
    )
      AND (
        NOT p.prosecdef
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg(setting)
          WHERE cfg.setting IN (
            'search_path=public, extensions',
            'search_path=public,extensions'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION
      'post-apply failed: changed functions must be SECURITY DEFINER with fixed search_path';
  END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
