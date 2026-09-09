-- Phase 6 production closeout: keep the immutable policy checksum on every
-- analytics hand-history entry. The cache-completion trigger installed after
-- the original projector correctly rejects a question identity without that
-- binding; omitting it made /api/training/save-session fail after an otherwise
-- successful authoritative attempt completion.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.training_attempts') IS NULL
     OR to_regclass('public.training_answers') IS NULL
     OR to_regclass('public.training_sessions') IS NULL
     OR to_regprocedure('public.fn_save_training_session_v2(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fn_training_session_cache_completion()') IS NULL THEN
    RAISE EXCEPTION 'TRAINING_SESSION_POLICY_PROJECTION_PREREQUISITE_MISSING';
  END IF;
END;
$preflight$;

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
      'policyChecksum', lower(answer.evidence_metadata ->> 'policyChecksum'),
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

REVOKE ALL ON FUNCTION public.fn_save_training_session_v2(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_save_training_session_v2(uuid, uuid)
  TO service_role;

-- Snapshot only completed attempts that can satisfy the checksum-bound cache
-- contract. Historical unbound rows remain excluded instead of being relabeled
-- as verified. The temporary target set also makes the repair race-safe: a new
-- completion that starts after this snapshot is owned by the normal API retry.
CREATE TEMP TABLE phase6_session_projection_repair_targets
ON COMMIT DROP
AS
SELECT attempt.id, attempt.user_id
FROM public.training_attempts attempt
WHERE attempt.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.training_sessions session
    WHERE session.attempt_id = attempt.id
  )
  AND EXISTS (
    SELECT 1 FROM public.training_answers answer
    WHERE answer.attempt_id = attempt.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.training_answers answer
    WHERE answer.attempt_id = attempt.id
      AND lower(coalesce(answer.evidence_metadata ->> 'policyChecksum', ''))
        !~ '^[0-9a-f]{64}$'
  );

DO $repair$
DECLARE
  target record;
  result jsonb;
BEGIN
  FOR target IN
    SELECT id, user_id
    FROM phase6_session_projection_repair_targets
    ORDER BY id
  LOOP
    result := public.fn_save_training_session_v2(target.user_id, target.id);
    IF coalesce((result ->> 'success')::boolean, false) IS NOT TRUE
       OR (result ->> 'attemptId')::uuid <> target.id THEN
      RAISE EXCEPTION 'TRAINING_SESSION_POLICY_PROJECTION_REPAIR_FAILED:%', target.id;
    END IF;
  END LOOP;
END;
$repair$;

DO $verify$
BEGIN
  IF position(
       '''policyChecksum'', lower(answer.evidence_metadata ->> ''policyChecksum'')'
       IN pg_get_functiondef('public.fn_save_training_session_v2(uuid,uuid)'::regprocedure)
     ) = 0 THEN
    RAISE EXCEPTION 'TRAINING_SESSION_POLICY_PROJECTION_NOT_INSTALLED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM phase6_session_projection_repair_targets target
    WHERE NOT EXISTS (
      SELECT 1 FROM public.training_sessions session
      WHERE session.attempt_id = target.id
    )
  ) THEN
    RAISE EXCEPTION 'TRAINING_SESSION_POLICY_PROJECTION_REPAIR_INCOMPLETE';
  END IF;
END;
$verify$;

COMMENT ON FUNCTION public.fn_save_training_session_v2(uuid, uuid) IS
  'Creates one immutable analytics projection from a completed Training attempt, preserving policy checksum and measured-EV evidence for every decision.';

COMMIT;
