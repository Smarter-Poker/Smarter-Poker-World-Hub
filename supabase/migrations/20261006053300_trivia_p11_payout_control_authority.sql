-- ============================================================================
-- 20261006053300_trivia_p11_payout_control_authority.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex Phase 11 post-release certification
-- AFFECTS:     Trivia settlement payout hold/release authority and operator RPC
-- IRREVERSIBLE: yes (operator control evidence is permanent)
--
-- WHY:
--   Phase 11 advertised payout_hold and payout_release, but its operator RPC
--   always returned unsupported_action. This made the control a contract-only
--   stub. A payout hold must be durable, exact-once, auditable, and enforced at
--   the Phase 2 settlement choke under the same settlement-row lock. It must
--   never block a valid cancellation/refund or permit the browser to assert an
--   amount.
--
-- HOW:
--   - Append immutable hold/release control events tied to the existing
--     immutable operator receipt by a deferred foreign key.
--   - Serialize hold, release and settlement on trivia_settlements FOR UPDATE.
--   - Replace the canonical trivia_settlement_settle body in place, preserving
--     its complete Phase 2 journal implementation and inserting the hold check
--     immediately after validation while its settlement-row lock is held.
--   - Fence rake_amount increases at the settlement table so an invocation
--     already running the predecessor rake body cannot cross the cutover hold.
--   - Keep refund-only and zero-movement void plans available while held.
--   - Replace only the advertised payout actions at the operator boundary;
--     every other Phase 11 action delegates unchanged to the prior function.
--
-- See .agent/workflows/migration-safety.md for the Tier 3 protocol.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. PRE-FLIGHT --------------------------------------------------------------
DO $preflight$
BEGIN
    IF to_regclass('public.trivia_settlements') IS NULL
       OR to_regclass('public.trivia_operator_events_v1') IS NULL THEN
        RAISE EXCEPTION 'trivia payout control preflight: required settlement or operator evidence table is missing';
    END IF;
    IF to_regprocedure('public.trivia_settlement_settle(text,uuid,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_operator_context_core_v1(uuid)') IS NULL
       OR to_regprocedure('public.trivia_p11_forbid_history_mutation()') IS NULL
       OR to_regprocedure('public.trivia_ledger_raise(text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)') IS NULL
       OR to_regprocedure('extensions.digest(bytea,text)') IS NULL
       OR to_regprocedure('extensions.gen_random_uuid()') IS NULL THEN
        RAISE EXCEPTION 'trivia payout control preflight: required Phase 2/11 function is missing';
    END IF;
    IF to_regclass('public.trivia_settlement_payout_controls_v1') IS NOT NULL
       OR to_regprocedure('public.trivia_settlement_payout_control_apply_v1(uuid,uuid,text,uuid,text)') IS NOT NULL
       OR to_regprocedure('public.trivia_settlement_payout_control_status_v1(uuid,uuid)') IS NOT NULL
       OR to_regprocedure('public.trivia_p11_guard_rake_mutation_v1()') IS NOT NULL
       OR EXISTS (SELECT 1 FROM pg_trigger
                   WHERE tgrelid = 'public.trivia_settlements'::regclass
                     AND NOT tgisinternal
                     AND tgname = 'trg_trivia_p11_guard_rake_mutation')
       OR to_regprocedure('public.trivia_operator_execute_before_payout_control_v1(uuid,text,text,text,uuid,jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'trivia payout control preflight: authority already exists; never replay this migration';
    END IF;
    IF encode(extensions.digest(convert_to(pg_get_functiondef(
            'public.trivia_settlement_settle(text,uuid,jsonb)'::regprocedure), 'UTF8'), 'sha256'), 'hex')
            <> 'e994b948469cec91bd72376c05d4bd084ff479f2e92989cbdde9f52a2a4c39c0'
       OR encode(extensions.digest(convert_to(pg_get_functiondef(
            'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)'::regprocedure), 'UTF8'), 'sha256'), 'hex')
            <> 'ef2e79dbfc12b3806a073358e1974588ddeaff7a172ae8f6e3b16583bf7d5470'
       OR encode(extensions.digest(convert_to(pg_get_functiondef(
            'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)'::regprocedure), 'UTF8'), 'sha256'), 'hex')
            <> '440e43193839f6b81540fd1126bc92a5d5e6479a971d4f51d1e4719b7026a46c' THEN
        RAISE EXCEPTION 'trivia payout control preflight: canonical financial RPC pre-image drifted';
    END IF;
    IF (SELECT owner.rolname <> 'postgres' OR NOT p.prosecdef
          FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
         WHERE p.oid='public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)'::regprocedure)
       OR has_function_privilege('anon','public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)','EXECUTE')
       OR has_function_privilege('authenticated','public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)','EXECUTE')
       OR NOT has_function_privilege('service_role','public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)','EXECUTE') THEN
        RAISE EXCEPTION 'trivia payout control preflight: canonical rake authority drifted';
    END IF;
END
$preflight$;

-- 2. IMMUTABLE CONTROL HISTORY ----------------------------------------------
CREATE TABLE public.trivia_settlement_payout_controls_v1 (
    control_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id uuid NOT NULL UNIQUE,
    settlement_id uuid NOT NULL REFERENCES public.trivia_settlements(id),
    operator_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('hold', 'release')),
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 500),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT trivia_settlement_payout_controls_receipt_fk
        FOREIGN KEY (receipt_id)
        REFERENCES public.trivia_operator_events_v1(receipt_id)
        DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX trivia_settlement_payout_controls_settlement_idx
    ON public.trivia_settlement_payout_controls_v1 (settlement_id, control_id DESC);

CREATE TRIGGER trg_trivia_settlement_payout_controls_immutable
    BEFORE UPDATE OR DELETE ON public.trivia_settlement_payout_controls_v1
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p11_forbid_history_mutation();
CREATE TRIGGER trg_trivia_settlement_payout_controls_no_truncate
    BEFORE TRUNCATE ON public.trivia_settlement_payout_controls_v1
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_p11_forbid_history_mutation();

ALTER TABLE public.trivia_settlement_payout_controls_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY trivia_settlement_payout_controls_rpc_only
    ON public.trivia_settlement_payout_controls_v1
    AS RESTRICTIVE
    FOR ALL
    TO PUBLIC
    USING (false)
    WITH CHECK (false);
REVOKE ALL ON TABLE public.trivia_settlement_payout_controls_v1
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.trivia_settlement_payout_controls_v1_control_id_seq
    FROM PUBLIC, anon, authenticated, service_role;

-- A CREATE OR REPLACE protects future rake calls, but an invocation that
-- entered the predecessor body before this transaction committed can retain
-- that body. Every rake path still increments the settlement row after its
-- ledger post. This trigger is therefore the durable cutover fence: an old
-- invocation that crosses it after a hold rolls its entire transaction,
-- including the already-attempted journal, back atomically.
CREATE FUNCTION public.trivia_p11_guard_rake_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
BEGIN
    IF NEW.rake_amount > OLD.rake_amount
       AND (SELECT c.action
              FROM public.trivia_settlement_payout_controls_v1 c
             WHERE c.settlement_id = OLD.id
             ORDER BY c.control_id DESC
             LIMIT 1) = 'hold' THEN
        RAISE EXCEPTION USING
            ERRCODE = 'TL001',
            MESSAGE = 'settlement_payout_held',
            DETAIL = jsonb_build_object(
                'settlement_id', OLD.id,
                'operation', 'rake',
                'cutoverFence', true
            )::text;
    END IF;
    RETURN NEW;
END
$body$;

CREATE TRIGGER trg_trivia_p11_guard_rake_mutation
    BEFORE UPDATE OF rake_amount ON public.trivia_settlements
    FOR EACH ROW
    EXECUTE FUNCTION public.trivia_p11_guard_rake_mutation_v1();

-- 3. AUTHORITATIVE CONTROL TRANSITION ---------------------------------------
CREATE FUNCTION public.trivia_settlement_payout_control_apply_v1(
    p_operator_id uuid,
    p_receipt_id uuid,
    p_action text,
    p_settlement_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    v_context jsonb;
    v_settlement public.trivia_settlements%ROWTYPE;
    v_previous public.trivia_settlement_payout_controls_v1%ROWTYPE;
    v_action text;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    IF p_operator_id IS NULL OR p_receipt_id IS NULL OR p_settlement_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'control_identity_required');
    END IF;
    IF p_action NOT IN ('hold', 'release') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_control_action');
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;
    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT (v_context->'capabilities' ? 'settlement_control') THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_capability_required');
    END IF;

    -- This is the lock shared with trivia_settlement_settle. Whichever request
    -- owns it first determines the only legal ordering of hold/release/settle.
    SELECT * INTO v_settlement
      FROM public.trivia_settlements
     WHERE id = p_settlement_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'settlement_not_found');
    END IF;

    SELECT * INTO v_previous
      FROM public.trivia_settlement_payout_controls_v1
     WHERE settlement_id = p_settlement_id
     ORDER BY control_id DESC
     LIMIT 1;
    v_action := CASE WHEN p_action = 'hold' THEN 'hold' ELSE 'release' END;

    IF p_action = 'hold' THEN
        IF v_settlement.state IN ('settled', 'refunded', 'voided') THEN
            RETURN jsonb_build_object(
                'success', false, 'error', 'settlement_terminal',
                'settlementId', v_settlement.id, 'settlementState', v_settlement.state
            );
        END IF;
        IF v_previous.action = 'hold' THEN
            RETURN jsonb_build_object(
                'success', false, 'error', 'payout_already_held',
                'settlementId', v_settlement.id, 'payoutControlState', 'held',
                'activeHoldReceiptId', v_previous.receipt_id
            );
        END IF;
    ELSIF v_previous.action IS DISTINCT FROM 'hold' THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'payout_not_held',
            'settlementId', v_settlement.id, 'payoutControlState', 'released'
        );
    END IF;

    INSERT INTO public.trivia_settlement_payout_controls_v1
        (receipt_id, settlement_id, operator_id, action, reason)
    VALUES
        (p_receipt_id, p_settlement_id, p_operator_id, v_action, btrim(p_reason));

    RETURN jsonb_build_object(
        'success', true,
        'settlementId', v_settlement.id,
        'subjectType', v_settlement.subject_type,
        'subjectId', v_settlement.subject_id,
        'settlementState', v_settlement.state,
        'payoutControlState', CASE WHEN p_action = 'hold' THEN 'held' ELSE 'released' END,
        'controlReceiptId', p_receipt_id
    );
END
$body$;

CREATE FUNCTION public.trivia_settlement_payout_control_status_v1(
    p_operator_id uuid,
    p_settlement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    v_context jsonb;
    v_result jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT ((v_context->'capabilities' ? 'settlement_control')
            OR (v_context->'capabilities' ? 'support_lookup')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_capability_required');
    END IF;
    SELECT jsonb_build_object(
        'success', true,
        'kind', 'settlement',
        'targetId', s.id,
        'found', true,
        'subjectType', s.subject_type,
        'subjectId', s.subject_id,
        'settlementState', s.state,
        'payoutControlState', CASE WHEN c.action = 'hold' THEN 'held' ELSE 'released' END,
        'latestControlReceiptId', c.receipt_id,
        'latestControlAction', c.action,
        'latestControlAt', c.created_at
    ) INTO v_result
      FROM public.trivia_settlements s
      LEFT JOIN LATERAL (
          SELECT pc.receipt_id, pc.action, pc.created_at
            FROM public.trivia_settlement_payout_controls_v1 pc
           WHERE pc.settlement_id = s.id
           ORDER BY pc.control_id DESC
           LIMIT 1
      ) c ON true
     WHERE s.id = p_settlement_id;
    RETURN COALESCE(v_result, jsonb_build_object(
        'success', true, 'kind', 'settlement', 'targetId', p_settlement_id, 'found', false
    ));
END
$body$;

-- 4. SETTLEMENT CHOKE ENFORCEMENT -------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_settlement_settle(p_subject_type text, p_subject_id uuid, p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  s public.trivia_settlements%ROWTYPE; p public.trivia_settlement_participants%ROWTYPE;
  v_hash text; v_outcome text; v_terminal text; v_refusal text; v_rake bigint; v_escrow bigint;
  v_pay bigint := 0; v_ref bigint := 0; v_lines jsonb := '[]'::jsonb; v_post jsonb; v_journal uuid;
  x jsonb; v_user uuid; v_amount bigint; v_kind text; v_seen uuid[] := '{}'; v_refs text[] := '{}';
  v_settled_entries bigint; v_alloc bigint; v_result jsonb; v_owed jsonb := '[]'::jsonb; v_rank integer;
  v_rake_account text;
  v_latest_control public.trivia_settlement_payout_controls_v1%ROWTYPE;
BEGIN
  IF p_subject_type NOT IN ('pvp_match', 'tournament') OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN
    PERFORM public.trivia_ledger_raise('invalid_plan');
  END IF;
  SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.trivia_ledger_raise('settlement_not_found', jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id));
  END IF;
  v_hash := public.trivia_ledger_sha256(p_plan::text);
  IF s.state IN ('settled', 'refunded', 'voided') THEN
    IF s.plan_hash = v_hash THEN
      INSERT INTO public.trivia_ledger_idempotency_events (idempotency_key, operation, outcome) VALUES (s.idempotency_key, 'settlement', 'replayed');
      RETURN s.result || jsonb_build_object('replayed', true);
    END IF;
    INSERT INTO public.trivia_ledger_idempotency_events (idempotency_key, operation, outcome) VALUES (s.idempotency_key, 'settlement', 'conflict');
    PERFORM public.trivia_ledger_raise('settlement_already_terminal', jsonb_build_object('state', s.state, 'settlement_id', s.id));
  END IF;
  v_outcome := p_plan ->> 'outcome';
  v_terminal := p_plan ->> 'terminal_state';
  v_refusal := COALESCE(p_plan ->> 'on_wallet_refusal', 'fail');
  v_rake := COALESCE((p_plan ->> 'rake')::bigint, 0);
  IF v_outcome IS NULL OR v_outcome NOT IN ('win', 'tie', 'forfeit', 'refund', 'void', 'prizes', 'cancelled')
     OR v_terminal IS NULL OR v_terminal NOT IN ('settled', 'refunded', 'voided') OR v_refusal NOT IN ('fail', 'liability')
     OR v_rake < 0 OR jsonb_typeof(COALESCE(p_plan -> 'payouts', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) <> 'array' THEN
    PERFORM public.trivia_ledger_raise('invalid_plan', jsonb_build_object('plan', p_plan));
  END IF;
  -- Read the durable payout control while the settlement row selected above is
  -- still locked. The operator transition takes that same row lock, so a hold
  -- cannot land between this decision and the journal transaction.
  SELECT * INTO v_latest_control
    FROM public.trivia_settlement_payout_controls_v1
   WHERE settlement_id = s.id
   ORDER BY control_id DESC
   LIMIT 1;
  IF v_latest_control.action = 'hold'
     AND NOT (
       (v_terminal = 'refunded' AND v_outcome IN ('tie', 'refund', 'cancelled')
        AND jsonb_array_length(COALESCE(p_plan -> 'payouts', '[]'::jsonb)) = 0
        AND v_rake = 0)
       OR
       (v_terminal = 'voided' AND v_outcome = 'void'
        AND jsonb_array_length(COALESCE(p_plan -> 'payouts', '[]'::jsonb)) = 0
        AND v_rake = 0)
     ) THEN
    PERFORM public.trivia_ledger_raise(
      'settlement_payout_held',
      jsonb_build_object(
        'settlement_id', s.id,
        'subject_type', s.subject_type,
        'subject_id', s.subject_id,
        'hold_receipt_id', v_latest_control.receipt_id));
  END IF;
  PERFORM set_config('trivia_ledger.writer', 'on', true);
  IF s.state = 'open' THEN
    PERFORM public.trivia_settlement_lock_row(s);
    SELECT * INTO s FROM public.trivia_settlements WHERE id = s.id;
  END IF;
  SELECT balance INTO v_escrow FROM public.trivia_ledger_accounts WHERE account_code = s.escrow_account_code FOR UPDATE;
  v_rake_account := CASE WHEN p_subject_type = 'pvp_match' THEN 'house:rake:pvp' ELSE 'house:rake:tournament' END;
  -- payouts
  FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'payouts', '[]'::jsonb)) LOOP
    v_user := (x ->> 'user_id')::uuid; v_amount := (x ->> 'amount')::bigint; v_kind := x ->> 'wallet_kind';
    SELECT * INTO p FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND user_id = v_user FOR UPDATE;
    IF NOT FOUND OR p.state <> 'held' OR v_user = ANY (v_seen) OR v_amount IS NULL OR v_amount <= 0
       OR v_kind IS DISTINCT FROM (CASE WHEN p_subject_type = 'pvp_match' THEN 'pvp_win' ELSE 'tournament_prize' END)
       OR COALESCE(x ->> 'reference', '') !~ '^[A-Za-z0-9_:.@-]{8,200}$' OR (x ->> 'reference') = ANY (v_refs) THEN
      PERFORM public.trivia_ledger_raise('invalid_plan_payout', jsonb_build_object('payout', x));
    END IF;
    v_seen := v_seen || v_user; v_refs := v_refs || (x ->> 'reference'); v_pay := v_pay + v_amount;
    IF p.funding_source = 'treasury' THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'treasury:trivia', 'amount', v_amount, 'user_id', v_user,
                   'participant_kind', p.participant_kind, 'memo', 'horse prize to treasury (' || (x ->> 'reference') || ')'));
    ELSE
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'wallet:' || v_user::text, 'amount', v_amount, 'user_id', v_user,
                   'participant_kind', p.participant_kind, 'wallet_kind', v_kind, 'wallet_reference', x ->> 'reference',
                   'wallet_description', x ->> 'description', 'mechanism', 'add', 'on_refusal', v_refusal));
    END IF;
  END LOOP;
  -- refunds: always the participant's original stored entry
  FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) LOOP
    v_user := (x ->> 'user_id')::uuid; v_kind := x ->> 'wallet_kind';
    SELECT * INTO p FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND user_id = v_user FOR UPDATE;
    IF NOT FOUND OR p.state <> 'held' OR v_user = ANY (v_seen)
       OR (x ? 'amount' AND (x ->> 'amount')::bigint IS DISTINCT FROM p.entry_amount)
       OR NOT ((p_subject_type = 'pvp_match' AND v_kind = 'pvp_refund')
               OR (p_subject_type = 'tournament' AND v_kind IN ('tournament_entry_refund', 'tournament_cancel_refund')))
       OR COALESCE(x ->> 'reference', '') !~ '^[A-Za-z0-9_:.@-]{8,200}$' OR (x ->> 'reference') = ANY (v_refs) THEN
      PERFORM public.trivia_ledger_raise('invalid_plan_refund', jsonb_build_object('refund', x));
    END IF;
    v_seen := v_seen || v_user; v_refs := v_refs || (x ->> 'reference'); v_ref := v_ref + p.entry_amount;
    IF p.funding_source = 'treasury' THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'treasury:trivia', 'amount', p.entry_amount, 'user_id', v_user,
                   'participant_kind', p.participant_kind, 'memo', 'horse entry returned to treasury (' || (x ->> 'reference') || ')'));
    ELSE
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'wallet:' || v_user::text, 'amount', p.entry_amount, 'user_id', v_user,
                   'participant_kind', p.participant_kind, 'wallet_kind', v_kind, 'wallet_reference', x ->> 'reference',
                   'wallet_description', x ->> 'description', 'mechanism', 'add', 'on_refusal', v_refusal));
    END IF;
  END LOOP;
  IF v_rake > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', v_rake_account, 'amount', v_rake, 'memo', 'rake'));
  END IF;
  -- conservation: every diamond in escrow is explained exactly once
  IF v_rake + v_pay + v_ref <> v_escrow THEN
    PERFORM public.trivia_ledger_raise('plan_does_not_conserve_escrow',
      jsonb_build_object('escrow', v_escrow, 'rake', v_rake, 'payouts', v_pay, 'refunds', v_ref));
  END IF;
  IF (v_terminal = 'voided' AND (v_escrow <> 0 OR v_pay <> 0 OR v_ref <> 0 OR v_rake <> 0))
     OR (v_terminal = 'refunded' AND (v_pay <> 0 OR v_rake <> 0))
     OR (v_terminal = 'settled' AND v_pay = 0 AND v_rake = 0) THEN
    PERFORM public.trivia_ledger_raise('terminal_state_inconsistent', jsonb_build_object('terminal_state', v_terminal));
  END IF;
  IF v_escrow > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object('account', s.escrow_account_code, 'amount', -v_escrow, 'memo', 'escrow settled')) || v_lines;
    v_post := public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', s.idempotency_key, 'operation', 'settlement',
        'request', jsonb_build_object('op', 'settlement', 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'plan_hash', v_hash),
        'source_event', p_subject_type || '.settled', 'source_type', p_subject_type, 'source_id', p_subject_id::text,
        'subject_type', p_subject_type, 'subject_id', p_subject_id, 'settlement_id', s.id, 'rules_version_id', s.rules_version_id,
        'actor_kind', 'system', 'funding_source', 'escrow'),
      v_lines);
    v_journal := (v_post ->> 'journal_id')::uuid;
    SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_owed FROM jsonb_array_elements(v_post -> 'lines') l WHERE l ->> 'account' LIKE 'liability:%';
  END IF;
  PERFORM set_config('trivia_ledger.writer', 'on', true);
  -- participants: payout/refund/lost, rank and rake share (largest remainder by entry, ties by user id), ONE update each
  SELECT COALESCE(sum(pp.entry_amount), 0) INTO v_settled_entries
    FROM public.trivia_settlement_participants pp
   WHERE pp.settlement_id = s.id AND pp.state = 'held'
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) rf
                      WHERE rf.value ->> 'user_id' = pp.user_id::text);
  v_alloc := s.rake_amount + v_rake;
  WITH cls AS (
    SELECT pp.user_id, pp.entry_amount,
           CASE WHEN rf.value IS NOT NULL THEN 'refund' WHEN po.value IS NOT NULL THEN 'payout' ELSE 'lost' END AS kind,
           COALESCE((po.value ->> 'amount')::bigint, 0) AS amount,
           COALESCE((po.value ->> 'rank')::integer, (rs.value ->> 'rank')::integer) AS rank, rs.value AS res
      FROM public.trivia_settlement_participants pp
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'payouts', '[]'::jsonb))
                          WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) po ON true
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb))
                          WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) rf ON true
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'results', '[]'::jsonb))
                          WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) rs ON true
     WHERE pp.settlement_id = s.id AND pp.state = 'held'),
  shares AS (
    SELECT c.*,
           CASE WHEN c.kind = 'refund' OR v_settled_entries = 0 THEN NULL ELSE (v_alloc * c.entry_amount) / v_settled_entries END AS base_share,
           CASE WHEN c.kind = 'refund' OR v_settled_entries = 0 THEN NULL ELSE (v_alloc * c.entry_amount) % v_settled_entries END AS rem
      FROM cls c),
  ranked AS (
    SELECT sh.*, row_number() OVER (PARTITION BY (sh.kind = 'refund') ORDER BY sh.rem DESC NULLS LAST, sh.user_id) AS rn,
           v_alloc - COALESCE(sum(sh.base_share) OVER (), 0) AS leftover
      FROM shares sh)
  UPDATE public.trivia_settlement_participants tp
     SET state = CASE WHEN rk.kind = 'refund' THEN 'refunded' ELSE 'settled' END,
         payout_amount = rk.amount,
         refund_amount = CASE WHEN rk.kind = 'refund' THEN tp.entry_amount ELSE 0 END,
         rake_share = CASE WHEN rk.base_share IS NULL THEN NULL ELSE rk.base_share + CASE WHEN rk.rn <= rk.leftover THEN 1 ELSE 0 END END,
         net_contribution = CASE WHEN rk.base_share IS NULL THEN NULL
                                 ELSE tp.entry_amount - (rk.base_share + CASE WHEN rk.rn <= rk.leftover THEN 1 ELSE 0 END) END,
         final_rank = rk.rank, result = rk.res, exit_journal_id = v_journal
    FROM ranked rk
   WHERE tp.settlement_id = s.id AND tp.user_id = rk.user_id;
  -- escrow must be exactly zero and is closed for good
  UPDATE public.trivia_ledger_accounts SET state = 'closed', closed_at = clock_timestamp(), closed_by_journal_id = v_journal
   WHERE account_code = s.escrow_account_code AND balance = 0 AND state = 'open';
  IF NOT FOUND THEN
    PERFORM public.trivia_ledger_raise('escrow_not_zero_at_terminal', jsonb_build_object('escrow_account', s.escrow_account_code));
  END IF;
  v_result := jsonb_build_object('success', true, 'replayed', false, 'settlement_id', s.id, 'subject_type', p_subject_type,
    'subject_id', p_subject_id, 'idempotency_key', s.idempotency_key, 'journal_id', v_journal, 'state', v_terminal,
    'outcome', v_outcome, 'gross_pool', s.gross_pool, 'subsidy_total', s.subsidy_total, 'rake', s.rake_amount + v_rake,
    'final_prize_pool', v_pay, 'paid_total', v_pay, 'refunded_total', s.refunded_total + v_ref, 'escrow_balance', 0,
    'owed', v_owed, 'lines', COALESCE(v_post -> 'lines', '[]'::jsonb));
  UPDATE public.trivia_settlements
     SET state = v_terminal, outcome = v_outcome, rake_amount = rake_amount + v_rake, paid_total = v_pay,
         refunded_total = refunded_total + v_ref, final_prize_pool = v_pay, plan = p_plan, plan_hash = v_hash,
         result = v_result, settlement_journal_id = v_journal, terminal_at = clock_timestamp()
   WHERE id = s.id;
  INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
  VALUES (s.id, 'settle', 'locked', v_terminal, jsonb_build_object('outcome', v_outcome, 'journal_id', v_journal,
          'rake', v_rake, 'paid', v_pay, 'refunded', v_ref, 'owed', jsonb_array_length(v_owed)));
  PERFORM set_config('trivia_ledger.writer', '', true);
  RETURN v_result;
END $fn$;

-- Rake is a separate escrow-to-house financial path. Enforce the same hold at
-- its canonical OID under the same settlement row lock; an exact already-
-- committed rake replay still returns before admission is reconsidered.
CREATE OR REPLACE FUNCTION public.trivia_ledger_rake(p_idempotency_key text, p_subject_type text, p_subject_id uuid,
  p_amount integer, p_description text, p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; s public.trivia_settlements%ROWTYPE; v_res jsonb; v_detail text;
BEGIN
  v_req := jsonb_build_object('op', 'rake', 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'amount', p_amount);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'rake', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
      PERFORM public.trivia_ledger_raise('invalid_request', jsonb_build_object('amount', p_amount));
    END IF;
    SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
    IF NOT FOUND OR s.state <> 'locked' THEN
      PERFORM public.trivia_ledger_raise('settlement_not_locked', jsonb_build_object('state', s.state));
    END IF;
    IF (SELECT c.action FROM public.trivia_settlement_payout_controls_v1 c
         WHERE c.settlement_id=s.id ORDER BY c.control_id DESC LIMIT 1) = 'hold' THEN
      PERFORM public.trivia_ledger_raise('settlement_payout_held',
        jsonb_build_object('settlement_id',s.id,'operation','rake'));
    END IF;
    v_res := public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'rake', 'request', v_req,
        'source_event', p_subject_type || '.rake', 'source_type', p_subject_type, 'source_id', p_subject_id::text,
        'subject_type', p_subject_type, 'subject_id', p_subject_id, 'settlement_id', s.id, 'rules_version_id', s.rules_version_id,
        'actor_kind', 'system', 'funding_source', 'escrow'),
      jsonb_build_array(
        jsonb_build_object('account', s.escrow_account_code, 'amount', -p_amount, 'memo', COALESCE(p_description, 'rake')),
        jsonb_build_object('account', CASE WHEN p_subject_type = 'pvp_match' THEN 'house:rake:pvp' ELSE 'house:rake:tournament' END,
                           'amount', p_amount, 'memo', COALESCE(p_description, 'rake'))));
    UPDATE public.trivia_settlements SET rake_amount = rake_amount + p_amount WHERE id = s.id;
    INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
    VALUES (s.id, 'rake', s.state, s.state, jsonb_build_object('amount', p_amount, 'journal_id', v_res ->> 'journal_id'));
    RETURN v_res;
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'rake');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'rake');
  END;
END $fn$;

-- 5. OPERATOR ACTION WIRING --------------------------------------------------
ALTER FUNCTION public.trivia_operator_execute_v1(uuid, text, text, text, uuid, jsonb)
    RENAME TO trivia_operator_execute_before_payout_control_v1;

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
AS $body$
DECLARE
    v_context jsonb;
    v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
    v_hash text;
    v_existing public.trivia_operator_events_v1%ROWTYPE;
    v_receipt uuid := extensions.gen_random_uuid();
    v_result jsonb := '{}'::jsonb;
    v_outcome text := 'failed';
BEGIN
    IF p_action NOT IN ('payout_hold', 'payout_release') THEN
        RETURN public.trivia_operator_execute_before_payout_control_v1(
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
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;
    IF p_target_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'target_required');
    END IF;
    IF jsonb_typeof(v_payload) <> 'object' OR octet_length(v_payload::text) > 4096 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
    END IF;
    -- No payout control accepts amount, recipient, role, outcome or any other
    -- browser-provided authority. Its payload is deliberately empty.
    IF v_payload <> '{}'::jsonb THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload_field');
    END IF;
    v_context := public.trivia_operator_context_core_v1(p_operator_id);
    IF NOT COALESCE((v_context->>'allowed')::boolean, false)
       OR NOT (v_context->'capabilities' ? 'settlement_control') THEN
        RETURN jsonb_build_object('success', false, 'error', 'operator_capability_required');
    END IF;

    v_hash := encode(extensions.digest(convert_to(
        jsonb_build_object(
            'operatorId', p_operator_id,
            'requestKey', p_request_key,
            'action', p_action,
            'reason', btrim(p_reason),
            'targetId', p_target_id,
            'payload', v_payload
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
    PERFORM pg_advisory_xact_lock(hashtextextended(
        'trivia-operator-target:settlement:' || p_target_id::text, 0
    ));

    BEGIN
        v_result := public.trivia_settlement_payout_control_apply_v1(
            p_operator_id,
            v_receipt,
            CASE WHEN p_action = 'payout_hold' THEN 'hold' ELSE 'release' END,
            p_target_id,
            btrim(p_reason)
        );
        v_outcome := CASE
            WHEN COALESCE((v_result->>'success')::boolean, false) THEN 'succeeded'
            ELSE 'failed'
        END;
    EXCEPTION WHEN OTHERS THEN
        v_result := jsonb_build_object('error', 'action_failed', 'sqlstate', SQLSTATE);
        v_outcome := 'failed';
    END;

    INSERT INTO public.trivia_operator_events_v1
        (receipt_id, operator_id, request_key, request_hash, action, reason,
         target_kind, target_id, outcome, result)
    VALUES
        (v_receipt, p_operator_id, p_request_key, v_hash, p_action, btrim(p_reason),
         'settlement', p_target_id, v_outcome, v_result);

    RETURN jsonb_build_object(
        'success', v_outcome = 'succeeded',
        'receipt_id', v_receipt,
        'replayed', false,
        'action', p_action,
        'outcome', v_outcome,
        'result', v_result
    );
END
$body$;

-- 6. LEAST-PRIVILEGE FUNCTION ACLS ------------------------------------------
ALTER FUNCTION public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.trivia_p11_guard_rake_mutation_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION
    public.trivia_p11_guard_rake_mutation_v1(),
    public.trivia_settlement_payout_control_apply_v1(uuid,uuid,text,uuid,text),
    public.trivia_settlement_payout_control_status_v1(uuid,uuid),
    public.trivia_settlement_settle(text,uuid,jsonb),
    public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb),
    public.trivia_operator_execute_before_payout_control_v1(uuid,text,text,text,uuid,jsonb),
    public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
    public.trivia_settlement_payout_control_status_v1(uuid,uuid),
    public.trivia_settlement_settle(text,uuid,jsonb),
    public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb),
    public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
TO service_role;

-- 7. POST-APPLY ASSERTIONS ---------------------------------------------------
DO $postflight$
DECLARE
    v_definition text;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class
             WHERE oid = 'public.trivia_settlement_payout_controls_v1'::regclass) THEN
        RAISE EXCEPTION 'payout control postflight: RLS is not enabled';
    END IF;
    IF has_table_privilege('anon', 'public.trivia_settlement_payout_controls_v1',
                           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.trivia_settlement_payout_controls_v1',
                              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'payout control postflight: browser role has table authority';
    END IF;
    IF has_table_privilege('service_role', 'public.trivia_settlement_payout_controls_v1',
                           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'payout control postflight: service role bypasses the RPC-only table boundary';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'trivia_settlement_payout_controls_v1'
           AND policyname = 'trivia_settlement_payout_controls_rpc_only'
           AND permissive = 'RESTRICTIVE'
           AND cmd = 'ALL'
           AND roles = ARRAY['public']::name[]
           AND qual = 'false'
           AND with_check = 'false'
    ) THEN
        RAISE EXCEPTION 'payout control postflight: intentional RPC-only RLS policy is missing';
    END IF;
    IF has_function_privilege('anon', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_settlement_settle(text,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_p11_guard_rake_mutation_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_p11_guard_rake_mutation_v1()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_p11_guard_rake_mutation_v1()', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_settlement_payout_control_status_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_settlement_payout_control_apply_v1(uuid,uuid,text,uuid,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_operator_execute_before_payout_control_v1(uuid,text,text,text,uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'payout control postflight: function ACL boundary is incorrect';
    END IF;
    IF (SELECT count(*) FROM pg_trigger
         WHERE tgrelid = 'public.trivia_settlement_payout_controls_v1'::regclass
           AND NOT tgisinternal
           AND tgname IN ('trg_trivia_settlement_payout_controls_immutable',
                          'trg_trivia_settlement_payout_controls_no_truncate')) <> 2 THEN
        RAISE EXCEPTION 'payout control postflight: immutable history triggers are missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger
         WHERE tgrelid = 'public.trivia_settlements'::regclass
           AND NOT tgisinternal
           AND tgname = 'trg_trivia_p11_guard_rake_mutation'
           AND tgfoid = 'public.trivia_p11_guard_rake_mutation_v1()'::regprocedure
    ) THEN
        RAISE EXCEPTION 'payout control postflight: cached-rake cutover fence is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.trivia_settlement_payout_controls_v1'::regclass
           AND conname = 'trivia_settlement_payout_controls_receipt_fk'
           AND condeferrable AND condeferred
    ) THEN
        RAISE EXCEPTION 'payout control postflight: deferred operator receipt link is missing';
    END IF;
    SELECT pg_get_functiondef('public.trivia_settlement_settle(text,uuid,jsonb)'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'FOR UPDATE'
       OR v_definition !~ 'settlement_payout_held'
       OR v_definition !~ 'trivia_ledger_post'
       OR v_definition !~ 'trivia_settlement_participants' THEN
        RAISE EXCEPTION 'payout control postflight: settlement choke enforcement is incomplete';
    END IF;
    SELECT pg_get_functiondef('public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'FOR UPDATE'
       OR v_definition !~ 'settlement_payout_held'
       OR v_definition !~ 'trivia_ledger_post'
       OR v_definition !~ 'rake_amount' THEN
        RAISE EXCEPTION 'payout control postflight: rake choke enforcement is incomplete';
    END IF;
    SELECT pg_get_functiondef('public.trivia_p11_guard_rake_mutation_v1()'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'NEW\.rake_amount > OLD\.rake_amount'
       OR v_definition !~ 'settlement_payout_held'
       OR v_definition !~ 'cutoverFence' THEN
        RAISE EXCEPTION 'payout control postflight: cached-rake fence body is incomplete';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (
               'trivia_settlement_payout_control_apply_v1',
               'trivia_settlement_payout_control_status_v1',
               'trivia_p11_guard_rake_mutation_v1',
               'trivia_settlement_settle',
               'trivia_ledger_rake',
               'trivia_operator_execute_v1'
           )
           AND (NOT p.prosecdef
                OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
    ) THEN
        RAISE EXCEPTION 'payout control postflight: security-definer search_path boundary is incomplete';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- ROLLBACK (Tier 3; apply only through a NEW reviewed migration)
-- Refuse rollback once evidence exists: history must never be discarded.
-- ============================================================================
-- BEGIN;
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM public.trivia_settlement_payout_controls_v1) THEN
--     RAISE EXCEPTION 'cannot roll back payout control authority with retained evidence';
--   END IF;
-- END $$;
-- DROP FUNCTION public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb);
-- ALTER FUNCTION public.trivia_operator_execute_before_payout_control_v1(uuid,text,text,text,uuid,jsonb)
--   RENAME TO trivia_operator_execute_v1;
-- ALTER FUNCTION public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
--   OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
--   FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)
--   TO service_role;
-- CREATE OR REPLACE FUNCTION public.trivia_settlement_settle(p_subject_type text, p_subject_id uuid, p_plan jsonb)
-- RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
-- DECLARE
--   s public.trivia_settlements%ROWTYPE; p public.trivia_settlement_participants%ROWTYPE;
--   v_hash text; v_outcome text; v_terminal text; v_refusal text; v_rake bigint; v_escrow bigint;
--   v_pay bigint := 0; v_ref bigint := 0; v_lines jsonb := '[]'::jsonb; v_post jsonb; v_journal uuid;
--   x jsonb; v_user uuid; v_amount bigint; v_kind text; v_seen uuid[] := '{}'; v_refs text[] := '{}';
--   v_settled_entries bigint; v_alloc bigint; v_result jsonb; v_owed jsonb := '[]'::jsonb; v_rank integer;
--   v_rake_account text;
-- BEGIN
--   IF p_subject_type NOT IN ('pvp_match', 'tournament') OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN
--     PERFORM public.trivia_ledger_raise('invalid_plan');
--   END IF;
--   SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
--   IF NOT FOUND THEN
--     PERFORM public.trivia_ledger_raise('settlement_not_found', jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id));
--   END IF;
--   v_hash := public.trivia_ledger_sha256(p_plan::text);
--   IF s.state IN ('settled', 'refunded', 'voided') THEN
--     IF s.plan_hash = v_hash THEN
--       INSERT INTO public.trivia_ledger_idempotency_events (idempotency_key, operation, outcome) VALUES (s.idempotency_key, 'settlement', 'replayed');
--       RETURN s.result || jsonb_build_object('replayed', true);
--     END IF;
--     INSERT INTO public.trivia_ledger_idempotency_events (idempotency_key, operation, outcome) VALUES (s.idempotency_key, 'settlement', 'conflict');
--     PERFORM public.trivia_ledger_raise('settlement_already_terminal', jsonb_build_object('state', s.state, 'settlement_id', s.id));
--   END IF;
--   v_outcome := p_plan ->> 'outcome';
--   v_terminal := p_plan ->> 'terminal_state';
--   v_refusal := COALESCE(p_plan ->> 'on_wallet_refusal', 'fail');
--   v_rake := COALESCE((p_plan ->> 'rake')::bigint, 0);
--   IF v_outcome IS NULL OR v_outcome NOT IN ('win', 'tie', 'forfeit', 'refund', 'void', 'prizes', 'cancelled')
--      OR v_terminal IS NULL OR v_terminal NOT IN ('settled', 'refunded', 'voided') OR v_refusal NOT IN ('fail', 'liability')
--      OR v_rake < 0 OR jsonb_typeof(COALESCE(p_plan -> 'payouts', '[]'::jsonb)) <> 'array'
--      OR jsonb_typeof(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) <> 'array' THEN
--     PERFORM public.trivia_ledger_raise('invalid_plan', jsonb_build_object('plan', p_plan));
--   END IF;
--   PERFORM set_config('trivia_ledger.writer', 'on', true);
--   IF s.state = 'open' THEN
--     PERFORM public.trivia_settlement_lock_row(s);
--     SELECT * INTO s FROM public.trivia_settlements WHERE id = s.id;
--   END IF;
--   SELECT balance INTO v_escrow FROM public.trivia_ledger_accounts WHERE account_code = s.escrow_account_code FOR UPDATE;
--   v_rake_account := CASE WHEN p_subject_type = 'pvp_match' THEN 'house:rake:pvp' ELSE 'house:rake:tournament' END;
--   -- payouts
--   FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'payouts', '[]'::jsonb)) LOOP
--     v_user := (x ->> 'user_id')::uuid; v_amount := (x ->> 'amount')::bigint; v_kind := x ->> 'wallet_kind';
--     SELECT * INTO p FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND user_id = v_user FOR UPDATE;
--     IF NOT FOUND OR p.state <> 'held' OR v_user = ANY (v_seen) OR v_amount IS NULL OR v_amount <= 0
--        OR v_kind IS DISTINCT FROM (CASE WHEN p_subject_type = 'pvp_match' THEN 'pvp_win' ELSE 'tournament_prize' END)
--        OR COALESCE(x ->> 'reference', '') !~ '^[A-Za-z0-9_:.@-]{8,200}$' OR (x ->> 'reference') = ANY (v_refs) THEN
--       PERFORM public.trivia_ledger_raise('invalid_plan_payout', jsonb_build_object('payout', x));
--     END IF;
--     v_seen := v_seen || v_user; v_refs := v_refs || (x ->> 'reference'); v_pay := v_pay + v_amount;
--     IF p.funding_source = 'treasury' THEN
--       v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'treasury:trivia', 'amount', v_amount, 'user_id', v_user,
--                    'participant_kind', p.participant_kind, 'memo', 'horse prize to treasury (' || (x ->> 'reference') || ')'));
--     ELSE
--       v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'wallet:' || v_user::text, 'amount', v_amount, 'user_id', v_user,
--                    'participant_kind', p.participant_kind, 'wallet_kind', v_kind, 'wallet_reference', x ->> 'reference',
--                    'wallet_description', x ->> 'description', 'mechanism', 'add', 'on_refusal', v_refusal));
--     END IF;
--   END LOOP;
--   -- refunds: always the participant's original stored entry
--   FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) LOOP
--     v_user := (x ->> 'user_id')::uuid; v_kind := x ->> 'wallet_kind';
--     SELECT * INTO p FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND user_id = v_user FOR UPDATE;
--     IF NOT FOUND OR p.state <> 'held' OR v_user = ANY (v_seen)
--        OR (x ? 'amount' AND (x ->> 'amount')::bigint IS DISTINCT FROM p.entry_amount)
--        OR NOT ((p_subject_type = 'pvp_match' AND v_kind = 'pvp_refund')
--                OR (p_subject_type = 'tournament' AND v_kind IN ('tournament_entry_refund', 'tournament_cancel_refund')))
--        OR COALESCE(x ->> 'reference', '') !~ '^[A-Za-z0-9_:.@-]{8,200}$' OR (x ->> 'reference') = ANY (v_refs) THEN
--       PERFORM public.trivia_ledger_raise('invalid_plan_refund', jsonb_build_object('refund', x));
--     END IF;
--     v_seen := v_seen || v_user; v_refs := v_refs || (x ->> 'reference'); v_ref := v_ref + p.entry_amount;
--     IF p.funding_source = 'treasury' THEN
--       v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'treasury:trivia', 'amount', p.entry_amount, 'user_id', v_user,
--                    'participant_kind', p.participant_kind, 'memo', 'horse entry returned to treasury (' || (x ->> 'reference') || ')'));
--     ELSE
--       v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'wallet:' || v_user::text, 'amount', p.entry_amount, 'user_id', v_user,
--                    'participant_kind', p.participant_kind, 'wallet_kind', v_kind, 'wallet_reference', x ->> 'reference',
--                    'wallet_description', x ->> 'description', 'mechanism', 'add', 'on_refusal', v_refusal));
--     END IF;
--   END LOOP;
--   IF v_rake > 0 THEN
--     v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', v_rake_account, 'amount', v_rake, 'memo', 'rake'));
--   END IF;
--   -- conservation: every diamond in escrow is explained exactly once
--   IF v_rake + v_pay + v_ref <> v_escrow THEN
--     PERFORM public.trivia_ledger_raise('plan_does_not_conserve_escrow',
--       jsonb_build_object('escrow', v_escrow, 'rake', v_rake, 'payouts', v_pay, 'refunds', v_ref));
--   END IF;
--   IF (v_terminal = 'voided' AND (v_escrow <> 0 OR v_pay <> 0 OR v_ref <> 0 OR v_rake <> 0))
--      OR (v_terminal = 'refunded' AND (v_pay <> 0 OR v_rake <> 0))
--      OR (v_terminal = 'settled' AND v_pay = 0 AND v_rake = 0) THEN
--     PERFORM public.trivia_ledger_raise('terminal_state_inconsistent', jsonb_build_object('terminal_state', v_terminal));
--   END IF;
--   IF v_escrow > 0 THEN
--     v_lines := jsonb_build_array(jsonb_build_object('account', s.escrow_account_code, 'amount', -v_escrow, 'memo', 'escrow settled')) || v_lines;
--     v_post := public.trivia_ledger_post(
--       jsonb_build_object('idempotency_key', s.idempotency_key, 'operation', 'settlement',
--         'request', jsonb_build_object('op', 'settlement', 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'plan_hash', v_hash),
--         'source_event', p_subject_type || '.settled', 'source_type', p_subject_type, 'source_id', p_subject_id::text,
--         'subject_type', p_subject_type, 'subject_id', p_subject_id, 'settlement_id', s.id, 'rules_version_id', s.rules_version_id,
--         'actor_kind', 'system', 'funding_source', 'escrow'),
--       v_lines);
--     v_journal := (v_post ->> 'journal_id')::uuid;
--     SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_owed FROM jsonb_array_elements(v_post -> 'lines') l WHERE l ->> 'account' LIKE 'liability:%';
--   END IF;
--   PERFORM set_config('trivia_ledger.writer', 'on', true);
--   -- participants: payout/refund/lost, rank and rake share (largest remainder by entry, ties by user id), ONE update each
--   SELECT COALESCE(sum(pp.entry_amount), 0) INTO v_settled_entries
--     FROM public.trivia_settlement_participants pp
--    WHERE pp.settlement_id = s.id AND pp.state = 'held'
--      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) rf
--                       WHERE rf.value ->> 'user_id' = pp.user_id::text);
--   v_alloc := s.rake_amount + v_rake;
--   WITH cls AS (
--     SELECT pp.user_id, pp.entry_amount,
--            CASE WHEN rf.value IS NOT NULL THEN 'refund' WHEN po.value IS NOT NULL THEN 'payout' ELSE 'lost' END AS kind,
--            COALESCE((po.value ->> 'amount')::bigint, 0) AS amount,
--            COALESCE((po.value ->> 'rank')::integer, (rs.value ->> 'rank')::integer) AS rank, rs.value AS res
--       FROM public.trivia_settlement_participants pp
--       LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'payouts', '[]'::jsonb))
--                           WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) po ON true
--       LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb))
--                           WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) rf ON true
--       LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'results', '[]'::jsonb))
--                           WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) rs ON true
--      WHERE pp.settlement_id = s.id AND pp.state = 'held'),
--   shares AS (
--     SELECT c.*,
--            CASE WHEN c.kind = 'refund' OR v_settled_entries = 0 THEN NULL ELSE (v_alloc * c.entry_amount) / v_settled_entries END AS base_share,
--            CASE WHEN c.kind = 'refund' OR v_settled_entries = 0 THEN NULL ELSE (v_alloc * c.entry_amount) % v_settled_entries END AS rem
--       FROM cls c),
--   ranked AS (
--     SELECT sh.*, row_number() OVER (PARTITION BY (sh.kind = 'refund') ORDER BY sh.rem DESC NULLS LAST, sh.user_id) AS rn,
--            v_alloc - COALESCE(sum(sh.base_share) OVER (), 0) AS leftover
--       FROM shares sh)
--   UPDATE public.trivia_settlement_participants tp
--      SET state = CASE WHEN rk.kind = 'refund' THEN 'refunded' ELSE 'settled' END,
--          payout_amount = rk.amount,
--          refund_amount = CASE WHEN rk.kind = 'refund' THEN tp.entry_amount ELSE 0 END,
--          rake_share = CASE WHEN rk.base_share IS NULL THEN NULL ELSE rk.base_share + CASE WHEN rk.rn <= rk.leftover THEN 1 ELSE 0 END END,
--          net_contribution = CASE WHEN rk.base_share IS NULL THEN NULL
--                                  ELSE tp.entry_amount - (rk.base_share + CASE WHEN rk.rn <= rk.leftover THEN 1 ELSE 0 END) END,
--          final_rank = rk.rank, result = rk.res, exit_journal_id = v_journal
--     FROM ranked rk
--    WHERE tp.settlement_id = s.id AND tp.user_id = rk.user_id;
--   -- escrow must be exactly zero and is closed for good
--   UPDATE public.trivia_ledger_accounts SET state = 'closed', closed_at = clock_timestamp(), closed_by_journal_id = v_journal
--    WHERE account_code = s.escrow_account_code AND balance = 0 AND state = 'open';
--   IF NOT FOUND THEN
--     PERFORM public.trivia_ledger_raise('escrow_not_zero_at_terminal', jsonb_build_object('escrow_account', s.escrow_account_code));
--   END IF;
--   v_result := jsonb_build_object('success', true, 'replayed', false, 'settlement_id', s.id, 'subject_type', p_subject_type,
--     'subject_id', p_subject_id, 'idempotency_key', s.idempotency_key, 'journal_id', v_journal, 'state', v_terminal,
--     'outcome', v_outcome, 'gross_pool', s.gross_pool, 'subsidy_total', s.subsidy_total, 'rake', s.rake_amount + v_rake,
--     'final_prize_pool', v_pay, 'paid_total', v_pay, 'refunded_total', s.refunded_total + v_ref, 'escrow_balance', 0,
--     'owed', v_owed, 'lines', COALESCE(v_post -> 'lines', '[]'::jsonb));
--   UPDATE public.trivia_settlements
--      SET state = v_terminal, outcome = v_outcome, rake_amount = rake_amount + v_rake, paid_total = v_pay,
--          refunded_total = refunded_total + v_ref, final_prize_pool = v_pay, plan = p_plan, plan_hash = v_hash,
--          result = v_result, settlement_journal_id = v_journal, terminal_at = clock_timestamp()
--    WHERE id = s.id;
--   INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
--   VALUES (s.id, 'settle', 'locked', v_terminal, jsonb_build_object('outcome', v_outcome, 'journal_id', v_journal,
--           'rake', v_rake, 'paid', v_pay, 'refunded', v_ref, 'owed', jsonb_array_length(v_owed)));
--   PERFORM set_config('trivia_ledger.writer', '', true);
--   RETURN v_result;
-- END $fn$;
-- ALTER FUNCTION public.trivia_settlement_settle(text,uuid,jsonb) OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.trivia_settlement_settle(text,uuid,jsonb)
--   FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.trivia_settlement_settle(text,uuid,jsonb) TO service_role;
-- CREATE OR REPLACE FUNCTION public.trivia_ledger_rake(p_idempotency_key text, p_subject_type text, p_subject_id uuid,
--   p_amount integer, p_description text, p_context jsonb DEFAULT '{}'::jsonb)
-- RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
-- DECLARE v_req jsonb; v_pre jsonb; s public.trivia_settlements%ROWTYPE; v_res jsonb; v_detail text;
-- BEGIN
--   v_req := jsonb_build_object('op', 'rake', 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'amount', p_amount);
--   BEGIN
--     v_pre := public.trivia_ledger_begin(p_idempotency_key, 'rake', v_req);
--     IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
--     IF p_amount IS NULL OR p_amount <= 0 THEN
--       PERFORM public.trivia_ledger_raise('invalid_request', jsonb_build_object('amount', p_amount));
--     END IF;
--     SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
--     IF NOT FOUND OR s.state <> 'locked' THEN
--       PERFORM public.trivia_ledger_raise('settlement_not_locked', jsonb_build_object('state', s.state));
--     END IF;
--     v_res := public.trivia_ledger_post(
--       jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'rake', 'request', v_req,
--         'source_event', p_subject_type || '.rake', 'source_type', p_subject_type, 'source_id', p_subject_id::text,
--         'subject_type', p_subject_type, 'subject_id', p_subject_id, 'settlement_id', s.id, 'rules_version_id', s.rules_version_id,
--         'actor_kind', 'system', 'funding_source', 'escrow'),
--       jsonb_build_array(
--         jsonb_build_object('account', s.escrow_account_code, 'amount', -p_amount, 'memo', COALESCE(p_description, 'rake')),
--         jsonb_build_object('account', CASE WHEN p_subject_type = 'pvp_match' THEN 'house:rake:pvp' ELSE 'house:rake:tournament' END,
--                            'amount', p_amount, 'memo', COALESCE(p_description, 'rake'))));
--     UPDATE public.trivia_settlements SET rake_amount = rake_amount + p_amount WHERE id = s.id;
--     INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
--     VALUES (s.id, 'rake', s.state, s.state, jsonb_build_object('amount', p_amount, 'journal_id', v_res ->> 'journal_id'));
--     RETURN v_res;
--   EXCEPTION
--     WHEN SQLSTATE 'TL001' THEN
--       GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
--       RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'rake');
--     WHEN OTHERS THEN
--       RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'rake');
--   END;
-- END $fn$;
-- ALTER FUNCTION public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb) OWNER TO postgres;
-- REVOKE ALL ON FUNCTION public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)
--   FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb) TO service_role;
-- DROP TRIGGER trg_trivia_p11_guard_rake_mutation ON public.trivia_settlements;
-- DROP FUNCTION public.trivia_p11_guard_rake_mutation_v1();
-- DROP FUNCTION public.trivia_settlement_payout_control_status_v1(uuid,uuid);
-- DROP FUNCTION public.trivia_settlement_payout_control_apply_v1(uuid,uuid,text,uuid,text);
-- DROP TABLE public.trivia_settlement_payout_controls_v1;
-- DO $rollback_postflight$
-- BEGIN
--   IF encode(extensions.digest(convert_to(pg_get_functiondef(
--          'public.trivia_operator_execute_v1(uuid,text,text,text,uuid,jsonb)'::regprocedure
--        ), 'UTF8'), 'sha256'), 'hex')
--          <> 'ef2e79dbfc12b3806a073358e1974588ddeaff7a172ae8f6e3b16583bf7d5470'
--      OR encode(extensions.digest(convert_to(pg_get_functiondef(
--          'public.trivia_settlement_settle(text,uuid,jsonb)'::regprocedure
--        ), 'UTF8'), 'sha256'), 'hex')
--          <> 'e994b948469cec91bd72376c05d4bd084ff479f2e92989cbdde9f52a2a4c39c0'
--      OR encode(extensions.digest(convert_to(pg_get_functiondef(
--          'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)'::regprocedure
--        ), 'UTF8'), 'sha256'), 'hex')
--          <> '440e43193839f6b81540fd1126bc92a5d5e6479a971d4f51d1e4719b7026a46c' THEN
--     RAISE EXCEPTION 'payout control rollback did not restore exact predecessor definitions';
--   END IF;
-- END
-- $rollback_postflight$;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
