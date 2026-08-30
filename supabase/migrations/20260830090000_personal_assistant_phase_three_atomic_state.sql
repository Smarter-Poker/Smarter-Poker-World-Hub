-- Personal Assistant phase three: transactional hand-audit replacement and
-- exactly-once leak-review scheduling.

BEGIN;

CREATE TABLE IF NOT EXISTS public.leak_review_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leak_id text NOT NULL,
  review_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leak_review_operations_unique UNIQUE (user_id, leak_id, review_id)
);

ALTER TABLE public.leak_review_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leak_review_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.leak_review_operations TO service_role;

CREATE OR REPLACE FUNCTION public.replace_hand_audit_decisions(
  p_user_id uuid,
  p_hand_ids text[],
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hand_id text;
  v_upserted integer := 0;
  v_removed integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_hand_ids IS NULL
     OR COALESCE(array_length(p_hand_ids, 1), 0) > 100
     OR jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_rows, '[]'::jsonb)) > 1200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
     WHERE NULLIF(r->>'hand_external_id', '') IS NULL
        OR NOT ((r->>'hand_external_id') = ANY(p_hand_ids))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'row_hand_mismatch');
  END IF;

  -- Always lock in sorted order so overlapping multi-hand audits cannot
  -- deadlock. Locks live until both the upsert and stale-key delete commit.
  FOR v_hand_id IN
    SELECT DISTINCT h FROM unnest(p_hand_ids) AS h
     WHERE h IS NOT NULL AND length(h) BETWEEN 1 AND 180
     ORDER BY h
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('hand_audit:' || p_user_id::text || ':' || v_hand_id, 0)
    );
  END LOOP;

  WITH incoming AS (
    SELECT *
      FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS x(
        hand_external_id text,
        decision_key text,
        question_id text,
        game_id text,
        street text,
        hero_position text,
        villain_position text,
        spot_type text,
        hero_hand text,
        board_cards jsonb,
        player_action text,
        solver_action text,
        selected_frequency numeric,
        optimal_frequency numeric,
        classification text,
        ev_loss numeric,
        ev_loss_measured boolean,
        solver_verified boolean,
        solver_source text,
        match_tier integer,
        audited_at timestamptz,
        updated_at timestamptz
      )
  ), written AS (
    INSERT INTO public.hand_audit_decisions (
      user_id, hand_external_id, decision_key, question_id, game_id, street,
      hero_position, villain_position, spot_type, hero_hand, board_cards,
      player_action, solver_action, selected_frequency, optimal_frequency,
      classification, ev_loss, ev_loss_measured, solver_verified,
      solver_source, match_tier, audited_at, updated_at
    )
    SELECT
      p_user_id, hand_external_id, decision_key, question_id, game_id, street,
      hero_position, villain_position, spot_type, hero_hand,
      COALESCE(board_cards, '[]'::jsonb), player_action, solver_action,
      selected_frequency, optimal_frequency, classification, ev_loss,
      COALESCE(ev_loss_measured, false), COALESCE(solver_verified, false),
      solver_source, match_tier, COALESCE(audited_at, now()), COALESCE(updated_at, now())
    FROM incoming
    ON CONFLICT (user_id, hand_external_id, decision_key) DO UPDATE SET
      question_id = EXCLUDED.question_id,
      game_id = EXCLUDED.game_id,
      street = EXCLUDED.street,
      hero_position = EXCLUDED.hero_position,
      villain_position = EXCLUDED.villain_position,
      spot_type = EXCLUDED.spot_type,
      hero_hand = EXCLUDED.hero_hand,
      board_cards = EXCLUDED.board_cards,
      player_action = EXCLUDED.player_action,
      solver_action = EXCLUDED.solver_action,
      selected_frequency = EXCLUDED.selected_frequency,
      optimal_frequency = EXCLUDED.optimal_frequency,
      classification = EXCLUDED.classification,
      ev_loss = EXCLUDED.ev_loss,
      ev_loss_measured = EXCLUDED.ev_loss_measured,
      solver_verified = EXCLUDED.solver_verified,
      solver_source = EXCLUDED.solver_source,
      match_tier = EXCLUDED.match_tier,
      audited_at = EXCLUDED.audited_at,
      updated_at = EXCLUDED.updated_at
    RETURNING 1
  ) SELECT count(*)::integer INTO v_upserted FROM written;

  DELETE FROM public.hand_audit_decisions d
   WHERE d.user_id = p_user_id
     AND d.hand_external_id = ANY(p_hand_ids)
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
        WHERE r->>'hand_external_id' = d.hand_external_id
          AND r->>'decision_key' = d.decision_key
     );
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'upserted', v_upserted,
    'removed', v_removed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_hand_audit_decisions(uuid, text[], jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_hand_audit_decisions(uuid, text[], jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.commit_leak_review_state(
  p_user_id uuid,
  p_leak_id text,
  p_review_id text,
  p_expected_updated_at timestamptz,
  p_candidate jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state public.leak_review_state%ROWTYPE;
  v_exists boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_leak_id !~ '^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$'
     OR p_review_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,95}$'
     OR jsonb_typeof(COALESCE(p_candidate, '{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('leak_review:' || p_user_id::text || ':' || p_leak_id, 0)
  );

  -- The operation ledger is authoritative even after later reviews advance
  -- the row: a delayed replay of A after B returns the current state unchanged.
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

  INSERT INTO public.leak_review_state (
    user_id, leak_id, ease, interval_days, due_at, reps, lapses,
    strong_streak, retired, last_score, history, last_outcome,
    schema_version, created_at, updated_at
  ) VALUES (
    p_user_id, p_leak_id,
    LEAST(2.8, GREATEST(1.3, COALESCE((p_candidate->>'ease')::numeric, 2.3))),
    LEAST(21, GREATEST(0, COALESCE((p_candidate->>'interval_days')::integer, 0))),
    COALESCE((p_candidate->>'due_at')::timestamptz, now()),
    LEAST(100000, GREATEST(0, COALESCE((p_candidate->>'reps')::integer, 0))),
    LEAST(100000, GREATEST(0, COALESCE((p_candidate->>'lapses')::integer, 0))),
    LEAST(100000, GREATEST(0, COALESCE((p_candidate->>'strong_streak')::integer, 0))),
    COALESCE((p_candidate->>'retired')::boolean, false),
    CASE WHEN p_candidate->>'last_score' IS NULL THEN NULL
         ELSE LEAST(1, GREATEST(0, (p_candidate->>'last_score')::numeric)) END,
    COALESCE(p_candidate->'history', '[]'::jsonb),
    COALESCE(p_candidate->'last_outcome', '{}'::jsonb),
    GREATEST(1, COALESCE((p_candidate->>'schema_version')::integer, 1)),
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
    updated_at = now()
  RETURNING * INTO v_state;

  INSERT INTO public.leak_review_operations (user_id, leak_id, review_id)
  VALUES (p_user_id, p_leak_id, p_review_id);

  RETURN jsonb_build_object('success', true, 'idempotent', false, 'row', to_jsonb(v_state));
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_leak_review_state(uuid, text, text, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_leak_review_state(uuid, text, text, timestamptz, jsonb)
  TO service_role;

COMMIT;
