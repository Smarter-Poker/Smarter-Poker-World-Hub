-- Personal Assistant Review Remediation Baseline Stamping
--
-- Additive, idempotent migration:
-- 1. Updates public.commit_leak_review_state(...) so that when a user reaches
--    corrective drill mastery (retired = true), remediation_baseline_at is
--    atomically stamped once (preserving any earlier baseline) to anchor
--    before-vs-after table-verified leak resolution proofs.
-- 2. Backfills remediation_baseline_at for existing retired rows where null.
-- 3. Keeps EXECUTE strictly revoked from PUBLIC, anon, authenticated and
--    granted only to service_role.

UPDATE public.leak_review_state
   SET remediation_baseline_at = COALESCE(updated_at, created_at, now())
 WHERE retired = true
   AND remediation_baseline_at IS NULL;

CREATE OR REPLACE FUNCTION public.commit_leak_review_state(
  p_user_id uuid,
  p_leak_id text,
  p_review_id text,
  p_expected_updated_at timestamp with time zone,
  p_candidate jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state public.leak_review_state%ROWTYPE;
  v_exists boolean := false;
  v_retired boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_leak_id !~ '^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$'
     OR p_review_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,95}$'
     OR jsonb_typeof(COALESCE(p_candidate, '{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('leak_review:' || p_user_id::text || ':' || p_leak_id, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.leak_review_operations
     WHERE user_id = p_user_id AND leak_id = p_leak_id AND review_id = p_review_id
  ) THEN
    SELECT * INTO v_state FROM public.leak_review_state
     WHERE user_id = p_user_id AND leak_id = p_leak_id;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'row', to_jsonb(v_state));
  END IF;

  SELECT * INTO v_state FROM public.leak_review_state
   WHERE user_id = p_user_id AND leak_id = p_leak_id
   FOR UPDATE;
  v_exists := FOUND;

  IF (v_exists AND (p_expected_updated_at IS NULL OR v_state.updated_at IS DISTINCT FROM p_expected_updated_at))
     OR (NOT v_exists AND p_expected_updated_at IS NOT NULL) THEN
    RETURN jsonb_build_object(
      'success', true, 'conflict', true,
      'row', CASE WHEN v_exists THEN to_jsonb(v_state) ELSE NULL END
    );
  END IF;

  v_retired := COALESCE((p_candidate->>'retired')::boolean, false);

  INSERT INTO public.leak_review_state (
    user_id, leak_id, ease, interval_days, due_at, reps, lapses,
    strong_streak, retired, last_score, history, last_outcome,
    schema_version, remediation_baseline_at, created_at, updated_at
  ) VALUES (
    p_user_id, p_leak_id,
    LEAST(2.8, GREATEST(1.3, COALESCE((p_candidate->>'ease')::numeric, 2.3))),
    LEAST(21, GREATEST(0, COALESCE((p_candidate->>'interval_days')::integer, 0))),
    COALESCE((p_candidate->>'due_at')::timestamptz, now()),
    LEAST(100000, GREATEST(0, COALESCE((p_candidate->>'reps')::integer, 0))),
    LEAST(100000, GREATEST(0, COALESCE((p_candidate->>'lapses')::integer, 0))),
    LEAST(100000, GREATEST(0, COALESCE((p_candidate->>'strong_streak')::integer, 0))),
    v_retired,
    CASE WHEN p_candidate->>'last_score' IS NULL THEN NULL
         ELSE LEAST(1, GREATEST(0, (p_candidate->>'last_score')::numeric)) END,
    COALESCE(p_candidate->'history', '[]'::jsonb),
    COALESCE(p_candidate->'last_outcome', '{}'::jsonb),
    GREATEST(1, COALESCE((p_candidate->>'schema_version')::integer, 1)),
    CASE WHEN v_retired THEN now() ELSE NULL END,
    now(), now()
  )
  ON CONFLICT (user_id, leak_id) DO UPDATE SET
    ease = EXCLUDED.ease,
    interval_days = EXCLUDED.interval_days,
    due_at = EXCLUDED.due_at,
    reps = EXCLUDED.reps,
    lapses = EXCLUDED.lapses,
    strong_streak = EXCLUDED.strong_streak,
    retired = EXCLUDED.retired,
    last_score = EXCLUDED.last_score,
    history = EXCLUDED.history,
    last_outcome = EXCLUDED.last_outcome,
    schema_version = EXCLUDED.schema_version,
    remediation_baseline_at = COALESCE(
      public.leak_review_state.remediation_baseline_at,
      CASE WHEN EXCLUDED.retired THEN now() ELSE NULL END
    ),
    updated_at = now()
  RETURNING * INTO v_state;

  INSERT INTO public.leak_review_operations (user_id, leak_id, review_id)
  VALUES (p_user_id, p_leak_id, p_review_id);

  RETURN jsonb_build_object('success', true, 'idempotent', false, 'row', to_jsonb(v_state));
END;
$$;

REVOKE ALL ON FUNCTION public.commit_leak_review_state(uuid, text, text, timestamp with time zone, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_leak_review_state(uuid, text, text, timestamp with time zone, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.commit_leak_review_state(uuid, text, text, timestamp with time zone, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_leak_review_state(uuid, text, text, timestamp with time zone, jsonb) TO service_role;
