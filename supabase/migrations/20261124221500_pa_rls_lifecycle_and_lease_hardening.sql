-- ===========================================================================
-- 20261124221500_pa_rls_lifecycle_and_lease_hardening.sql
-- ===========================================================================
-- TIER:        2
-- AUTHOR:      Antigravity (2a32ed83-0b9a-4a55-bc41-4be2c65f3155)
-- AFFECTS:     public.sandbox_results RLS,
--              public.purge_personal_assistant_data,
--              public.apply_personal_assistant_retention,
--              public.checkpoint_pa_leak_audit_job
-- IRREVERSIBLE: no
--
-- WHY:
--   1. public.sandbox_results had policy "sandbox_results_authenticated_select"
--      with USING (true), allowing any authenticated user to SELECT other
--      users' sandbox results.
--   2. purge_personal_assistant_data and apply_personal_assistant_retention
--      omitted user_training_leaks, user_assistant_stats, and
--      leak_review_operations from owned-data deletion and retention.
--   3. checkpoint_pa_leak_audit_job updated heartbeat_at on running checkpoints
--      without renewing lease_expires_at, allowing an active large-account
--      audit running past 90s to lose its lease mid-scan.
-- ===========================================================================

BEGIN;

-- 1. Replace overly permissive sandbox_results SELECT policy with owner-scoped join
ALTER TABLE public.sandbox_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sandbox_results_authenticated_select" ON public.sandbox_results;
DROP POLICY IF EXISTS "sandbox_results_owner_select" ON public.sandbox_results;

CREATE POLICY "sandbox_results_owner_select"
  ON public.sandbox_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sandbox_sessions s
      WHERE s.id = sandbox_results.session_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

-- 2. Complete owned-data graph deletion in purge_personal_assistant_data
CREATE OR REPLACE FUNCTION public.purge_personal_assistant_data(
  p_user_id uuid,
  p_scope text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_leak_ids uuid[] := '{}'::uuid[];
  v_session_ids uuid[] := '{}'::uuid[];
  v_receipt_id uuid;
  v_fingerprint text;
BEGIN
  IF p_user_id IS NULL OR p_scope NOT IN ('coaching', 'analysis', 'sandbox', 'all') THEN
    RAISE EXCEPTION 'invalid personal assistant purge request';
  END IF;

  IF p_scope IN ('coaching', 'all') THEN
    DELETE FROM public.pa_coach_feedback WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('coach_feedback', v_count);
    DELETE FROM public.pa_coaching_goals WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('coaching_goals', v_count);
    DELETE FROM public.pa_coaching_preferences WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('preferences', v_count);
  END IF;

  IF p_scope IN ('analysis', 'all') THEN
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_leak_ids
    FROM public.user_leaks WHERE user_id = p_user_id;

    DELETE FROM public.leak_hand_examples WHERE leak_id = ANY(v_leak_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('hand_examples', v_count);
    DELETE FROM public.leak_drill_answers WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('drill_answers', v_count);
    DELETE FROM public.leak_drill_attempts WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('drill_attempts', v_count);
    DELETE FROM public.leak_drill_sessions WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('drill_sessions', v_count);
    DELETE FROM public.leak_review_operations WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('review_operations', v_count);
    DELETE FROM public.leak_review_state WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('review_states', v_count);
    DELETE FROM public.hand_audit_decisions WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('audit_decisions', v_count);
    DELETE FROM public.pa_leak_audit_jobs WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('audit_jobs', v_count);
    DELETE FROM public.user_training_leaks WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('training_leaks', v_count);
    DELETE FROM public.user_leaks WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('leaks', v_count);
    DELETE FROM public.user_assistant_stats WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('assistant_stats', v_count);
  END IF;

  IF p_scope IN ('sandbox', 'all') THEN
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_session_ids
    FROM public.sandbox_sessions WHERE user_id = p_user_id;
    DELETE FROM public.sandbox_coach_results WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_coach_results', v_count);
    DELETE FROM public.sandbox_equity_history WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_equity_history', v_count);
    DELETE FROM public.sandbox_results WHERE session_id = ANY(v_session_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_results', v_count);
    DELETE FROM public.sandbox_sessions WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_sessions', v_count);
    DELETE FROM public.sandbox_saved_hands WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('saved_hands', v_count);
    DELETE FROM public.sandbox_analytics WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_analytics', v_count);
    DELETE FROM public.sandbox_quiz_results WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_quiz_results', v_count);
    DELETE FROM public.sandbox_bookmarks WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_bookmarks', v_count);
    DELETE FROM public.sandbox_templates WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_templates', v_count);
    DELETE FROM public.sandbox_shared_scenarios WHERE creator_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('sandbox_shared_scenarios', v_count);
    DELETE FROM public.solution_bookmarks WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('solution_bookmarks', v_count);
  END IF;

  v_fingerprint := md5(p_user_id::text || ':delete:' || p_scope || ':' || v_counts::text || ':' || clock_timestamp()::text || ':' || gen_random_uuid()::text);
  INSERT INTO public.pa_data_lifecycle_receipts (user_id, action, scope, item_counts, receipt_fingerprint)
  VALUES (p_user_id, 'delete', p_scope, v_counts, v_fingerprint)
  RETURNING id INTO v_receipt_id;

  RETURN jsonb_build_object('receipt_id', v_receipt_id, 'receipt_fingerprint', v_fingerprint, 'counts', v_counts);
END;
$function$;

-- 3. Complete owned-data graph retention in apply_personal_assistant_retention
CREATE OR REPLACE FUNCTION public.apply_personal_assistant_retention(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_days integer;
  v_last_run timestamptz;
  v_cutoff timestamptz;
  v_counts jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_old_leak_ids uuid[] := '{}'::uuid[];
  v_old_drill_batch_ids uuid[] := '{}'::uuid[];
  v_old_session_ids uuid[] := '{}'::uuid[];
  v_fingerprint text;
BEGIN
  SELECT retention_days, last_retention_run_at INTO v_days, v_last_run
  FROM public.pa_coaching_preferences
  WHERE user_id = p_user_id;
  IF v_days IS NULL THEN RETURN jsonb_build_object('applied', false, 'retention_days', null); END IF;
  IF v_last_run IS NOT NULL AND v_last_run > now() - interval '24 hours' THEN
    RETURN jsonb_build_object('applied', false, 'retention_days', v_days, 'reason', 'recently_applied');
  END IF;
  v_cutoff := now() - make_interval(days => v_days);

  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_old_leak_ids
  FROM public.user_leaks
  WHERE user_id = p_user_id AND status = 'resolved' AND coalesce(resolved_at, updated_at, created_at) < v_cutoff;
  DELETE FROM public.leak_hand_examples WHERE leak_id = ANY(v_old_leak_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('hand_examples', v_count);
  DELETE FROM public.user_leaks WHERE id = ANY(v_old_leak_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('resolved_leaks', v_count);
  DELETE FROM public.user_training_leaks
  WHERE user_id = p_user_id AND fixed_at IS NOT NULL AND coalesce(fixed_at, updated_at, detected_at) < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('resolved_training_leaks', v_count);
  DELETE FROM public.leak_review_operations WHERE user_id = p_user_id AND created_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('review_operations', v_count);
  DELETE FROM public.user_assistant_stats
  WHERE user_id = p_user_id AND updated_at IS NOT NULL AND updated_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('assistant_stats', v_count);
  DELETE FROM public.hand_audit_decisions WHERE user_id = p_user_id AND audited_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('audit_decisions', v_count);
  DELETE FROM public.pa_leak_audit_jobs WHERE user_id = p_user_id AND status IN ('completed', 'failed', 'cancelled') AND updated_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('audit_jobs', v_count);
  DELETE FROM public.pa_coach_feedback WHERE user_id = p_user_id AND status = 'resolved' AND updated_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('coach_feedback', v_count);
  DELETE FROM public.pa_coaching_goals WHERE user_id = p_user_id AND status = 'completed' AND updated_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('coaching_goals', v_count);

  SELECT coalesce(array_agg(batch_id), '{}'::uuid[]) INTO v_old_drill_batch_ids
  FROM public.leak_drill_sessions
  WHERE user_id = p_user_id AND completed_at IS NOT NULL AND completed_at < v_cutoff;
  DELETE FROM public.leak_drill_answers WHERE user_id = p_user_id AND batch_id = ANY(v_old_drill_batch_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('drill_answers', v_count);
  DELETE FROM public.leak_drill_attempts WHERE user_id = p_user_id AND batch_id = ANY(v_old_drill_batch_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('drill_attempts', v_count);
  DELETE FROM public.leak_drill_sessions WHERE user_id = p_user_id AND batch_id = ANY(v_old_drill_batch_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('drill_sessions', v_count);

  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_old_session_ids
  FROM public.sandbox_sessions WHERE user_id = p_user_id AND created_at < v_cutoff;
  DELETE FROM public.sandbox_coach_results
  WHERE user_id = p_user_id AND (created_at < v_cutoff OR session_id = ANY(v_old_session_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_coach_results', v_count);
  DELETE FROM public.sandbox_equity_history
  WHERE user_id = p_user_id AND (created_at < v_cutoff OR session_id = ANY(v_old_session_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_equity_history', v_count);
  DELETE FROM public.sandbox_results WHERE session_id = ANY(v_old_session_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_results', v_count);
  DELETE FROM public.sandbox_sessions WHERE id = ANY(v_old_session_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_sessions', v_count);
  DELETE FROM public.sandbox_saved_hands WHERE user_id = p_user_id AND created_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('saved_hands', v_count);
  DELETE FROM public.sandbox_analytics WHERE user_id = p_user_id AND created_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_analytics', v_count);
  DELETE FROM public.sandbox_quiz_results WHERE user_id = p_user_id AND created_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_quiz_results', v_count);
  DELETE FROM public.sandbox_bookmarks WHERE user_id = p_user_id AND created_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_bookmarks', v_count);
  DELETE FROM public.sandbox_templates WHERE user_id = p_user_id AND created_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_templates', v_count);
  DELETE FROM public.sandbox_shared_scenarios WHERE creator_id = p_user_id AND created_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sandbox_shared_scenarios', v_count);
  DELETE FROM public.solution_bookmarks WHERE user_id = p_user_id AND created_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('solution_bookmarks', v_count);

  UPDATE public.pa_coaching_preferences SET last_retention_run_at = now(), updated_at = now()
  WHERE user_id = p_user_id;
  v_fingerprint := md5(p_user_id::text || ':retention:' || v_counts::text || ':' || clock_timestamp()::text || ':' || gen_random_uuid()::text);
  INSERT INTO public.pa_data_lifecycle_receipts (user_id, action, scope, item_counts, receipt_fingerprint)
  VALUES (p_user_id, 'retention', 'all', v_counts, v_fingerprint);
  RETURN jsonb_build_object('applied', true, 'retention_days', v_days, 'cutoff', v_cutoff, 'counts', v_counts);
END;
$function$;

-- 4. Renew audit-job lease on every active running checkpoint
CREATE OR REPLACE FUNCTION public.checkpoint_pa_leak_audit_job(
  p_job_id uuid,
  p_worker_token uuid,
  p_status text,
  p_stage text,
  p_audit_cursor text,
  p_progress jsonb,
  p_result jsonb DEFAULT NULL,
  p_reconciliation jsonb DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS SETOF public.pa_leak_audit_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.pa_leak_audit_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('queued', 'running', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid audit status';
  END IF;
  UPDATE public.pa_leak_audit_jobs
     SET status = p_status,
         stage = LEFT(COALESCE(NULLIF(p_stage, ''), stage), 80),
         audit_cursor = p_audit_cursor,
         progress = COALESCE(p_progress, progress),
         result = COALESCE(p_result, result),
         reconciliation = COALESCE(p_reconciliation, reconciliation),
         error_code = p_error_code,
         error_message = LEFT(p_error_message, 500),
         heartbeat_at = now(),
         queued_at = CASE WHEN p_status = 'queued' THEN now() ELSE queued_at END,
         completed_at = CASE WHEN p_status IN ('completed', 'failed', 'cancelled') THEN now() ELSE NULL END,
         worker_token = CASE WHEN p_status = 'running' THEN worker_token ELSE NULL END,
         lease_expires_at = CASE
           WHEN p_status = 'running' THEN GREATEST(COALESCE(lease_expires_at, now()), now() + interval '90 seconds')
           ELSE NULL
         END,
         updated_at = now()
   WHERE id = p_job_id AND status = 'running' AND worker_token = p_worker_token
   RETURNING * INTO v_job;
  IF FOUND THEN RETURN NEXT v_job; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_personal_assistant_data(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_personal_assistant_retention(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_pa_leak_audit_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_personal_assistant_data(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_personal_assistant_retention(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_pa_leak_audit_job(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, text) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sandbox_results'
      AND policyname = 'sandbox_results_authenticated_select'
  ) THEN
    RAISE EXCEPTION 'legacy permissive sandbox_results_authenticated_select policy still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sandbox_results'
      AND policyname = 'sandbox_results_owner_select'
  ) THEN
    RAISE EXCEPTION 'sandbox_results_owner_select policy is missing';
  END IF;

  IF has_function_privilege('authenticated', 'public.purge_personal_assistant_data(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.purge_personal_assistant_data(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'purge_personal_assistant_data is exposed to a browser role';
  END IF;
END $$;

COMMIT;
