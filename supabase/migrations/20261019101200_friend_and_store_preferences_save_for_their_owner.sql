-- ═══════════════════════════════════════════════════════════════════════
-- 20261019101200_friend_and_store_preferences_save_for_their_owner.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (launch bug fixes, 2026-10-19)
-- AFFECTS:      public.update_friend_preferences, public.update_store_preferences
-- IRREVERSIBLE: no
--
-- WHY:
--   /hub/friends settings and the Diamond Store preferences save through
--   src/services/preferences-service.js -> rpc('update_friend_preferences')
--   and rpc('update_store_preferences'). Both functions are EXECUTE-able only
--   by postgres and service_role, so every save from the browser failed with
--   42501 and the toggles reset on the next visit.
--
--   Both are SECURITY INVOKER: they run as the caller, under the profiles
--   RLS policy (UPDATE only where auth.uid() = id) and the caller's column
--   grants (authenticated already holds UPDATE on friend_preferences and
--   store_preferences). Granting EXECUTE therefore lets a player do nothing
--   they cannot already do with a direct PATCH of their own row. To make
--   that explicit instead of relying on a silent zero-row update, the bodies
--   now refuse a p_user_id that is not the caller, refuse anything but a JSON
--   object, cap the payload size, and report a missing profile.
--
-- HOW:
--   - CREATE OR REPLACE both functions with the same signature, still
--     SECURITY INVOKER, search_path pinned
--   - GRANT EXECUTE TO authenticated (anon stays without it)
--   - assert grants and invoker security
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $pre$
BEGIN
  IF to_regprocedure('public.update_friend_preferences(uuid, jsonb)') IS NULL
     OR to_regprocedure('public.update_store_preferences(uuid, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: preference functions not found with (uuid, jsonb)';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('update_friend_preferences', 'update_store_preferences')) <> 2 THEN
    RAISE EXCEPTION 'pre-flight failed: unexpected overloads of the preference functions';
  END IF;
END $pre$;

CREATE OR REPLACE FUNCTION public.update_friend_preferences(p_user_id uuid, p_preferences jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $function$
BEGIN
  IF p_preferences IS NULL OR jsonb_typeof(p_preferences) <> 'object' THEN
    RAISE EXCEPTION 'friend preferences must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_preferences::text) > 4096 THEN
    RAISE EXCEPTION 'friend preferences are too large' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'you can only change your own friend preferences' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET friend_preferences = COALESCE(friend_preferences, '{}'::jsonb) || p_preferences
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN p_preferences;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_store_preferences(p_user_id uuid, p_preferences jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $function$
BEGIN
  IF p_preferences IS NULL OR jsonb_typeof(p_preferences) <> 'object' THEN
    RAISE EXCEPTION 'store preferences must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_preferences::text) > 4096 THEN
    RAISE EXCEPTION 'store preferences are too large' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'you can only change your own store preferences' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET store_preferences = COALESCE(store_preferences, '{}'::jsonb) || p_preferences
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN p_preferences;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_friend_preferences(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_store_preferences(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_friend_preferences(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_store_preferences(uuid, jsonb) TO authenticated, service_role;

DO $post$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.update_friend_preferences(uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.update_store_preferences(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply failed: authenticated cannot execute the preference functions';
  END IF;
  IF has_function_privilege('anon', 'public.update_friend_preferences(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.update_store_preferences(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply failed: anon can execute a preference function';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('update_friend_preferences', 'update_store_preferences')
                AND p.prosecdef) THEN
    RAISE EXCEPTION 'post-apply failed: a preference function became SECURITY DEFINER';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'friend_preferences', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'store_preferences', 'UPDATE') THEN
    RAISE EXCEPTION 'post-apply failed: authenticated lacks the column grant the invoker functions need';
  END IF;
END $post$;

COMMIT;

-- ROLLBACK (forward migration):
-- REVOKE EXECUTE ON FUNCTION public.update_friend_preferences(uuid, jsonb) FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION public.update_store_preferences(uuid, jsonb) FROM authenticated;
