-- Phase 5 release audit: a sanction is valid only after, and only when it
-- matches, the human verdict recorded on its integrity case.
--
-- ROLLBACK:
-- Restore fn_ca_integrity_sanction from migration 20260906101639. No table or
-- row rollback is required because this migration only tightens RPC behavior.

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_sanction(
  p_case_id        uuid,
  p_subject_id     uuid,
  p_kind           text,
  p_amount         numeric,
  p_restriction_id uuid,
  p_approval_id    uuid,
  p_note           text,
  p_actor          uuid,
  p_op_id          text,
  p_ip_address     text DEFAULT NULL,
  p_user_agent     text DEFAULT NULL,
  p_request_id     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_case public.ca_integrity_cases;
  v_sanction public.ca_integrity_sanctions;
  v_payload jsonb;
  v_hash text;
  v_state text;
  v_expected_decision text;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'Operator identity is required');
  END IF;
  IF p_op_id IS NULL OR length(btrim(p_op_id)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OP_ID_REQUIRED', 'message', 'A bounded operation id is required');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('warning', 'restriction', 'confiscation') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SANCTION', 'message', 'Unknown sanction kind');
  END IF;
  IF length(btrim(coalesce(p_note, ''))) NOT BETWEEN 10 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_NOTE', 'message', 'A sanction note of at least ten characters is required');
  END IF;
  IF p_kind = 'confiscation' AND (p_amount IS NULL OR p_amount <= 0 OR p_approval_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPROVAL_REQUIRED', 'message', 'A positive amount and approval are required for confiscation');
  END IF;
  IF p_kind <> 'confiscation' AND (p_amount IS NOT NULL OR p_approval_id IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_MONEY_FIELDS', 'message', 'Only confiscation may carry money approval fields');
  END IF;
  IF p_kind = 'restriction' AND p_restriction_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESTRICTION_REQUIRED', 'message', 'A restriction record is required');
  END IF;
  IF p_kind <> 'restriction' AND p_restriction_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_RESTRICTION', 'message', 'Only a restriction sanction may name a restriction');
  END IF;

  v_payload := jsonb_build_object(
    'case_id', p_case_id, 'subject_id', p_subject_id, 'kind', p_kind,
    'amount', p_amount, 'asset', CASE WHEN p_kind = 'confiscation' THEN 'chips' ELSE NULL END,
    'restriction_id', p_restriction_id, 'approval_id', p_approval_id, 'note', btrim(p_note));
  v_hash := md5(v_payload::text);
  SELECT * INTO v_sanction FROM public.ca_integrity_sanctions s WHERE s.op_id = p_op_id;
  IF FOUND THEN
    IF v_sanction.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation id was used for a different sanction');
    END IF;
    RETURN jsonb_build_object('ok', true, 'sanction', to_jsonb(v_sanction), 'idempotent', true);
  END IF;

  SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_NOT_FOUND', 'message', 'Integrity case not found');
  END IF;
  IF v_case.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_CLOSED', 'message', 'A closed case cannot receive a sanction');
  END IF;
  IF v_case.status <> 'decided' OR v_case.decision IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DECISION_REQUIRED', 'message', 'A human decision is required before a sanction');
  END IF;

  v_expected_decision := CASE p_kind
    WHEN 'warning' THEN 'warned'
    WHEN 'restriction' THEN 'restricted'
    WHEN 'confiscation' THEN 'confiscated'
  END;
  IF v_case.decision <> v_expected_decision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SANCTION_DECISION_MISMATCH',
      'message', 'The sanction must match the human decision recorded on the case');
  END IF;
  IF NOT (p_subject_id = ANY(v_case.subject_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBJECT_NOT_IN_CASE', 'message', 'That player is not a subject of this case');
  END IF;
  IF p_kind = 'restriction' AND NOT EXISTS (
    SELECT 1 FROM public.ca_player_restrictions r
     WHERE r.id = p_restriction_id AND r.user_id = p_subject_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESTRICTION_NOT_FOUND', 'message', 'That restriction does not belong to this case subject');
  END IF;
  IF p_kind = 'confiscation' AND NOT EXISTS (
    SELECT 1 FROM public.ca_operator_approvals a
     WHERE a.id = p_approval_id AND a.kind = 'sanction' AND a.status = 'approved'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPROVAL_NOT_APPROVED', 'message', 'The confiscation approval is not approved');
  END IF;

  -- Warnings and existing restrictions have already happened elsewhere. A
  -- confiscation is only an approved decision record: this function never
  -- debits chips and deliberately cannot mark it applied.
  v_state := CASE WHEN p_kind = 'confiscation' THEN 'approved' ELSE 'applied' END;
  INSERT INTO public.ca_integrity_sanctions (
    case_id, subject_id, kind, state, amount, asset, restriction_id, approval_id,
    payload, payload_hash, proposed_by, applied_by, applied_at, note, op_id)
  VALUES (
    p_case_id, p_subject_id, p_kind, v_state, p_amount,
    CASE WHEN p_kind = 'confiscation' THEN 'chips' ELSE NULL END,
    p_restriction_id, p_approval_id, v_payload, v_hash, p_actor,
    CASE WHEN v_state = 'applied' THEN p_actor ELSE NULL END,
    CASE WHEN v_state = 'applied' THEN now() ELSE NULL END,
    btrim(p_note), p_op_id)
  RETURNING * INTO v_sanction;

  INSERT INTO public.ca_integrity_case_items (
    case_id, item_type, detail, snapshot_hash, added_by, op_id, payload_hash)
  VALUES (
    p_case_id, 'sanction', jsonb_build_object('sanction_id', v_sanction.id, 'kind', p_kind, 'state', v_state),
    md5(jsonb_build_object('sanction_id', v_sanction.id, 'kind', p_kind, 'state', v_state)::text),
    p_actor, md5('integrity-sanction-event:' || p_op_id), v_hash);

  PERFORM public.fn_ca_integrity_audit(
    p_actor, 'integrity.sanction_propose', 'integrity_case', p_case_id::text,
    jsonb_build_object('op_id', p_op_id, 'kind', p_kind, 'no_chips_moved', p_kind = 'confiscation'),
    NULL, to_jsonb(v_sanction), p_ip_address, p_user_agent, p_request_id);
  RETURN jsonb_build_object(
    'ok', true, 'sanction', to_jsonb(v_sanction), 'idempotent', false,
    'no_chips_moved', p_kind = 'confiscation');
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_ca_integrity_sanction(uuid, uuid, text, numeric, uuid, uuid, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_sanction(uuid, uuid, text, numeric, uuid, uuid, text, uuid, text, text, text, text) TO service_role;
