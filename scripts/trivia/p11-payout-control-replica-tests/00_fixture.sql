\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

CREATE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '')
$$;

CREATE TABLE public.trivia_ledger_accounts (
    account_code text PRIMARY KEY,
    kind text NOT NULL,
    user_id uuid,
    subject_id uuid,
    tracks_balance boolean NOT NULL DEFAULT true,
    balance bigint NOT NULL DEFAULT 0,
    min_balance bigint,
    state text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    closed_at timestamptz,
    closed_by_journal_id uuid
);

CREATE TABLE public.trivia_settlements (
    id uuid PRIMARY KEY,
    subject_type text NOT NULL CHECK (subject_type IN ('pvp_match', 'tournament')),
    subject_id uuid NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    rules_version_id text NOT NULL,
    escrow_account_code text NOT NULL UNIQUE REFERENCES public.trivia_ledger_accounts(account_code),
    state text NOT NULL CHECK (state IN ('open', 'locked', 'settled', 'refunded', 'voided')),
    outcome text,
    held_total bigint NOT NULL DEFAULT 0,
    subsidy_total bigint NOT NULL DEFAULT 0,
    released_total bigint NOT NULL DEFAULT 0,
    refunded_total bigint NOT NULL DEFAULT 0,
    rake_amount bigint NOT NULL DEFAULT 0,
    paid_total bigint NOT NULL DEFAULT 0,
    gross_pool bigint,
    final_prize_pool bigint,
    plan jsonb,
    plan_hash text,
    result jsonb,
    settlement_journal_id uuid,
    context jsonb NOT NULL DEFAULT '{}'::jsonb,
    opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    locked_at timestamptz,
    terminal_at timestamptz,
    UNIQUE (subject_type, subject_id)
);

CREATE TABLE public.trivia_settlement_participants (
    settlement_id uuid NOT NULL REFERENCES public.trivia_settlements(id),
    user_id uuid NOT NULL,
    participant_kind text NOT NULL,
    funding_source text NOT NULL,
    entry_amount bigint NOT NULL,
    hold_journal_id uuid NOT NULL,
    hold_reference text NOT NULL,
    state text NOT NULL DEFAULT 'held',
    rake_share bigint,
    net_contribution bigint,
    payout_amount bigint NOT NULL DEFAULT 0,
    refund_amount bigint NOT NULL DEFAULT 0,
    final_rank integer,
    result jsonb,
    exit_journal_id uuid,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (settlement_id, user_id)
);

CREATE TABLE public.trivia_settlement_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    settlement_id uuid NOT NULL REFERENCES public.trivia_settlements(id),
    event text NOT NULL,
    from_state text,
    to_state text,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.trivia_ledger_idempotency_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idempotency_key text NOT NULL,
    operation text NOT NULL,
    outcome text NOT NULL,
    at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.trivia_operator_events_v1 (
    receipt_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    operator_id uuid NOT NULL,
    request_key text NOT NULL,
    request_hash text NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    target_kind text NOT NULL,
    target_id uuid,
    outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'refused', 'standby')),
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (operator_id, request_key)
);

CREATE TABLE public.trivia_incident_notes_v1 (
    receipt_id uuid PRIMARY KEY REFERENCES public.trivia_operator_events_v1(receipt_id),
    operator_id uuid NOT NULL,
    incident_key text NOT NULL,
    severity text NOT NULL,
    status text NOT NULL,
    note text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.p11_test_journals (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    journal_id uuid NOT NULL UNIQUE DEFAULT extensions.gen_random_uuid(),
    settlement_id uuid NOT NULL,
    outcome text NOT NULL,
    idempotency_key text UNIQUE,
    operation text,
    request jsonb,
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION public.trivia_p11_forbid_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$$;

CREATE TRIGGER trg_trivia_operator_events_immutable
    BEFORE UPDATE OR DELETE ON public.trivia_operator_events_v1
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p11_forbid_history_mutation();

CREATE FUNCTION public.trivia_operator_context_core_v1(p_operator_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
    SELECT CASE
        WHEN p_operator_id = '11111111-1111-4111-8111-111111111111'::uuid
        THEN '{"allowed":true,"roles":["settlement_operator"],"capabilities":["snapshot","support_lookup","settlement_control","incident_note"]}'::jsonb
        WHEN p_operator_id = '22222222-2222-4222-8222-222222222222'::uuid
        THEN '{"allowed":true,"roles":["observer"],"capabilities":["snapshot","support_lookup"]}'::jsonb
        ELSE '{"allowed":false,"roles":[],"capabilities":[]}'::jsonb
    END
$$;

CREATE FUNCTION public.trivia_ledger_raise(p_code text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = 'TL001', MESSAGE = p_code, DETAIL = COALESCE(p_detail, '{}'::jsonb)::text;
END
$$;

CREATE FUNCTION public.trivia_ledger_sha256(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions, pg_temp
AS $$ SELECT encode(extensions.digest(convert_to(p_text, 'UTF8'), 'sha256'), 'hex') $$;

CREATE FUNCTION public.trivia_settlement_lock_row(s public.trivia_settlements)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_escrow bigint;
BEGIN
    SELECT balance INTO v_escrow
      FROM public.trivia_ledger_accounts
     WHERE account_code = s.escrow_account_code
     FOR UPDATE;
    UPDATE public.trivia_settlements
       SET state = 'locked', gross_pool = v_escrow, locked_at = clock_timestamp()
     WHERE id = s.id;
    INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
    VALUES (s.id, 'lock', 'open', 'locked', jsonb_build_object('gross_pool', v_escrow));
    RETURN v_escrow;
END
$$;

CREATE FUNCTION public.trivia_ledger_post(p_context jsonb, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_journal uuid := extensions.gen_random_uuid();
    v_settlement uuid := (p_context->>'settlement_id')::uuid;
    v_line jsonb;
    v_result jsonb;
BEGIN
    v_result := jsonb_build_object('success', true, 'journal_id', v_journal, 'lines', p_lines);
    INSERT INTO public.p11_test_journals
        (journal_id, settlement_id, outcome, idempotency_key, operation, request, result)
    VALUES
        (v_journal, v_settlement, COALESCE(p_context->>'source_event', 'settlement'),
         p_context->>'idempotency_key', p_context->>'operation', p_context->'request', v_result);
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
        UPDATE public.trivia_ledger_accounts
           SET balance = balance + (v_line->>'amount')::bigint
         WHERE account_code = v_line->>'account' AND tracks_balance;
    END LOOP;
    RETURN v_result;
END
$$;

CREATE FUNCTION public.trivia_ledger_begin(p_key text,p_operation text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_existing public.p11_test_journals%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('p11-test-ledger:'||p_key,20261006));
 SELECT * INTO v_existing FROM public.p11_test_journals WHERE idempotency_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_existing.operation=p_operation AND v_existing.request=p_request THEN
  INSERT INTO public.trivia_ledger_idempotency_events(idempotency_key,operation,outcome)
  VALUES(p_key,p_operation,'replayed');
  RETURN v_existing.result||jsonb_build_object('replayed',true);
 END IF;
 RETURN jsonb_build_object('success',false,'replayed',false,'error','idempotency_conflict',
   'idempotency_key',p_key,'operation',p_operation,'journal_id',v_existing.journal_id);
END
$$;
CREATE FUNCTION public.trivia_ledger_error(p_code text,p_detail text,p_key text,p_operation text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('success',false,'replayed',false,'error',p_code,
   'detail',coalesce(nullif(p_detail,''),'{}')::jsonb,'idempotency_key',p_key,'operation',p_operation)
$$;
CREATE FUNCTION public.trivia_ledger_unexpected(p_sqlstate text,p_message text,p_key text,p_operation text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('success',false,'replayed',false,'error','internal_error',
   'sqlstate',p_sqlstate,'message',p_message,'idempotency_key',p_key,'operation',p_operation)
$$;

CREATE FUNCTION public.trivia_ledger_rake(p_idempotency_key text,p_subject_type text,p_subject_id uuid,
 p_amount integer,p_description text,p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_req jsonb;v_pre jsonb;s public.trivia_settlements%ROWTYPE;v_res jsonb;v_detail text;
BEGIN
 v_req:=jsonb_build_object('op','rake','subject_type',p_subject_type,'subject_id',p_subject_id,'amount',p_amount);
 BEGIN
  v_pre:=public.trivia_ledger_begin(p_idempotency_key,'rake',v_req);
  IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN PERFORM public.trivia_ledger_raise('invalid_request',jsonb_build_object('amount',p_amount)); END IF;
  SELECT * INTO s FROM public.trivia_settlements WHERE subject_type=p_subject_type AND subject_id=p_subject_id FOR UPDATE;
  IF NOT FOUND OR s.state<>'locked' THEN PERFORM public.trivia_ledger_raise('settlement_not_locked',jsonb_build_object('state',s.state)); END IF;
  v_res:=public.trivia_ledger_post(jsonb_build_object('idempotency_key',p_idempotency_key,'operation','rake','request',v_req,
    'source_event',p_subject_type||'.rake','source_type',p_subject_type,'source_id',p_subject_id::text,
    'subject_type',p_subject_type,'subject_id',p_subject_id,'settlement_id',s.id,'rules_version_id',s.rules_version_id,
    'actor_kind','system','funding_source','escrow'),jsonb_build_array(
      jsonb_build_object('account',s.escrow_account_code,'amount',-p_amount,'memo',coalesce(p_description,'rake')),
      jsonb_build_object('account',CASE WHEN p_subject_type='pvp_match' THEN 'house:rake:pvp' ELSE 'house:rake:tournament' END,
        'amount',p_amount,'memo',coalesce(p_description,'rake'))));
  UPDATE public.trivia_settlements SET rake_amount=rake_amount+p_amount WHERE id=s.id;
  INSERT INTO public.trivia_settlement_events(settlement_id,event,from_state,to_state,detail)
  VALUES(s.id,'rake',s.state,s.state,jsonb_build_object('amount',p_amount,'journal_id',v_res->>'journal_id'));
  RETURN v_res;
 EXCEPTION WHEN SQLSTATE 'TL001' THEN
  GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
  RETURN public.trivia_ledger_error(SQLERRM,v_detail,p_idempotency_key,'rake');
 WHEN OTHERS THEN RETURN public.trivia_ledger_unexpected(SQLSTATE,SQLERRM,p_idempotency_key,'rake');
 END;
END $$;

-- Simulates a transaction that entered the predecessor body before the
-- forward migration committed. The new table trigger must still stop it after
-- an operator hold, rolling its preceding ledger_post side effects back.
CREATE FUNCTION public.p11_test_old_rake_body(p_idempotency_key text,p_subject_type text,p_subject_id uuid,
 p_amount integer,p_description text,p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_req jsonb;v_pre jsonb;s public.trivia_settlements%ROWTYPE;v_res jsonb;v_detail text;
BEGIN
 v_req:=jsonb_build_object('op','rake','subject_type',p_subject_type,'subject_id',p_subject_id,'amount',p_amount);
 BEGIN
  v_pre:=public.trivia_ledger_begin(p_idempotency_key,'rake',v_req);
  IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN PERFORM public.trivia_ledger_raise('invalid_request',jsonb_build_object('amount',p_amount)); END IF;
  SELECT * INTO s FROM public.trivia_settlements WHERE subject_type=p_subject_type AND subject_id=p_subject_id FOR UPDATE;
  IF NOT FOUND OR s.state<>'locked' THEN PERFORM public.trivia_ledger_raise('settlement_not_locked',jsonb_build_object('state',s.state)); END IF;
  v_res:=public.trivia_ledger_post(jsonb_build_object('idempotency_key',p_idempotency_key,'operation','rake','request',v_req,
    'source_event',p_subject_type||'.rake','source_type',p_subject_type,'source_id',p_subject_id::text,
    'subject_type',p_subject_type,'subject_id',p_subject_id,'settlement_id',s.id,'rules_version_id',s.rules_version_id,
    'actor_kind','system','funding_source','escrow'),jsonb_build_array(
      jsonb_build_object('account',s.escrow_account_code,'amount',-p_amount,'memo',coalesce(p_description,'rake')),
      jsonb_build_object('account',CASE WHEN p_subject_type='pvp_match' THEN 'house:rake:pvp' ELSE 'house:rake:tournament' END,
        'amount',p_amount,'memo',coalesce(p_description,'rake'))));
  UPDATE public.trivia_settlements SET rake_amount=rake_amount+p_amount WHERE id=s.id;
  INSERT INTO public.trivia_settlement_events(settlement_id,event,from_state,to_state,detail)
  VALUES(s.id,'rake',s.state,s.state,jsonb_build_object('amount',p_amount,'journal_id',v_res->>'journal_id'));
  RETURN v_res;
 EXCEPTION WHEN SQLSTATE 'TL001' THEN
  GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
  RETURN public.trivia_ledger_error(SQLERRM,v_detail,p_idempotency_key,'rake');
 WHEN OTHERS THEN RETURN public.trivia_ledger_unexpected(SQLSTATE,SQLERRM,p_idempotency_key,'rake');
 END;
END $$;

-- Production-shape signature with a deliberately visible journal side effect.
-- The forward migration must stop a held payout before this function executes.
CREATE FUNCTION public.trivia_settlement_settle(
    p_subject_type text,
    p_subject_id uuid,
    p_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settlement public.trivia_settlements%ROWTYPE;
    v_terminal text;
    v_outcome text;
BEGIN
    SELECT * INTO v_settlement
      FROM public.trivia_settlements
     WHERE subject_type = p_subject_type AND subject_id = p_subject_id
     FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM public.trivia_ledger_raise('settlement_not_found');
    END IF;
    IF v_settlement.state IN ('settled', 'refunded', 'voided') THEN
        RETURN jsonb_build_object('success', true, 'replayed', true, 'state', v_settlement.state);
    END IF;
    v_terminal := p_plan->>'terminal_state';
    v_outcome := p_plan->>'outcome';
    IF v_terminal NOT IN ('settled', 'refunded', 'voided') THEN
        PERFORM public.trivia_ledger_raise('invalid_plan');
    END IF;
    INSERT INTO public.p11_test_journals (settlement_id, outcome)
    VALUES (v_settlement.id, v_outcome);
    UPDATE public.trivia_settlements SET state = v_terminal WHERE id = v_settlement.id;
    RETURN jsonb_build_object(
        'success', true, 'replayed', false,
        'settlement_id', v_settlement.id, 'state', v_terminal, 'outcome', v_outcome
    );
END
$$;

-- Prior Phase 11 boundary. The forward migration delegates every non-payout
-- action to this exact function unchanged.
CREATE FUNCTION public.trivia_operator_execute_v1(
    p_operator_id uuid,
    p_request_key text,
    p_action text,
    p_reason text,
    p_target_id uuid DEFAULT NULL,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'success', true,
        'replayed', false,
        'action', p_action,
        'outcome', 'succeeded',
        'result', jsonb_build_object('success', true, 'delegated', true)
    );
END
$$;

REVOKE ALL ON FUNCTION
    public.trivia_settlement_settle(text,uuid,jsonb),
    public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb),
    public.p11_test_old_rake_body(text,text,uuid,integer,text,jsonb),
    public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
    public.trivia_settlement_settle(text,uuid,jsonb),
    public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb),
    public.p11_test_old_rake_body(text,text,uuid,integer,text,jsonb),
    public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
TO service_role;

INSERT INTO public.trivia_ledger_accounts
    (account_code, kind, subject_id, tracks_balance, balance, state)
VALUES
    ('escrow:tournament:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', 'tournament_escrow', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', true, 100, 'open'),
    ('escrow:pvp:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002', 'pvp_escrow', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002', true, 100, 'open'),
    ('escrow:pvp:cccccccc-cccc-4ccc-8ccc-cccccccc0003', 'pvp_escrow', 'cccccccc-cccc-4ccc-8ccc-cccccccc0003', true, 0, 'open'),
    ('escrow:pvp:dddddddd-dddd-4ddd-8ddd-dddddddd0004', 'pvp_escrow', 'dddddddd-dddd-4ddd-8ddd-dddddddd0004', true, 0, 'open'),
    ('escrow:pvp:eeeeeeee-eeee-4eee-8eee-eeeeeeee0005', 'pvp_escrow', 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0005', true, 0, 'open'),
    ('escrow:pvp:ffffffff-ffff-4fff-8fff-ffffffff0006', 'pvp_escrow', 'ffffffff-ffff-4fff-8fff-ffffffff0006', true, 0, 'open'),
    ('house:rake:pvp', 'house_revenue', NULL, true, 0, 'open'),
    ('house:rake:tournament', 'house_revenue', NULL, true, 0, 'open');

INSERT INTO public.trivia_settlements
    (id, subject_type, subject_id, idempotency_key, rules_version_id, escrow_account_code, state)
VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'tournament', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', 'settlement-a-0001', 'tournament.nightly@1', 'escrow:tournament:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', 'open'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'pvp_match', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002', 'settlement-b-0002', 'pvp.standard@1', 'escrow:pvp:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002', 'open'),
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'pvp_match', 'cccccccc-cccc-4ccc-8ccc-cccccccc0003', 'settlement-c-0003', 'pvp.standard@1', 'escrow:pvp:cccccccc-cccc-4ccc-8ccc-cccccccc0003', 'open'),
    ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'pvp_match', 'dddddddd-dddd-4ddd-8ddd-dddddddd0004', 'settlement-d-0004', 'pvp.standard@1', 'escrow:pvp:dddddddd-dddd-4ddd-8ddd-dddddddd0004', 'open'),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5', 'pvp_match', 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0005', 'settlement-e-0005', 'pvp.standard@1', 'escrow:pvp:eeeeeeee-eeee-4eee-8eee-eeeeeeee0005', 'open'),
    ('ffffffff-ffff-4fff-8fff-fffffffffff6', 'pvp_match', 'ffffffff-ffff-4fff-8fff-ffffffff0006', 'settlement-f-0006', 'pvp.standard@1', 'escrow:pvp:ffffffff-ffff-4fff-8fff-ffffffff0006', 'open');

INSERT INTO public.trivia_settlement_participants
    (settlement_id, user_id, participant_kind, funding_source, entry_amount,
     hold_journal_id, hold_reference)
VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'human', 'player_wallet', 100,
     '10000000-0000-4000-8000-000000000001', 'tournament_hold_a_0001'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '11111111-1111-4111-8111-111111111111', 'human', 'player_wallet', 100,
     '10000000-0000-4000-8000-000000000002', 'pvp_hold_b_0002');
