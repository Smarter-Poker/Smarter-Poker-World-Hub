-- ============================================================================
-- 20261005233500_trivia_preferences_atomic_cas.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex Phase 10 progress/account lane
-- AFFECTS:     public.profiles, public.update_page_preferences,
--              public.update_trivia_preferences_cas
-- IRREVERSIBLE: no
--
-- WHY:
--   Trivia settings previously read a JSON snapshot and then replaced the
--   whole profile column in a separate request. Two devices could both pass
--   the read-time drift check and the later write could silently overwrite the
--   first. The revision was also stored inside browser-authored JSON, so it was
--   not an authoritative compare-and-swap token.
--
-- HOW:
--   - Adds a server-owned bigint revision beside trivia_preferences.
--   - Removes authenticated direct writes and the generic preference RPC
--     bypass for this one column.
--   - Adds a JWT-bound, row-locked CAS RPC that accepts an expected revision,
--     increments revision only on a changed value, and returns the current
--     cloud snapshot on conflict.
--   - Retains a trigger so every trusted server-side preference write advances
--     the same revision and no writer can assign a revision directly.
-- ============================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $preflight$
DECLARE
  v_update_rpc regprocedure := to_regprocedure(
    'public.update_page_preferences(uuid,text,jsonb)'
  );
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.profiles not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'trivia_preferences'
       AND data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: profiles.trivia_preferences jsonb not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: profiles.updated_at not found';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'trivia_preferences_revision'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: profiles.trivia_preferences_revision already exists';
  END IF;

  IF v_update_rpc IS NULL
     OR pg_get_function_result(v_update_rpc) <> 'jsonb' THEN
    RAISE EXCEPTION 'pre-flight failed: current update_page_preferences jsonb RPC not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'pre-flight failed: required Supabase roles not found';
  END IF;
END
$preflight$;

-- 2. AUTHORITATIVE REVISION AND WRITE GUARD
ALTER TABLE public.profiles
  ADD COLUMN trivia_preferences_revision bigint NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_trivia_preferences_revision_nonnegative
  CHECK (trivia_preferences_revision >= 0) NOT VALID;

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_trivia_preferences_revision_nonnegative;

COMMENT ON COLUMN public.profiles.trivia_preferences_revision IS
  'Server-owned compare-and-swap revision for the account trivia_preferences document.';

CREATE FUNCTION public.guard_trivia_preferences_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $function$
BEGIN
  IF NEW.trivia_preferences IS DISTINCT FROM OLD.trivia_preferences THEN
    NEW.trivia_preferences_revision := OLD.trivia_preferences_revision + 1;
  ELSE
    -- A revision is an observation token, never browser- or caller-authored.
    NEW.trivia_preferences_revision := OLD.trivia_preferences_revision;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_trivia_preferences_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER profiles_trivia_preferences_revision_guard
BEFORE UPDATE OF trivia_preferences, trivia_preferences_revision
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_trivia_preferences_revision();

-- The July profile hardening migration removed blanket table UPDATE and
-- granted safe columns individually. Revoke this column explicitly and keep
-- both values readable by the signed-in owner through existing profile RLS.
REVOKE UPDATE (trivia_preferences, trivia_preferences_revision)
  ON TABLE public.profiles FROM authenticated, anon;
GRANT SELECT (trivia_preferences, trivia_preferences_revision)
  ON TABLE public.profiles TO authenticated;

-- 3. JWT-BOUND ATOMIC CAS
CREATE FUNCTION public.update_trivia_preferences_cas(
  p_expected_revision bigint,
  p_preferences jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_current jsonb;
  v_requested jsonb;
  v_revision bigint;
  v_updated_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Expected trivia preference revision is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_preferences) IS DISTINCT FROM 'object'
     OR pg_column_size(p_preferences) > 131072
     OR p_preferences ? '_sync' THEN
    RAISE EXCEPTION 'Trivia preferences payload is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_requested := p_preferences;

  SELECT COALESCE(p.trivia_preferences, '{}'::jsonb),
         p.trivia_preferences_revision,
         p.updated_at
    INTO v_current, v_revision, v_updated_at
    FROM public.profiles AS p
   WHERE p.id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Response-loss retries are idempotent. A stale token may confirm the same
  -- final document, but can never replace a different document.
  IF (v_current - '_sync') = v_requested THEN
    RETURN jsonb_build_object(
      'contract', 'trivia-preferences-cas/1',
      'version', 1,
      'success', true,
      'conflict', false,
      'changed', false,
      'revision', v_revision,
      'preferences', v_current - '_sync',
      'updatedAt', v_updated_at
    );
  END IF;

  IF v_revision <> p_expected_revision THEN
    RETURN jsonb_build_object(
      'contract', 'trivia-preferences-cas/1',
      'version', 1,
      'success', false,
      'conflict', true,
      'changed', false,
      'revision', v_revision,
      'preferences', v_current - '_sync',
      'updatedAt', v_updated_at
    );
  END IF;

  UPDATE public.profiles
     SET trivia_preferences = v_requested,
         updated_at = clock_timestamp()
   WHERE id = v_user_id
  RETURNING trivia_preferences,
            trivia_preferences_revision,
            updated_at
       INTO v_current, v_revision, v_updated_at;

  RETURN jsonb_build_object(
    'contract', 'trivia-preferences-cas/1',
    'version', 1,
    'success', true,
    'conflict', false,
    'changed', true,
    'revision', v_revision,
    'preferences', v_current,
    'updatedAt', v_updated_at
  );
END
$function$;

COMMENT ON FUNCTION public.update_trivia_preferences_cas(bigint, jsonb) IS
  'Atomically replaces the signed-in account trivia preferences only at the expected server revision; returns the current cloud snapshot on conflict.';

REVOKE ALL ON FUNCTION public.update_trivia_preferences_cas(bigint, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_trivia_preferences_cas(bigint, jsonb)
  TO authenticated;

-- The general preference writer remains available for every other maintained
-- preference column, but Trivia must use the revisioned authority above.
CREATE OR REPLACE FUNCTION public.update_page_preferences(
  p_user_id uuid,
  p_column_name text,
  p_preferences jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_preferences jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: User ID mismatch';
  END IF;

  IF p_column_name NOT IN (
    'bankroll_preferences', 'video_preferences',
    'video_library_preferences', 'news_preferences',
    'memory_games_preferences', 'diamond_arcade_preferences',
    'diamond_arena_preferences', 'poker_near_me_preferences'
  ) THEN
    RAISE EXCEPTION 'Invalid preference column: %', p_column_name;
  END IF;

  EXECUTE format(
    'UPDATE public.profiles SET %I = $1, updated_at = now() WHERE id = $2 RETURNING %I',
    p_column_name,
    p_column_name
  ) INTO v_preferences USING p_preferences, p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN v_preferences;
END
$function$;

REVOKE ALL ON FUNCTION public.update_page_preferences(uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_page_preferences(uuid, text, jsonb)
  TO authenticated;

-- 4. POST-APPLY ASSERTIONS
DO $postconditions$
DECLARE
  v_cas regprocedure := to_regprocedure(
    'public.update_trivia_preferences_cas(bigint,jsonb)'
  );
  v_generic regprocedure := to_regprocedure(
    'public.update_page_preferences(uuid,text,jsonb)'
  );
  v_cas_definition text;
  v_guard_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'trivia_preferences_revision'
       AND data_type = 'bigint'
       AND is_nullable = 'NO'
       AND column_default LIKE '0%'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: authoritative trivia revision column is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.profiles'::regclass
       AND conname = 'profiles_trivia_preferences_revision_nonnegative'
       AND convalidated
  ) THEN
    RAISE EXCEPTION 'post-apply failed: trivia revision constraint is not validated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.profiles'::regclass
       AND tgname = 'profiles_trivia_preferences_revision_guard'
       AND tgenabled = 'O'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'post-apply failed: trivia revision guard trigger is missing';
  END IF;

  IF v_cas IS NULL OR v_generic IS NULL THEN
    RAISE EXCEPTION 'post-apply failed: preference RPC contract is missing';
  END IF;

  SELECT pg_get_functiondef(v_cas) INTO v_cas_definition;
  SELECT pg_get_functiondef('public.guard_trivia_preferences_revision()'::regprocedure)
    INTO v_guard_definition;

  IF position('FOR UPDATE' IN v_cas_definition) = 0
     OR position('v_revision <> p_expected_revision' IN v_cas_definition) = 0
     OR position('OLD.trivia_preferences_revision + 1' IN v_guard_definition) = 0 THEN
    RAISE EXCEPTION 'post-apply failed: row lock, comparison, or server increment is absent';
  END IF;

  IF NOT has_function_privilege(
      'authenticated',
      'public.update_trivia_preferences_cas(bigint,jsonb)',
      'EXECUTE'
    )
     OR has_function_privilege(
      'anon',
      'public.update_trivia_preferences_cas(bigint,jsonb)',
      'EXECUTE'
    )
     OR has_function_privilege(
      'service_role',
      'public.update_trivia_preferences_cas(bigint,jsonb)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'post-apply failed: CAS RPC grants are not least privilege';
  END IF;

  IF has_column_privilege(
      'authenticated', 'public.profiles', 'trivia_preferences', 'UPDATE'
    )
     OR has_column_privilege(
      'authenticated', 'public.profiles', 'trivia_preferences_revision', 'UPDATE'
    ) THEN
    RAISE EXCEPTION 'post-apply failed: browser role retains direct Trivia preference authority';
  END IF;

  IF position(
      '''trivia_preferences'''
      IN pg_get_functiondef(v_generic)
    ) > 0 THEN
    RAISE EXCEPTION 'post-apply failed: generic preference RPC still accepts Trivia writes';
  END IF;
END
$postconditions$;

COMMIT;

-- ============================================================================
-- ROLLBACK (Tier 3; apply only as a NEW forward migration)
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS profiles_trivia_preferences_revision_guard
--   ON public.profiles;
-- DROP FUNCTION IF EXISTS public.guard_trivia_preferences_revision();
-- DROP FUNCTION IF EXISTS public.update_trivia_preferences_cas(bigint, jsonb);
-- CREATE OR REPLACE FUNCTION public.update_page_preferences(
--   p_user_id uuid, p_column_name text, p_preferences jsonb
-- ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
-- SET search_path = public AS $rollback$
-- DECLARE v_preferences jsonb;
-- BEGIN
--   IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
--     RAISE EXCEPTION 'Unauthorized: User ID mismatch';
--   END IF;
--   IF p_column_name NOT IN ('bankroll_preferences','trivia_preferences','video_preferences',
--     'video_library_preferences','news_preferences','memory_games_preferences',
--     'diamond_arcade_preferences','diamond_arena_preferences','poker_near_me_preferences') THEN
--     RAISE EXCEPTION 'Invalid preference column: %', p_column_name;
--   END IF;
--   EXECUTE format(
--     'UPDATE profiles SET %I = $1, updated_at = now() WHERE id = $2 RETURNING %I',
--     p_column_name, p_column_name
--   ) INTO v_preferences USING p_preferences, p_user_id;
--   IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
--   RETURN v_preferences;
-- END
-- $rollback$;
-- GRANT UPDATE (trivia_preferences) ON public.profiles TO authenticated;
-- ALTER TABLE public.profiles
--   DROP CONSTRAINT IF EXISTS profiles_trivia_preferences_revision_nonnegative;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS trivia_preferences_revision;
-- COMMIT;
