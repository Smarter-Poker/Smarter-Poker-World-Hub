-- ===========================================================================
-- 20260927034000_fresh_public_youtube_verification_ids.sql
-- ===========================================================================
-- TIER:        3 (new SECURITY DEFINER verifier boundary)
-- AUTHOR:      Codex, Reels supply recovery
-- AFFECTS:     rpc: fn_fresh_public_youtube_verification_ids (new)
-- IRREVERSIBLE: no
--
-- WHY:
--   The scheduled horse publisher previously asked YouTube for every random
--   candidate. One upstream anti-bot response activated a process-wide
--   backoff and made the remaining 305 checks unknown. The database already
--   owns the fail-closed definition of a fresh public YouTube proof, but the
--   worker had no bounded batch interface to consume that authority.
--
-- HOW:
--   Add one service-role-only wrapper that normalizes and deduplicates at most
--   1,000 YouTube ids and delegates every positive decision to the installed
--   scalar fn_has_fresh_public_youtube_verification(text). The wrapper copies
--   none of the freshness, restriction, library, or negative-verdict logic.
--
-- This is a forward-only migration. Installed migrations remain immutable.
-- ===========================================================================

BEGIN;

DO $preflight$
DECLARE
  v_scalar regprocedure := to_regprocedure(
    'public.fn_has_fresh_public_youtube_verification(text)'
  );
BEGIN
  IF v_scalar IS NULL THEN
    RAISE EXCEPTION
      'pre-flight failed: fn_has_fresh_public_youtube_verification(text) is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = v_scalar
      AND (
        p.prosecdef IS DISTINCT FROM true
        OR p.provolatile <> 's'
        OR NOT COALESCE(p.proconfig, ARRAY[]::text[])
          @> ARRAY['search_path=public, extensions']::text[]
      )
  ) THEN
    RAISE EXCEPTION
      'pre-flight failed: scalar verification authority must be stable, SECURITY DEFINER, and have a fixed search_path';
  END IF;

  IF to_regprocedure(
    'public.fn_fresh_public_youtube_verification_ids(text[])'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'pre-flight failed: fn_fresh_public_youtube_verification_ids(text[]) already exists';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.fn_fresh_public_youtube_verification_ids(
  p_youtube_video_ids text[]
)
RETURNS TABLE (youtube_video_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  IF COALESCE(auth.role()::text, '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'fn_fresh_public_youtube_verification_ids requires the service role';
  END IF;

  IF COALESCE(cardinality(p_youtube_video_ids), 0) > 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'at most 1000 YouTube video ids may be checked at once';
  END IF;

  RETURN QUERY
  SELECT DISTINCT candidate.video_id AS youtube_video_id
  FROM (
    SELECT btrim(candidate.raw_video_id) AS video_id
    FROM unnest(COALESCE(p_youtube_video_ids, ARRAY[]::text[]))
      AS candidate(raw_video_id)
  ) AS candidate
  WHERE candidate.video_id ~ '^[A-Za-z0-9_-]{11}$'
    AND public.fn_has_fresh_public_youtube_verification(candidate.video_id)
  ORDER BY candidate.video_id;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_fresh_public_youtube_verification_ids(text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_fresh_public_youtube_verification_ids(text[])
  TO service_role;

DO $postflight$
DECLARE
  v_fn regprocedure := to_regprocedure(
    'public.fn_fresh_public_youtube_verification_ids(text[])'
  );
  v_proc pg_proc%ROWTYPE;
BEGIN
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'post-flight failed: batch verification RPC is missing';
  END IF;

  SELECT p.* INTO STRICT v_proc
  FROM pg_proc p
  WHERE p.oid = v_fn;

  IF v_proc.prosecdef IS DISTINCT FROM true
     OR v_proc.provolatile <> 's'
     OR v_proc.proretset IS DISTINCT FROM true
     OR NOT COALESCE(v_proc.proconfig, ARRAY[]::text[])
       @> ARRAY['search_path=public, extensions']::text[]
  THEN
    RAISE EXCEPTION
      'post-flight failed: batch verification RPC attributes are unsafe';
  END IF;

  IF position(
    'fn_has_fresh_public_youtube_verification'
    IN pg_get_functiondef(v_fn)
  ) = 0 THEN
    RAISE EXCEPTION
      'post-flight failed: batch verification RPC no longer delegates to the scalar authority';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.fn_fresh_public_youtube_verification_ids(text[])',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.fn_fresh_public_youtube_verification_ids(text[])',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.fn_fresh_public_youtube_verification_ids(text[])',
    'EXECUTE'
  ) OR EXISTS (
    SELECT 1
    FROM aclexplode(
      COALESCE(v_proc.proacl, acldefault('f', v_proc.proowner))
    ) acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'post-flight failed: batch verification RPC privileges are unsafe';
  END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
