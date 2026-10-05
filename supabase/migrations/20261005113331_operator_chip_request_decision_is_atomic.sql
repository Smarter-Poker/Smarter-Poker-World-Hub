-- Stable Admin O5: one locked chip-request decision and, on approval, one
-- sanctioned club-treasury funding call in the same transaction.
BEGIN;
SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_missing text[];
  v_status_check text;
BEGIN
  IF to_regclass('public.chip_requests') IS NULL THEN
    RAISE EXCEPTION 'chip request decision: public.chip_requests is missing';
  END IF;
  SELECT array_agg(required.name ORDER BY required.name)
    INTO v_missing
    FROM (VALUES
      ('id','uuid'), ('club_id','uuid'), ('requester_id','uuid'),
      ('amount','numeric'), ('status','text'), ('responded_by','uuid'),
      ('responded_at','timestamp with time zone'), ('op_id','uuid')
    ) AS required(name, expected_type)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = 'public.chip_requests'::regclass
        AND a.attname = required.name
        AND NOT a.attisdropped
        AND format_type(a.atttypid, a.atttypmod) = required.expected_type
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'chip request decision: missing or changed columns %', v_missing;
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_status_check
    FROM pg_constraint
   WHERE conrelid = 'public.chip_requests'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%';
  IF v_status_check IS NULL
     OR v_status_check NOT LIKE '%pending%'
     OR v_status_check NOT LIKE '%approved%'
     OR v_status_check NOT LIKE '%declined%'
     OR v_status_check NOT LIKE '%cancelled%' THEN
    RAISE EXCEPTION 'chip request decision: status constraint is not the proven four-state contract';
  END IF;
  IF to_regprocedure('public.fn_ca_fund_club(uuid,numeric,text,text)') IS NULL THEN
    RAISE EXCEPTION 'chip request decision: sanctioned fn_ca_fund_club signature is missing';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.fn_ca_operator_decide_chip_request(
  p_request_id uuid,
  p_action text,
  p_actor_id uuid,
  p_expected_op_id uuid,
  p_expected_amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_req public.chip_requests%ROWTYPE;
  v_fund jsonb;
  v_key text;
BEGIN
  IF p_request_id IS NULL OR p_actor_id IS NULL OR p_action NOT IN ('approve', 'deny') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_decision');
  END IF;

  SELECT * INTO v_req
    FROM public.chip_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_req.status <> 'pending' THEN
    IF v_req.responded_by = p_actor_id
       AND ((p_action = 'approve' AND v_req.status = 'approved')
         OR (p_action = 'deny' AND v_req.status = 'declined')) THEN
      RETURN jsonb_build_object('ok', true, 'status', v_req.status,
        'request_id', v_req.id, 'op_id', v_req.op_id, 'replayed', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'already_decided',
      'status', v_req.status, 'request_id', v_req.id);
  END IF;

  IF v_req.op_id IS DISTINCT FROM p_expected_op_id
     OR v_req.amount IS DISTINCT FROM p_expected_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_changed',
      'status', v_req.status, 'request_id', v_req.id);
  END IF;

  IF v_req.op_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_idempotency_key');
  END IF;

  IF p_action = 'deny' THEN
    UPDATE public.chip_requests
       SET status = 'declined', responded_by = p_actor_id, responded_at = now()
     WHERE id = v_req.id;
    RETURN jsonb_build_object('ok', true, 'status', 'declined',
      'request_id', v_req.id, 'op_id', v_req.op_id, 'replayed', false);
  END IF;

  v_key := 'chip-request-fund:' || v_req.op_id::text;
  v_fund := public.fn_ca_fund_club(
    v_req.club_id,
    v_req.amount,
    'Approved Stable Admin chip request ' || v_req.id::text,
    v_key
  );
  IF NOT COALESCE((v_fund ->> 'ok')::boolean, false) THEN
    RAISE EXCEPTION 'chip request funding refused: %', COALESCE(v_fund ->> 'reason', 'unknown');
  END IF;

  UPDATE public.chip_requests
     SET status = 'approved', responded_by = p_actor_id, responded_at = now()
   WHERE id = v_req.id;
  RETURN jsonb_build_object('ok', true, 'status', 'approved',
    'request_id', v_req.id, 'op_id', v_req.op_id,
    'replayed', COALESCE((v_fund ->> 'replayed')::boolean, false),
    'funding', v_fund);
END
$function$;

ALTER FUNCTION public.fn_ca_operator_decide_chip_request(uuid, text, uuid, uuid, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_ca_operator_decide_chip_request(uuid, text, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_operator_decide_chip_request(uuid, text, uuid, uuid, numeric) TO service_role;

DO $postflight$
DECLARE
  v_src text;
  v_acl aclitem[];
BEGIN
  SELECT prosrc, proacl INTO v_src, v_acl
    FROM pg_proc
   WHERE oid = 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)'::regprocedure;
  IF v_src NOT LIKE '%FOR UPDATE%'
     OR v_src NOT LIKE '%fn_ca_fund_club%'
     OR v_src NOT LIKE '%v_req.op_id%'
     OR v_src NOT LIKE '%status = ''approved''%'
     OR v_src NOT LIKE '%status = ''declined''%' THEN
    RAISE EXCEPTION 'chip request decision: installed function lost its atomic contract';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'chip request decision: execute grants are not service-role-only';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'chip request decision: function is not SECURITY DEFINER';
  END IF;
END
$postflight$;

COMMIT;
