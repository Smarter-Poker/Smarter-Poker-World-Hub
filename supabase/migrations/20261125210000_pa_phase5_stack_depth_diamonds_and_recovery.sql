-- ===========================================================================
-- MIGRATION:   pa_phase5_stack_depth_diamonds_and_recovery
-- AFFECTS:     public.hand_audit_decisions (stack_depth_bb, evidence_scope)
--              public.pa_coaching_preferences (weekly_digest_opt_in)
--              public.diamond_reward_catalog (pa_leak_verified_fixed)
--              public.replace_hand_audit_decisions
--              public.requeue_stalled_pa_leak_audit_jobs
-- IRREVERSIBLE: no
--
-- Zero new tables. Obeying explicit table access rules.
-- ZERO XP columns anywhere (trigger xp_ban_guard enforced).
-- ===========================================================================

BEGIN;

-- 1. Extend public.hand_audit_decisions with stack_depth_bb and evidence_scope
ALTER TABLE public.hand_audit_decisions
  ADD COLUMN IF NOT EXISTS stack_depth_bb numeric(6,1),
  ADD COLUMN IF NOT EXISTS evidence_scope text;

-- Add check constraint for evidence_scope (NULL or in allowed values)
ALTER TABLE public.hand_audit_decisions
  DROP CONSTRAINT IF EXISTS hand_audit_decisions_evidence_scope_check;

ALTER TABLE public.hand_audit_decisions
  ADD CONSTRAINT hand_audit_decisions_evidence_scope_check
  CHECK (evidence_scope IS NULL OR evidence_scope IN ('club_arena', 'external_upload', 'self_reported_live', 'training_solver'));

-- 2. Extend public.pa_coaching_preferences with weekly_digest_opt_in
ALTER TABLE public.pa_coaching_preferences
  ADD COLUMN IF NOT EXISTS weekly_digest_opt_in boolean NOT NULL DEFAULT false;

-- 3. Replace public.replace_hand_audit_decisions with stack_depth_bb and evidence_scope persistence
CREATE OR REPLACE FUNCTION public.replace_hand_audit_decisions(
  p_user_id uuid,
  p_hand_ids text[],
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
        stack_depth_bb numeric,
        evidence_scope text,
        audited_at timestamptz,
        updated_at timestamptz
      )
  ), written AS (
    INSERT INTO public.hand_audit_decisions (
      user_id, hand_external_id, decision_key, question_id, game_id, street,
      hero_position, villain_position, spot_type, hero_hand, board_cards,
      player_action, solver_action, selected_frequency, optimal_frequency,
      classification, ev_loss, ev_loss_measured, solver_verified,
      solver_source, match_tier, stack_depth_bb, evidence_scope,
      audited_at, updated_at
    )
    SELECT
      p_user_id, hand_external_id, decision_key, question_id, game_id, street,
      hero_position, villain_position, spot_type, hero_hand,
      COALESCE(board_cards, '[]'::jsonb), player_action, solver_action,
      selected_frequency, optimal_frequency, classification, ev_loss,
      COALESCE(ev_loss_measured, false), COALESCE(solver_verified, false),
      solver_source, match_tier, stack_depth_bb, evidence_scope,
      COALESCE(audited_at, now()), COALESCE(updated_at, now())
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
      stack_depth_bb = EXCLUDED.stack_depth_bb,
      evidence_scope = EXCLUDED.evidence_scope,
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

-- 4. Insert catalog action for verified live leak fix
INSERT INTO public.diamond_reward_catalog (
  action_key, diamonds, max_per_day, counts_toward_daily_cap, lifetime, category, active, updated_at
) VALUES (
  'pa_leak_verified_fixed', 25, 2, true, false, 'training', true, now()
) ON CONFLICT (action_key) DO NOTHING;

-- 5. Stalled leak audit job recovery RPC
CREATE OR REPLACE FUNCTION public.requeue_stalled_pa_leak_audit_jobs(
  p_limit integer DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := LEAST(100, GREATEST(1, COALESCE(p_limit, 25)));
  v_requeued_ids uuid[];
  v_active_count integer := 0;
  v_failed_24h integer := 0;
  v_p95_duration_ms bigint := 0;
BEGIN
  WITH candidates AS (
    SELECT id
      FROM public.pa_leak_audit_jobs
     WHERE status = 'running'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at < now()
     ORDER BY lease_expires_at ASC
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.pa_leak_audit_jobs j
       SET status = 'queued',
           worker_token = NULL,
           lease_expires_at = NULL,
           queued_at = now(),
           updated_at = now()
      FROM candidates c
     WHERE j.id = c.id
    RETURNING j.id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_requeued_ids FROM updated;

  SELECT count(*)::integer INTO v_active_count
    FROM public.pa_leak_audit_jobs
   WHERE status IN ('queued', 'running');

  SELECT count(*)::integer INTO v_failed_24h
    FROM public.pa_leak_audit_jobs
   WHERE status = 'failed'
     AND COALESCE(completed_at, updated_at) >= now() - interval '24 hours';

  SELECT COALESCE(
    round(
      percentile_cont(0.95) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
      )
    )::bigint,
    0
  ) INTO v_p95_duration_ms
    FROM public.pa_leak_audit_jobs
   WHERE status = 'completed'
     AND completed_at >= now() - interval '24 hours'
     AND started_at IS NOT NULL
     AND completed_at >= started_at;

  RETURN jsonb_build_object(
    'requeuedIds', to_jsonb(v_requeued_ids),
    'stalledRequeued', COALESCE(array_length(v_requeued_ids, 1), 0),
    'activeCount', v_active_count,
    'failed24h', v_failed_24h,
    'p95DurationMs', v_p95_duration_ms
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.requeue_stalled_pa_leak_audit_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_stalled_pa_leak_audit_jobs(integer)
  TO service_role;

-- 6. Self-verifying assertions
DO $$
DECLARE
  v_overloads integer;
BEGIN
  SELECT count(*) INTO v_overloads
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'replace_hand_audit_decisions';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'replace_hand_audit_decisions must have exactly 1 overload, found %', v_overloads;
  END IF;

  SELECT count(*) INTO v_overloads
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'requeue_stalled_pa_leak_audit_jobs';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'requeue_stalled_pa_leak_audit_jobs must have exactly 1 overload, found %', v_overloads;
  END IF;

  IF has_function_privilege('anon', 'public.replace_hand_audit_decisions(uuid,text[],jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.replace_hand_audit_decisions(uuid,text[],jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'replace_hand_audit_decisions must not be executable by anon or authenticated';
  END IF;

  IF has_function_privilege('anon', 'public.requeue_stalled_pa_leak_audit_jobs(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.requeue_stalled_pa_leak_audit_jobs(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'requeue_stalled_pa_leak_audit_jobs must not be executable by anon or authenticated';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
