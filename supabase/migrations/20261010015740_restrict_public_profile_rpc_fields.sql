-- ═══════════════════════════════════════════════════════════════════════
-- 20261010015740_restrict_public_profile_rpc_fields.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3 (drop/recreate RPC to narrow its TABLE return type)
-- AUTHOR:       Codex public-profile privacy repair
-- AFFECTS:      public.get_public_profile_by_username(text)
-- IRREVERSIBLE: yes (forbidden public keys must not be restored; the safe
--               recovery section recreates the narrowed contract)
--
-- WHY:
--   A logged-out publishable-key call returned the keys `full_name` and
--   `diamonds`. The body already replaced both values with NULL, but a TABLE
--   return type still exposes those private field names in every public JSON
--   response. The only browser consumer needs the seven display-safe fields.
--
-- HOW:
--   Refuse drift from the reviewed single overload, drop it without CASCADE,
--   recreate the same case-insensitive/trimmed lookup with only seven public
--   fields, restore the intentional anon/authenticated/service_role grants,
--   and assert the exact tuple, owner, settings and privileges.
--
-- Never apply between :50 and :03 UTC (the break window refuses DDL).
-- ═══════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_fn oid := to_regprocedure('public.get_public_profile_by_username(text)');
  v_count integer;
  v_body text;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_public_profile_by_username';

  IF v_fn IS NULL OR v_count <> 1 THEN
    RAISE EXCEPTION 'pre-flight: expected exactly one public.get_public_profile_by_username overload, found %', v_count;
  END IF;

  SELECT lower(regexp_replace(p.prosrc, '\s+', ' ', 'g'))
    INTO v_body
    FROM pg_proc p
   WHERE p.oid = v_fn;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_language l ON l.oid = p.prolang
     WHERE p.oid = v_fn
       AND pg_get_userbyid(p.proowner) = 'postgres'
       AND l.lanname = 'plpgsql'
       AND p.provolatile = 's'
       AND p.prosecdef
       AND p.proconfig = ARRAY['search_path=public']::text[]
       AND pg_get_function_result(p.oid) =
         'TABLE(id uuid, username text, full_name text, display_name text, bio text, avatar_url text, level integer, diamonds integer, created_at timestamp with time zone)'
  ) THEN
    RAISE EXCEPTION 'pre-flight: public profile RPC catalog contract drifted';
  END IF;

  IF position('lower(p.username)' IN v_body) = 0
     OR position('lower(trim(both '' @'' from coalesce(p_username' IN v_body) = 0
     OR position('null::text' IN v_body) = 0
     OR position('null::integer' IN v_body) = 0
     OR position('limit 1' IN v_body) = 0 THEN
    RAISE EXCEPTION 'pre-flight: public profile RPC reviewed lookup body drifted';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('id', 'uuid'), ('username', 'text'), ('display_name', 'text'),
        ('bio', 'text'), ('avatar_url', 'text'), ('level', 'integer'),
        ('created_at', 'timestamp with time zone')
      ) expected(column_name, data_type)
     WHERE NOT EXISTS (
       SELECT 1
         FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'profiles'
          AND c.column_name = expected.column_name
          AND c.data_type = expected.data_type
     )
  ) THEN
    RAISE EXCEPTION 'pre-flight: profiles public-display columns are missing or changed';
  END IF;

  IF NOT has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'pre-flight: expected browser/service EXECUTE contract drifted';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_depend d
     WHERE d.refclassid = 'pg_proc'::regclass
       AND d.refobjid = v_fn
       AND d.deptype NOT IN ('i', 'e')
  ) THEN
    RAISE EXCEPTION 'pre-flight: dependent objects prevent safe RESTRICT replacement';
  END IF;
END
$preflight$;

-- PostgreSQL cannot change OUT/TABLE columns with CREATE OR REPLACE. RESTRICT
-- is intentional: any unexpected database dependency aborts the transaction.
DROP FUNCTION public.get_public_profile_by_username(text);

CREATE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  level integer,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id,
         p.username,
         p.display_name,
         p.bio,
         p.avatar_url,
         p.level,
         p.created_at
    FROM public.profiles p
   WHERE lower(p.username) = lower(trim(BOTH ' @' FROM coalesce(p_username, '')))
   LIMIT 1;
END;
$function$;

ALTER FUNCTION public.get_public_profile_by_username(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_profile_by_username(text) IS
  'Logged-out public profile lookup. Returns only display-safe fields; never legal identity or wallet data.';

DO $postcondition$
DECLARE
  v_fn oid := to_regprocedure('public.get_public_profile_by_username(text)');
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_public_profile_by_username';

  IF v_fn IS NULL OR v_count <> 1 THEN
    RAISE EXCEPTION 'post-condition: expected one public profile RPC overload, found %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_language l ON l.oid = p.prolang
     WHERE p.oid = v_fn
       AND pg_get_userbyid(p.proowner) = 'postgres'
       AND l.lanname = 'plpgsql'
       AND p.provolatile = 's'
       AND p.prosecdef
       AND p.proconfig = ARRAY['search_path=public, extensions']::text[]
       AND pg_get_function_result(p.oid) =
         'TABLE(id uuid, username text, display_name text, bio text, avatar_url text, level integer, created_at timestamp with time zone)'
       AND position('full_name' IN lower(p.prosrc)) = 0
       AND position('diamonds' IN lower(p.prosrc)) = 0
  ) THEN
    RAISE EXCEPTION 'post-condition: narrowed public profile RPC catalog contract is not exact';
  END IF;

  IF NOT has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = v_fn)) acl
        WHERE acl.grantee = 0
     ) THEN
    RAISE EXCEPTION 'post-condition: public profile RPC privileges are not exact';
  END IF;
END
$postcondition$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- SAFE RECOVERY (Tier 3: copy into a NEW migration; never restore private keys)
-- ═════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP FUNCTION public.get_public_profile_by_username(text);
-- CREATE FUNCTION public.get_public_profile_by_username(p_username text)
-- RETURNS TABLE (
--   id uuid, username text, display_name text, bio text, avatar_url text,
--   level integer, created_at timestamptz
-- )
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
-- AS $function$
-- BEGIN
--   RETURN QUERY
--   SELECT p.id, p.username, p.display_name, p.bio, p.avatar_url, p.level,
--          p.created_at
--     FROM public.profiles p
--    WHERE lower(p.username) = lower(trim(BOTH ' @' FROM coalesce(p_username, '')))
--    LIMIT 1;
-- END;
-- $function$;
-- ALTER FUNCTION public.get_public_profile_by_username(text) OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.get_public_profile_by_username(text) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO anon, authenticated, service_role;
-- COMMIT;
