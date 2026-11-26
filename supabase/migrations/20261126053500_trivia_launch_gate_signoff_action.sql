-- 20261126053500_trivia_launch_gate_signoff_action.sql
--
-- Closes the dead-end physical-device launch sign-off write path.
--
-- public.trivia_launch_gate_signoffs_v1 (append-only) already feeds
-- public.trivia_launch_readiness_v1(), but nothing could write the three
-- physical-device gates. This adds a supervisor-only, exact-once operator
-- action `launch_gate_signoff` to public.trivia_operator_execute_v1.
--
-- Safety properties:
--   * ONLY physical_ios_review, physical_android_review, physical_push_receipt
--     may be signed. operator_mfa_http_write is rejected (invalid_gate_key):
--     Gate 2 can only be written by trivia_record_mfa_write_proof_v1 after a
--     real HMAC-verified MFA write.
--   * supervisor role required; device 3..120, evidence_ref 3..240, reason 12+.
--   * exact-once per (operator_id, request_key) via trivia_operator_events_v1.
--   * No sign-off row is inserted by this migration.
--   * Existing actions and wrappers are preserved: the current
--     trivia_operator_execute_v1 is renamed (ACL preserved) and the new
--     function delegates every other action to it unchanged.
--
-- Additive; touches only the operator-events CHECK constraints (tiny table,
-- not a gameplay table).
--
-- FORWARD ROLLBACK (manual only): ALTER FUNCTION
--   public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb) RENAME TO
--   trivia_operator_execute_launch_signoff_v1; then ALTER FUNCTION
--   public.trivia_operator_execute_before_launch_signoff_v1(uuid,text,text,text,uuid,jsonb)
--   RENAME TO trivia_operator_execute_v1. Historical sign-off rows are retained.

DO $preflight$
BEGIN
    IF to_regprocedure('public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'preflight failed: trivia_operator_execute_v1 missing';
    END IF;
    IF to_regprocedure('public.trivia_operator_execute_before_payout_control_v1(uuid,text,text,text,uuid,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'preflight failed: trivia_operator_execute_before_payout_control_v1 missing';
    END IF;
    IF to_regclass('public.trivia_launch_gate_signoffs_v1') IS NULL THEN
        RAISE EXCEPTION 'preflight failed: trivia_launch_gate_signoffs_v1 missing';
    END IF;
    IF to_regprocedure('public.trivia_operator_context_core_v1(uuid)') IS NULL THEN
        RAISE EXCEPTION 'preflight failed: trivia_operator_context_core_v1 missing';
    END IF;
END $preflight$;

-- 1. Allow the new action/target kind on the immutable operator receipt table.
ALTER TABLE public.trivia_operator_events_v1
    DROP CONSTRAINT IF EXISTS trivia_operator_events_v1_action_check,
    ADD CONSTRAINT trivia_operator_events_v1_action_check CHECK (
        action = ANY (ARRAY[
            'question_quarantine'::text,
            'question_release'::text,
            'pvp_recover'::text,
            'pvp_joins_set'::text,
            'pvp_horses_set'::text,
            'tournament_cancel'::text,
            'tournament_recover_settlement'::text,
            'incident_note'::text,
            'payout_hold'::text,
            'payout_release'::text,
            'round_recover'::text,
            'match_recover'::text,
            'treasury_replenish_from_rake'::text,
            'launch_gate_signoff'::text
        ])
    );

ALTER TABLE public.trivia_operator_events_v1
    DROP CONSTRAINT IF EXISTS trivia_operator_events_v1_target_kind_check,
    ADD CONSTRAINT trivia_operator_events_v1_target_kind_check CHECK (
        target_kind = ANY (ARRAY[
            'question'::text,
            'question_quarantine'::text,
            'pvp_engine'::text,
            'tournament'::text,
            'incident'::text,
            'settlement'::text,
            'round'::text,
            'match'::text,
            'treasury'::text,
            'launch_gate'::text
        ])
    );

-- 2. Preserve the current dispatcher under a new name (once).
DO $rename$
BEGIN
    IF to_regprocedure('public.trivia_operator_execute_before_launch_signoff_v1(uuid,text,text,text,uuid,jsonb)') IS NULL THEN
        ALTER FUNCTION public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)
            RENAME TO trivia_operator_execute_before_launch_signoff_v1;
    END IF;
END $rename$;

REVOKE ALL ON FUNCTION public.trivia_operator_execute_before_launch_signoff_v1(uuid, text, text, text, uuid, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;

-- 3. New dispatcher with the supervisor-only physical sign-off action.
CREATE OR REPLACE FUNCTION public.trivia_operator_execute_v1(
    p_operator_id uuid,
    p_request_key text,
    p_action text,
    p_reason text,
    p_target_id uuid DEFAULT NULL::uuid,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_context jsonb;
    v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
    v_extra_keys text[];
    v_gate_key text;
    v_device text;
    v_evidence text;
    v_reason text := btrim(COALESCE(p_reason, ''));
    v_hash text;
    v_existing public.trivia_operator_events_v1%ROWTYPE;
    v_receipt uuid := extensions.gen_random_uuid();
    v_signoff_id uuid;
    v_signed_at timestamptz;
    v_result jsonb;
BEGIN
    IF p_action IS DISTINCT FROM 'launch_gate_signoff' THEN
        RETURN public.trivia_operator_execute_before_launch_signoff_v1(
            p_operator_id, p_request_key, p_action, p_reason, p_target_id, p_payload
        );
    END IF;

    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    IF p_operator_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_required');
    END IF;
    IF p_request_key IS NULL OR p_request_key !~ '^[A-Za-z0-9_.:@-]{8,128}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request_key');
    END IF;
    IF p_target_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_target');
    END IF;
    IF jsonb_typeof(v_payload) <> 'object' OR octet_length(v_payload::text) > 4096 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
    END IF;
    SELECT array_agg(k) INTO v_extra_keys
      FROM jsonb_object_keys(v_payload) AS k
     WHERE k NOT IN ('gateKey', 'device', 'evidenceRef');
    IF coalesce(cardinality(v_extra_keys), 0) > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload_field');
    END IF;

    v_gate_key := btrim(COALESCE(v_payload->>'gateKey', ''));
    IF v_gate_key NOT IN ('physical_ios_review', 'physical_android_review', 'physical_push_receipt') THEN
        -- Includes operator_mfa_http_write: Gate 2 can never be signed by hand.
        RETURN jsonb_build_object('success', false, 'error', 'invalid_gate_key');
    END IF;
    v_device := btrim(COALESCE(v_payload->>'device', ''));
    IF length(v_device) NOT BETWEEN 3 AND 120 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_device');
    END IF;
    v_evidence := btrim(COALESCE(v_payload->>'evidenceRef', ''));
    IF length(v_evidence) NOT BETWEEN 3 AND 240 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_evidence_ref');
    END IF;
    IF length(v_reason) < 12 OR length(v_reason) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT (v_context->'roles' ? 'supervisor') THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_capability_required');
    END IF;

    v_hash := encode(extensions.digest(convert_to(
        jsonb_build_object(
            'operatorId', p_operator_id,
            'requestKey', p_request_key,
            'action', p_action,
            'reason', v_reason,
            'targetId', p_target_id,
            'payload', jsonb_build_object(
                'gateKey', v_gate_key, 'device', v_device, 'evidenceRef', v_evidence)
        )::text, 'UTF8'), 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'trivia-operator:' || p_operator_id::text || ':' || p_request_key, 0
    ));
    SELECT * INTO v_existing
      FROM public.trivia_operator_events_v1
     WHERE operator_id = p_operator_id AND request_key = p_request_key;
    IF FOUND THEN
        IF v_existing.request_hash <> v_hash THEN
            RETURN jsonb_build_object(
                'success', false, 'error', 'idempotency_conflict',
                'receipt_id', v_existing.receipt_id
            );
        END IF;
        RETURN jsonb_build_object(
            'success', v_existing.outcome = 'succeeded',
            'receipt_id', v_existing.receipt_id,
            'replayed', true,
            'action', v_existing.action,
            'outcome', v_existing.outcome,
            'result', v_existing.result
        );
    END IF;

    INSERT INTO public.trivia_launch_gate_signoffs_v1 (gate_key, actor_id, evidence_ref, metadata, signed_at)
    VALUES (
        v_gate_key,
        p_operator_id,
        v_evidence,
        jsonb_build_object(
            'device', v_device,
            'reason', v_reason,
            'receipt_id', v_receipt,
            'request_key', p_request_key,
            'source', 'operator_action'
        ),
        pg_catalog.clock_timestamp()
    )
    RETURNING id, signed_at INTO v_signoff_id, v_signed_at;

    v_result := jsonb_build_object(
        'success', true,
        'gate_key', v_gate_key,
        'signoff_id', v_signoff_id,
        'signed_at', v_signed_at
    );

    INSERT INTO public.trivia_operator_events_v1
        (receipt_id, operator_id, request_key, request_hash, action, reason,
         target_kind, target_id, outcome, result)
    VALUES
        (v_receipt, p_operator_id, p_request_key, v_hash, p_action, v_reason,
         'launch_gate', NULL, 'succeeded', v_result);

    RETURN jsonb_build_object(
        'success', true,
        'receipt_id', v_receipt,
        'replayed', false,
        'action', p_action,
        'outcome', 'succeeded',
        'result', v_result
    );
END
$function$;

REVOKE ALL ON FUNCTION public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)
    TO postgres, service_role;

-- 4. Post-install assertions.
DO $assert$
BEGIN
    IF has_function_privilege('anon', 'public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'assertion failed: trivia_operator_execute_v1 exposed to anon/authenticated';
    END IF;
    IF to_regprocedure('public.trivia_operator_execute_before_launch_signoff_v1(uuid,text,text,text,uuid,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'assertion failed: delegated dispatcher missing';
    END IF;
END $assert$;
