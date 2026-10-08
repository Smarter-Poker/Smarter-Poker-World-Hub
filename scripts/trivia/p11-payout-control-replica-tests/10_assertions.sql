\set ON_ERROR_STOP on

SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', false);

DO $test$
DECLARE
    v_operator constant uuid := '11111111-1111-4111-8111-111111111111';
    v_observer constant uuid := '22222222-2222-4222-8222-222222222222';
    v_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    v_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    v_c constant uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
    v_f constant uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff6';
    v_result jsonb;
    v_replay jsonb;
    v_receipt uuid;
    v_count bigint;
    v_house_before bigint;
    v_refused boolean := false;
BEGIN
    -- Hold is durable and exact-once under the stable request key.
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'hold-refund-0001', 'payout_hold',
        'Hold this payout while settlement evidence is reviewed.', v_a, '{}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false)
       OR v_result#>>'{result,payoutControlState}' <> 'held' THEN
        RAISE EXCEPTION 'hold failed: %', v_result;
    END IF;
    v_receipt := (v_result->>'receipt_id')::uuid;
    v_replay := public.trivia_operator_execute_v1(
        v_operator, 'hold-refund-0001', 'payout_hold',
        'Hold this payout while settlement evidence is reviewed.', v_a, '{}'::jsonb
    );
    IF NOT COALESCE((v_replay->>'replayed')::boolean, false)
       OR (v_replay->>'receipt_id')::uuid <> v_receipt THEN
        RAISE EXCEPTION 'hold replay did not preserve receipt: %', v_replay;
    END IF;
    SELECT count(*) INTO v_count FROM public.trivia_settlement_payout_controls_v1 WHERE settlement_id = v_a;
    IF v_count <> 1 THEN RAISE EXCEPTION 'hold replay created % control rows', v_count; END IF;

    -- Same key with changed intent is a conflict and cannot release anything.
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'hold-refund-0001', 'payout_release',
        'Release this payout after settlement evidence review.', v_a, '{}'::jsonb
    );
    IF v_result->>'error' <> 'idempotency_conflict' THEN
        RAISE EXCEPTION 'changed-intent replay was not refused: %', v_result;
    END IF;

    -- Browser-owned financial data is refused before a receipt or control row.
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'hold-refund-0002', 'payout_hold',
        'Attempt a hold with forbidden client-owned financial data.', v_a,
        '{"amount":999999}'::jsonb
    );
    IF v_result->>'error' <> 'invalid_payload_field' THEN
        RAISE EXCEPTION 'client amount was not refused: %', v_result;
    END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_operator_events_v1 WHERE request_key = 'hold-refund-0002') THEN
        RAISE EXCEPTION 'invalid client amount created an operator receipt';
    END IF;

    -- An active hold rejects payout before the original journal function runs.
    BEGIN
        PERFORM public.trivia_settlement_settle(
            'tournament', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
            '{"outcome":"prizes","terminal_state":"settled","rake":10,"payouts":[{"user_id":"11111111-1111-4111-8111-111111111111","amount":90}],"refunds":[]}'::jsonb
        );
    EXCEPTION WHEN SQLSTATE 'TL001' THEN
        v_refused := SQLERRM = 'settlement_payout_held';
    END;
    IF NOT v_refused THEN RAISE EXCEPTION 'held payout reached the settlement implementation'; END IF;
    IF EXISTS (SELECT 1 FROM public.p11_test_journals WHERE settlement_id = v_a)
       OR (SELECT state FROM public.trivia_settlements WHERE id = v_a) <> 'open' THEN
        RAISE EXCEPTION 'held payout left a partial journal or settlement mutation';
    END IF;

    -- Cancellation/refund is admitted while held. The production function still
    -- derives exact amounts from stored entries; this fixture proves the choke
    -- does not turn a payout hold into a player-funds lockout.
    v_result := public.trivia_settlement_settle(
        'tournament', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
        '{"outcome":"cancelled","terminal_state":"refunded","rake":0,"payouts":[],"refunds":[{"user_id":"11111111-1111-4111-8111-111111111111","wallet_kind":"tournament_cancel_refund","reference":"tournament_cancel_refund_a_0001","description":"Cancelled tournament entry refund"}]}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false)
       OR v_result->>'state' <> 'refunded' THEN
        RAISE EXCEPTION 'held cancellation refund was blocked: %', v_result;
    END IF;
    SELECT count(*) INTO v_count FROM public.p11_test_journals WHERE settlement_id = v_a;
    IF v_count <> 1 THEN RAISE EXCEPTION 'refund journal count was %, expected 1', v_count; END IF;

    -- Release is tied to the same settlement and remains legal after a refund.
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'release-refund-01', 'payout_release',
        'Release the retained hold after the cancellation refund completed.', v_a, '{}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false)
       OR v_result#>>'{result,payoutControlState}' <> 'released' THEN
        RAISE EXCEPTION 'same-settlement release failed: %', v_result;
    END IF;
    v_result := public.trivia_settlement_payout_control_status_v1(v_operator, v_a);
    IF v_result->>'payoutControlState' <> 'released'
       OR v_result->>'settlementState' <> 'refunded' THEN
        RAISE EXCEPTION 'status readback is incorrect: %', v_result;
    END IF;

    -- A release cannot consume a hold belonging to another settlement.
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'release-other-001', 'payout_release',
        'Try to release a settlement that has no active payout hold.', v_c, '{}'::jsonb
    );
    IF v_result#>>'{result,error}' <> 'payout_not_held'
       OR v_result->>'outcome' <> 'failed' THEN
        RAISE EXCEPTION 'foreign/no-hold release was not refused durably: %', v_result;
    END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_settlement_payout_controls_v1 WHERE settlement_id = v_c) THEN
        RAISE EXCEPTION 'foreign/no-hold release wrote control state';
    END IF;

    -- Hold -> release -> payout executes once through the original journal owner.
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'hold-payout-0001', 'payout_hold',
        'Hold this payout until the operator completes the evidence review.', v_b, '{}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false) THEN RAISE EXCEPTION 'second hold failed: %', v_result; END IF;
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'release-pay-0001', 'payout_release',
        'Release this payout after the evidence review completed cleanly.', v_b, '{}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false) THEN RAISE EXCEPTION 'second release failed: %', v_result; END IF;
    v_result := public.trivia_settlement_settle(
        'pvp_match', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002',
        '{"outcome":"win","terminal_state":"settled","rake":10,"payouts":[{"user_id":"11111111-1111-4111-8111-111111111111","amount":90,"wallet_kind":"pvp_win","reference":"pvp_win_b_0002","description":"Verified PvP payout"}],"refunds":[]}'::jsonb
    );
    IF v_result->>'state' <> 'settled' THEN RAISE EXCEPTION 'released payout did not settle: %', v_result; END IF;
    SELECT count(*) INTO v_count FROM public.p11_test_journals WHERE settlement_id = v_b;
    IF v_count <> 1 THEN RAISE EXCEPTION 'released payout journal count was %, expected 1', v_count; END IF;

    -- Rake has a second canonical financial choke. A hold blocks both the new
    -- body and a predecessor body that entered before cutover. The table fence
    -- rolls the predecessor's already-attempted journal back atomically.
    UPDATE public.trivia_ledger_accounts
       SET balance = 100
     WHERE account_code = 'escrow:pvp:ffffffff-ffff-4fff-8fff-ffffffff0006';
    UPDATE public.trivia_settlements
       SET state = 'locked', gross_pool = 100, locked_at = clock_timestamp()
     WHERE id = v_f;
    SELECT balance INTO v_house_before
      FROM public.trivia_ledger_accounts WHERE account_code = 'house:rake:pvp';
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'hold-rake-f-001', 'payout_hold',
        'Hold this rake movement while settlement evidence is reviewed.', v_f, '{}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'rake hold failed: %', v_result;
    END IF;

    v_result := public.p11_test_old_rake_body(
        'old-rake-held-01', 'pvp_match', 'ffffffff-ffff-4fff-8fff-ffffffff0006',
        10, 'Predecessor rake cutover probe', '{}'::jsonb
    );
    IF v_result->>'error' <> 'settlement_payout_held' THEN
        RAISE EXCEPTION 'cached predecessor rake crossed active hold: %', v_result;
    END IF;
    v_result := public.trivia_ledger_rake(
        'new-rake-held-01', 'pvp_match', 'ffffffff-ffff-4fff-8fff-ffffffff0006',
        10, 'Canonical rake hold probe', '{}'::jsonb
    );
    IF v_result->>'error' <> 'settlement_payout_held' THEN
        RAISE EXCEPTION 'canonical rake crossed active hold: %', v_result;
    END IF;
    IF EXISTS (SELECT 1 FROM public.p11_test_journals WHERE settlement_id = v_f)
       OR (SELECT rake_amount FROM public.trivia_settlements WHERE id = v_f) <> 0
       OR (SELECT balance FROM public.trivia_ledger_accounts
            WHERE account_code = 'escrow:pvp:ffffffff-ffff-4fff-8fff-ffffffff0006') <> 100
       OR (SELECT balance FROM public.trivia_ledger_accounts
            WHERE account_code = 'house:rake:pvp') <> v_house_before THEN
        RAISE EXCEPTION 'held rake left a partial journal, balance, or settlement mutation';
    END IF;

    v_result := public.trivia_operator_execute_v1(
        v_operator, 'release-rake-f1', 'payout_release',
        'Release this rake movement after settlement evidence review.', v_f, '{}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'rake release failed: %', v_result;
    END IF;
    v_result := public.trivia_ledger_rake(
        'released-rake-f1', 'pvp_match', 'ffffffff-ffff-4fff-8fff-ffffffff0006',
        10, 'Released rake movement', '{}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false)
       OR COALESCE((v_result->>'replayed')::boolean, false) THEN
        RAISE EXCEPTION 'released rake did not execute once: %', v_result;
    END IF;
    v_replay := public.trivia_ledger_rake(
        'released-rake-f1', 'pvp_match', 'ffffffff-ffff-4fff-8fff-ffffffff0006',
        10, 'Released rake movement', '{}'::jsonb
    );
    IF NOT COALESCE((v_replay->>'success')::boolean, false)
       OR NOT COALESCE((v_replay->>'replayed')::boolean, false)
       OR v_replay->>'journal_id' IS DISTINCT FROM v_result->>'journal_id' THEN
        RAISE EXCEPTION 'released rake replay was not exact-once: fresh=% replay=%', v_result, v_replay;
    END IF;
    SELECT count(*) INTO v_count FROM public.p11_test_journals WHERE settlement_id = v_f;
    IF v_count <> 1
       OR (SELECT rake_amount FROM public.trivia_settlements WHERE id = v_f) <> 10
       OR (SELECT balance FROM public.trivia_ledger_accounts
            WHERE account_code = 'escrow:pvp:ffffffff-ffff-4fff-8fff-ffffffff0006') <> 90
       OR (SELECT balance FROM public.trivia_ledger_accounts
            WHERE account_code = 'house:rake:pvp') <> v_house_before + 10 THEN
        RAISE EXCEPTION 'released rake replay duplicated or lost money';
    END IF;

    -- Capability and status readback are database-owned.
    v_result := public.trivia_operator_execute_v1(
        v_observer, 'observer-hold-01', 'payout_hold',
        'Observer attempts a settlement payout control without capability.', v_c, '{}'::jsonb
    );
    IF v_result->>'error' <> 'operator_capability_required' THEN
        RAISE EXCEPTION 'observer gained settlement authority: %', v_result;
    END IF;
    v_result := public.trivia_settlement_payout_control_status_v1(v_observer, v_c);
    IF NOT COALESCE((v_result->>'success')::boolean, false) OR v_result->>'kind' <> 'settlement' THEN
        RAISE EXCEPTION 'support-only settlement readback failed: %', v_result;
    END IF;

    -- Non-payout operations still delegate unchanged to the prior Phase 11 RPC.
    v_result := public.trivia_operator_execute_v1(
        v_operator, 'delegated-note-1', 'incident_note',
        'Record a non-payout operation through the prior authority.', NULL,
        '{"incidentKey":"test","note":"delegated note"}'::jsonb
    );
    IF NOT COALESCE((v_result->>'success')::boolean, false)
       OR v_result#>>'{result,success}' <> 'true'
       OR v_result#>>'{result,incidentKey}' <> 'test'
       OR NOT EXISTS (
           SELECT 1 FROM public.trivia_incident_notes_v1
            WHERE receipt_id = (v_result->>'receipt_id')::uuid
              AND incident_key = 'test'
       ) THEN
        RAISE EXCEPTION 'non-payout action did not delegate unchanged: %', v_result;
    END IF;
END
$test$;

DO $acl$
BEGIN
    IF has_table_privilege('anon', 'public.trivia_settlement_payout_controls_v1', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_settlement_payout_controls_v1', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('service_role', 'public.trivia_settlement_payout_controls_v1', 'SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'payout control table ACL is broader than intended';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'trivia_settlement_payout_controls_v1'
           AND policyname = 'trivia_settlement_payout_controls_rpc_only'
           AND permissive = 'RESTRICTIVE'
           AND cmd = 'ALL'
           AND roles = ARRAY['public']::name[]
           AND qual = 'false'
           AND with_check = 'false'
    ) THEN
        RAISE EXCEPTION 'payout control RPC-only RLS policy is missing';
    END IF;
    IF has_function_privilege('service_role', 'public.trivia_operator_execute_before_payout_control_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_settlement_payout_control_apply_v1(uuid,uuid,text,uuid,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_p11_guard_rake_mutation_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_p11_guard_rake_mutation_v1()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_p11_guard_rake_mutation_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION 'service role can bypass the authoritative boundary';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.trivia_settlements'::regclass
           AND NOT tgisinternal
           AND tgname = 'trg_trivia_p11_guard_rake_mutation'
    ) THEN
        RAISE EXCEPTION 'cached predecessor rake fence is missing';
    END IF;
END
$acl$;

SELECT jsonb_build_object(
    'suite', 'trivia-p11-payout-control-pg17',
    'controls', (SELECT count(*) FROM public.trivia_settlement_payout_controls_v1),
    'receipts', (SELECT count(*) FROM public.trivia_operator_events_v1),
    'journals', (SELECT count(*) FROM public.p11_test_journals),
    'status', 'PASS'
);
