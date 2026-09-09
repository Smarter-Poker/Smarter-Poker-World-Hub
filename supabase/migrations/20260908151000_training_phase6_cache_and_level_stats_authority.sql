-- Phase 6 closeout: keep the strict cache-grade contract after the Phase 3
-- event-integrity migration, add attempt-snapshot recovery, and install the
-- real two-argument level statistics RPC used by game-engine-service.

BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

DO $preflight$
BEGIN
  IF to_regclass('public.training_question_cache') IS NULL
     OR to_regclass('public.training_question_events') IS NULL
     OR to_regclass('public.training_question_snapshots') IS NULL
     OR to_regclass('public.training_attempts') IS NULL
     OR to_regclass('public.training_answers') IS NULL
     OR to_regprocedure('public.fn_training_cache_grade(jsonb,text)') IS NULL
     OR to_regprocedure('public.fn_training_grade_delivered_policy_v1(jsonb,jsonb,text,text,jsonb)') IS NULL
     OR to_regprocedure('public.fn_training_record_answer_cache_event_v1(public.training_answers)') IS NULL
     OR to_regprocedure('public.fn_training_cache_record_event(text,text,text,uuid,boolean,jsonb,timestamptz,text)') IS NULL THEN
    RAISE EXCEPTION 'TRAINING_PHASE6_CACHE_LEVEL_STATS_PREREQUISITE_MISSING';
  END IF;
END;
$preflight$;

-- 20260908140000 is already applied in production, while the older-numbered
-- Phase 6 replay migration will arrive in this release. Reinstall the strict
-- action-bound implementation here so late migration delivery cannot restore
-- the earlier checksum-only replay behavior.
CREATE OR REPLACE FUNCTION public.fn_training_cache_record_event(
  p_event_type text,
  p_event_key text,
  p_question_id text,
  p_user_id uuid DEFAULT NULL,
  p_is_correct boolean DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_occurred_at timestamptz DEFAULT now(),
  p_expected_policy_checksum text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inserted boolean := false;
  v_rows integer := 0;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_existing public.training_question_events%ROWTYPE;
  v_cache public.training_question_cache%ROWTYPE;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_expected_checksum text := lower(coalesce(p_expected_policy_checksum, ''));
  v_selected_answer text;
  v_legacy_cache_id uuid;
BEGIN
  IF p_event_type NOT IN ('served', 'answered', 'completed') THEN
    RAISE EXCEPTION 'invalid_training_cache_event_type';
  END IF;
  IF nullif(btrim(p_event_key), '') IS NULL OR length(p_event_key) > 320 THEN
    RAISE EXCEPTION 'invalid_training_cache_event_key';
  END IF;
  IF nullif(btrim(p_question_id), '') IS NULL OR length(p_question_id) > 180 THEN
    RAISE EXCEPTION 'invalid_training_cache_question_id';
  END IF;
  IF (p_event_type = 'answered') <> (p_is_correct IS NOT NULL) THEN
    RAISE EXCEPTION 'answered_event_requires_is_correct';
  END IF;
  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'invalid_training_cache_event_metadata';
  END IF;
  IF v_metadata @> '{"historicalPolicyBinding":false}'::jsonb THEN
    RAISE EXCEPTION 'bound_event_cannot_claim_historical_binding';
  END IF;
  IF v_expected_checksum !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'training_cache_event_missing_policy_checksum';
  END IF;

  -- Preserve only the two explicit rolling-deploy compatibility readers from
  -- 081400. All other answered callers must submit the selected action.
  IF p_event_type = 'answered'
     AND nullif(btrim(v_metadata ->> 'selectedAnswer'), '') IS NULL THEN
    IF v_metadata ->> 'consumer' = 'daily-challenge' THEN
      SELECT challenge.selected_action INTO v_selected_answer
      FROM public.training_daily_challenge challenge
      WHERE challenge.user_id = p_user_id
        AND challenge.daily_id = v_metadata ->> 'dailyId'
      LIMIT 1;
    ELSIF v_metadata ->> 'consumer' = 'verified-leak-drill' THEN
      SELECT cache_row.id INTO v_legacy_cache_id
      FROM public.training_question_cache cache_row
      WHERE cache_row.question_id = p_question_id;
      SELECT CASE WHEN answer.timed_out THEN '__timeout__' ELSE answer.selected_answer END
      INTO v_selected_answer
      FROM public.leak_drill_answers answer
      WHERE answer.user_id = p_user_id
        AND answer.batch_id::text = v_metadata ->> 'batchId'
        AND answer.question_id = v_legacy_cache_id::text
      LIMIT 1;
    END IF;
    IF nullif(btrim(v_selected_answer), '') IS NULL THEN
      RAISE EXCEPTION 'answered_event_requires_selected_answer';
    END IF;
    v_metadata := v_metadata || jsonb_build_object('selectedAnswer', v_selected_answer);
  END IF;

  -- Preserve the Phase 6 immutable replay contract while requiring every
  -- checksum-bound field introduced by 081400. An exact existing receipt is
  -- replayable after its mutable cache row changes or disappears; a changed
  -- action or any other metadata fails closed.
  SELECT * INTO v_existing
  FROM public.training_question_events event_row
  WHERE event_row.event_type = p_event_type
    AND event_row.event_key = p_event_key;
  IF FOUND THEN
    IF v_existing.question_id <> p_question_id
       OR v_existing.user_id IS DISTINCT FROM p_user_id
       OR v_existing.is_correct IS DISTINCT FROM p_is_correct
       OR v_existing.policy_checksum <> v_expected_checksum
       OR v_existing.binding_status <> 'CHECKSUM_BOUND'
       OR v_existing.metadata IS DISTINCT FROM v_metadata THEN
      RAISE EXCEPTION 'training_cache_event_binding_mismatch';
    END IF;
    RETURN jsonb_build_object(
      'inserted', false,
      'questionId', v_existing.question_id,
      'cacheRowFound', false,
      'bindingStatus', v_existing.binding_status,
      'policyChecksum', v_existing.policy_checksum,
      'served', 0,
      'answered', 0,
      'correct', 0,
      'completed', 0
    );
  END IF;

  SELECT * INTO v_cache
  FROM public.training_question_cache cache_row
  WHERE cache_row.question_id = p_question_id
    AND cache_row.quality_status IN ('active', 'active_fallback')
  FOR UPDATE;
  IF v_cache.id IS NULL THEN
    RAISE EXCEPTION 'training_cache_event_question_not_active';
  END IF;
  IF v_expected_checksum <> v_cache.policy_checksum THEN
    RAISE EXCEPTION 'training_cache_event_stale_policy';
  END IF;

  INSERT INTO public.training_question_events (
    event_type, event_key, question_id, user_id, is_correct, policy_checksum,
    metadata, occurred_at, binding_status
  ) VALUES (
    p_event_type, p_event_key, p_question_id, p_user_id, p_is_correct,
    v_cache.policy_checksum, v_metadata, v_occurred_at, 'CHECKSUM_BOUND'
  )
  ON CONFLICT (event_type, event_key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_inserted := v_rows = 1;

  IF NOT v_inserted THEN
    SELECT * INTO v_existing
    FROM public.training_question_events event_row
    WHERE event_row.event_type = p_event_type
      AND event_row.event_key = p_event_key;
    IF v_existing.question_id <> p_question_id
       OR v_existing.user_id IS DISTINCT FROM p_user_id
       OR v_existing.is_correct IS DISTINCT FROM p_is_correct
       OR v_existing.policy_checksum <> v_cache.policy_checksum
       OR v_existing.binding_status <> 'CHECKSUM_BOUND'
       OR v_existing.metadata IS DISTINCT FROM v_metadata THEN
      RAISE EXCEPTION 'training_cache_event_binding_mismatch';
    END IF;
  ELSE
    UPDATE public.training_question_cache cache_row
    SET served_count = coalesce(cache_row.served_count, 0)
          + CASE WHEN p_event_type = 'served' THEN 1 ELSE 0 END,
        answered_count = coalesce(cache_row.answered_count, 0)
          + CASE WHEN p_event_type = 'answered' THEN 1 ELSE 0 END,
        correct_count = coalesce(cache_row.correct_count, 0)
          + CASE WHEN p_event_type = 'answered' AND p_is_correct THEN 1 ELSE 0 END,
        completed_count = coalesce(cache_row.completed_count, 0)
          + CASE WHEN p_event_type = 'completed' THEN 1 ELSE 0 END,
        times_used = least(2147483647, coalesce(cache_row.times_used, 0)
          + CASE WHEN p_event_type = 'served' THEN 1 ELSE 0 END),
        last_served_at = CASE WHEN p_event_type = 'served'
          THEN greatest(coalesce(cache_row.last_served_at, '-infinity'::timestamptz), v_occurred_at)
          ELSE cache_row.last_served_at END,
        last_answered_at = CASE WHEN p_event_type = 'answered'
          THEN greatest(coalesce(cache_row.last_answered_at, '-infinity'::timestamptz), v_occurred_at)
          ELSE cache_row.last_answered_at END,
        last_completed_at = CASE WHEN p_event_type = 'completed'
          THEN greatest(coalesce(cache_row.last_completed_at, '-infinity'::timestamptz), v_occurred_at)
          ELSE cache_row.last_completed_at END
    WHERE cache_row.question_id = p_question_id
    RETURNING cache_row.* INTO v_cache;
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'questionId', p_question_id,
    'cacheRowFound', v_cache.id IS NOT NULL,
    'bindingStatus', 'CHECKSUM_BOUND',
    'policyChecksum', v_cache.policy_checksum,
    'served', coalesce(v_cache.served_count, 0),
    'answered', coalesce(v_cache.answered_count, 0),
    'correct', coalesce(v_cache.correct_count, 0),
    'completed', coalesce(v_cache.completed_count, 0)
  );
END;
$$;

-- This is deliberately the last trigger definition in the ordered migration chain.
-- The Phase 6 validator/recorder was installed by 20260907203000 and survives
-- the Phase 3 integrity migration, which replaces only this trigger wrapper.
CREATE OR REPLACE FUNCTION public.fn_training_answer_cache_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM public.fn_training_record_answer_cache_event_v1(NEW);
  RETURN NEW;
END;
$$;

-- Keep the unrelated one-argument profile-XP function intact. This overload
-- is the real contract called by getLevelStats(userId, levelId). Production
-- already has this signature, but its historical definition trusted the
-- supplied user id and retained the default PUBLIC/anon grants. Replacing the
-- body and resetting its ACL here is therefore a security upgrade, not merely
-- creation of a missing overload.
CREATE OR REPLACE FUNCTION public.get_user_level_stats(
  p_user_id uuid,
  p_level_id integer
)
RETURNS TABLE (
  total_questions bigint,
  correct_answers bigint,
  accuracy numeric,
  avg_ev_loss numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: can only query your own level stats'
      USING ERRCODE = '42501';
  END IF;
  IF p_level_id IS NULL OR p_level_id NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid Training level'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    count(*),
    count(*) FILTER (WHERE answer.is_correct),
    coalesce(
      round(
        100 * count(*) FILTER (WHERE answer.is_correct)::numeric
          / nullif(count(*), 0),
        2
      ),
      0::numeric
    ),
    coalesce(
      round(avg(answer.ev_loss) FILTER (WHERE answer.ev_loss_measured IS TRUE), 2),
      0::numeric
    )
  FROM public.training_answers answer
  JOIN public.training_attempts attempt
    ON attempt.id = answer.attempt_id
   AND attempt.user_id = answer.user_id
  WHERE answer.user_id = p_user_id
    AND answer.level = p_level_id
    AND attempt.level = p_level_id
    AND attempt.practice_only IS FALSE
    AND attempt.status = 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_training_answer_cache_event()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_cache_record_event(
  text, text, text, uuid, boolean, jsonb, timestamptz, text
)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_record_event(
  text, text, text, uuid, boolean, jsonb, timestamptz, text
)
  TO service_role;
REVOKE ALL ON FUNCTION public.fn_training_grade_delivered_policy_v1(jsonb, jsonb, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_record_answer_cache_event_v1(public.training_answers)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_level_stats(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_level_stats(uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_user_level_stats(uuid) IS
  'Legacy one-argument profile-XP compatibility overload; intentionally preserved by the Phase 6 Training level-stats authority closeout.';

DO $postflight$
DECLARE
  v_answer_definition text;
  v_event_definition text;
  v_stats_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.fn_training_record_answer_cache_event_v1(public.training_answers)'::regprocedure
  )
  INTO v_answer_definition;
  IF position('training_answer_grade_mismatch' IN v_answer_definition) = 0
     OR position('training_answer_solver_evidence_mismatch' IN v_answer_definition) = 0
     OR position('training_answer_ev_evidence_mismatch' IN v_answer_definition) = 0
     OR position('training_answer_lineage_mismatch' IN v_answer_definition) = 0
     OR position('immutableSnapshotRecovery' IN v_answer_definition) = 0
     OR position('selectedAnswer' IN v_answer_definition) = 0
     OR position('v_existing.metadata IS DISTINCT FROM v_event_metadata' IN v_answer_definition) = 0 THEN
    RAISE EXCEPTION 'TRAINING_PHASE6_ANSWER_AUTHORITY_POSTFLIGHT_FAILED';
  END IF;

  SELECT pg_get_functiondef(
    'public.fn_training_cache_record_event(text,text,text,uuid,boolean,jsonb,timestamptz,text)'::regprocedure
  )
  INTO v_event_definition;
  IF position('answered_event_requires_selected_answer' IN v_event_definition) = 0
     OR position('v_existing.metadata IS DISTINCT FROM v_metadata' IN v_event_definition) = 0
     OR position('binding_status' IN v_event_definition) = 0
     OR has_function_privilege(
       'anon',
       'public.fn_training_cache_record_event(text,text,text,uuid,boolean,jsonb,timestamptz,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.fn_training_cache_record_event(text,text,text,uuid,boolean,jsonb,timestamptz,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.fn_training_cache_record_event(text,text,text,uuid,boolean,jsonb,timestamptz,text)',
       'EXECUTE'
     )
     OR has_table_privilege(
       'service_role', 'public.training_question_events',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     ) THEN
    RAISE EXCEPTION 'TRAINING_PHASE6_EVENT_INTEGRITY_POSTFLIGHT_FAILED';
  END IF;

  IF to_regprocedure('public.get_user_level_stats(uuid,integer)') IS NULL
     OR to_regprocedure('public.get_user_level_stats(uuid)') IS NULL THEN
    RAISE EXCEPTION 'TRAINING_LEVEL_STATS_OVERLOAD_POSTFLIGHT_FAILED';
  END IF;
  SELECT pg_get_functiondef('public.get_user_level_stats(uuid,integer)'::regprocedure)
  INTO v_stats_definition;
  IF position('public.training_answers' IN v_stats_definition) = 0
     OR position('public.training_attempts' IN v_stats_definition) = 0
     OR position('user_question_history' IN v_stats_definition) > 0
     OR position('auth.uid()' IN v_stats_definition) = 0
     OR position('auth.role()' IN v_stats_definition) = 0
     OR has_function_privilege('anon', 'public.get_user_level_stats(uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_user_level_stats(uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_user_level_stats(uuid,integer)', 'EXECUTE')
     OR coalesce(
       obj_description('public.get_user_level_stats(uuid)'::regprocedure, 'pg_proc'),
       ''
     ) NOT LIKE 'Legacy one-argument profile-XP compatibility overload;%' THEN
    RAISE EXCEPTION 'TRAINING_LEVEL_STATS_AUTHORITY_POSTFLIGHT_FAILED';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;
