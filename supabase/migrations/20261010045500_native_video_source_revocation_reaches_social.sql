-- TIER: 2; AUTHOR: Codex; AFFECTS: managed native video visibility and ID-only invalidation.
-- WHY: source revocation previously changed only video_source_masters. Social
-- cards could remain mounted because social_posts is intentionally absent from
-- the broad Postgres Changes publication and periodic feed reload was removed.
-- HOW: hide only linked managed native rows in the same transaction and emit a
-- strict public {kind,id} broadcast. No private source/provenance data or table
-- grant is exposed. Qualification: native-video-source-revocation-postgres.test.mjs.
-- Install outside :50-:03 UTC; exact source once, never replay.
-- RECOVERY: disable the three named triggers to stop new effects; restore a
-- row only after its source is independently eligible. Never bulk-publicize.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.video_source_masters') IS NULL THEN missing := array_append(missing, 'video_source_masters'); END IF;
  IF to_regclass('public.social_posts') IS NULL THEN missing := array_append(missing, 'social_posts'); END IF;
  IF to_regclass('public.social_reels') IS NULL THEN missing := array_append(missing, 'social_reels'); END IF;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'preflight: required relations missing: %', array_to_string(missing, ',');
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'video_source_masters.video_id', 'video_source_masters.status',
      'social_posts.source_asset_id', 'social_posts.origin_type',
      'social_posts.content_type', 'social_posts.playback_type', 'social_posts.visibility',
      'social_posts.is_deleted', 'social_posts.audience_mode',
      'social_reels.source_asset_id', 'social_reels.origin_type',
      'social_reels.playback_type', 'social_reels.is_public', 'social_reels.is_deleted'
    ]) expected(qualified)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = split_part(expected.qualified, '.', 1)
        AND c.column_name = split_part(expected.qualified, '.', 2)
    )
  ) THEN
    RAISE EXCEPTION 'preflight: native source revocation columns are incomplete';
  END IF;

  IF to_regprocedure('public.fn_native_video_source_revocation_reaches_social()') IS NOT NULL
     OR to_regprocedure('public.fn_broadcast_social_video_invalidation()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.video_source_masters'::regclass
         AND tgname = 'trg_native_video_source_revocation_reaches_social'
         AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'preflight: native source revocation bridge already exists';
  END IF;
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'preflight: supported realtime.send broadcast contract missing';
  END IF;
END
$preflight$;

CREATE FUNCTION public.fn_native_video_source_revocation_reaches_social()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  IF NEW.status NOT IN ('revoked', 'deleted') THEN
    RETURN NEW;
  END IF;

  UPDATE public.social_posts p
  SET visibility = 'private'
  WHERE p.source_asset_id = NEW.video_id
    AND p.origin_type = 'video_library'
    AND p.content_type = 'video'
    AND p.playback_type = 'native'
    AND p.visibility IS DISTINCT FROM 'private';

  UPDATE public.social_reels r
  SET is_public = false
  WHERE r.source_asset_id = NEW.video_id
    AND r.origin_type = 'video_library'
    AND r.playback_type = 'native'
    AND r.is_public IS TRUE;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_native_video_source_revocation_reaches_social()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.fn_broadcast_social_video_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  row_kind text;
  row_id uuid;
  should_send boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'social_posts' THEN
    row_kind := 'post';
    row_id := OLD.id;
    should_send := OLD.is_deleted IS NOT TRUE
      AND coalesce(OLD.visibility, 'public') = 'public'
      AND coalesce(OLD.audience_mode, 'public') = 'public'
      AND (TG_OP = 'DELETE' OR (
        NEW.is_deleted IS TRUE
        OR coalesce(NEW.visibility, 'public') <> 'public'
        OR coalesce(NEW.audience_mode, 'public') <> 'public'
      ));
  ELSIF TG_TABLE_NAME = 'social_reels' THEN
    row_kind := 'reel';
    row_id := OLD.id;
    should_send := OLD.is_public IS TRUE
      AND OLD.is_deleted IS NOT TRUE
      AND (TG_OP = 'DELETE' OR NEW.is_public IS NOT TRUE OR NEW.is_deleted IS TRUE);
  END IF;

  IF should_send THEN
    PERFORM realtime.send(
      jsonb_build_object('kind', row_kind, 'id', row_id),
      'managed_video_invalidated',
      'social-video-authority',
      false
    );
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_broadcast_social_video_invalidation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_native_video_source_revocation_reaches_social
AFTER INSERT OR UPDATE OF status
ON public.video_source_masters
FOR EACH ROW
EXECUTE FUNCTION public.fn_native_video_source_revocation_reaches_social();

CREATE TRIGGER trg_social_posts_broadcast_video_invalidation
AFTER UPDATE OF visibility, is_deleted, audience_mode OR DELETE
ON public.social_posts
FOR EACH ROW
EXECUTE FUNCTION public.fn_broadcast_social_video_invalidation();

CREATE TRIGGER trg_social_reels_broadcast_video_invalidation
AFTER UPDATE OF is_public, is_deleted OR DELETE
ON public.social_reels
FOR EACH ROW
EXECUTE FUNCTION public.fn_broadcast_social_video_invalidation();

-- Close any source revocation that completed before this event bridge existed.
UPDATE public.social_posts p
SET visibility = 'private'
FROM public.video_source_masters m
WHERE m.video_id = p.source_asset_id
  AND m.status IN ('revoked', 'deleted')
  AND p.origin_type = 'video_library'
  AND p.content_type = 'video'
  AND p.playback_type = 'native'
  AND p.visibility IS DISTINCT FROM 'private';

UPDATE public.social_reels r
SET is_public = false
FROM public.video_source_masters m
WHERE m.video_id = r.source_asset_id
  AND m.status IN ('revoked', 'deleted')
  AND r.origin_type = 'video_library'
  AND r.playback_type = 'native'
  AND r.is_public IS TRUE;

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.video_source_masters'::regclass
      AND tgname = 'trg_native_video_source_revocation_reaches_social'
      AND NOT tgisinternal
      AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'postflight: native source revocation trigger missing or disabled';
  END IF;
  IF has_function_privilege('anon', 'public.fn_native_video_source_revocation_reaches_social()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_native_video_source_revocation_reaches_social()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.fn_native_video_source_revocation_reaches_social()', 'EXECUTE') THEN
    RAISE EXCEPTION 'postflight: trigger function is directly executable';
  END IF;
  IF has_function_privilege('anon', 'public.fn_broadcast_social_video_invalidation()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_broadcast_social_video_invalidation()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.fn_broadcast_social_video_invalidation()', 'EXECUTE') THEN
    RAISE EXCEPTION 'postflight: invalidation broadcaster is directly executable';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.video_source_masters m
    JOIN public.social_posts p ON p.source_asset_id = m.video_id
    WHERE m.status IN ('revoked', 'deleted')
      AND p.origin_type = 'video_library'
      AND p.content_type = 'video'
      AND p.playback_type = 'native'
      AND p.visibility IS DISTINCT FROM 'private'
  ) OR EXISTS (
    SELECT 1
    FROM public.video_source_masters m
    JOIN public.social_reels r ON r.source_asset_id = m.video_id
    WHERE m.status IN ('revoked', 'deleted')
      AND r.origin_type = 'video_library'
      AND r.playback_type = 'native'
      AND r.is_public IS TRUE
  ) THEN
    RAISE EXCEPTION 'postflight: revoked native source remains public';
  END IF;
END
$postflight$;

COMMIT;
