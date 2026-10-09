-- =======================================================================
-- 20261009005500_fleet_readiness_excludes_closed_horses.sql
-- =======================================================================
-- TIER:        3 (replace one existing RPC body, preserving its signature,
--              invoker security, owner and execute grants)
-- AUTHOR:      Smarter-Poker, Fleet Content Programme follow-up
-- AFFECTS:     public.fn_horses_not_social_ready()
-- IRREVERSIBLE: no (the rollback restores the prior function body)
--
-- WHY:
--   Production returned 62 readiness rows, all retired horse identities.
--   Those profiles are deliberately closed and benched with status
--   'deleted' and horse_status 'disabled', while their author rows are
--   inactive. They are tombstones, not fleet drift. Counting them made the
--   admin metric and weekly digest report work that should never be repaired.
--
-- HOW:
--   - Keep the existing readiness checks for every live horse, including a
--     missing content_authors row and an inactive content_authors row.
--   - Apply the same two closed-horse exclusions pinned by
--     a-closed-horse-is-never-selected-again.law.test.mjs.
--   - Preserve the zero-argument table signature, STABLE volatility,
--     SECURITY INVOKER behavior, pinned search_path, postgres ownership and
--     authenticated/service_role execute grants.
--
-- EVIDENCE:
--   __tests__/a-closed-horse-is-never-selected-again.law.test.mjs records
--   the canonical status and horse_status exclusions. The pre-fix function
--   is in 20260905121000_every_horse_is_born_social.sql.
-- =======================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $preflight$
DECLARE
  v_missing text;
  v_overloads integer;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
BEGIN
  SELECT string_agg(required.column_name, ', ' ORDER BY required.column_name)
    INTO v_missing
    FROM (VALUES
      ('id'), ('username'), ('is_horse'), ('status'), ('horse_status'),
      ('bio'), ('social_profile_completed'), ('avatar_url')
    ) AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1
       FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'profiles'
        AND c.column_name = required.column_name
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: profiles columns missing: %', v_missing;
  END IF;

  SELECT string_agg(required.column_name, ', ' ORDER BY required.column_name)
    INTO v_missing
    FROM (VALUES
      ('profile_id'), ('is_active'), ('voice'), ('personality'), ('timezone')
    ) AS required(column_name)
   WHERE NOT EXISTS (
     SELECT 1
       FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'content_authors'
        AND c.column_name = required.column_name
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: content_authors columns missing: %', v_missing;
  END IF;

  SELECT count(*)
    INTO v_overloads
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_horses_not_social_ready';

  IF v_overloads IS DISTINCT FROM 1
     OR to_regprocedure('public.fn_horses_not_social_ready()') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: expected exactly fn_horses_not_social_ready()';
  END IF;

  SELECT owner_role.rolname, p.prosecdef, p.proconfig
    INTO v_owner, v_security_definer, v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = p.proowner
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_horses_not_social_ready'
     AND p.pronargs = 0;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_security_definer IS DISTINCT FROM false
     OR NOT COALESCE('search_path=public, pg_temp' = ANY(v_config), false)
     OR has_function_privilege('anon', 'public.fn_horses_not_social_ready()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_horses_not_social_ready()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_horses_not_social_ready()', 'EXECUTE') THEN
    RAISE EXCEPTION 'pre-flight failed: owner, security, search_path or grants drifted';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'pre-flight failed: required database role missing';
  END IF;
END
$preflight$;

-- 2. THE CHANGE
CREATE OR REPLACE FUNCTION public.fn_horses_not_social_ready()
RETURNS TABLE (profile_id uuid, username text, missing text[])
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id, p.username,
         array_remove(ARRAY[
           CASE WHEN ca.profile_id IS NULL THEN 'content_authors' END,
           CASE WHEN ca.profile_id IS NOT NULL AND NOT ca.is_active THEN 'is_active' END,
           CASE WHEN COALESCE(ca.voice, '') = '' THEN 'voice' END,
           CASE WHEN ca.personality IS NULL THEN 'personality' END,
           CASE WHEN COALESCE(ca.timezone, '') = '' THEN 'timezone' END,
           CASE WHEN COALESCE(p.bio, '') = '' THEN 'bio' END,
           CASE WHEN NOT COALESCE(p.social_profile_completed, false) THEN 'social_profile_completed' END,
           CASE WHEN p.avatar_url IS NULL THEN 'avatar_url' END
         ], NULL) AS missing
    FROM public.profiles p
    LEFT JOIN public.content_authors ca ON ca.profile_id = p.id
   WHERE p.is_horse IS TRUE
     AND p.status IS DISTINCT FROM 'deleted'
     AND p.horse_status IS DISTINCT FROM 'disabled'
     AND (ca.profile_id IS NULL OR NOT ca.is_active OR COALESCE(ca.voice, '') = ''
          OR ca.personality IS NULL OR COALESCE(ca.timezone, '') = ''
          OR COALESCE(p.bio, '') = '' OR NOT COALESCE(p.social_profile_completed, false)
          OR p.avatar_url IS NULL);
$function$;

COMMENT ON FUNCTION public.fn_horses_not_social_ready() IS
  'Drift detector for live fleet horses missing any social credential. Closed or benched horse tombstones are excluded; each returned row names what is missing.';

ALTER FUNCTION public.fn_horses_not_social_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_horses_not_social_ready()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_horses_not_social_ready()
  TO authenticated, service_role;

-- 3. POST-APPLY ASSERTIONS
DO $postapply$
DECLARE
  v_definition text;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
BEGIN
  SELECT pg_get_functiondef(p.oid), owner_role.rolname, p.prosecdef, p.proconfig
    INTO v_definition, v_owner, v_security_definer, v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = p.proowner
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_horses_not_social_ready'
     AND p.pronargs = 0;

  IF v_definition IS NULL
     OR v_definition NOT LIKE '%p.status IS DISTINCT FROM ''deleted''%'
     OR v_definition NOT LIKE '%p.horse_status IS DISTINCT FROM ''disabled''%'
     OR v_definition NOT LIKE '%ca.profile_id IS NULL OR NOT ca.is_active%'
     OR v_definition NOT LIKE '%LEFT JOIN public.content_authors%' THEN
    RAISE EXCEPTION 'post-apply failed: readiness function contract is incomplete';
  END IF;

  IF v_owner IS DISTINCT FROM 'postgres'
     OR v_security_definer IS DISTINCT FROM false
     OR NOT COALESCE('search_path=public, pg_temp' = ANY(v_config), false) THEN
    RAISE EXCEPTION 'post-apply failed: owner, security or search_path changed';
  END IF;

  IF has_function_privilege('anon', 'public.fn_horses_not_social_ready()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_horses_not_social_ready()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_horses_not_social_ready()', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply failed: execute grants changed';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.fn_horses_not_social_ready() drift
      JOIN public.profiles p ON p.id = drift.profile_id
     WHERE p.status = 'deleted' OR p.horse_status = 'disabled'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: closed horse returned by readiness function';
  END IF;
END
$postapply$;

COMMIT;

-- =======================================================================
-- ROLLBACK (Tier 3: apply as a new migration; do not edit this file)
-- =======================================================================
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.fn_horses_not_social_ready()
-- RETURNS TABLE (profile_id uuid, username text, missing text[])
-- LANGUAGE sql
-- STABLE
-- SECURITY INVOKER
-- SET search_path TO 'public', 'pg_temp'
-- AS $function$
--   SELECT p.id, p.username,
--          array_remove(ARRAY[
--            CASE WHEN ca.profile_id IS NULL THEN 'content_authors' END,
--            CASE WHEN ca.profile_id IS NOT NULL AND NOT ca.is_active THEN 'is_active' END,
--            CASE WHEN COALESCE(ca.voice, '') = '' THEN 'voice' END,
--            CASE WHEN ca.personality IS NULL THEN 'personality' END,
--            CASE WHEN COALESCE(ca.timezone, '') = '' THEN 'timezone' END,
--            CASE WHEN COALESCE(p.bio, '') = '' THEN 'bio' END,
--            CASE WHEN NOT COALESCE(p.social_profile_completed, false) THEN 'social_profile_completed' END,
--            CASE WHEN p.avatar_url IS NULL THEN 'avatar_url' END
--          ], NULL) AS missing
--     FROM public.profiles p
--     LEFT JOIN public.content_authors ca ON ca.profile_id = p.id
--    WHERE p.is_horse IS TRUE
--      AND (ca.profile_id IS NULL OR NOT ca.is_active OR COALESCE(ca.voice, '') = ''
--           OR ca.personality IS NULL OR COALESCE(ca.timezone, '') = ''
--           OR COALESCE(p.bio, '') = '' OR NOT COALESCE(p.social_profile_completed, false)
--           OR p.avatar_url IS NULL);
-- $function$;
-- COMMENT ON FUNCTION public.fn_horses_not_social_ready() IS
--   'Drift detector: horses missing any social credential. Expected empty; each row names what is missing.';
-- ALTER FUNCTION public.fn_horses_not_social_ready() OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.fn_horses_not_social_ready()
--   FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.fn_horses_not_social_ready()
--   TO authenticated, service_role;
-- COMMIT;
