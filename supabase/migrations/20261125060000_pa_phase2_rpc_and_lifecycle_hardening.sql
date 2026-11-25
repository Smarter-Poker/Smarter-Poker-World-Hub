-- ===========================================================================
-- 20261125060000_pa_phase2_rpc_and_lifecycle_hardening.sql
-- ===========================================================================
-- TIER:        2
-- AUTHOR:      Antigravity (2a32ed83-0b9a-4a55-bc41-4be2c65f3155)
-- AFFECTS:     public.resolve_user_leaks_if_unchanged,
--              public.get_pa_linked_hand_bundle,
--              public.commit_leak_review_state,
--              public.purge_personal_assistant_data,
--              public.apply_personal_assistant_retention,
--              public.leak_hand_examples grants
-- IRREVERSIBLE: no
--
-- WHY:
--   1. resolve_user_leaks_if_unchanged omitted 'ca_hand_facts' from allowed
--      source_system values, causing conflicts > 0 and permanent audit job
--      failure whenever a recovered ca_hand_facts leak tried to auto-resolve.
--   2. get_pa_linked_hand_bundle omitted hand.source, leak.source_system,
--      leak.is_active, omitted LIMIT 12 on decisions, and filtered out
--      resolved leaks (diverging from handAuditRouteCore fallback path).
--   3. commit_leak_review_state pinned remediation_baseline_at forever across
--      relapses instead of clearing on retired=false and re-stamping on re-mastery.
--   4. apply_personal_assistant_retention omitted expired leak_review_state
--      and abandoned incomplete leak_drill_sessions; purge_personal_assistant_data
--      omitted the legacy 'fingerprint' return alias alongside 'receipt_fingerprint'.
--   5. leak_hand_examples only revoked INSERT/REFERENCES/TRIGGER from authenticated
--      instead of REVOKE ALL + GRANT SELECT.
-- ===========================================================================

BEGIN;

-- 1. Allow ca_hand_facts leaks to auto-resolve atomically via resolve_user_leaks_if_unchanged
CREATE OR REPLACE FUNCTION public.resolve_user_leaks_if_unchanged(
  p_user_id uuid,
  p_candidates jsonb,
  p_resolved_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_requested integer := 0;
  v_resolved integer := 0;
BEGIN
  IF p_user_id IS NULL
     OR jsonb_typeof(COALESCE(p_candidates, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_candidates, '[]'::jsonb)) > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('leak_detection:' || p_user_id::text, 0));
  v_requested := jsonb_array_length(COALESCE(p_candidates, '[]'::jsonb));

  WITH candidates AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_candidates, '[]'::jsonb)) AS x(
      id uuid,
      expected_updated_at timestamptz
    )
  ), resolved AS (
    UPDATE public.user_leaks AS leak
    SET status = 'resolved',
        resolved_at = COALESCE(p_resolved_at, now()),
        remediation_completed_at = COALESCE(p_resolved_at, now()),
        resolution_source = 'detector',
        is_active = false,
        updated_at = COALESCE(p_resolved_at, now())
    FROM candidates AS candidate
    WHERE leak.id = candidate.id
      AND leak.user_id = p_user_id
      AND leak.source_system IN ('live_play', 'solver_engine', 'training_solver', 'ca_hand_facts')
      AND leak.detector_managed = true
      AND leak.status IS DISTINCT FROM 'resolved'
      AND leak.updated_at IS NOT DISTINCT FROM candidate.expected_updated_at
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_resolved FROM resolved;

  RETURN jsonb_build_object(
    'success', true,
    'requested', v_requested,
    'resolved', v_resolved,
    'conflicts', v_requested - v_resolved
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_user_leaks_if_unchanged(uuid, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_leaks_if_unchanged(uuid, jsonb, timestamptz)
  TO service_role;

-- 2. Align get_pa_linked_hand_bundle with handAuditRouteCore direct-query contract
CREATE OR REPLACE FUNCTION public.get_pa_linked_hand_bundle(
  p_user_id uuid,
  p_hand_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hand jsonb;
  v_fact jsonb;
  v_decisions jsonb;
  v_leaks jsonb;
BEGIN
  IF p_user_id IS NULL OR p_hand_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT jsonb_build_object(
    'id', h.id,
    'table_id', h.table_id,
    'tournament_id', h.tournament_id,
    'hand_number', h.hand_number,
    'game_variant', h.game_variant,
    'small_blind', h.small_blind,
    'big_blind', h.big_blind,
    'button_seat', h.button_seat,
    'pot_size', h.pot_size,
    'bomb_pot', h.bomb_pot,
    'kill_pot', h.kill_pot,
    'rit_boards', h.rit_boards,
    'community_cards', h.community_cards,
    'community_cards2', h.community_cards2,
    'community_cards3', h.community_cards3,
    'board', h.board,
    'hole_cards', h.hole_cards,
    'players', h.players,
    'actions', h.actions,
    'summary', h.summary,
    'source', h.source,
    'created_at', h.created_at
  )
  INTO v_hand
  FROM public.hand_history h
  WHERE h.id = p_hand_id
    AND (
      h.players @> jsonb_build_array(jsonb_build_object('userId', p_user_id::text))
      OR h.players @> jsonb_build_array(jsonb_build_object('id', p_user_id::text))
    )
  LIMIT 1;

  IF v_hand IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT jsonb_build_object(
    'hand_id', f.hand_id,
    'hole_cards', f.hole_cards,
    'effective_stack_bb_at_deal', f.effective_stack_bb_at_deal
  )
  INTO v_fact
  FROM public.ca_hand_facts f
  WHERE f.hand_id = p_hand_id
    AND f.user_id = p_user_id
  LIMIT 1;

  SELECT COALESCE(
    jsonb_agg(d_obj),
    '[]'::jsonb
  )
  INTO v_decisions
  FROM (
    SELECT jsonb_build_object(
      'decision_key', d.decision_key,
      'street', d.street,
      'hero_position', d.hero_position,
      'villain_position', d.villain_position,
      'spot_type', d.spot_type,
      'hero_hand', d.hero_hand,
      'board_cards', d.board_cards,
      'player_action', d.player_action,
      'solver_action', d.solver_action,
      'selected_frequency', d.selected_frequency,
      'optimal_frequency', d.optimal_frequency,
      'classification', d.classification,
      'ev_loss', d.ev_loss,
      'ev_loss_measured', d.ev_loss_measured,
      'solver_verified', d.solver_verified,
      'solver_source', d.solver_source,
      'match_tier', d.match_tier,
      'game_id', d.game_id,
      'audited_at', d.audited_at
    ) AS d_obj
    FROM public.hand_audit_decisions d
    WHERE d.user_id = p_user_id
      AND d.hand_external_id = 'club-arena:' || p_hand_id::text
    ORDER BY d.audited_at ASC, d.id ASC
    LIMIT 12
  ) d_sub;

  SELECT COALESCE(
    jsonb_agg(l_obj),
    '[]'::jsonb
  )
  INTO v_leaks
  FROM (
    SELECT jsonb_build_object(
      'id', l.id,
      'leak_type', l.leak_type,
      'leak_category', l.leak_category,
      'situation_class', l.situation_class,
      'status', l.status,
      'source_system', l.source_system,
      'is_active', l.is_active,
      'occurrence_count', l.occurrence_count,
      'avg_ev_loss_bb', l.avg_ev_loss_bb,
      'recommended_drill', l.recommended_drill,
      'updated_at', l.updated_at
    ) AS l_obj
    FROM public.user_leaks l
    WHERE l.user_id = p_user_id
    ORDER BY l.updated_at DESC
    LIMIT 100
  ) l_sub;

  RETURN jsonb_build_object(
    'found', true,
    'hand', v_hand,
    'fact', v_fact,
    'decisions', v_decisions,
    'leaks', v_leaks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pa_linked_hand_bundle(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pa_linked_hand_bundle(uuid, uuid) TO service_role;

-- 3. Reset remediation_baseline_at on relapse so re-mastery gets a fresh post-relapse verification baseline
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
SET search_path = ''
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
    remediation_baseline_at = CASE
      WHEN EXCLUDED.retired THEN COALESCE(
        CASE WHEN public.leak_review_state.retired THEN public.leak_review_state.remediation_baseline_at ELSE NULL END,
        now()
      )
      ELSE NULL
    END,
    updated_at = now()
  RETURNING * INTO v_state;

  INSERT INTO public.leak_review_operations (user_id, leak_id, review_id)
  VALUES (p_user_id, p_leak_id, p_review_id);

  RETURN jsonb_build_object('success', true, 'idempotent', false, 'row', to_jsonb(v_state));
END;
$$;

REVOKE ALL ON FUNCTION public.commit_leak_review_state(uuid, text, text, timestamp with time zone, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_leak_review_state(uuid, text, text, timestamp with time zone, jsonb)
  TO service_role;

-- 4. Restore backward-compatible 'fingerprint' alias in purge_personal_assistant_data
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

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id,
    'fingerprint', v_fingerprint,
    'receipt_fingerprint', v_fingerprint,
    'counts', v_counts
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_personal_assistant_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_personal_assistant_data(uuid, text) TO service_role;

-- 5. Complete retention coverage: expired retired/orphaned leak_review_state + abandoned leak_drill_sessions
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
  DELETE FROM public.leak_review_state lrs
  WHERE lrs.user_id = p_user_id
    AND coalesce(lrs.updated_at, lrs.created_at) < v_cutoff
    AND (
      lrs.retired = true
      OR (
        NOT EXISTS (SELECT 1 FROM public.user_leaks l WHERE l.user_id = p_user_id AND l.id::text = lrs.leak_id)
        AND NOT EXISTS (SELECT 1 FROM public.user_training_leaks tl WHERE tl.user_id = p_user_id AND tl.id::text = lrs.leak_id)
      )
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('review_states', v_count);
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
  WHERE user_id = p_user_id
    AND (
      (completed_at IS NOT NULL AND completed_at < v_cutoff)
      OR (completed_at IS NULL AND started_at < v_cutoff)
    );
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

REVOKE ALL ON FUNCTION public.apply_personal_assistant_retention(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personal_assistant_retention(uuid) TO service_role;

-- 6. Tighten leak_hand_examples table grants (prevent UPDATE/DELETE/TRUNCATE by authenticated)
REVOKE ALL ON TABLE public.leak_hand_examples FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.leak_hand_examples TO authenticated;
GRANT ALL ON TABLE public.leak_hand_examples TO service_role;

COMMIT;
