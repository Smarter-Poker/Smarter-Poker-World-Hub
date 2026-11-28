-- ═══════════════════════════════════════════════════════════════════════
-- 02_fn_profile_settings_set_key.sql
-- Install as: supabase/migrations/<UTC stamp>_fn_profile_settings_set_key.sql
-- DRAFT - NOT INSTALLED. Nothing in this folder has been applied anywhere.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive: one new function)
-- AUTHOR:      Claude (Bankroll Manager programme, Wave 4 db lane, 2026-11-28)
-- AFFECTS:     rpcs: public.fn_profile_settings_set_key(text, jsonb)
-- IRREVERSIBLE: no
--
-- CLIENT CODE THAT DEPENDS ON THIS:
--   src/lib/bankroll/tokePrefs.mjs saveTokePrefsToAccount (called by
--   src/components/bankroll/toke/useTokePrefs.js updatePref) calls
--   supabase.rpc('fn_profile_settings_set_key', { p_key: 'tokeTracker', p_value }).
--   Until this is installed PostgREST answers PGRST202 and the client falls
--   back to its read-whole/write-whole update, so the client ships first.
--
-- WHY:
--   Toke Tracker preferences live in profiles.settings.tokeTracker. The
--   client read the whole settings object, replaced one key, and wrote the
--   whole object back. Any other writer of profiles.settings between that
--   read and write (another tab, another settings surface) lost its keys.
--   This function merges ONE top-level key in a single UPDATE, so a
--   concurrent writer of a different key is never overwritten.
--
-- HOW:
--   - SECURITY INVOKER: runs as the caller, so the existing profiles RLS
--     (profiles_update: auth.uid() = id) and column grants (authenticated has
--     SELECT/UPDATE on profiles.settings) still decide. It touches only
--     the caller's own row (id = auth.uid()); nobody can name another user.
--   - Key restricted to ^[A-Za-z][A-Za-z0-9_]{0,63}$ (no path tricks).
--   - Raises 28000 when signed out, 22023 on a bad key, P0002 when the
--     caller has no profile row. Returns the new settings object.
--   - EXECUTE for authenticated only; revoked from PUBLIC and anon.
--   - Every BEFORE/AFTER UPDATE trigger on profiles fires exactly as it does
--     for today's client .update(), because this is the same UPDATE.
--
-- BREAK WINDOW: the database refuses DDL from :50 to :03 UTC every hour.
-- Run `date -u` first; a refused run applied nothing - apply ONCE after :03.
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $pre$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'settings' AND data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: public.profiles.settings jsonb not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: profiles_update policy missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass) THEN
    RAISE EXCEPTION 'pre-flight failed: RLS is off on public.profiles';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'settings', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'settings', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'id', 'SELECT') THEN
    RAISE EXCEPTION 'pre-flight failed: authenticated lacks SELECT/UPDATE on profiles.settings or SELECT on profiles.id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_profile_settings_set_key'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: fn_profile_settings_set_key already exists (installed already?)';
  END IF;
END
$pre$;

-- ─── 2. THE CHANGE ────────────────────────────────────────────────────
CREATE FUNCTION public.fn_profile_settings_set_key(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_settings jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'invalid settings key' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles
     SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(p_key, p_value)
   WHERE id = v_uid
  RETURNING settings INTO v_settings;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_settings;
END
$fn$;

COMMENT ON FUNCTION public.fn_profile_settings_set_key(text, jsonb) IS
  'Sets one top-level key of the caller''s own profiles.settings in place (RLS applies, security invoker). Replaces read-whole/write-whole updates that could drop a concurrent writer''s keys. Bankroll Manager Toke prefs, 2026-11-28.';

REVOKE ALL ON FUNCTION public.fn_profile_settings_set_key(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_profile_settings_set_key(text, jsonb) TO authenticated;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $post$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_profile_settings_set_key') <> 1 THEN
    RAISE EXCEPTION 'post-apply: expected exactly one fn_profile_settings_set_key overload';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_profile_settings_set_key(text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: authenticated cannot execute fn_profile_settings_set_key';
  END IF;
  IF has_function_privilege('anon', 'public.fn_profile_settings_set_key(text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply: anon can execute fn_profile_settings_set_key';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_profile_settings_set_key(text, jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'post-apply: function must be SECURITY INVOKER';
  END IF;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if the function itself is faulty; the client falls back to
-- its read-then-write path on PGRST202, so dropping it is safe):
-- BEGIN;
-- SET LOCAL lock_timeout = '2s';
-- DROP FUNCTION IF EXISTS public.fn_profile_settings_set_key(text, jsonb);
-- COMMIT;
-- After a drop PostgREST needs a schema reload (NOTIFY pgrst, 'reload schema')
-- before it answers PGRST202 instead of a stale plan.
-- ═══════════════════════════════════════════════════════════════════════
