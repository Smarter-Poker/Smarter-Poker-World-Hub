-- 20261005151155_chip_request_refuses_terminal_clubs.sql
-- A chip request can outlive its club. The Phase 6 atomic decision function
-- originally delegated approval to fn_ca_fund_club after locking only the
-- request. That funding function accepts every existing club, including a
-- deleted or archived one. Lock the authoritative club row in the same
-- transaction and refuse terminal states before the money function runs.

BEGIN;
SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)') IS NULL THEN
    RAISE EXCEPTION 'terminal chip safety: atomic decision function is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.clubs'::regclass
       AND attname = 'status'
       AND NOT attisdropped
       AND format_type(atttypid, atttypmod) = 'text'
  ) THEN
    RAISE EXCEPTION 'terminal chip safety: clubs.status text column is missing';
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
  v_club_status text;
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

  SELECT c.status INTO v_club_status
    FROM public.clubs c
   WHERE c.id = v_req.club_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'club_not_found',
      'status', v_req.status, 'request_id', v_req.id);
  END IF;
  IF v_club_status IS NULL OR v_club_status NOT IN ('active', 'suspended') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'club_terminal',
      'club_status', v_club_status, 'status', v_req.status,
      'request_id', v_req.id);
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
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_proc
   WHERE oid = 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)'::regprocedure;
  IF strpos(v_src, 'FROM public.chip_requests') = 0
     OR strpos(v_src, 'FROM public.clubs c') = 0
     OR strpos(v_src, 'FROM public.chip_requests') >= strpos(v_src, 'FROM public.clubs c')
     OR strpos(v_src, 'FROM public.clubs c') >= strpos(v_src, 'fn_ca_fund_club')
     OR v_src NOT LIKE '%v_club_status IS NULL OR v_club_status NOT IN (''active'', ''suspended'')%'
     OR v_src NOT LIKE '%''reason'', ''club_terminal''%' THEN
    RAISE EXCEPTION 'terminal chip safety: installed lock/refusal order differs';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'terminal chip safety: execute grants are not service-role-only';
  END IF;
  IF (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.fn_ca_operator_decide_chip_request(uuid,text,uuid,uuid,numeric)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'terminal chip safety: function is not SECURITY DEFINER';
  END IF;
END
$postflight$;

COMMIT;
