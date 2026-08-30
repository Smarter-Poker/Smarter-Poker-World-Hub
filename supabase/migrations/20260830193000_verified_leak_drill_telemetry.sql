-- Personal Assistant phase five: immutable, server-verified corrective drills.
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.leak_drill_sessions (
  batch_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leak_id text NOT NULL,
  question_ids jsonb NOT NULL,
  attempt_number integer CHECK (attempt_number BETWEEN 1 AND 100000),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT leak_drill_sessions_attempt_unique UNIQUE (user_id, leak_id, attempt_number),
  CONSTRAINT leak_drill_sessions_questions_bound CHECK (
    jsonb_typeof(question_ids) = 'array'
    AND jsonb_array_length(question_ids) BETWEEN 5 AND 20
    AND octet_length(question_ids::text) <= 8192
  )
);

CREATE TABLE IF NOT EXISTS public.leak_drill_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.leak_drill_sessions(batch_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leak_id text NOT NULL,
  question_id text NOT NULL,
  selected_answer text,
  correct_answer text NOT NULL,
  correct boolean NOT NULL,
  timed_out boolean NOT NULL DEFAULT false,
  explanation text,
  solver_source text NOT NULL,
  classification text NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leak_drill_answers_first_lock UNIQUE (user_id, batch_id, question_id),
  CONSTRAINT leak_drill_answers_text_bound CHECK (
    length(question_id) BETWEEN 1 AND 180
    AND length(COALESCE(selected_answer, '')) <= 100
    AND length(correct_answer) BETWEEN 1 AND 100
    AND length(COALESCE(explanation, '')) <= 2000
  )
);

CREATE TABLE IF NOT EXISTS public.leak_drill_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES public.leak_drill_sessions(batch_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leak_id text NOT NULL,
  review_id text NOT NULL,
  source_table text NOT NULL DEFAULT 'user_leaks' CHECK (source_table = 'user_leaks'),
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 100000),
  total_questions smallint NOT NULL CHECK (total_questions BETWEEN 5 AND 20),
  correct_answers smallint NOT NULL CHECK (correct_answers BETWEEN 0 AND total_questions),
  accuracy numeric(5,4) NOT NULL CHECK (accuracy BETWEEN 0 AND 1),
  passed boolean NOT NULL,
  first_attempt boolean NOT NULL,
  remediation_mastered boolean NOT NULL,
  server_verified boolean NOT NULL DEFAULT true,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leak_drill_attempts_review_unique UNIQUE (user_id, leak_id, review_id),
  CONSTRAINT leak_drill_attempts_number_unique UNIQUE (user_id, leak_id, attempt_number),
  CONSTRAINT leak_drill_attempts_evidence_bound CHECK (
    jsonb_typeof(evidence) = 'array'
    AND jsonb_array_length(evidence) = total_questions
    AND octet_length(evidence::text) <= 65536
  )
);

CREATE INDEX IF NOT EXISTS idx_leak_drill_attempts_verified_mastery
  ON public.leak_drill_attempts (user_id, completed_at DESC)
  WHERE server_verified AND first_attempt AND passed AND remediation_mastered;

ALTER TABLE public.leak_drill_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leak_drill_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leak_drill_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leak_drill_sessions, public.leak_drill_answers, public.leak_drill_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.leak_drill_sessions, public.leak_drill_answers, public.leak_drill_attempts TO service_role;

-- Canonical solver rows contain grading keys. All active consumers already go
-- through server APIs; retire the legacy public table read before verified
-- drills expose cache-linked scenarios.
DROP POLICY IF EXISTS "Anyone can read cached questions" ON public.training_question_cache;
REVOKE SELECT ON public.training_question_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_question_cache TO service_role;

-- Review state is committed by the atomic service-role RPC. Direct browser
-- writes made its history unsuitable as a first-attempt ledger.
DROP POLICY IF EXISTS leak_review_state_insert_own ON public.leak_review_state;
DROP POLICY IF EXISTS leak_review_state_update_own ON public.leak_review_state;
DROP POLICY IF EXISTS leak_review_state_delete_own ON public.leak_review_state;
REVOKE INSERT, UPDATE, DELETE ON public.leak_review_state FROM authenticated;

CREATE OR REPLACE FUNCTION public.start_verified_leak_drill(
  p_user_id uuid, p_leak_id text, p_batch_id uuid, p_question_ids jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_session public.leak_drill_sessions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_batch_id IS NULL
     OR p_leak_id !~ '^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$'
     OR jsonb_typeof(COALESCE(p_question_ids, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_question_ids) NOT BETWEEN 5 AND 20
     OR (SELECT count(*) FROM jsonb_array_elements_text(p_question_ids))
        <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_question_ids)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  -- Global quota and per-leak numbering use a consistent lock order.
  PERFORM pg_advisory_xact_lock(hashtextextended('leak_drill_user:' || p_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('leak_drill:' || p_user_id::text || ':' || p_leak_id, 0));

  SELECT * INTO v_session FROM public.leak_drill_sessions WHERE batch_id = p_batch_id;
  IF FOUND THEN
    RETURN jsonb_build_object('success', v_session.user_id = p_user_id AND v_session.leak_id = p_leak_id,
      'idempotent', true, 'session', to_jsonb(v_session));
  END IF;
  IF (SELECT count(*) FROM public.leak_drill_sessions WHERE user_id = p_user_id) >= 5000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_quota_reached');
  END IF;

  -- Only deterministic, server-owned solver signals can start a verified run.
  PERFORM 1 FROM public.user_leaks
   WHERE user_id = p_user_id AND id::text = p_leak_id
     AND detector_managed = true AND source_system = 'solver_engine'
     AND leak_type ~ '^solver_(training|club_arena)_' AND status IS DISTINCT FROM 'resolved'
     AND is_active IS DISTINCT FROM false FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'ineligible_leak'); END IF;

  -- Merely loading or abandoning a drill does not consume an attempt. The
  -- number is reserved atomically with the first locked answer below.
  INSERT INTO public.leak_drill_sessions(batch_id, user_id, leak_id, question_ids)
    VALUES (p_batch_id, p_user_id, p_leak_id, p_question_ids) RETURNING * INTO v_session;
  RETURN jsonb_build_object('success', true, 'idempotent', false, 'session', to_jsonb(v_session));
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_verified_leak_drill_answer(
  p_user_id uuid, p_leak_id text, p_batch_id uuid, p_question_id text,
  p_selected_answer text, p_correct_answer text, p_correct boolean, p_timed_out boolean,
  p_explanation text, p_solver_source text, p_classification text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_answer public.leak_drill_answers%ROWTYPE;
  v_session public.leak_drill_sessions%ROWTYPE;
  v_legacy_attempts integer := 0;
  v_attempt integer;
BEGIN
  IF p_user_id IS NULL OR p_batch_id IS NULL OR length(COALESCE(p_question_id, '')) NOT BETWEEN 1 AND 180
     OR length(COALESCE(p_correct_answer, '')) NOT BETWEEN 1 AND 100
     OR length(COALESCE(p_selected_answer, '')) > 100 OR length(COALESCE(p_explanation, '')) > 2000
     OR length(COALESCE(p_solver_source, '')) NOT BETWEEN 1 AND 100
     OR length(COALESCE(p_classification, '')) NOT BETWEEN 1 AND 40 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('leak_drill_user:' || p_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('leak_drill:' || p_user_id::text || ':' || p_leak_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('leak_drill_answer:' || p_user_id::text || ':' || p_batch_id::text || ':' || p_question_id, 0));
  SELECT * INTO v_answer FROM public.leak_drill_answers
    WHERE user_id = p_user_id AND batch_id = p_batch_id AND question_id = p_question_id;
  IF FOUND THEN RETURN jsonb_build_object('success', true, 'idempotent', true, 'answer', to_jsonb(v_answer)); END IF;

  SELECT * INTO v_session FROM public.leak_drill_sessions
    WHERE batch_id = p_batch_id AND user_id = p_user_id AND leak_id = p_leak_id
      AND completed_at IS NULL AND question_ids ? p_question_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_session'); END IF;

  IF v_session.attempt_number IS NULL THEN
    -- The private operation ledger is the authoritative pre-feature history;
    -- unlike leak_review_state it was never client-writable.
    SELECT count(*)::integer INTO v_legacy_attempts
      FROM public.leak_review_operations WHERE user_id = p_user_id AND leak_id = p_leak_id;
    SELECT GREATEST(COALESCE(max(attempt_number), 0), COALESCE(v_legacy_attempts, 0)) + 1 INTO v_attempt
      FROM public.leak_drill_sessions WHERE user_id = p_user_id AND leak_id = p_leak_id;
    UPDATE public.leak_drill_sessions SET attempt_number = v_attempt
      WHERE batch_id = p_batch_id RETURNING * INTO v_session;
  END IF;

  INSERT INTO public.leak_drill_answers(batch_id, user_id, leak_id, question_id, selected_answer,
    correct_answer, correct, timed_out, explanation, solver_source, classification)
  VALUES (p_batch_id, p_user_id, p_leak_id, p_question_id, NULLIF(p_selected_answer, ''),
    p_correct_answer, p_correct, COALESCE(p_timed_out, false), p_explanation, p_solver_source, p_classification)
  RETURNING * INTO v_answer;
  RETURN jsonb_build_object('success', true, 'idempotent', false, 'answer', to_jsonb(v_answer));
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_verified_leak_drill_attempt(
  p_user_id uuid, p_leak_id text, p_review_id text, p_batch_id uuid, p_question_ids jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_existing public.leak_drill_attempts%ROWTYPE;
  v_session public.leak_drill_sessions%ROWTYPE;
  v_total integer;
  v_correct integer;
  v_accuracy numeric;
  v_passed boolean;
  v_evidence jsonb;
BEGIN
  IF p_user_id IS NULL OR p_batch_id IS NULL
     OR p_leak_id !~ '^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$'
     OR p_review_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,95}$'
     OR jsonb_typeof(COALESCE(p_question_ids, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_question_ids) NOT BETWEEN 5 AND 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('leak_drill_user:' || p_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('leak_drill:' || p_user_id::text || ':' || p_leak_id, 0));

  SELECT * INTO v_existing FROM public.leak_drill_attempts WHERE batch_id = p_batch_id;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id OR v_existing.leak_id <> p_leak_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
    END IF;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'attempt', to_jsonb(v_existing));
  END IF;
  IF EXISTS (SELECT 1 FROM public.leak_drill_attempts
      WHERE user_id = p_user_id AND leak_id = p_leak_id AND review_id = p_review_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'review_id_reused');
  END IF;

  SELECT * INTO v_session FROM public.leak_drill_sessions
    WHERE batch_id = p_batch_id AND user_id = p_user_id AND leak_id = p_leak_id FOR UPDATE;
  IF NOT FOUND OR v_session.completed_at IS NOT NULL OR v_session.attempt_number IS NULL
     OR v_session.question_ids <> p_question_ids THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_consumed_session');
  END IF;

  SELECT count(*)::integer, count(*) FILTER (WHERE correct)::integer,
    jsonb_agg(jsonb_build_object('questionId', question_id, 'selectedAnswer', selected_answer,
      'timedOut', timed_out, 'correct', correct) ORDER BY answered_at, question_id)
    INTO v_total, v_correct, v_evidence
    FROM public.leak_drill_answers
    WHERE user_id = p_user_id AND leak_id = p_leak_id AND batch_id = p_batch_id
      AND question_id IN (SELECT value FROM jsonb_array_elements_text(p_question_ids));
  IF v_total <> jsonb_array_length(p_question_ids) THEN
    RETURN jsonb_build_object('success', false, 'error', 'incomplete_drill');
  END IF;

  -- Revalidate provenance at completion. Drill mastery is coaching state; the
  -- deterministic detector alone resolves empirical leak truth after new play.
  PERFORM 1 FROM public.user_leaks WHERE user_id = p_user_id AND id::text = p_leak_id
    AND detector_managed = true AND source_system = 'solver_engine'
    AND leak_type ~ '^solver_(training|club_arena)_' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'ineligible_leak'); END IF;

  v_accuracy := round(v_correct::numeric / v_total::numeric, 4);
  v_passed := v_accuracy >= 0.8;
  UPDATE public.leak_drill_sessions SET completed_at = now() WHERE batch_id = p_batch_id;
  INSERT INTO public.leak_drill_attempts(batch_id, user_id, leak_id, review_id, attempt_number,
    total_questions, correct_answers, accuracy, passed, first_attempt, remediation_mastered, evidence)
  VALUES (p_batch_id, p_user_id, p_leak_id, p_review_id, v_session.attempt_number,
    v_total, v_correct, v_accuracy, v_passed, v_session.attempt_number = 1, v_passed, v_evidence)
  RETURNING * INTO v_existing;
  RETURN jsonb_build_object('success', true, 'idempotent', false, 'attempt', to_jsonb(v_existing));
END;
$function$;

REVOKE ALL ON FUNCTION public.start_verified_leak_drill(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_verified_leak_drill_answer(uuid,text,uuid,text,text,text,boolean,boolean,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_verified_leak_drill_attempt(uuid,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_verified_leak_drill(uuid,text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_leak_drill_answer(uuid,text,uuid,text,text,text,boolean,boolean,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_leak_drill_attempt(uuid,text,text,uuid,jsonb) TO service_role;

DO $postapply$
BEGIN
  IF to_regclass('public.leak_drill_sessions') IS NULL OR to_regclass('public.leak_drill_answers') IS NULL
    OR to_regclass('public.leak_drill_attempts') IS NULL THEN
    RAISE EXCEPTION 'Post-apply: verified drill telemetry is incomplete';
  END IF;
  IF has_function_privilege('authenticated', 'public.record_verified_leak_drill_answer(uuid,text,uuid,text,text,text,boolean,boolean,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post-apply: authenticated can execute private drill telemetry';
  END IF;
END;
$postapply$;

NOTIFY pgrst, 'reload schema';
COMMIT;
