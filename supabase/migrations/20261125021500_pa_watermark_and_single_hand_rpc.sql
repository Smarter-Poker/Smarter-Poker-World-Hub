-- Personal Assistant Incremental Audit Watermarks, Remediation Baseline,
-- and Single-Round-Trip Owner-Scoped Linked-Hand Audit Bundle RPC
--
-- Additive, idempotent migration:
-- 1. Adds incremental Club Arena hand audit watermark columns on public.user_assistant_stats
--    so repeat Leak Finder scans stop early once previously audited hands are reached.
-- 2. Adds remediation_baseline_at on public.leak_review_state to anchor before-vs-after
--    table-verified leak resolution proofs.
-- 3. Creates service-role-only SECURITY DEFINER RPC public.get_pa_linked_hand_bundle(uuid, uuid)
--    returning owner-verified hand_history, permitted ca_hand_facts, existing hand_audit_decisions,
--    and active user_leaks in a single round-trip while enforcing strict owner containment.

ALTER TABLE public.user_assistant_stats
  ADD COLUMN IF NOT EXISTS last_audited_hand_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_audited_hand_id uuid,
  ADD COLUMN IF NOT EXISTS last_audited_matcher_version text;

ALTER TABLE public.leak_review_state
  ADD COLUMN IF NOT EXISTS remediation_baseline_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_pa_linked_hand_bundle(
  p_user_id uuid,
  p_hand_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    jsonb_agg(
      jsonb_build_object(
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
      )
      ORDER BY d.audited_at ASC, d.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_decisions
  FROM public.hand_audit_decisions d
  WHERE d.user_id = p_user_id
    AND d.hand_external_id = 'club-arena:' || p_hand_id::text;

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
      'occurrence_count', l.occurrence_count,
      'avg_ev_loss_bb', l.avg_ev_loss_bb,
      'recommended_drill', l.recommended_drill,
      'updated_at', l.updated_at
    ) AS l_obj
    FROM public.user_leaks l
    WHERE l.user_id = p_user_id
      AND COALESCE(l.status, '') <> 'resolved'
    ORDER BY l.updated_at DESC
    LIMIT 200
  ) sub;

  RETURN jsonb_build_object(
    'found', true,
    'hand', v_hand,
    'fact', v_fact,
    'decisions', v_decisions,
    'leaks', v_leaks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pa_linked_hand_bundle(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pa_linked_hand_bundle(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_pa_linked_hand_bundle(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_pa_linked_hand_bundle(uuid, uuid) TO service_role;
