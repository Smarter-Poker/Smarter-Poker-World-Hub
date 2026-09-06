-- ===========================================================================
-- 20260906130000_personal_assistant_phase_eight_lifecycle.sql
-- ===========================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     Personal Assistant preferences, lifecycle receipts, purge RPCs
-- IRREVERSIBLE: no
--
-- WHY:
--   Players need an owner-private export, explicit retention choice, and an
--   atomic way to remove coaching, analysis, or Sandbox data. Deleting through
--   several REST calls can stop halfway and leave a misleading partial result.
--
-- HOW:
--   Extend the existing owner preference row, add an immutable receipt table,
--   and expose two service-role-only transactional functions. Club Arena source
--   hands and private recorder facts are intentionally outside these functions;
--   this control removes Personal Assistant derivatives, not poker records.
-- ===========================================================================

BEGIN;

ALTER TABLE public.pa_coaching_preferences
  ADD COLUMN IF NOT EXISTS retention_days integer,
  ADD COLUMN IF NOT EXISTS last_retention_run_at timestamptz;

ALTER TABLE public.pa_coaching_preferences
  DROP CONSTRAINT IF EXISTS pa_coaching_preferences_retention_days_check;
ALTER TABLE public.pa_coaching_preferences
  ADD CONSTRAINT pa_coaching_preferences_retention_days_check
  CHECK (retention_days IS NULL OR retention_days IN (30, 90, 180, 365));

ALTER TABLE public.pa_coaching_preferences
  DROP CONSTRAINT IF EXISTS pa_coaching_preferences_saved_view_check;
ALTER TABLE public.pa_coaching_preferences
  ADD CONSTRAINT pa_coaching_preferences_saved_view_check
  CHECK (saved_view IN ('coach', 'evidence', 'timeline', 'goals', 'report', 'data'));

CREATE TABLE IF NOT EXISTS public.pa_data_lifecycle_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('export', 'delete', 'retention')),
  scope text NOT NULL CHECK (scope IN ('coaching', 'analysis', 'sandbox', 'all')),
  item_counts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(item_counts) = 'object'),
  receipt_fingerprint text NOT NULL CHECK (receipt_fingerprint ~ '^[a-f0-9]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pa_data_lifecycle_receipts_owner_recent
  ON public.pa_data_lifecycle_receipts (user_id, created_at DESC);

ALTER TABLE public.pa_data_lifecycle_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pa_data_lifecycle_receipts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pa_data_lifecycle_receipts_owner_read ON public.pa_data_lifecycle_receipts;
CREATE POLICY pa_data_lifecycle_receipts_owner_read ON public.pa_data_lifecycle_receipts
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS pa_data_lifecycle_receipts_service_insert ON public.pa_data_lifecycle_receipts;
CREATE POLICY pa_data_lifecycle_receipts_service_insert ON public.pa_data_lifecycle_receipts
  FOR INSERT TO service_role WITH CHECK (true);

REVOKE ALL ON TABLE public.pa_data_lifecycle_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pa_data_lifecycle_receipts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.pa_data_lifecycle_receipts TO service_role;

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
    DELETE FROM public.leak_review_state WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('review_states', v_count);
    DELETE FROM public.hand_audit_decisions WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('audit_decisions', v_count);
    DELETE FROM public.pa_leak_audit_jobs WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('audit_jobs', v_count);
    DELETE FROM public.user_leaks WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('leaks', v_count);
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

  v_fingerprint := md5(p_user_id::text || ':' || p_scope || ':' || v_counts::text || ':' || clock_timestamp()::text || ':' || gen_random_uuid()::text);
  INSERT INTO public.pa_data_lifecycle_receipts (user_id, action, scope, item_counts, receipt_fingerprint)
  VALUES (p_user_id, 'delete', p_scope, v_counts, v_fingerprint)
  RETURNING id INTO v_receipt_id;

  RETURN jsonb_build_object('receipt_id', v_receipt_id, 'fingerprint', v_fingerprint, 'counts', v_counts);
END;
$function$;

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

REVOKE ALL ON FUNCTION public.purge_personal_assistant_data(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_personal_assistant_retention(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_personal_assistant_data(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_personal_assistant_retention(uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'pa_data_lifecycle_receipts'
      AND policyname = 'pa_data_lifecycle_receipts_owner_read'
  ) THEN RAISE EXCEPTION 'lifecycle receipt owner policy is missing'; END IF;
  IF has_function_privilege('authenticated', 'public.purge_personal_assistant_data(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.purge_personal_assistant_data(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'personal assistant purge is exposed to a browser role';
  END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.apply_personal_assistant_retention(uuid);
-- DROP FUNCTION IF EXISTS public.purge_personal_assistant_data(uuid, text);
-- DROP TABLE IF EXISTS public.pa_data_lifecycle_receipts;
-- ALTER TABLE public.pa_coaching_preferences DROP COLUMN IF EXISTS last_retention_run_at;
-- ALTER TABLE public.pa_coaching_preferences DROP COLUMN IF EXISTS retention_days;
-- ALTER TABLE public.pa_coaching_preferences DROP CONSTRAINT IF EXISTS pa_coaching_preferences_saved_view_check;
-- ALTER TABLE public.pa_coaching_preferences ADD CONSTRAINT pa_coaching_preferences_saved_view_check
--   CHECK (saved_view IN ('coach', 'evidence', 'timeline', 'goals', 'report'));
-- COMMIT;
