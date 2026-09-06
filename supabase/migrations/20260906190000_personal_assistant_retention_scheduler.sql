-- ═══════════════════════════════════════════════════════════════════════
-- 20260906190000_personal_assistant_retention_scheduler.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Codex
-- AFFECTS:      RPC apply_personal_assistant_retention_batch(integer)
-- IRREVERSIBLE: no
--
-- WHY:
--   Retention was only applied while a user opened Data Controls. A saved
--   retention policy must continue to run when that user is inactive.
--
-- HOW:
--   - Selects only due policies in bounded, lock-safe batches.
--   - Reuses the existing per-owner retention function.
--   - Exposes execution only to the service role.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.pa_coaching_preferences') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.pa_coaching_preferences not found';
  END IF;
  IF to_regprocedure('public.apply_personal_assistant_retention(uuid)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: apply_personal_assistant_retention(uuid) not found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_personal_assistant_retention_batch(
  p_limit integer DEFAULT 250
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_result jsonb;
  v_processed integer := 0;
  v_applied integer := 0;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  FOR v_user_id IN
    SELECT user_id
    FROM public.pa_coaching_preferences
    WHERE retention_days IS NOT NULL
      AND (last_retention_run_at IS NULL OR last_retention_run_at <= now() - interval '24 hours')
    ORDER BY last_retention_run_at NULLS FIRST, user_id
    LIMIT greatest(1, least(coalesce(p_limit, 250), 1000))
    FOR UPDATE SKIP LOCKED
  LOOP
    v_result := public.apply_personal_assistant_retention(v_user_id);
    v_processed := v_processed + 1;
    IF coalesce((v_result ->> 'applied')::boolean, false) THEN
      v_applied := v_applied + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'applied', v_applied,
    'batch_limit', greatest(1, least(coalesce(p_limit, 250), 1000))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_personal_assistant_retention_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personal_assistant_retention_batch(integer) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.apply_personal_assistant_retention_batch(integer)') IS NULL THEN
    RAISE EXCEPTION 'post-apply failed: retention batch function not found';
  END IF;
  IF has_function_privilege('authenticated', 'public.apply_personal_assistant_retention_batch(integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_personal_assistant_retention_batch(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'personal assistant retention batch is exposed to a browser role';
  END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.apply_personal_assistant_retention_batch(integer);
-- COMMIT;
