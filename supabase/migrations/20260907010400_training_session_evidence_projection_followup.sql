-- Phase 6 follow-up: preserve explicit measured-EV evidence in the sealed
-- session projection and make Session Setup statistics accuracy-based.
--
-- The first authority migration correctly nulled unmeasured EV values but did
-- not persist the independent evLossMeasured flag in hand_history. Readers
-- therefore could not distinguish a measured 0.00 BB result from a legacy
-- compatibility zero without guessing. The dashboard RPCs also returned a
-- signed -100..100 Training score while their UI labelled it as a percentage.

CREATE OR REPLACE FUNCTION public.fn_save_training_session_v2(
  p_user_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  attempt_row public.training_attempts%ROWTYPE;
  session_row public.training_sessions%ROWTYPE;
  hand_history jsonb := '[]'::jsonb;
  position_stats jsonb := '{}'::jsonb;
  classification_counts jsonb := '{}'::jsonb;
  total_ev_loss numeric := 0;
  mistake_count integer := 0;
  measured_count integer := 0;
  decision_count integer := 0;
  continuation_decision_count integer := 0;
  avg_frequency_diff numeric := 0;
  inserted boolean := false;
BEGIN
  SELECT * INTO attempt_row
  FROM public.training_attempts
  WHERE id = p_attempt_id
  FOR KEY SHARE;

  IF p_user_id IS NULL OR NOT FOUND OR attempt_row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'status', 404,
      'code', 'TRAINING_ATTEMPT_NOT_FOUND',
      'error', 'The completed Training attempt was not found.');
  END IF;
  IF attempt_row.status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'status', 409,
      'code', 'TRAINING_ATTEMPT_NOT_COMPLETED',
      'error', 'Only a completed Training attempt can become an analytics session.');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'handNumber', answer.hand_ordinal,
      'decisionOrdinal', answer.decision_ordinal,
      'questionId', answer.question_id,
      'snapshotKey', answer.snapshot_key,
      'selectedAnswer', answer.answer_id,
      'isCorrect', answer.is_correct,
      'classification', answer.classification,
      'street', answer.street,
      'heroPosition', answer.hero_position,
      'villainPosition', answer.villain_position,
      'spotType', answer.spot_type,
      'solverVerified', answer.solver_verified,
      'evLossMeasured', answer.ev_loss_measured,
      'evLoss', CASE WHEN answer.ev_loss_measured THEN answer.ev_loss ELSE NULL END,
      'answeredAt', answer.answered_at
    ) ORDER BY answer.hand_ordinal, answer.decision_ordinal), '[]'::jsonb),
    coalesce(sum(answer.ev_loss) FILTER (WHERE answer.ev_loss_measured), 0),
    count(*) FILTER (WHERE NOT answer.is_correct)::integer,
    count(*) FILTER (WHERE answer.ev_loss_measured)::integer,
    count(*)::integer,
    count(*) FILTER (WHERE answer.decision_ordinal > 1)::integer,
    coalesce(avg(abs(answer.optimal_frequency - answer.selected_frequency))
      FILTER (WHERE answer.solver_verified), 0)
  INTO hand_history, total_ev_loss, mistake_count, measured_count,
    decision_count, continuation_decision_count, avg_frequency_diff
  FROM public.training_answers answer
  WHERE answer.attempt_id = attempt_row.id;

  SELECT coalesce(jsonb_object_agg(bucket.position, jsonb_build_object(
      'total', bucket.total,
      'correct', bucket.correct,
      'accuracy', round(bucket.correct::numeric / bucket.total * 100, 2),
      'evLoss', bucket.ev_loss
    )), '{}'::jsonb)
  INTO position_stats
  FROM (
    SELECT coalesce(nullif(hero_position, ''), 'unknown') AS position,
      count(*)::integer AS total,
      count(*) FILTER (WHERE is_correct)::integer AS correct,
      coalesce(sum(ev_loss) FILTER (WHERE ev_loss_measured), 0) AS ev_loss
    FROM public.training_answers
    WHERE attempt_id = attempt_row.id
    GROUP BY coalesce(nullif(hero_position, ''), 'unknown')
  ) bucket;

  SELECT coalesce(jsonb_object_agg(bucket.classification, bucket.total), '{}'::jsonb)
  INTO classification_counts
  FROM (
    SELECT coalesce(nullif(classification, ''), 'unknown') AS classification,
      count(*)::integer AS total
    FROM public.training_answers
    WHERE attempt_id = attempt_row.id
    GROUP BY coalesce(nullif(classification, ''), 'unknown')
  ) bucket;

  INSERT INTO public.training_sessions (
    user_id, game_id, game_name, gtow_score, score_scale, total_ev_loss,
    hands_played, mistake_count, accuracy, correct_count, best_streak,
    level_passed, level, hand_history, position_stats, classification_counts,
    trainer_config, avg_ev_loss_per_hand, avg_ev_loss_per_mistake,
    avg_frequency_diff, attempt_id, created_at
  ) VALUES (
    attempt_row.user_id, attempt_row.game_id, attempt_row.game_id,
    attempt_row.accuracy_percentage * 2 - 100, 2, total_ev_loss,
    attempt_row.answered_hands, mistake_count, attempt_row.accuracy_percentage,
    attempt_row.correct_hands, attempt_row.best_streak, attempt_row.passed,
    attempt_row.level, hand_history, position_stats, classification_counts,
    jsonb_build_object(
      'sessionKind', attempt_row.session_kind,
      'difficulty', attempt_row.difficulty,
      'targetHands', attempt_row.expected_hands,
      'decisionCount', decision_count,
      'continuationDecisionCount', continuation_decision_count,
      'practiceOnly', attempt_row.practice_only,
      'configHash', attempt_row.config_hash
    ),
    CASE WHEN measured_count > 0 THEN round(total_ev_loss / attempt_row.answered_hands, 4) ELSE 0 END,
    CASE WHEN measured_count > 0 AND mistake_count > 0 THEN round(total_ev_loss / mistake_count, 4) ELSE 0 END,
    round(avg_frequency_diff, 4), attempt_row.id, attempt_row.completed_at
  )
  ON CONFLICT (attempt_id) WHERE attempt_id IS NOT NULL DO NOTHING
  RETURNING * INTO session_row;
  inserted := FOUND;

  IF NOT inserted THEN
    SELECT * INTO session_row FROM public.training_sessions
    WHERE attempt_id = attempt_row.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'newSession', inserted,
    'attemptId', attempt_row.id,
    'practiceOnly', attempt_row.practice_only,
    'session', to_jsonb(session_row),
    'diamondsEarned', 0
  );
END;
$function$;

-- Repair only server-bound session projections that predate the explicit flag.
-- Every value is rebuilt from the canonical answer rows for the same attempt.
WITH rebuilt AS (
  SELECT
    answer.attempt_id,
    coalesce(jsonb_agg(jsonb_build_object(
      'handNumber', answer.hand_ordinal,
      'decisionOrdinal', answer.decision_ordinal,
      'questionId', answer.question_id,
      'snapshotKey', answer.snapshot_key,
      'selectedAnswer', answer.answer_id,
      'isCorrect', answer.is_correct,
      'classification', answer.classification,
      'street', answer.street,
      'heroPosition', answer.hero_position,
      'villainPosition', answer.villain_position,
      'spotType', answer.spot_type,
      'solverVerified', answer.solver_verified,
      'evLossMeasured', answer.ev_loss_measured,
      'evLoss', CASE WHEN answer.ev_loss_measured THEN answer.ev_loss ELSE NULL END,
      'answeredAt', answer.answered_at
    ) ORDER BY answer.hand_ordinal, answer.decision_ordinal), '[]'::jsonb) AS hand_history
  FROM public.training_answers answer
  WHERE answer.attempt_id IS NOT NULL
  GROUP BY answer.attempt_id
)
UPDATE public.training_sessions session
SET hand_history = rebuilt.hand_history
FROM rebuilt
WHERE session.attempt_id = rebuilt.attempt_id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(session.hand_history, '[]'::jsonb)) item
    WHERE NOT item ? 'evLossMeasured'
  );

CREATE OR REPLACE FUNCTION public.training_dashboard_30day_stats(
  p_user_id uuid,
  p_game_id text
)
RETURNS TABLE (
  avg_score numeric,
  sessions_count bigint,
  hands_played bigint,
  best_score numeric,
  total_ev_loss numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: can only query your own stats'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT session.*
    FROM public.training_sessions session
    JOIN public.training_attempts attempt
      ON attempt.id = session.attempt_id
     AND attempt.user_id = session.user_id
     AND attempt.practice_only IS FALSE
     AND attempt.status = 'completed'
    WHERE session.user_id = p_user_id
      AND session.game_id = p_game_id
      AND session.created_at >= now() - interval '30 days'
      AND session.hands_played > 0
      AND session.correct_count BETWEEN 0 AND session.hands_played
  ), measured AS (
    SELECT count(*)::bigint AS decisions, sum(answer.ev_loss)::numeric AS loss
    FROM public.training_answers answer
    JOIN scoped session ON session.attempt_id = answer.attempt_id
    WHERE answer.solver_verified IS TRUE
      AND answer.ev_loss_measured IS TRUE
  )
  SELECT
    round(100 * sum(scoped.correct_count)::numeric / nullif(sum(scoped.hands_played), 0), 2),
    count(*)::bigint,
    coalesce(sum(scoped.hands_played), 0)::bigint,
    round(max(100 * scoped.correct_count::numeric / scoped.hands_played), 2),
    CASE WHEN measured.decisions > 0 THEN round(measured.loss, 2) ELSE NULL END
  FROM scoped
  CROSS JOIN measured
  GROUP BY measured.decisions, measured.loss;
END;
$function$;

CREATE OR REPLACE FUNCTION public.training_dashboard_last_session(
  p_user_id uuid,
  p_game_id text
)
RETURNS TABLE (
  session_id uuid,
  gtow_score numeric,
  accuracy numeric,
  hands_played integer,
  level integer,
  level_passed boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: can only query your own stats'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    session.id,
    CASE WHEN session.score_scale = 2 AND session.gtow_score BETWEEN -100 AND 100
      THEN session.gtow_score ELSE NULL END,
    round(100 * session.correct_count::numeric / session.hands_played, 2),
    session.hands_played,
    session.level,
    session.level_passed,
    session.created_at
  FROM public.training_sessions session
  JOIN public.training_attempts attempt
    ON attempt.id = session.attempt_id
   AND attempt.user_id = session.user_id
   AND attempt.practice_only IS FALSE
   AND attempt.status = 'completed'
  WHERE session.user_id = p_user_id
    AND session.game_id = p_game_id
    AND session.hands_played > 0
    AND session.correct_count BETWEEN 0 AND session.hands_played
  ORDER BY session.created_at DESC
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.training_dashboard_lifetime_stats(
  p_user_id uuid,
  p_game_id text
)
RETURNS TABLE (
  total_sessions bigint,
  total_hands bigint,
  best_score numeric,
  avg_score numeric,
  highest_level_passed integer,
  total_diamonds_est bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: can only query your own stats'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT session.*, attempt.reward_diamonds
    FROM public.training_sessions session
    JOIN public.training_attempts attempt
      ON attempt.id = session.attempt_id
     AND attempt.user_id = session.user_id
     AND attempt.practice_only IS FALSE
     AND attempt.status = 'completed'
    WHERE session.user_id = p_user_id
      AND session.game_id = p_game_id
      AND session.hands_played > 0
      AND session.correct_count BETWEEN 0 AND session.hands_played
  )
  SELECT
    count(*)::bigint,
    coalesce(sum(scoped.hands_played), 0)::bigint,
    round(max(100 * scoped.correct_count::numeric / scoped.hands_played), 2),
    round(100 * sum(scoped.correct_count)::numeric / nullif(sum(scoped.hands_played), 0), 2),
    coalesce(max(scoped.level) FILTER (WHERE scoped.level_passed), 0)::integer,
    coalesce(sum(scoped.reward_diamonds), 0)::bigint
  FROM scoped;
END;
$function$;

COMMENT ON FUNCTION public.fn_save_training_session_v2(uuid, uuid) IS
  'Creates one immutable analytics projection from a completed Training attempt, including explicit measured-EV flags.';
COMMENT ON FUNCTION public.training_dashboard_30day_stats(uuid, text) IS
  'Verified non-practice weighted accuracy, volume, and explicitly measured EV for Session Setup.';
COMMENT ON FUNCTION public.training_dashboard_last_session(uuid, text) IS
  'Most recent verified non-practice Training session with count-derived accuracy.';
COMMENT ON FUNCTION public.training_dashboard_lifetime_stats(uuid, text) IS
  'Verified non-practice lifetime accuracy and actual attempt reward totals.';

DO $verify$
BEGIN
  IF position(
    '''evLossMeasured'', answer.ev_loss_measured'
    IN pg_get_functiondef('public.fn_save_training_session_v2(uuid,uuid)'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'fn_save_training_session_v2 is missing evLossMeasured evidence';
  END IF;
  IF position(
    '100 * sum(scoped.correct_count)'
    IN lower(pg_get_functiondef('public.training_dashboard_30day_stats(uuid,text)'::regprocedure))
  ) = 0 THEN
    RAISE EXCEPTION 'training_dashboard_30day_stats is not accuracy-derived';
  END IF;
  IF position(
    'sum(scoped.reward_diamonds)'
    IN lower(pg_get_functiondef('public.training_dashboard_lifetime_stats(uuid,text)'::regprocedure))
  ) = 0 THEN
    RAISE EXCEPTION 'training_dashboard_lifetime_stats is not reward-authoritative';
  END IF;
END;
$verify$;
