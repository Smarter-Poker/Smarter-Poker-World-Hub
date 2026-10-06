\set ON_ERROR_STOP on

SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', false);

DO $verify$
DECLARE
    v_count bigint;
    v_success bigint;
    v_receipts bigint;
BEGIN
    -- Different request keys racing to hold the same settlement serialize on
    -- the target advisory lock and settlement row. Exactly one control wins;
    -- both attempts retain immutable receipts.
    SELECT count(*) INTO v_count
      FROM public.trivia_settlement_payout_controls_v1
     WHERE settlement_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'::uuid;
    IF v_count <> 1 THEN RAISE EXCEPTION 'concurrent different-key hold wrote % controls', v_count; END IF;
    SELECT count(*) FILTER (WHERE outcome = 'succeeded'), count(*)
      INTO v_success, v_receipts
      FROM public.trivia_operator_events_v1
     WHERE request_key IN ('race-hold-key-01', 'race-hold-key-02');
    IF v_success <> 1 OR v_receipts <> 2 THEN
        RAISE EXCEPTION 'different-key race receipts success=% total=%', v_success, v_receipts;
    END IF;

    -- Identical concurrent retries serialize on the request lock and replay one
    -- receipt/control instead of duplicating either side effect.
    SELECT count(*) INTO v_count
      FROM public.trivia_settlement_payout_controls_v1
     WHERE settlement_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5'::uuid;
    IF v_count <> 1 THEN RAISE EXCEPTION 'concurrent same-key hold wrote % controls', v_count; END IF;
    SELECT count(*) INTO v_receipts
      FROM public.trivia_operator_events_v1
     WHERE request_key = 'race-same-key-01';
    IF v_receipts <> 1 THEN RAISE EXCEPTION 'concurrent same-key retry wrote % receipts', v_receipts; END IF;
END
$verify$;

SELECT jsonb_build_object(
    'suite', 'trivia-p11-payout-control-concurrency-pg17',
    'status', 'PASS'
);
