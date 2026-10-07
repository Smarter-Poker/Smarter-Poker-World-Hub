-- ============================================================================
-- 20261006061500_trivia_phase9_paid_skip_and_endless_score_authority.sql
-- ============================================================================
-- TIER:         3 (new FKs plus removal of browser/service write grants)
-- AUTHOR:       Codex
-- AFFECTS:      solo answer/settlement authority; paid Trivia skips;
--               endless_high_scores reconciliation/write authority
-- IRREVERSIBLE: yes once reconciliation/operation evidence exists; the
--               executable rollback below refuses to discard that evidence
--
-- WHY:
--   A display index of -1 cannot distinguish a purchased skip from a timeout,
--   the three-skip cap lived in one browser, and VIP skips had no durable
--   receipt. Endless high scores were also written directly by authenticated
--   browsers from caller-owned scores. Both are server-authority defects.
--
-- HOW:
--   - atomically bind a fixed-price/VIP paid skip to the existing first-answer
--     authority and one immutable receipt, under the session row lock;
--   - enforce three skips per session across devices and exact replay by
--     (session, question), with the price/reference derived in SQL;
--   - enforce the three non-paid-miss run boundary in the shared answer and
--     settlement transactions, while excluding durable paid-skip receipts;
--   - reconcile the browser-writable historical Endless board to verified
--     submitted sessions before removing direct write authority;
--   - project Endless high scores only from a submitted server result, using
--     GREATEST under a per-player advisory lock and an immutable projection
--     receipt; and
--   - remove all browser/service table-write grants so the RPCs are the only
--     write paths.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $preflight$
BEGIN
    IF to_regclass('public.trivia_sessions') IS NULL
       OR to_regclass('public.trivia_session_answers') IS NULL
       OR to_regclass('public.trivia_session_results') IS NULL
       OR to_regclass('public.trivia_scores') IS NULL
       OR to_regclass('public.trivia_question_revisions') IS NULL
       OR to_regclass('public.trivia_question_quarantine') IS NULL
       OR to_regclass('public.trivia_questions') IS NULL
       OR to_regclass('public.profiles') IS NULL
       OR to_regclass('public.diamond_transactions') IS NULL
       OR to_regclass('public.endless_high_scores') IS NULL THEN
        RAISE EXCEPTION 'phase9 authority preflight: required relation is missing';
    END IF;
    IF to_regprocedure('public.trivia_solo_spend(uuid,integer,text,text,text)') IS NULL
       OR to_regprocedure('public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)') IS NULL
       OR to_regprocedure('public.trivia_phase9_guard_lifeline_ledger_v1()') IS NULL
       OR to_regprocedure('public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)') IS NULL
       OR to_regprocedure('public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid)') IS NULL
       OR to_regprocedure('public.trivia_p8_lock_and_void_session_questions_v1(uuid)') IS NULL
       OR to_regprocedure('public.trivia_p8_legacy_grade_locked_v1(uuid)') IS NULL
       OR to_regprocedure('public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)') IS NULL
       OR to_regprocedure('public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'phase9 authority preflight: canonical spend/answer/settlement authority is missing';
    END IF;
    IF pg_get_functiondef('public.trivia_solo_spend(uuid,integer,text,text,text)'::regprocedure)
            !~ 'paid_skip_requires_session_authority'
       OR pg_get_functiondef('public.trivia_solo_spend(uuid,integer,text,text,text)'::regprocedure)
            !~ 'trivia_solo_spend_before_phase9_v1'
       OR has_function_privilege('anon','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('authenticated','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE')
       OR NOT has_function_privilege('service_role','public.trivia_solo_spend(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('anon','public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('authenticated','public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('service_role','public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)','EXECUTE')
       OR has_function_privilege('anon','public.trivia_phase9_guard_lifeline_ledger_v1()','EXECUTE')
       OR has_function_privilege('authenticated','public.trivia_phase9_guard_lifeline_ledger_v1()','EXECUTE')
       OR has_function_privilege('service_role','public.trivia_phase9_guard_lifeline_ledger_v1()','EXECUTE') THEN
        RAISE EXCEPTION 'phase9 authority preflight: committed generic-lifeline choke is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid='public.diamond_transactions'::regclass
           AND tgname='trg_phase9_guard_lifeline_ledger'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'phase9 authority preflight: committed ledger guard is missing';
    END IF;
    IF encode(extensions.digest(convert_to(pg_get_functiondef(
            'public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)'::regprocedure), 'UTF8'), 'sha256'), 'hex')
            <> 'af927f47b3259719df44c51c94655068ea9e25ad871810053d0bd1b414ad4d9d'
       OR encode(extensions.digest(convert_to(pg_get_functiondef(
            'public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid)'::regprocedure), 'UTF8'), 'sha256'), 'hex')
            <> 'f00df46444d7a47491eb8ffec2ada9f205631ee513142f7fb593dbbc53e7ae3e'
       OR encode(extensions.digest(convert_to(pg_get_functiondef(
            'public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)'::regprocedure), 'UTF8'), 'sha256'), 'hex')
            <> 'db234432b579caba5e203eb11b5ffea18ec8ccc5b8c9e42a8a13cfd1a2ef9fa8'
       OR encode(extensions.digest(convert_to(pg_get_functiondef(
            'public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)'::regprocedure), 'UTF8'), 'sha256'), 'hex')
            <> '1cf0c250dc031e6ef0be7e3b56b106cd6ab0b4b21d485aa9ccc99883cf255f32' THEN
        RAISE EXCEPTION 'phase9 authority preflight: canonical RPC pre-image drifted';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'profiles'
           AND column_name IN ('diamonds','is_vip','vip_tier','vip_expires_at')) <> 4 THEN
        RAISE EXCEPTION 'phase9 authority preflight: profile wallet/VIP proof is incomplete';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'diamond_transactions'
           AND column_name IN ('id','user_id','amount','transaction_type','balance_after',
                               'reference_id','counterparty','issuance_class')) <> 8 THEN
        RAISE EXCEPTION 'phase9 authority preflight: Diamond receipt proof is incomplete';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'endless_high_scores'
           AND column_name IN ('user_id','mode','high_score','achieved_at')) <> 4 THEN
        RAISE EXCEPTION 'phase9 authority preflight: Endless projection shape is incomplete';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'trivia_scores'
           AND column_name IN ('user_id','mode','correct_count','session_id','server_verified')) <> 5 THEN
        RAISE EXCEPTION 'phase9 authority preflight: verified score provenance is incomplete';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.endless_high_scores'::regclass
           AND contype = 'u'
           AND pg_get_constraintdef(oid) = 'UNIQUE (user_id, mode)'
    ) THEN
        RAISE EXCEPTION 'phase9 authority preflight: Endless unique projection key is missing';
    END IF;
    -- Canonical repository lineage grants anon SELECT and authenticated
    -- SELECT/INSERT/UPDATE. Production also accumulated DELETE/REFERENCES/
    -- TRIGGER grants and a matching delete policy. Both known pre-images are
    -- safe inputs because this migration removes every browser write grant;
    -- requiring the production-only drift would make a fresh canonical
    -- install impossible.
    IF NOT has_table_privilege('anon', 'public.endless_high_scores', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.endless_high_scores',
                                  'SELECT,INSERT,UPDATE') THEN
        RAISE EXCEPTION 'phase9 authority preflight: Endless baseline ACL pre-image drifted';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polrelid = 'public.endless_high_scores'::regclass
           AND polname = 'users_insert_own_scores' AND polcmd = 'a'
           AND polroles = '{0}'::oid[]
           AND pg_get_expr(polwithcheck, polrelid)
               = '(( SELECT auth.uid() AS uid) = user_id)'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polrelid = 'public.endless_high_scores'::regclass
           AND polname = 'users_update_own_scores' AND polcmd = 'w'
           AND polroles = '{0}'::oid[]
           AND pg_get_expr(polqual, polrelid)
               = '(( SELECT auth.uid() AS uid) = user_id)'
           AND pg_get_expr(polwithcheck, polrelid)
               = '(( SELECT auth.uid() AS uid) = user_id)'
    ) THEN
        RAISE EXCEPTION 'phase9 authority preflight: Endless browser policy pre-image drifted';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polrelid = 'public.endless_high_scores'::regclass
           AND polname = 'users_delete_own_scores'
           AND NOT (polcmd = 'd'
                AND polroles = '{0}'::oid[]
                AND pg_get_expr(polqual, polrelid)
                    = '(( SELECT auth.uid() AS uid) = user_id)')
    ) THEN
        RAISE EXCEPTION 'phase9 authority preflight: unknown Endless delete-policy drift';
    END IF;
END;
$preflight$;

CREATE TABLE public.trivia_paid_skip_receipts_v1 (
    receipt_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.trivia_sessions(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id) ON DELETE RESTRICT,
    position integer NOT NULL CHECK (position >= 1),
    paid_skip_ordinal integer NOT NULL CHECK (paid_skip_ordinal BETWEEN 1 AND 3),
    policy_version text NOT NULL DEFAULT 'paid-skip@1'
        CHECK (policy_version IN ('paid-skip@1','paid-skip-legacy@1')),
    source_binding text NOT NULL DEFAULT 'authority'
        CHECK (source_binding IN ('authority','legacy_bound_answer','legacy_ledger_only')),
    policy_unit_cost integer NOT NULL DEFAULT 5 CHECK (policy_unit_cost = 5),
    policy_session_limit integer NOT NULL DEFAULT 3 CHECK (policy_session_limit = 3),
    entitlement text NOT NULL CHECK (entitlement IN ('vip','diamonds')),
    diamonds_charged integer NOT NULL,
    spend_reference text,
    wallet_transaction_id uuid REFERENCES public.diamond_transactions(id) ON DELETE RESTRICT,
    balance_after integer NOT NULL CHECK (balance_after >= 0),
    client_nonce uuid,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT trivia_paid_skip_receipts_session_question_key UNIQUE (session_id, question_id),
    CONSTRAINT trivia_paid_skip_receipts_session_ordinal_key UNIQUE (session_id, paid_skip_ordinal),
    CONSTRAINT trivia_paid_skip_receipts_entitlement_ck CHECK (
        (entitlement = 'vip' AND diamonds_charged = 0
         AND spend_reference IS NULL AND wallet_transaction_id IS NULL)
        OR
        (entitlement = 'diamonds' AND diamonds_charged = 5
         AND spend_reference IS NOT NULL AND wallet_transaction_id IS NOT NULL)
    )
);

CREATE INDEX trivia_paid_skip_receipts_user_created_idx
    ON public.trivia_paid_skip_receipts_v1 (user_id, recorded_at DESC);
CREATE INDEX trivia_paid_skip_receipts_question_idx
    ON public.trivia_paid_skip_receipts_v1 (question_id);
CREATE INDEX trivia_paid_skip_receipts_wallet_transaction_idx
    ON public.trivia_paid_skip_receipts_v1 (wallet_transaction_id)
    WHERE wallet_transaction_id IS NOT NULL;

CREATE TABLE public.trivia_endless_high_score_projections_v1 (
    projection_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    session_id uuid NOT NULL UNIQUE REFERENCES public.trivia_sessions(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    variant text NOT NULL CHECK (variant = 'random'),
    verified_correct integer NOT NULL CHECK (verified_correct >= 0),
    previous_high_score integer NOT NULL CHECK (previous_high_score >= 0),
    projected_high_score integer NOT NULL CHECK (projected_high_score >= verified_correct),
    improved boolean NOT NULL,
    result_hash text,
    projected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT trivia_endless_high_score_projection_math_ck CHECK (
        projected_high_score = greatest(previous_high_score, verified_correct)
        AND improved = (verified_correct > previous_high_score)
    )
);

CREATE TABLE public.trivia_endless_high_score_reconciliations_v1 (
    reconciliation_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    variant text NOT NULL CHECK (variant = 'random'),
    previous_high_score integer CHECK (previous_high_score >= 0),
    trusted_high_score integer CHECK (trusted_high_score >= 0),
    projected_high_score integer CHECK (projected_high_score >= 0),
    action text NOT NULL CHECK (action IN ('preserved','lowered','raised','inserted','deleted')),
    evidence_session_id uuid REFERENCES public.trivia_sessions(id) ON DELETE RESTRICT,
    evidence_kind text CHECK (evidence_kind IN ('engine_v3','legacy')),
    reconciled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT trivia_endless_high_score_reconciliation_once UNIQUE (user_id, variant),
    CONSTRAINT trivia_endless_high_score_reconciliation_shape_ck CHECK (
        (action = 'deleted' AND previous_high_score IS NOT NULL
         AND trusted_high_score IS NULL AND projected_high_score IS NULL
         AND evidence_session_id IS NULL AND evidence_kind IS NULL)
        OR
        (action = 'inserted' AND previous_high_score IS NULL
         AND trusted_high_score IS NOT NULL
         AND projected_high_score = trusted_high_score
         AND evidence_session_id IS NOT NULL AND evidence_kind IS NOT NULL)
        OR
        (action IN ('preserved','lowered','raised')
         AND previous_high_score IS NOT NULL AND trusted_high_score IS NOT NULL
         AND projected_high_score = trusted_high_score
         AND evidence_session_id IS NOT NULL AND evidence_kind IS NOT NULL)
    )
);

CREATE INDEX trivia_endless_high_score_projections_user_created_idx
    ON public.trivia_endless_high_score_projections_v1 (user_id, projected_at DESC);
CREATE INDEX trivia_endless_high_score_reconciliations_evidence_session_idx
    ON public.trivia_endless_high_score_reconciliations_v1 (evidence_session_id)
    WHERE evidence_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trivia_phase9_forbid_receipt_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $body$
BEGIN
    RAISE EXCEPTION 'phase9 authority receipts are immutable'
        USING ERRCODE = 'check_violation';
END;
$body$;

CREATE TRIGGER trg_trivia_paid_skip_receipts_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON public.trivia_paid_skip_receipts_v1
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_phase9_forbid_receipt_mutation_v1();

CREATE TRIGGER trg_trivia_endless_high_score_projections_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON public.trivia_endless_high_score_projections_v1
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_phase9_forbid_receipt_mutation_v1();

CREATE TRIGGER trg_trivia_endless_high_score_reconciliations_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON public.trivia_endless_high_score_reconciliations_v1
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_phase9_forbid_receipt_mutation_v1();

ALTER TABLE public.trivia_paid_skip_receipts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_endless_high_score_projections_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_endless_high_score_reconciliations_v1 ENABLE ROW LEVEL SECURITY;

-- These tables are written/read only by postgres-owned SECURITY DEFINER
-- authorities. Explicit restrictive policies document intentional deny-all
-- direct access and avoid an ambiguous RLS-enabled-with-no-policy posture.
CREATE POLICY trivia_paid_skip_receipts_rpc_only
    ON public.trivia_paid_skip_receipts_v1 AS RESTRICTIVE
    FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY trivia_endless_projections_rpc_only
    ON public.trivia_endless_high_score_projections_v1 AS RESTRICTIVE
    FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY trivia_endless_reconciliations_rpc_only
    ON public.trivia_endless_high_score_reconciliations_v1 AS RESTRICTIVE
    FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.trivia_paid_skip_receipts_v1,
    public.trivia_endless_high_score_projections_v1,
    public.trivia_endless_high_score_reconciliations_v1
FROM PUBLIC, anon, authenticated, service_role;

-- The preceding committed migration prevents new generic lifeline writes.
-- Drain any call that entered the old body before that commit: SHARE conflicts
-- with the RowExclusive lock held by an INSERT and is retained through this
-- transaction. Once acquired, every pre-cutover writer has committed or
-- aborted, the exact scan below sees its durable row, and no later ledger row
-- can race between reconciliation and commit.
LOCK TABLE public.diamond_transactions IN SHARE MODE;

-- Adopt exact pre-Phase9 paid skips before classifying misses. This same
-- authority is invoked by every answer/status/settlement choke, so a durable
-- debit that becomes visible after the installation scan is still adopted
-- exactly once before it can be misclassified as a free timeout.
CREATE FUNCTION public.trivia_paid_skip_adopt_legacy_v1(
    p_session_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_receipt_count integer;
    v_candidate_count integer;
    v_ordinal integer;
    v_sequence integer;
    v_answer_order integer;
    v_binding text;
    v_row record;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success',false,'error','not_your_session');
    END IF;
    IF s.mode NOT IN ('endless','survival') THEN
        RETURN jsonb_build_object('success',true,'adopted',0);
    END IF;

    IF EXISTS (
        SELECT 1
          FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
          JOIN public.diamond_transactions t ON t.user_id=s.user_id
           AND t.reference_id IN (
               'trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip',
               'spend:'||s.user_id::text||':trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip')
          LEFT JOIN public.trivia_session_answers a
            ON a.session_id=s.id AND a.question_id=q.question_id
         WHERE t.amount IS DISTINCT FROM -5
            OR coalesce(t.transaction_type,t.type) IS DISTINCT FROM 'trivia_lifeline'
            OR t.counterparty IS DISTINCT FROM 'revenue:trivia_lifeline'
            OR t.issuance_class IS DISTINCT FROM 'spend'
            OR t.balance_after IS NULL OR t.balance_after<0
            OR t.created_at<s.created_at
            OR t.created_at>coalesce(CASE WHEN s.status='submitted' THEN s.submitted_at END,
                                         s.expires_at,clock_timestamp())
            OR (s.engine_version IS NOT NULL AND
                (a.question_id IS NULL OR a.server_voided_at IS NOT NULL OR a.outcome IS NOT NULL AND
                 (a.outcome IS DISTINCT FROM 'skip' OR a.display_index IS DISTINCT FROM -1)))
            OR (s.engine_version IS NULL AND
                (jsonb_typeof(s.answers) IS DISTINCT FROM 'object'
                 OR s.answers?q.question_id::text AND
                    ((s.answers->q.question_id::text)->'v'='true'::jsonb
                     OR (s.answers->q.question_id::text)->>'d' IS DISTINCT FROM '-1')))
    ) THEN
        RETURN jsonb_build_object('success',false,'error','malformed_legacy_paid_skip_evidence');
    END IF;
    IF EXISTS (
        SELECT 1
          FROM unnest(s.question_ids) q(question_id)
          JOIN public.diamond_transactions t ON t.user_id=s.user_id
           AND t.reference_id IN (
               'trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip',
               'spend:'||s.user_id::text||':trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip')
         GROUP BY q.question_id HAVING count(*)>1
    ) THEN
        RETURN jsonb_build_object('success',false,'error','ambiguous_paid_skip_debit');
    END IF;

    SELECT count(*)::integer INTO v_receipt_count
      FROM public.trivia_paid_skip_receipts_v1 WHERE session_id=s.id;
    SELECT count(*)::integer INTO v_candidate_count
      FROM unnest(s.question_ids) q(question_id)
      JOIN public.diamond_transactions t ON t.user_id=s.user_id
       AND t.reference_id IN (
           'trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip',
           'spend:'||s.user_id::text||':trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip')
     WHERE NOT EXISTS (
         SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
          WHERE r.session_id=s.id AND r.question_id=q.question_id);
    IF v_receipt_count+v_candidate_count>3 THEN
        RETURN jsonb_build_object('success',false,'error','legacy_paid_skip_cap_exceeded');
    END IF;
    v_ordinal:=v_receipt_count;

    FOR v_row IN
        SELECT q.question_id,q.position::integer,a.outcome,a.client_nonce,
               t.id transaction_id,t.reference_id,t.balance_after,t.created_at
          FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
          LEFT JOIN public.trivia_session_answers a
            ON a.session_id=s.id AND a.question_id=q.question_id
          JOIN public.diamond_transactions t ON t.user_id=s.user_id
           AND t.reference_id IN (
               'trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip',
               'spend:'||s.user_id::text||':trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip')
         WHERE NOT EXISTS (
             SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
              WHERE r.session_id=s.id AND r.question_id=q.question_id)
         ORDER BY t.created_at,q.position
    LOOP
        v_ordinal:=v_ordinal+1;
        v_binding:=CASE WHEN (s.engine_version IS NOT NULL AND v_row.outcome IS NOT NULL)
                              OR (s.engine_version IS NULL AND s.answers?v_row.question_id::text)
                        THEN 'legacy_bound_answer' ELSE 'legacy_ledger_only' END;
        INSERT INTO public.trivia_paid_skip_receipts_v1(
            session_id,user_id,question_id,position,paid_skip_ordinal,
            policy_version,source_binding,policy_unit_cost,policy_session_limit,
            entitlement,diamonds_charged,spend_reference,wallet_transaction_id,
            balance_after,client_nonce,recorded_at)
        VALUES(s.id,s.user_id,v_row.question_id,v_row.position,v_ordinal,
            'paid-skip-legacy@1',v_binding,5,3,'diamonds',5,v_row.reference_id,
            v_row.transaction_id,v_row.balance_after,v_row.client_nonce,v_row.created_at);

        IF s.status='open' AND v_binding='legacy_ledger_only' THEN
            IF s.engine_version IS NOT NULL THEN
                SELECT coalesce(max(sequence),0)+1 INTO v_sequence
                  FROM public.trivia_session_answers WHERE session_id=s.id;
                UPDATE public.trivia_session_answers
                   SET outcome='skip',display_index=-1,original_index=NULL,is_correct=false,
                       sequence=v_sequence,answered_at=v_row.created_at
                 WHERE session_id=s.id AND question_id=v_row.question_id
                   AND outcome IS NULL AND server_voided_at IS NULL;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'legacy paid-skip answer binding changed concurrently'
                        USING ERRCODE='serialization_failure';
                END IF;
            ELSE
                SELECT coalesce(max((e.value->>'n')::integer),-1)+1 INTO v_answer_order
                  FROM jsonb_each(s.answers) e
                 WHERE coalesce(e.value->>'n','')~'^[0-9]+$';
                s.answers:=s.answers||jsonb_build_object(v_row.question_id::text,
                    jsonb_build_object('d',-1,'n',v_answer_order,'at',v_row.created_at));
                UPDATE public.trivia_sessions SET answers=s.answers WHERE id=s.id;
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('success',true,'adopted',v_candidate_count,
        'paidSkipCount',v_receipt_count+v_candidate_count);
END;
$body$;

DO $legacy_paid_skip_adoption$
DECLARE
    candidate record;
    result jsonb;
BEGIN
    FOR candidate IN
        SELECT DISTINCT s.id,s.user_id
          FROM public.trivia_sessions s
          CROSS JOIN LATERAL unnest(s.question_ids) q(question_id)
          JOIN public.diamond_transactions t ON t.user_id=s.user_id
           AND t.reference_id IN (
               'trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip',
               'spend:'||s.user_id::text||':trivia_lifeline:'||s.id::text||':'||q.question_id::text||':skip')
         WHERE s.mode IN ('endless','survival')
    LOOP
        result:=public.trivia_paid_skip_adopt_legacy_v1(candidate.id,candidate.user_id);
        IF coalesce((result->>'success')::boolean,false) IS NOT TRUE THEN
            RAISE EXCEPTION 'phase9 authority historical paid-skip adoption failed: %',result;
        END IF;
    END LOOP;
END;
$legacy_paid_skip_adoption$;

-- Rebuild the previously browser-writable board from verified submitted
-- Endless sessions before the only future writer is enabled. `trivia_scores`
-- proves the server award path and ownership; the immutable V3 result or the
-- sealed legacy score supplies the correct-answer count. Unsupported rows are
-- removed rather than grandfathering a caller-controlled maximum forever.
WITH candidate_base AS (
    SELECT s.user_id,
           CASE WHEN s.engine_version IS NOT NULL THEN r.correct ELSE score.correct_count END AS verified_correct,
           s.id AS session_id,
           CASE WHEN s.engine_version IS NOT NULL THEN 'engine_v3' ELSE 'legacy' END AS evidence_kind,
           coalesce(r.completed_at, s.submitted_at, s.created_at) AS completed_at,
           s.engine_version
      FROM public.trivia_scores score
      JOIN public.trivia_sessions s
        ON s.id = score.session_id
       AND s.user_id = score.user_id
       AND s.mode = 'endless'
       AND s.status = 'submitted'
      LEFT JOIN public.trivia_session_results r
        ON r.session_id = s.id
       AND r.user_id = s.user_id
       AND r.mode = 'endless'
       AND r.outcome = 'submitted'
     WHERE score.server_verified IS TRUE
       AND score.mode = 'endless'
       AND score.correct_count >= 0
       AND (
            (s.engine_version IS NOT NULL
             AND r.session_id IS NOT NULL
             AND r.correct = score.correct_count
             AND r.correct = s.correct_count
             AND r.score = s.score
             AND r.result_hash IS NOT NULL)
            OR
            (s.engine_version IS NULL
             AND s.correct_count = score.correct_count
             AND s.settlement_request_id IS NOT NULL
             AND jsonb_typeof(s.settlement_result) = 'object'
             AND coalesce((s.settlement_result ->> 'success')::boolean, false) IS TRUE)
       )
), candidate_engine_events AS (
    SELECT cb.session_id,a.question_id,a.position,a.sequence,a.server_voided_at,
           a.outcome IN ('wrong','skip','late','timeout') AS failed,
           (a.outcome IN ('wrong','skip','late','timeout') AND NOT EXISTS (
               SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
           )) AS non_paid_miss
      FROM candidate_base cb
      JOIN public.trivia_session_answers a ON a.session_id=cb.session_id
     WHERE cb.engine_version IS NOT NULL AND a.outcome IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
            WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
              AND paid.source_binding='legacy_ledger_only')
), candidate_engine_ledger_events AS (
    SELECT cb.session_id,r.question_id,r.position
      FROM candidate_base cb
      JOIN public.trivia_paid_skip_receipts_v1 r ON r.session_id=cb.session_id
     WHERE cb.engine_version IS NOT NULL AND r.source_binding='legacy_ledger_only'
), candidate_engine_integrity AS (
    SELECT cb.session_id,
           NOT EXISTS (
               SELECT 1 FROM candidate_engine_events e
                WHERE e.session_id=cb.session_id AND (e.sequence IS NULL OR e.sequence<1))
           AND (SELECT count(*) FROM candidate_engine_events e WHERE e.session_id=cb.session_id)
               = (SELECT count(DISTINCT e.sequence) FROM candidate_engine_events e
                   WHERE e.session_id=cb.session_id)
           AND NOT EXISTS (
               SELECT 1 FROM candidate_engine_events earlier
               JOIN candidate_engine_events later ON later.session_id=earlier.session_id
                AND later.sequence>earlier.sequence AND later.position<=earlier.position
                WHERE earlier.session_id=cb.session_id)
           AND NOT EXISTS (
               SELECT 1
                 FROM generate_series(1,coalesce(greatest(
                     (SELECT max(e.position) FROM candidate_engine_events e WHERE e.session_id=cb.session_id),
                     (SELECT max(r.position) FROM candidate_engine_ledger_events r WHERE r.session_id=cb.session_id)),0)) pos
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.trivia_session_answers a
                     WHERE a.session_id=cb.session_id AND a.position=pos AND a.outcome IS NOT NULL)
                  AND NOT EXISTS (
                    SELECT 1 FROM candidate_engine_ledger_events r
                     WHERE r.session_id=cb.session_id AND r.position=pos)) AS valid
      FROM candidate_base cb WHERE cb.engine_version IS NOT NULL
), candidate_legacy_events AS (
    SELECT cb.session_id,q.question_id,q.position::integer,parsed.answer_order,
           answer.value->'v' IS NOT DISTINCT FROM 'true'::jsonb AS voided,
           CASE WHEN parsed.display_index=-1 THEN true
                ELSE (s.permutations->answer.key->>parsed.display_index)::integer
                     IS DISTINCT FROM revision.correct_index END AS failed,
           (CASE WHEN parsed.display_index=-1 THEN true
                 ELSE (s.permutations->answer.key->>parsed.display_index)::integer
                      IS DISTINCT FROM revision.correct_index END
            AND NOT EXISTS (
                SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                 WHERE paid.session_id=s.id AND paid.question_id=q.question_id)) AS non_paid_miss
      FROM candidate_base cb
      JOIN public.trivia_sessions s ON s.id=cb.session_id
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(s.answers)='object'
                                         THEN s.answers ELSE '{}'::jsonb END) answer(key,value)
      JOIN LATERAL unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
        ON q.question_id::text=answer.key
      CROSS JOIN LATERAL (
          SELECT CASE WHEN coalesce(answer.value->>'n','')~'^[0-9]+$'
                      THEN (answer.value->>'n')::integer END answer_order,
                 CASE WHEN coalesce(answer.value->>'d','')~'^-?[0-9]+$'
                      THEN (answer.value->>'d')::integer END display_index
      ) parsed
      JOIN public.trivia_question_revisions revision
        ON revision.id=CASE WHEN coalesce(s.question_revision_ids->>answer.key,'')
               ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             THEN (s.question_revision_ids->>answer.key)::uuid END
       AND revision.question_id=q.question_id
     WHERE cb.engine_version IS NULL AND jsonb_typeof(answer.value)='object'
       AND parsed.answer_order IS NOT NULL AND parsed.display_index>=-1
       AND (parsed.display_index=-1 OR (jsonb_typeof(s.permutations->answer.key)='array'
            AND parsed.display_index<jsonb_array_length(s.permutations->answer.key)))
       AND NOT EXISTS (
           SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
            WHERE paid.session_id=s.id AND paid.question_id=q.question_id
              AND paid.source_binding='legacy_ledger_only')
), candidate_legacy_ledger_events AS (
    SELECT cb.session_id,r.question_id,r.position
      FROM candidate_base cb
      JOIN public.trivia_paid_skip_receipts_v1 r ON r.session_id=cb.session_id
     WHERE cb.engine_version IS NULL AND r.source_binding='legacy_ledger_only'
), candidate_legacy_integrity AS (
    SELECT cb.session_id,
           jsonb_typeof(s.answers)='object'
           AND NOT EXISTS (
               SELECT 1 FROM candidate_legacy_events e
                WHERE e.session_id=cb.session_id AND (e.answer_order IS NULL OR e.answer_order<0))
           AND (SELECT count(*) FROM candidate_legacy_events e WHERE e.session_id=cb.session_id)
               = (SELECT count(DISTINCT e.answer_order) FROM candidate_legacy_events e
                   WHERE e.session_id=cb.session_id)
           AND (SELECT count(*) FROM jsonb_each(s.answers) raw
                 WHERE NOT EXISTS (
                     SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                      WHERE paid.session_id=s.id AND paid.question_id=CASE
                          WHEN raw.key~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                          THEN raw.key::uuid END
                        AND paid.source_binding='legacy_ledger_only'))
               = (SELECT count(*) FROM candidate_legacy_events e WHERE e.session_id=cb.session_id)
           AND NOT EXISTS (
               SELECT 1 FROM candidate_legacy_events earlier
               JOIN candidate_legacy_events later ON later.session_id=earlier.session_id
                AND later.answer_order>earlier.answer_order AND later.position<=earlier.position
                WHERE earlier.session_id=cb.session_id)
           AND NOT EXISTS (
               SELECT 1
                 FROM generate_series(1,coalesce(greatest(
                     (SELECT max(e.position) FROM candidate_legacy_events e WHERE e.session_id=cb.session_id),
                     (SELECT max(r.position) FROM candidate_legacy_ledger_events r WHERE r.session_id=cb.session_id)),0)) pos
                WHERE NOT (coalesce(s.answers,'{}'::jsonb)?s.question_ids[pos]::text)
                  AND NOT EXISTS (
                    SELECT 1 FROM candidate_legacy_ledger_events r
                     WHERE r.session_id=cb.session_id AND r.position=pos)) AS valid
      FROM candidate_base cb JOIN public.trivia_sessions s ON s.id=cb.session_id
     WHERE cb.engine_version IS NULL
), candidate_integrity AS (
    SELECT session_id,valid FROM candidate_engine_integrity
    UNION ALL SELECT session_id,valid FROM candidate_legacy_integrity
), candidate_attempts AS (
    -- A historical result is trusted only when every attempted event has a
    -- durable total order and play stopped on the exact third non-paid miss.
    -- Sequence/ordinal integrity proves recorded attempts progressed strictly
    -- through roster order, and the no-hole proof accounts for every earlier
    -- position (including ledger-only skips). Roster position is therefore the
    -- single collision-free order for the merged event stream.
    SELECT e.session_id,e.position AS event_order,e.non_paid_miss
      FROM candidate_engine_events e
      JOIN candidate_engine_integrity i ON i.session_id=e.session_id AND i.valid
     WHERE e.server_voided_at IS NULL
    UNION ALL
    SELECT r.session_id,r.position AS event_order,false
      FROM candidate_engine_ledger_events r
      JOIN candidate_engine_integrity i ON i.session_id=r.session_id AND i.valid
    UNION ALL
    SELECT e.session_id,e.position AS event_order,e.non_paid_miss
      FROM candidate_legacy_events e
      JOIN candidate_legacy_integrity i ON i.session_id=e.session_id AND i.valid
     WHERE NOT e.voided
    UNION ALL
    SELECT r.session_id,r.position AS event_order,false
      FROM candidate_legacy_ledger_events r
      JOIN candidate_legacy_integrity i ON i.session_id=r.session_id AND i.valid
), candidate_failures AS (
    SELECT session_id, event_order,
           row_number() OVER (
               PARTITION BY session_id ORDER BY event_order
           )::integer AS failure_number
      FROM candidate_attempts
     WHERE non_paid_miss
), candidate_boundaries AS (
    SELECT session_id, event_order AS boundary_order
      FROM candidate_failures
     WHERE failure_number = 3
), trusted_candidates AS (
    SELECT cb.user_id, cb.verified_correct, cb.session_id,
           cb.evidence_kind, cb.completed_at
      FROM candidate_base cb
      JOIN candidate_integrity integrity ON integrity.session_id=cb.session_id AND integrity.valid
     WHERE NOT EXISTS (
         SELECT 1
           FROM candidate_boundaries boundary
           JOIN candidate_attempts attempt
             ON attempt.session_id = boundary.session_id
            AND attempt.event_order > boundary.boundary_order
          WHERE boundary.session_id = cb.session_id
     )
), trusted AS (
    SELECT DISTINCT ON (user_id)
           user_id, verified_correct, session_id, evidence_kind, completed_at
      FROM trusted_candidates
     ORDER BY user_id, verified_correct DESC, completed_at ASC NULLS LAST, session_id
), combined AS (
    SELECT coalesce(h.user_id, t.user_id) AS user_id,
           h.high_score AS previous_high_score,
           t.verified_correct AS trusted_high_score,
           t.session_id AS evidence_session_id,
           t.evidence_kind,
           CASE
             WHEN h.user_id IS NULL THEN 'inserted'
             WHEN t.user_id IS NULL THEN 'deleted'
             WHEN h.high_score = t.verified_correct THEN 'preserved'
             WHEN h.high_score > t.verified_correct THEN 'lowered'
             ELSE 'raised'
           END AS action
      FROM (SELECT * FROM public.endless_high_scores WHERE mode = 'random') h
      FULL JOIN trusted t ON t.user_id = h.user_id
)
INSERT INTO public.trivia_endless_high_score_reconciliations_v1 (
    user_id, variant, previous_high_score, trusted_high_score,
    projected_high_score, action, evidence_session_id, evidence_kind
)
SELECT user_id, 'random', previous_high_score, trusted_high_score,
       trusted_high_score, action, evidence_session_id, evidence_kind
  FROM combined;

DELETE FROM public.endless_high_scores h
 WHERE h.mode = 'random'
   AND EXISTS (
       SELECT 1 FROM public.trivia_endless_high_score_reconciliations_v1 r
        WHERE r.user_id = h.user_id AND r.variant = h.mode AND r.action = 'deleted');

UPDATE public.endless_high_scores h
   SET high_score = r.projected_high_score,
       achieved_at = r.reconciled_at
  FROM public.trivia_endless_high_score_reconciliations_v1 r
 WHERE h.user_id = r.user_id AND h.mode = r.variant
   AND r.action IN ('lowered','raised');

INSERT INTO public.endless_high_scores (user_id, mode, high_score, achieved_at)
SELECT r.user_id, r.variant, r.projected_high_score, r.reconciled_at
  FROM public.trivia_endless_high_score_reconciliations_v1 r
 WHERE r.action = 'inserted';

-- The public leaderboard remains readable. Its writes now exist only inside
-- trivia_endless_high_score_project_v1 under the function owner.
DROP POLICY IF EXISTS "Users can insert own endless high score" ON public.endless_high_scores;
DROP POLICY IF EXISTS "users_insert_own_scores" ON public.endless_high_scores;
DROP POLICY IF EXISTS "Users can update own endless high score" ON public.endless_high_scores;
DROP POLICY IF EXISTS "users_update_own_scores" ON public.endless_high_scores;
DROP POLICY IF EXISTS "Users can delete own endless high score" ON public.endless_high_scores;
DROP POLICY IF EXISTS "users_delete_own_scores" ON public.endless_high_scores;
DROP POLICY IF EXISTS "Service role manages endless high scores" ON public.endless_high_scores;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.endless_high_scores FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.endless_high_scores TO anon, authenticated;

-- Expand the public compatibility surface before any new function is defined.
-- Every Phase9 authority function below calls these exact renamed OIDs.  The
-- old public names are recreated only after the hardened functions exist, so a
-- freshly planned or already-cached PL/pgSQL statement can never recurse into
-- a compatibility wrapper or bypass the new choke.
ALTER FUNCTION public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)
    RENAME TO trivia_session_answer_before_phase9_v4;
ALTER FUNCTION public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid)
    RENAME TO trivia_legacy_session_answer_before_phase9_v1;
ALTER FUNCTION public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)
    RENAME TO trivia_session_settle_solo_before_phase9_v4;
ALTER FUNCTION public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
    RENAME TO award_trivia_run_before_phase9_v4;

CREATE OR REPLACE FUNCTION public.trivia_solo_miss_status_v1(
    p_session_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_adoption jsonb;
    v_authority jsonb;
    v_grade jsonb;
    v_non_paid_misses integer := 0;
    v_terminal_failures integer := 0;
    v_roster_size integer := 0;
    v_required_correct integer;
    v_terminal_threshold integer := 3;
    v_boundary_order integer;
    v_overrun boolean := false;
    v_terminal_reached boolean := false;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF s.mode NOT IN ('endless','survival') THEN
        RETURN jsonb_build_object('success', true, 'sessionId', s.id,
            'nonPaidMissCount', 0, 'terminalFailureCount', 0,
            'missLimit', 3, 'runMissLimitReached', false, 'overrun', false);
    END IF;

    v_adoption:=public.trivia_paid_skip_adopt_legacy_v1(s.id,p_user_id);
    IF coalesce((v_adoption->>'success')::boolean,false) IS NOT TRUE THEN
        RETURN v_adoption;
    END IF;
    -- Adoption can bind an open legacy answer map; reload the locked row before
    -- deriving sequence/terminal status.
    SELECT * INTO s FROM public.trivia_sessions WHERE id=s.id;

    v_roster_size := coalesce(cardinality(s.question_ids), 0);
    IF s.mode = 'survival' THEN
        IF s.survival_level IS NULL OR s.survival_level < 1 OR s.survival_level > 10 THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_survival_level');
        END IF;
        v_required_correct := (ARRAY[17,18,18,19,19,19,20,20,20,20])[s.survival_level];
        -- Survival remains playable after the last mathematically tolerable
        -- miss.  The exact next wrong/skip/late/timeout event is admitted and
        -- becomes terminal; only later new events are refused.
        v_terminal_threshold := greatest(1, v_roster_size - v_required_correct + 1);
    END IF;

    IF s.engine_version IS NOT NULL THEN
        -- Open runs may neutralize a newly invalid question before counting.
        -- Submitted runs are sealed evidence: a later quarantine must never
        -- rewrite their answer rows or retroactively change terminal/high-score
        -- eligibility.
        IF s.status = 'open' THEN
            v_authority := public.trivia_p8_lock_and_void_session_questions_v1(s.id);
            IF coalesce((v_authority ->> 'success')::boolean, false) IS NOT TRUE THEN
                RETURN v_authority;
            END IF;
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.trivia_session_answers a
             WHERE a.session_id=s.id AND a.outcome IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                      AND paid.source_binding='legacy_ledger_only')
               AND (a.sequence IS NULL OR a.sequence<1)
        ) OR (SELECT count(*) FROM public.trivia_session_answers a
               WHERE a.session_id=s.id AND a.outcome IS NOT NULL
                 AND NOT EXISTS (
                     SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                      WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                        AND paid.source_binding='legacy_ledger_only'))
             <> (SELECT count(DISTINCT a.sequence) FROM public.trivia_session_answers a
                  WHERE a.session_id=s.id AND a.outcome IS NOT NULL
                    AND NOT EXISTS (
                        SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                         WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                           AND paid.source_binding='legacy_ledger_only'))
        OR EXISTS (
            SELECT 1 FROM public.trivia_session_answers earlier
            JOIN public.trivia_session_answers later ON later.session_id=earlier.session_id
             AND later.sequence>earlier.sequence AND later.position<=earlier.position
             WHERE earlier.session_id=s.id AND earlier.outcome IS NOT NULL AND later.outcome IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 p
                    WHERE p.session_id=earlier.session_id AND p.question_id=earlier.question_id
                      AND p.source_binding='legacy_ledger_only')
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 p
                    WHERE p.session_id=later.session_id AND p.question_id=later.question_id
                      AND p.source_binding='legacy_ledger_only')
        ) OR EXISTS (
            SELECT 1 FROM generate_series(1,coalesce(greatest(
                (SELECT max(a.position) FROM public.trivia_session_answers a
                  WHERE a.session_id=s.id AND a.outcome IS NOT NULL),
                (SELECT max(r.position) FROM public.trivia_paid_skip_receipts_v1 r
                  WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only')),0)) pos
             WHERE NOT EXISTS (SELECT 1 FROM public.trivia_session_answers a
                                WHERE a.session_id=s.id AND a.position=pos AND a.outcome IS NOT NULL)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                                WHERE r.session_id=s.id AND r.position=pos
                                  AND r.source_binding='legacy_ledger_only')
        ) THEN
            RETURN jsonb_build_object('success',false,'error','answer_sequence_invalid');
        END IF;
        WITH answer_events AS (
            SELECT a.question_id,a.position,a.sequence,a.server_voided_at,
                   a.position AS event_order,
                   a.outcome IN ('wrong','skip','late','timeout') AS failed,
                   (a.outcome IN ('wrong','skip','late','timeout') AND NOT EXISTS (
                        SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                         WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                    )) AS non_paid_miss
              FROM public.trivia_session_answers a
             WHERE a.session_id=s.id AND a.outcome IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=a.session_id AND paid.question_id=a.question_id
                      AND paid.source_binding='legacy_ledger_only')
        ), ledger_events AS (
            SELECT r.question_id,r.position,r.position AS event_order
              FROM public.trivia_paid_skip_receipts_v1 r
             WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only'
        ), attempted AS (
            SELECT question_id,event_order,failed,non_paid_miss
              FROM answer_events WHERE server_voided_at IS NULL
            UNION ALL
            SELECT question_id,event_order,true,false FROM ledger_events
        ), terminal_events AS (
            SELECT event_order,
                   row_number() OVER (ORDER BY event_order)::integer AS failure_number
              FROM attempted
             WHERE CASE WHEN s.mode = 'endless' THEN non_paid_miss ELSE failed END
        )
        SELECT (SELECT count(*)::integer FROM attempted WHERE non_paid_miss),
               (SELECT count(*)::integer FROM terminal_events),
               (SELECT event_order FROM terminal_events
                 WHERE failure_number = v_terminal_threshold),
               EXISTS (
                   SELECT 1 FROM attempted a
                    WHERE a.event_order > coalesce(
                        (SELECT event_order FROM terminal_events
                          WHERE failure_number = v_terminal_threshold),
                        2147483647
                    )
               )
          INTO v_non_paid_misses, v_terminal_failures, v_boundary_order, v_overrun;
    ELSE
        -- This validator also neutralizes invalid bound questions and fails
        -- closed on malformed legacy answer evidence before any casts below.
        IF s.status = 'open' THEN
            v_grade := public.trivia_p8_legacy_grade_locked_v1(s.id);
            IF coalesce((v_grade ->> 'success')::boolean, false) IS NOT TRUE THEN
                RETURN v_grade;
            END IF;
            SELECT * INTO s FROM public.trivia_sessions WHERE id = s.id;
        END IF;
        IF jsonb_typeof(s.answers) IS DISTINCT FROM 'object' THEN
            RETURN jsonb_build_object('success',false,'error','answer_record_invalid');
        END IF;
        IF (SELECT count(*) FROM jsonb_each(s.answers) raw
             WHERE raw.value->'v' IS DISTINCT FROM 'true'::jsonb
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id
                      AND paid.question_id=CASE WHEN raw.key
                           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                           THEN raw.key::uuid END
                      AND paid.source_binding='legacy_ledger_only'))
           <> (SELECT count(*)
                 FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                 JOIN LATERAL (SELECT s.answers->q.question_id::text value) answer
                   ON answer.value IS NOT NULL
                 JOIN public.trivia_question_revisions revision
                   ON revision.id=CASE WHEN coalesce(s.question_revision_ids->>q.question_id::text,'')
                        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        THEN (s.question_revision_ids->>q.question_id::text)::uuid END
                  AND revision.question_id=q.question_id
                WHERE answer.value->'v' IS DISTINCT FROM 'true'::jsonb
                  AND jsonb_typeof(answer.value)='object'
                  AND coalesce(answer.value->>'n','')~'^[0-9]+$'
                  AND coalesce(answer.value->>'d','')~'^-?[0-9]+$'
                  AND (answer.value->>'d')::integer>=-1
                  AND ((answer.value->>'d')::integer=-1
                       OR (jsonb_typeof(s.permutations->q.question_id::text)='array'
                           AND (answer.value->>'d')::integer
                               <jsonb_array_length(s.permutations->q.question_id::text)))
                  AND NOT EXISTS (
                      SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                       WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                         AND paid.source_binding='legacy_ledger_only'))
        OR (SELECT count(*)
              FROM unnest(s.question_ids) q(question_id)
             WHERE s.answers?q.question_id::text
               AND (s.answers->q.question_id::text)->'v' IS DISTINCT FROM 'true'::jsonb
               AND coalesce((s.answers->q.question_id::text)->>'n','')~'^[0-9]+$'
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                      AND paid.source_binding='legacy_ledger_only'))
           <> (SELECT count(DISTINCT ((s.answers->q.question_id::text)->>'n')::integer)
                 FROM unnest(s.question_ids) q(question_id)
                WHERE s.answers?q.question_id::text
                  AND (s.answers->q.question_id::text)->'v' IS DISTINCT FROM 'true'::jsonb
                  AND coalesce((s.answers->q.question_id::text)->>'n','')~'^[0-9]+$'
                  AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                       WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                         AND paid.source_binding='legacy_ledger_only'))
        OR EXISTS (
            WITH parsed AS (
                SELECT q.position::integer,(answer.value->>'n')::integer answer_order
                  FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                  JOIN LATERAL (SELECT s.answers->q.question_id::text value) answer
                    ON answer.value IS NOT NULL
                 WHERE answer.value->'v' IS DISTINCT FROM 'true'::jsonb
                   AND coalesce(answer.value->>'n','')~'^[0-9]+$'
                   AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                        WHERE r.session_id=s.id AND r.question_id=q.question_id
                          AND r.source_binding='legacy_ledger_only')
            )
            SELECT 1 FROM parsed earlier JOIN parsed later
              ON later.answer_order>earlier.answer_order AND later.position<=earlier.position
        ) OR EXISTS (
            SELECT 1 FROM generate_series(1,coalesce(greatest(
                (SELECT max(q.position)::integer
                   FROM unnest(s.question_ids) WITH ORDINALITY q(question_id,position)
                  WHERE s.answers?q.question_id::text),
                (SELECT max(r.position) FROM public.trivia_paid_skip_receipts_v1 r
                  WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only')),0)) pos
             WHERE NOT(s.answers?s.question_ids[pos]::text)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_paid_skip_receipts_v1 r
                                WHERE r.session_id=s.id AND r.position=pos
                                  AND r.source_binding='legacy_ledger_only')
        ) THEN
            RETURN jsonb_build_object('success',false,'error','answer_sequence_invalid');
        END IF;
        WITH answer_events AS (
            SELECT q.question_id,q.position::integer,
                   q.position::integer AS event_order,
                   answer.value->'v' IS NOT DISTINCT FROM 'true'::jsonb AS voided,
                   ((answer.value ->> 'd')::integer = -1 OR
                    (s.permutations -> q.question_id::text
                        ->> (answer.value ->> 'd')::integer)::integer
                        IS DISTINCT FROM revision.correct_index) AS failed,
                   (((answer.value ->> 'd')::integer = -1 OR
                     (s.permutations -> q.question_id::text
                        ->> (answer.value ->> 'd')::integer)::integer
                        IS DISTINCT FROM revision.correct_index) AND NOT EXISTS (
                       SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                        WHERE paid.session_id = s.id
                          AND paid.question_id = q.question_id
                   )) AS non_paid_miss
              FROM unnest(s.question_ids) WITH ORDINALITY q(question_id, position)
              JOIN LATERAL (
                  SELECT s.answers -> q.question_id::text AS value
              ) answer ON answer.value IS NOT NULL
              JOIN public.trivia_question_revisions revision
                ON revision.id = (s.question_revision_ids ->> q.question_id::text)::uuid
               AND revision.question_id = q.question_id
             WHERE coalesce(answer.value->>'n','')~'^[0-9]+$'
               AND coalesce(answer.value->>'d','')~'^-?[0-9]+$'
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_paid_skip_receipts_v1 paid
                    WHERE paid.session_id=s.id AND paid.question_id=q.question_id
                      AND paid.source_binding='legacy_ledger_only')
        ), ledger_events AS (
            SELECT r.question_id,r.position,r.position AS event_order
              FROM public.trivia_paid_skip_receipts_v1 r
             WHERE r.session_id=s.id AND r.source_binding='legacy_ledger_only'
        ), attempted AS (
            SELECT question_id,event_order,failed,non_paid_miss
              FROM answer_events WHERE NOT voided
            UNION ALL
            SELECT question_id,event_order,true,false FROM ledger_events
        ), terminal_events AS (
            SELECT event_order,
                   row_number() OVER (ORDER BY event_order)::integer AS failure_number
              FROM attempted
             WHERE CASE WHEN s.mode = 'endless' THEN non_paid_miss ELSE failed END
        )
        SELECT (SELECT count(*)::integer FROM attempted WHERE non_paid_miss),
               (SELECT count(*)::integer FROM terminal_events),
               (SELECT event_order FROM terminal_events
                 WHERE failure_number = v_terminal_threshold),
               EXISTS (
                   SELECT 1 FROM attempted a
                    WHERE a.event_order > coalesce(
                        (SELECT event_order FROM terminal_events
                          WHERE failure_number = v_terminal_threshold),
                        2147483647
                    )
               )
          INTO v_non_paid_misses, v_terminal_failures, v_boundary_order, v_overrun;
    END IF;

    v_terminal_reached := v_boundary_order IS NOT NULL;

    RETURN jsonb_build_object(
        'success', true,
        'sessionId', s.id,
        'mode', s.mode,
        'nonPaidMissCount', coalesce(v_non_paid_misses, 0),
        'terminalFailureCount', coalesce(v_terminal_failures, 0),
        'missLimit', v_terminal_threshold,
        'runMissLimitReached', v_terminal_reached,
        'overrun', coalesce(v_overrun, false),
        'boundaryOrder', v_boundary_order,
        'rosterSize', v_roster_size,
        'survivalLevel', CASE WHEN s.mode = 'survival' THEN s.survival_level ELSE NULL END,
        'requiredCorrect', v_required_correct,
        'maxPossibleCorrect', CASE WHEN s.mode = 'survival'
            THEN greatest(0, v_roster_size - coalesce(v_terminal_failures, 0))
            ELSE NULL END
    );
END;
$body$;

-- Replace the lightweight count projection now that the authoritative miss
-- evaluator exists. Resume clients receive the same cross-device run boundary
-- the answer and settlement chokes enforce.
CREATE OR REPLACE FUNCTION public.trivia_paid_skip_status_v1(
    p_session_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_count integer;
    v_miss_status jsonb;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF s.mode NOT IN ('endless','survival') THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_skip_not_supported');
    END IF;
    v_miss_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
    IF coalesce((v_miss_status ->> 'success')::boolean, false) IS NOT TRUE THEN
        RETURN v_miss_status;
    END IF;
    -- miss_status adopts any exact pre-cutover ledger evidence under the same
    -- session lock. Count only after that adoption so resume never reports a
    -- stale cap or loses a paid entitlement.
    SELECT count(*)::integer INTO v_count
      FROM public.trivia_paid_skip_receipts_v1 r
     WHERE r.session_id = s.id;
    RETURN jsonb_build_object(
        'success', true,
        'sessionId', s.id,
        'paidSkipCount', v_count,
        'paidSkipLimit', 3,
        'policyVersion', 'paid-skip@1',
        'policyUnitCost', 5,
        'nonPaidMissCount', (v_miss_status ->> 'nonPaidMissCount')::integer,
        'terminalFailureCount', (v_miss_status ->> 'terminalFailureCount')::integer,
        'missLimit', (v_miss_status ->> 'missLimit')::integer,
        'runMissLimitReached', coalesce((v_miss_status ->> 'runMissLimitReached')::boolean, false),
        'overrun', coalesce((v_miss_status ->> 'overrun')::boolean, false),
        'survivalLevel', v_miss_status -> 'survivalLevel',
        'requiredCorrect', v_miss_status -> 'requiredCorrect',
        'maxPossibleCorrect', v_miss_status -> 'maxPossibleCorrect'
    );
END;
$body$;

CREATE OR REPLACE FUNCTION public.trivia_paid_skip_v1(
    p_session_id uuid,
    p_user_id uuid,
    p_question_id uuid,
    p_client_nonce uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    a public.trivia_session_answers%ROWTYPE;
    v_existing public.trivia_paid_skip_receipts_v1%ROWTYPE;
    v_profile public.profiles%ROWTYPE;
    v_position integer;
    v_count integer;
    v_is_vip boolean;
    v_current_vip_eligible boolean := false;
    v_reference text;
    v_legacy_reference text;
    v_reference_existed boolean := false;
    v_legacy_debit_adopted boolean := false;
    v_spend jsonb;
    v_answer jsonb;
    v_transaction public.diamond_transactions%ROWTYPE;
    v_canonical_transaction public.diamond_transactions%ROWTYPE;
    v_legacy_transaction public.diamond_transactions%ROWTYPE;
    v_receipt public.trivia_paid_skip_receipts_v1%ROWTYPE;
    v_failure jsonb;
    v_miss_status jsonb;
    v_current_balance integer;
    v_expected_position integer;
    v_prior_question_id uuid;
    v_adoption jsonb;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;

    -- This lock serializes the cap, first answer, debit and receipt for every
    -- device using the same session.
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF s.mode NOT IN ('endless','survival') THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_skip_not_supported');
    END IF;

    -- Adopt any exact historical debit before every receipt/cap/answer check.
    -- Otherwise a same-question late debit can look unanswered and a newly
    -- adopted third receipt can collide with a fresh ordinal after charging.
    v_adoption := public.trivia_paid_skip_adopt_legacy_v1(s.id, p_user_id);
    IF coalesce((v_adoption ->> 'success')::boolean, false) IS NOT TRUE THEN
        RETURN v_adoption;
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = s.id;

    SELECT * INTO v_existing
      FROM public.trivia_paid_skip_receipts_v1
     WHERE session_id = s.id AND question_id = p_question_id;
    IF FOUND THEN
        SELECT count(*)::integer INTO v_count
          FROM public.trivia_paid_skip_receipts_v1 WHERE session_id = s.id;
        SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
        IF NOT FOUND THEN
            v_current_balance := v_existing.balance_after;
            v_current_vip_eligible := false;
        ELSE
            v_current_balance := v_profile.diamonds;
            v_current_vip_eligible := coalesce(v_profile.is_vip, false)
                AND (coalesce(v_profile.vip_tier, '') = 'lifetime'
                     OR (v_profile.vip_expires_at IS NOT NULL
                         AND v_profile.vip_expires_at > clock_timestamp()));
        END IF;
        v_miss_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
        v_failure := jsonb_build_object(
            'success', true,
            'receiptId', v_existing.receipt_id,
            'sessionId', s.id,
            'questionId', v_existing.question_id,
            'storedDisplayIndex', -1,
            'outcome', 'skip',
            'paidSkipCount', v_count,
            'paidSkipLimit', 3,
            'diamondsCharged', v_existing.diamonds_charged,
            'newBalance', v_current_balance,
            'chargeBalanceAfter', v_existing.balance_after,
            'vip', v_existing.entitlement = 'vip',
            'entitlementWasVip', v_existing.entitlement = 'vip',
            'currentVipEligible', v_current_vip_eligible,
            'replayed', true,
            'newlyCharged', false
        );
        IF coalesce((v_miss_status ->> 'success')::boolean, false) IS TRUE THEN
            v_failure := v_failure || jsonb_build_object(
                'nonPaidMissCount', (v_miss_status ->> 'nonPaidMissCount')::integer,
                'terminalFailureCount', (v_miss_status ->> 'terminalFailureCount')::integer,
                'missLimit', (v_miss_status ->> 'missLimit')::integer,
                'runMissLimitReached', coalesce((v_miss_status ->> 'runMissLimitReached')::boolean, false));
        END IF;
        RETURN v_failure;
    END IF;

    IF s.status <> 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_closed');
    END IF;
    IF s.expires_at IS NOT NULL AND clock_timestamp() > s.expires_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_expired');
    END IF;
    v_position := array_position(s.question_ids, p_question_id);
    IF v_position IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session');
    END IF;
    SELECT count(*)::integer INTO v_count
      FROM public.trivia_paid_skip_receipts_v1 WHERE session_id = s.id;
    IF v_count >= 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_skip_limit_reached',
            'paidSkipCount', v_count, 'paidSkipLimit', 3);
    END IF;

    -- An ordinary -1 answer is not proof of payment: it could be a timeout or
    -- free skip. Only a question with no first answer can enter this authority.
    IF s.engine_version IS NOT NULL THEN
        SELECT * INTO a FROM public.trivia_session_answers
         WHERE session_id = s.id AND question_id = p_question_id FOR UPDATE;
        IF NOT FOUND OR a.position IS DISTINCT FROM v_position THEN
            RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session');
        END IF;
        IF a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'answer_already_recorded');
        END IF;
        SELECT prior.position, prior.question_id
          INTO v_expected_position, v_prior_question_id
          FROM public.trivia_session_answers prior
         WHERE prior.session_id = s.id
           AND prior.position < a.position
           AND prior.outcome IS NULL
           AND prior.server_voided_at IS NULL
         ORDER BY prior.position
         LIMIT 1;
    ELSIF coalesce(s.answers, '{}'::jsonb) ? p_question_id::text THEN
        RETURN jsonb_build_object('success', false, 'error', 'answer_already_recorded');
    ELSE
        SELECT position, s.question_ids[position]
          INTO v_expected_position, v_prior_question_id
          FROM generate_subscripts(s.question_ids, 1) position
         WHERE position < v_position
           AND NOT (coalesce(s.answers, '{}'::jsonb) ? s.question_ids[position]::text)
         ORDER BY position
         LIMIT 1;
    END IF;
    IF v_expected_position IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'position_out_of_order',
            'expectedPosition', v_expected_position,
            'priorQuestionId', v_prior_question_id,
            'paidSkipCount', v_count, 'paidSkipLimit', 3);
    END IF;

    v_miss_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
    IF coalesce((v_miss_status ->> 'success')::boolean, false) IS NOT TRUE THEN
        RETURN v_miss_status;
    END IF;
    IF coalesce((v_miss_status ->> 'runMissLimitReached')::boolean, false) IS TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'run_miss_limit_reached',
            'nonPaidMissCount', (v_miss_status ->> 'nonPaidMissCount')::integer,
            'terminalFailureCount', (v_miss_status ->> 'terminalFailureCount')::integer,
            'missLimit', (v_miss_status ->> 'missLimit')::integer,
            'runMissLimitReached', true,
            'paidSkipCount', v_count,
            'paidSkipLimit', 3
        );
    END IF;

    v_reference := 'spend:' || p_user_id::text || ':trivia_lifeline:'
        || s.id::text || ':' || p_question_id::text || ':skip';
    v_legacy_reference := 'trivia_lifeline:' || s.id::text || ':'
        || p_question_id::text || ':skip';
    -- Both possible wallet identities follow the canonical ledger-lock before
    -- profile-lock order. This also serializes adoption against an in-flight
    -- pre-cutover client still spending the historical raw reference.
    IF v_reference < v_legacy_reference THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('trivia_ledger:' || v_reference, 20260929));
        PERFORM pg_advisory_xact_lock(hashtextextended('trivia_ledger:' || v_legacy_reference, 20260929));
    ELSE
        PERFORM pg_advisory_xact_lock(hashtextextended('trivia_ledger:' || v_legacy_reference, 20260929));
        PERFORM pg_advisory_xact_lock(hashtextextended('trivia_ledger:' || v_reference, 20260929));
    END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
    v_current_vip_eligible := coalesce(v_profile.is_vip, false)
        AND (coalesce(v_profile.vip_tier, '') = 'lifetime'
             OR (v_profile.vip_expires_at IS NOT NULL
                 AND v_profile.vip_expires_at > clock_timestamp()));
    v_is_vip := v_current_vip_eligible;
    -- The nested block is a database subtransaction. Any post-debit binding
    -- failure raises PS001, which rolls the debit and answer back together.
    BEGIN
        -- Cutover adoption is entitlement-independent. A player who paid
        -- before deployment and became VIP before retry still receives a
        -- Diamond-backed receipt for that exact debit; current VIP status can
        -- only authorize a request for which no matching debit exists.
        SELECT * INTO v_canonical_transaction
          FROM public.diamond_transactions
         WHERE user_id = p_user_id AND reference_id = v_reference
         FOR SHARE;
        v_reference_existed := FOUND;
        SELECT * INTO v_legacy_transaction
          FROM public.diamond_transactions
         WHERE user_id = p_user_id AND reference_id = v_legacy_reference
         FOR SHARE;
        v_legacy_debit_adopted := FOUND;
        IF v_reference_existed AND v_legacy_debit_adopted THEN
            RETURN jsonb_build_object('success', false,
                'error', 'ambiguous_paid_skip_debit');
        ELSIF v_reference_existed THEN
            v_transaction := v_canonical_transaction;
            v_is_vip := false;
        ELSIF v_legacy_debit_adopted THEN
            v_transaction := v_legacy_transaction;
            v_is_vip := false;
        ELSIF NOT v_is_vip THEN
                PERFORM set_config('trivia.phase9_paid_skip_authority','on',true);
                v_spend := public.trivia_solo_spend_before_phase9_v1(
                    p_user_id,
                    5,
                    'Trivia Paid Skip',
                    'trivia_lifeline',
                    v_reference
                );
                PERFORM set_config('trivia.phase9_paid_skip_authority','',true);
                IF coalesce((v_spend ->> 'success')::boolean, false) IS NOT TRUE THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', CASE
                            WHEN lower(coalesce(v_spend ->> 'error', '')) LIKE '%insufficient%'
                                THEN 'insufficient_diamonds'
                            ELSE coalesce(v_spend ->> 'error', 'paid_skip_charge_failed')
                        END,
                        'paidSkipCount', v_count,
                        'paidSkipLimit', 3,
                        'newBalance', coalesce((v_spend ->> 'balance')::integer, v_profile.diamonds)
                    );
                END IF;
                IF (v_spend ->> 'charged')::integer IS DISTINCT FROM 5
                   OR v_spend ->> 'transaction_type' IS DISTINCT FROM 'trivia_lifeline'
                   OR v_spend ->> 'reference_id' IS DISTINCT FROM v_reference
                   OR v_spend ->> 'counterparty' IS DISTINCT FROM 'revenue:trivia_lifeline'
                   OR v_spend ->> 'issuance_class' IS DISTINCT FROM 'spend' THEN
                    v_failure := jsonb_build_object('success', false, 'error', 'invalid_charge_receipt');
                    RAISE EXCEPTION 'paid skip charge receipt failed validation' USING ERRCODE = 'PS001';
                END IF;
                SELECT * INTO v_transaction
                  FROM public.diamond_transactions
                 WHERE user_id = p_user_id AND reference_id = v_reference
                 FOR SHARE;
        END IF;
        IF NOT v_is_vip THEN
            IF v_transaction.id IS NULL
               OR v_transaction.amount IS DISTINCT FROM -5
               OR coalesce(v_transaction.transaction_type, v_transaction.type)
                    IS DISTINCT FROM 'trivia_lifeline'
               OR v_transaction.counterparty IS DISTINCT FROM 'revenue:trivia_lifeline'
               OR v_transaction.issuance_class IS DISTINCT FROM 'spend'
               OR v_transaction.balance_after IS NULL THEN
                v_failure := jsonb_build_object('success', false, 'error', 'invalid_charge_receipt');
                RAISE EXCEPTION 'paid skip durable charge proof is missing' USING ERRCODE = 'PS001';
            END IF;
        END IF;

        IF s.engine_version IS NOT NULL THEN
            v_answer := public.trivia_session_answer_before_phase9_v4(
                s.id, p_user_id, p_question_id, -1, p_client_nonce);
        ELSE
            v_answer := public.trivia_legacy_session_answer_before_phase9_v1(
                s.id, p_user_id, p_question_id, -1, p_client_nonce);
        END IF;
        IF coalesce((v_answer ->> 'success')::boolean, false) IS NOT TRUE
           OR coalesce((v_answer ->> 'storedDisplayIndex')::integer, 0) <> -1
           OR coalesce((v_answer ->> 'duplicate')::boolean, false)
           OR coalesce((v_answer ->> 'voided')::boolean, false)
           OR v_answer ->> 'outcome' = 'voided' THEN
            v_failure := jsonb_build_object('success', false,
                'error', CASE WHEN coalesce((v_answer ->> 'voided')::boolean, false)
                                   OR v_answer ->> 'outcome' = 'voided'
                              THEN 'question_unavailable'
                              ELSE coalesce(v_answer ->> 'error', 'paid_skip_binding_failed') END,
                'paidSkipCount', v_count,
                'paidSkipLimit', 3);
            RAISE EXCEPTION 'paid skip answer binding failed' USING ERRCODE = 'PS001';
        END IF;

        INSERT INTO public.trivia_paid_skip_receipts_v1 (
            session_id, user_id, question_id, position, paid_skip_ordinal,
            policy_version, policy_unit_cost, policy_session_limit,
            entitlement, diamonds_charged, spend_reference,
            wallet_transaction_id, balance_after, client_nonce
        ) VALUES (
            s.id, p_user_id, p_question_id, v_position, v_count + 1,
            'paid-skip@1', 5, 3,
            CASE WHEN v_is_vip THEN 'vip' ELSE 'diamonds' END,
            CASE WHEN v_is_vip THEN 0 ELSE 5 END,
            CASE WHEN v_is_vip THEN NULL ELSE v_transaction.reference_id END,
            CASE WHEN v_is_vip THEN NULL ELSE v_transaction.id END,
            CASE WHEN v_is_vip THEN coalesce(v_profile.diamonds, 0)
                 ELSE v_transaction.balance_after END,
            p_client_nonce
        )
        RETURNING * INTO v_receipt;

        v_miss_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
        IF coalesce((v_miss_status ->> 'success')::boolean, false) IS NOT TRUE THEN
            v_failure := v_miss_status;
            RAISE EXCEPTION 'paid skip terminal-state projection failed' USING ERRCODE = 'PS001';
        END IF;
    EXCEPTION WHEN SQLSTATE 'PS001' THEN
        RETURN v_failure;
    END;

    SELECT diamonds INTO v_current_balance FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN v_current_balance := v_receipt.balance_after; END IF;

    RETURN jsonb_build_object(
        'success', true,
        'receiptId', v_receipt.receipt_id,
        'sessionId', s.id,
        'questionId', p_question_id,
        'storedDisplayIndex', -1,
        'outcome', 'skip',
        'paidSkipCount', v_count + 1,
        'paidSkipLimit', 3,
        'nonPaidMissCount', (v_miss_status ->> 'nonPaidMissCount')::integer,
        'terminalFailureCount', (v_miss_status ->> 'terminalFailureCount')::integer,
        'missLimit', (v_miss_status ->> 'missLimit')::integer,
        'runMissLimitReached', coalesce((v_miss_status ->> 'runMissLimitReached')::boolean, false),
        'diamondsCharged', v_receipt.diamonds_charged,
        'newBalance', v_current_balance,
        'vip', v_is_vip,
        'entitlementWasVip', v_is_vip,
        'currentVipEligible', v_current_vip_eligible,
        'replayed', false,
        'newlyCharged', NOT v_is_vip
            AND NOT v_legacy_debit_adopted
            AND NOT v_reference_existed
            AND coalesce((v_spend ->> 'idempotent')::boolean, false) IS NOT TRUE
    );
END;
$body$;

CREATE OR REPLACE FUNCTION public.trivia_solo_answer_v1(
    p_session_id uuid,
    p_user_id uuid,
    p_question_id uuid,
    p_display_index integer,
    p_client_nonce uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    a public.trivia_session_answers%ROWTYPE;
    v_status jsonb;
    v_answer jsonb;
    v_position integer;
    v_expected_position integer;
    v_prior_question_id uuid;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL
       OR p_display_index IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;

    -- Duplicate requests replay before the run boundary. In particular, the
    -- third miss remains retryable while every genuinely new answer is closed.
    IF s.engine_version IS NOT NULL THEN
        SELECT * INTO a FROM public.trivia_session_answers
         WHERE session_id = s.id AND question_id = p_question_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session'); END IF;
        IF a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL THEN
            v_answer := public.trivia_session_answer_before_phase9_v4(
                s.id, p_user_id, p_question_id, p_display_index, p_client_nonce);
            IF s.mode NOT IN ('endless','survival') THEN RETURN v_answer; END IF;
            v_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
            IF coalesce((v_status ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_status; END IF;
            RETURN v_answer || jsonb_build_object(
                'nonPaidMissCount', (v_status ->> 'nonPaidMissCount')::integer,
                'terminalFailureCount', (v_status ->> 'terminalFailureCount')::integer,
                'missLimit', (v_status ->> 'missLimit')::integer,
                'runMissLimitReached', coalesce((v_status ->> 'runMissLimitReached')::boolean, false));
        END IF;
    ELSIF coalesce(s.answers, '{}'::jsonb) ? p_question_id::text THEN
        v_answer := public.trivia_legacy_session_answer_before_phase9_v1(
            s.id, p_user_id, p_question_id, p_display_index, p_client_nonce);
        IF s.mode NOT IN ('endless','survival') THEN RETURN v_answer; END IF;
        v_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
        IF coalesce((v_status ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_status; END IF;
        RETURN v_answer || jsonb_build_object(
            'nonPaidMissCount', (v_status ->> 'nonPaidMissCount')::integer,
            'terminalFailureCount', (v_status ->> 'terminalFailureCount')::integer,
            'missLimit', (v_status ->> 'missLimit')::integer,
            'runMissLimitReached', coalesce((v_status ->> 'runMissLimitReached')::boolean, false));
    END IF;

    -- Untimed Endless/Survival profiles have no authoritative per-question
    -- deadline. Therefore a missing earlier answer cannot honestly be
    -- synthesized as a timeout. Refuse later positions until the exact prior
    -- answer/timeout (-1) is durably bound; this makes lost timeout writes
    -- retryable instead of invisible to settlement authority.
    IF s.mode IN ('endless','survival') THEN
        IF s.engine_version IS NOT NULL THEN
            SELECT prior.position, prior.question_id
              INTO v_expected_position, v_prior_question_id
              FROM public.trivia_session_answers prior
             WHERE prior.session_id = s.id
               AND prior.position < a.position
               AND prior.outcome IS NULL
               AND prior.server_voided_at IS NULL
             ORDER BY prior.position
             LIMIT 1;
        ELSE
            v_position := array_position(s.question_ids, p_question_id);
            IF v_position IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'question_not_in_session');
            END IF;
            SELECT position, s.question_ids[position]
              INTO v_expected_position, v_prior_question_id
              FROM generate_subscripts(s.question_ids, 1) position
             WHERE position < v_position
               AND NOT (coalesce(s.answers, '{}'::jsonb) ? s.question_ids[position]::text)
             ORDER BY position
             LIMIT 1;
        END IF;
        IF v_expected_position IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'position_out_of_order',
                'expectedPosition', v_expected_position,
                'priorQuestionId', v_prior_question_id);
        END IF;
    END IF;

    IF s.mode IN ('endless','survival') THEN
        v_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
        IF coalesce((v_status ->> 'success')::boolean, false) IS NOT TRUE THEN
            RETURN v_status;
        END IF;
        -- The status pass can durably neutralize a newly invalid question.
        -- Replay that neutral result before applying the player-miss boundary.
        IF s.engine_version IS NOT NULL THEN
            SELECT * INTO a FROM public.trivia_session_answers
             WHERE session_id = s.id AND question_id = p_question_id FOR UPDATE;
            IF a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL THEN
                v_answer := public.trivia_session_answer_before_phase9_v4(
                    s.id, p_user_id, p_question_id, p_display_index, p_client_nonce);
                RETURN v_answer || jsonb_build_object(
                    'nonPaidMissCount', (v_status ->> 'nonPaidMissCount')::integer,
                    'terminalFailureCount', (v_status ->> 'terminalFailureCount')::integer,
                    'missLimit', (v_status ->> 'missLimit')::integer,
                    'runMissLimitReached', coalesce((v_status ->> 'runMissLimitReached')::boolean, false));
            END IF;
        ELSIF (SELECT answers FROM public.trivia_sessions WHERE id = s.id) ? p_question_id::text THEN
            v_answer := public.trivia_legacy_session_answer_before_phase9_v1(
                s.id, p_user_id, p_question_id, p_display_index, p_client_nonce);
            RETURN v_answer || jsonb_build_object(
                'nonPaidMissCount', (v_status ->> 'nonPaidMissCount')::integer,
                'terminalFailureCount', (v_status ->> 'terminalFailureCount')::integer,
                'missLimit', (v_status ->> 'missLimit')::integer,
                'runMissLimitReached', coalesce((v_status ->> 'runMissLimitReached')::boolean, false));
        END IF;
        IF coalesce((v_status ->> 'runMissLimitReached')::boolean, false) IS TRUE THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'run_miss_limit_reached',
                'nonPaidMissCount', (v_status ->> 'nonPaidMissCount')::integer,
                'terminalFailureCount', (v_status ->> 'terminalFailureCount')::integer,
                'missLimit', (v_status ->> 'missLimit')::integer,
                'runMissLimitReached', true
            );
        END IF;
    END IF;

    IF s.engine_version IS NOT NULL THEN
        v_answer := public.trivia_session_answer_before_phase9_v4(
            s.id, p_user_id, p_question_id, p_display_index, p_client_nonce);
    ELSE
        v_answer := public.trivia_legacy_session_answer_before_phase9_v1(
            s.id, p_user_id, p_question_id, p_display_index, p_client_nonce);
    END IF;
    IF s.mode NOT IN ('endless','survival') THEN
        RETURN v_answer;
    END IF;
    IF coalesce((v_answer ->> 'success')::boolean, false) IS NOT TRUE
       AND coalesce((v_answer ->> 'recorded')::boolean, false) IS NOT TRUE THEN
        RETURN v_answer;
    END IF;
    v_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
    IF coalesce((v_status ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_status; END IF;
    RETURN v_answer || jsonb_build_object(
        'nonPaidMissCount', (v_status ->> 'nonPaidMissCount')::integer,
        'terminalFailureCount', (v_status ->> 'terminalFailureCount')::integer,
        'missLimit', (v_status ->> 'missLimit')::integer,
        'runMissLimitReached', coalesce((v_status ->> 'runMissLimitReached')::boolean, false));
END;
$body$;

CREATE OR REPLACE FUNCTION public.trivia_endless_high_score_project_v1(
    p_session_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    r public.trivia_session_results%ROWTYPE;
    v_existing public.trivia_endless_high_score_projections_v1%ROWTYPE;
    v_correct integer;
    v_result_hash text;
    v_before integer := 0;
    v_after integer;
    v_improved boolean;
    v_achieved_at timestamptz;
    v_miss_status jsonb;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    IF s.mode <> 'endless' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_endless_session');
    END IF;
    IF s.status <> 'submitted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_submitted');
    END IF;
    v_miss_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
    IF coalesce((v_miss_status ->> 'success')::boolean, false) IS NOT TRUE THEN
        RETURN v_miss_status;
    END IF;
    IF coalesce((v_miss_status ->> 'overrun')::boolean, false) IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'run_miss_limit_reached',
            'nonPaidMissCount', (v_miss_status ->> 'nonPaidMissCount')::integer,
            'terminalFailureCount', (v_miss_status ->> 'terminalFailureCount')::integer,
            'missLimit', (v_miss_status ->> 'missLimit')::integer,
            'runMissLimitReached', true, 'overrun', true);
    END IF;

    IF s.engine_version IS NOT NULL THEN
        SELECT * INTO r FROM public.trivia_session_results WHERE session_id = s.id;
        IF NOT FOUND OR r.user_id IS DISTINCT FROM s.user_id
           OR r.mode IS DISTINCT FROM 'endless' OR r.outcome IS DISTINCT FROM 'submitted'
           OR r.correct IS DISTINCT FROM s.correct_count
           OR r.score IS DISTINCT FROM s.score OR r.correct < 0 OR r.result_hash IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'verified_result_unavailable');
        END IF;
        v_correct := r.correct;
        v_result_hash := r.result_hash;
        v_achieved_at := r.completed_at;
    ELSE
        IF s.score IS NULL OR s.score < 0 OR s.settlement_request_id IS NULL
           OR jsonb_typeof(s.settlement_result) IS DISTINCT FROM 'object'
           OR coalesce((s.settlement_result ->> 'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', 'verified_result_unavailable');
        END IF;
        IF s.correct_count IS NULL OR s.correct_count < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'verified_result_unavailable');
        END IF;
        v_correct := s.correct_count;
        v_result_hash := s.settlement_result ->> 'result_hash';
        v_achieved_at := coalesce(s.submitted_at, s.created_at);
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
        'trivia-endless-high-score:' || p_user_id::text || ':random', 0));

    SELECT * INTO v_existing
      FROM public.trivia_endless_high_score_projections_v1
     WHERE session_id = s.id;
    IF FOUND THEN
        SELECT high_score INTO v_after FROM public.endless_high_scores
         WHERE user_id = p_user_id AND mode = 'random';
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'projection_state_missing');
        END IF;
        RETURN jsonb_build_object('success', true, 'status', 'persisted',
            'sessionId', s.id, 'verifiedCorrect', v_existing.verified_correct,
            'highScore', v_after,
            'projectedHighScore', v_existing.projected_high_score,
            'improved', v_existing.improved,
            'replayed', true, 'projectionId', v_existing.projection_id);
    END IF;

    SELECT high_score INTO v_before FROM public.endless_high_scores
     WHERE user_id = p_user_id AND mode = 'random' FOR UPDATE;
    IF NOT FOUND THEN v_before := 0; END IF;
    v_improved := v_correct > v_before;

    INSERT INTO public.endless_high_scores AS hs
        (user_id, mode, high_score, achieved_at)
    VALUES (p_user_id, 'random', v_correct, v_achieved_at)
    ON CONFLICT (user_id, mode) DO UPDATE SET
        high_score = greatest(hs.high_score, EXCLUDED.high_score),
        achieved_at = CASE WHEN EXCLUDED.high_score > hs.high_score
                           THEN EXCLUDED.achieved_at ELSE hs.achieved_at END
    RETURNING high_score INTO v_after;

    INSERT INTO public.trivia_endless_high_score_projections_v1 (
        session_id, user_id, variant, verified_correct,
        previous_high_score, projected_high_score, improved, result_hash
    ) VALUES (
        s.id, p_user_id, 'random', v_correct,
        v_before, v_after, v_improved, v_result_hash
    )
    RETURNING * INTO v_existing;

    RETURN jsonb_build_object('success', true, 'status', 'persisted',
        'sessionId', s.id, 'verifiedCorrect', v_correct,
        'highScore', v_after, 'projectedHighScore', v_after, 'improved', v_improved,
        'replayed', false, 'projectionId', v_existing.projection_id);
END;
$body$;

CREATE OR REPLACE FUNCTION public.trivia_session_settle_solo_v5(
    p_session_id uuid,
    p_user_id uuid,
    p_diamonds integer,
    p_grade_basis jsonb,
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_status jsonb;
    v_settlement jsonb;
    v_projection jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;
    -- A committed settlement is an immutable financial receipt. Replay it
    -- before applying the new admission boundary: historical overrun evidence
    -- is ineligible for the leaderboard, but can never erase or mask the
    -- already-committed wallet result.
    IF s.status = 'submitted' THEN
        v_settlement := public.trivia_session_settle_solo_before_phase9_v4(
            p_session_id, p_user_id, p_diamonds, p_grade_basis, p_request_id);
        IF coalesce((v_settlement ->> 'success')::boolean, false) IS NOT TRUE THEN
            RETURN v_settlement;
        END IF;
        IF s.mode = 'endless' THEN
            v_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
            IF coalesce((v_status ->> 'success')::boolean, false) IS NOT TRUE THEN
                RETURN v_settlement || jsonb_build_object('highScoreProjection',
                    jsonb_build_object('status', 'pending',
                        'reason', 'boundary_status_unavailable',
                        'highScore', NULL, 'improved', false));
            ELSIF coalesce((v_status ->> 'overrun')::boolean, false) IS TRUE THEN
                RETURN v_settlement || jsonb_build_object('highScoreProjection',
                    jsonb_build_object('status', 'ineligible',
                        'reason', 'historical_run_boundary_overrun',
                        'highScore', NULL, 'improved', false));
            END IF;
            v_projection := public.trivia_endless_high_score_project_v1(s.id, p_user_id);
            IF coalesce((v_projection ->> 'success')::boolean, false) IS NOT TRUE
               OR v_projection ->> 'status' IS DISTINCT FROM 'persisted' THEN
                RETURN v_settlement || jsonb_build_object('highScoreProjection',
                    jsonb_build_object('status', 'pending',
                        'reason', 'projection_unavailable',
                        'highScore', NULL, 'improved', false));
            END IF;
            RETURN v_settlement || jsonb_build_object('highScoreProjection', v_projection);
        END IF;
        RETURN v_settlement;
    END IF;
    IF s.mode IN ('endless','survival') THEN
        v_status := public.trivia_solo_miss_status_v1(s.id, p_user_id);
        IF coalesce((v_status ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_status; END IF;
        IF coalesce((v_status ->> 'overrun')::boolean, false) IS TRUE THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'run_miss_limit_reached',
                'nonPaidMissCount', (v_status ->> 'nonPaidMissCount')::integer,
                'terminalFailureCount', (v_status ->> 'terminalFailureCount')::integer,
                'missLimit', (v_status ->> 'missLimit')::integer,
                'runMissLimitReached', true,
                'overrun', true
            );
        END IF;
    END IF;
    BEGIN
        v_settlement := public.trivia_session_settle_solo_before_phase9_v4(
            p_session_id, p_user_id, p_diamonds, p_grade_basis, p_request_id);
        IF coalesce((v_settlement ->> 'success')::boolean, false) IS NOT TRUE THEN
            RETURN v_settlement;
        END IF;
        IF s.mode = 'endless' THEN
            v_projection := public.trivia_endless_high_score_project_v1(s.id, p_user_id);
            IF coalesce((v_projection ->> 'success')::boolean, false) IS NOT TRUE
               OR v_projection ->> 'status' IS DISTINCT FROM 'persisted' THEN
                RAISE EXCEPTION 'atomic Endless projection failed: %',
                    coalesce(v_projection ->> 'error', 'invalid_projection_receipt')
                    USING ERRCODE = 'PS002';
            END IF;
            v_settlement := v_settlement || jsonb_build_object('highScoreProjection', v_projection);
        END IF;
    EXCEPTION WHEN SQLSTATE 'PS002' THEN
        RETURN jsonb_build_object('success', false, 'error', 'high_score_projection_failed',
            'highScoreProjection', jsonb_build_object('status', 'pending'));
    END;
    RETURN v_settlement;
END;
$body$;

CREATE OR REPLACE FUNCTION public.award_trivia_run_v5(
    p_session_id uuid,
    p_score integer,
    p_correct integer,
    p_total integer,
    p_answered integer,
    p_diamonds integer,
    p_completion_total integer,
    p_completion_answered integer,
    p_request_id uuid,
    p_settlement_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
DECLARE
    s public.trivia_sessions%ROWTYPE;
    v_status jsonb;
    v_award jsonb;
    v_finalization jsonb;
    v_projection jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'session_not_found'); END IF;
    -- Preserve a committed award before enforcing the new boundary. Invalid
    -- historical overruns replay their financial receipt but are explicitly
    -- ineligible for high-score projection.
    IF s.status = 'submitted' THEN
        v_award := public.award_trivia_run_before_phase9_v4(
            p_session_id, p_score, p_correct, p_total, p_answered, p_diamonds,
            p_completion_total, p_completion_answered, p_request_id, p_settlement_snapshot);
        IF coalesce((v_award ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_award; END IF;
        IF s.mode = 'endless' THEN
            v_status := public.trivia_solo_miss_status_v1(s.id, s.user_id);
            IF coalesce((v_status ->> 'success')::boolean, false) IS NOT TRUE THEN
                RETURN v_award || jsonb_build_object('highScoreProjection',
                    jsonb_build_object('status', 'pending',
                        'reason', 'boundary_status_unavailable',
                        'highScore', NULL, 'improved', false));
            ELSIF coalesce((v_status ->> 'overrun')::boolean, false) IS TRUE THEN
                RETURN v_award || jsonb_build_object('highScoreProjection',
                    jsonb_build_object('status', 'ineligible',
                        'reason', 'historical_run_boundary_overrun',
                        'highScore', NULL, 'improved', false));
            END IF;
            v_projection := public.trivia_endless_high_score_project_v1(s.id, s.user_id);
            IF coalesce((v_projection ->> 'success')::boolean, false) IS NOT TRUE
               OR v_projection ->> 'status' IS DISTINCT FROM 'persisted' THEN
                RETURN v_award || jsonb_build_object('highScoreProjection',
                    jsonb_build_object('status', 'pending',
                        'reason', 'projection_unavailable',
                        'highScore', NULL, 'improved', false));
            END IF;
            RETURN v_award || jsonb_build_object('highScoreProjection', v_projection);
        END IF;
        RETURN v_award;
    END IF;
    IF s.mode IN ('endless','survival') THEN
        v_status := public.trivia_solo_miss_status_v1(s.id, s.user_id);
        IF coalesce((v_status ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_status; END IF;
        IF coalesce((v_status ->> 'overrun')::boolean, false) IS TRUE THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'run_miss_limit_reached',
                'nonPaidMissCount', (v_status ->> 'nonPaidMissCount')::integer,
                'terminalFailureCount', (v_status ->> 'terminalFailureCount')::integer,
                'missLimit', (v_status ->> 'missLimit')::integer,
                'runMissLimitReached', true,
                'overrun', true
            );
        END IF;
    END IF;
    BEGIN
        v_award := public.award_trivia_run_before_phase9_v4(
            p_session_id, p_score, p_correct, p_total, p_answered, p_diamonds,
            p_completion_total, p_completion_answered, p_request_id, p_settlement_snapshot);
        IF coalesce((v_award ->> 'success')::boolean, false) IS NOT TRUE THEN RETURN v_award; END IF;
        IF s.mode = 'endless' THEN
            -- The hash-pinned Phase8 engine settlement calls the public award
            -- entry point before it finalizes trivia_session_results. After
            -- cutover that entry point routes through this wrapper, so seal the
            -- authoritative engine result before projecting it. The Phase8
            -- settlement's following finalizer call is idempotent and replays.
            IF s.engine_version IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_session_results WHERE session_id = s.id
               ) THEN
                v_finalization := public.trivia_p3_finalize_session_v4(
                    s.id, 'submitted', p_request_id);
                IF NOT EXISTS (
                    SELECT 1 FROM public.trivia_session_results WHERE session_id = s.id
                ) THEN
                    RAISE EXCEPTION 'atomic Endless result finalization failed: %',
                        coalesce(v_finalization ->> 'error', 'result_receipt_missing')
                        USING ERRCODE = 'PS003';
                END IF;
            END IF;
            v_projection := public.trivia_endless_high_score_project_v1(s.id, s.user_id);
            IF coalesce((v_projection ->> 'success')::boolean, false) IS NOT TRUE
               OR v_projection ->> 'status' IS DISTINCT FROM 'persisted' THEN
                RAISE EXCEPTION 'atomic Endless projection failed: %',
                    coalesce(v_projection ->> 'error', 'invalid_projection_receipt')
                    USING ERRCODE = 'PS002';
            END IF;
            v_award := v_award || jsonb_build_object('highScoreProjection', v_projection);
        END IF;
    EXCEPTION
        WHEN SQLSTATE 'PS002' THEN
            RETURN jsonb_build_object('success', false, 'error', 'high_score_projection_failed',
                'highScoreProjection', jsonb_build_object('status', 'pending'));
        WHEN SQLSTATE 'PS003' THEN
            RETURN jsonb_build_object('success', false, 'error', 'high_score_result_finalization_failed',
                'highScoreProjection', jsonb_build_object('status', 'pending'));
    END;
    RETURN v_award;
END;
$body$;

-- Backward-compatible DB-first cutover. The currently served API can keep
-- calling the old public names after this migration, but those names now
-- enforce the same Phase9 authority. The exact pre-Phase9 implementations are
-- owner-internal dependencies for the hardened wrappers only.

CREATE FUNCTION public.trivia_session_answer_v4(
    p_session_id uuid, p_user_id uuid, p_question_id uuid,
    p_display_index integer, p_client_nonce uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
    SELECT public.trivia_solo_answer_v1(
        p_session_id, p_user_id, p_question_id, p_display_index, p_client_nonce)
$body$;

CREATE FUNCTION public.trivia_legacy_session_answer_v1(
    p_session_id uuid, p_user_id uuid, p_question_id uuid,
    p_display_index integer, p_client_nonce uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
    SELECT public.trivia_solo_answer_v1(
        p_session_id, p_user_id, p_question_id, p_display_index, p_client_nonce)
$body$;

CREATE FUNCTION public.trivia_session_settle_solo_v4(
    p_session_id uuid, p_user_id uuid, p_diamonds integer,
    p_grade_basis jsonb, p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
    SELECT public.trivia_session_settle_solo_v5(
        p_session_id, p_user_id, p_diamonds, p_grade_basis, p_request_id)
$body$;

CREATE FUNCTION public.award_trivia_run_v4(
    p_session_id uuid, p_score integer, p_correct integer, p_total integer,
    p_answered integer, p_diamonds integer,
    p_completion_total integer, p_completion_answered integer, p_request_id uuid,
    p_settlement_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $body$
    SELECT public.award_trivia_run_v5(
        p_session_id, p_score, p_correct, p_total, p_answered, p_diamonds,
        p_completion_total, p_completion_answered, p_request_id, p_settlement_snapshot)
$body$;

ALTER TABLE public.trivia_paid_skip_receipts_v1 OWNER TO postgres;
ALTER TABLE public.trivia_endless_high_score_projections_v1 OWNER TO postgres;
ALTER TABLE public.trivia_endless_high_score_reconciliations_v1 OWNER TO postgres;
ALTER FUNCTION public.trivia_phase9_forbid_receipt_mutation_v1() OWNER TO postgres;
ALTER FUNCTION public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.trivia_solo_spend(uuid,integer,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.trivia_paid_skip_adopt_legacy_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_solo_miss_status_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_paid_skip_status_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_solo_answer_v1(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_endless_high_score_project_v1(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_settle_solo_v5(uuid,uuid,integer,jsonb,uuid) OWNER TO postgres;
ALTER FUNCTION public.award_trivia_run_v5(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_answer_before_phase9_v4(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_legacy_session_answer_before_phase9_v1(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_settle_solo_before_phase9_v4(uuid,uuid,integer,jsonb,uuid) OWNER TO postgres;
ALTER FUNCTION public.award_trivia_run_before_phase9_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid) OWNER TO postgres;
ALTER FUNCTION public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.trivia_phase9_forbid_receipt_mutation_v1(),
    public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text),
    public.trivia_solo_spend(uuid,integer,text,text,text),
    public.trivia_paid_skip_adopt_legacy_v1(uuid,uuid),
    public.trivia_solo_miss_status_v1(uuid,uuid),
    public.trivia_paid_skip_status_v1(uuid,uuid),
    public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid),
    public.trivia_solo_answer_v1(uuid,uuid,uuid,integer,uuid),
    public.trivia_endless_high_score_project_v1(uuid,uuid),
    public.trivia_session_settle_solo_v5(uuid,uuid,integer,jsonb,uuid),
    public.award_trivia_run_v5(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb),
    public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid),
    public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid),
    public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid),
    public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
FROM PUBLIC, anon, authenticated, service_role;
-- The unchanged implementations remain installed as owner-internal cutover
-- dependencies. Both the new and historical public names enforce Phase9.
REVOKE EXECUTE ON FUNCTION
    public.trivia_session_answer_before_phase9_v4(uuid,uuid,uuid,integer,uuid),
    public.trivia_legacy_session_answer_before_phase9_v1(uuid,uuid,uuid,integer,uuid),
    public.trivia_session_settle_solo_before_phase9_v4(uuid,uuid,integer,jsonb,uuid),
    public.award_trivia_run_before_phase9_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_paid_skip_status_v1(uuid,uuid),
    public.trivia_solo_spend(uuid,integer,text,text,text),
    public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid),
    public.trivia_solo_answer_v1(uuid,uuid,uuid,integer,uuid),
    public.trivia_endless_high_score_project_v1(uuid,uuid),
    public.trivia_session_settle_solo_v5(uuid,uuid,integer,jsonb,uuid),
    public.award_trivia_run_v5(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb),
    public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid),
    public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid),
    public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid),
    public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
TO service_role;

DO $postflight$
DECLARE
    v_definition text;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class
             WHERE oid = 'public.trivia_paid_skip_receipts_v1'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class
                WHERE oid = 'public.trivia_endless_high_score_projections_v1'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class
                WHERE oid = 'public.trivia_endless_high_score_reconciliations_v1'::regclass) THEN
        RAISE EXCEPTION 'phase9 authority postflight: receipt RLS is not enabled';
    END IF;
    IF (SELECT count(*) FROM pg_policy
         WHERE polname IN ('trivia_paid_skip_receipts_rpc_only',
                           'trivia_endless_projections_rpc_only',
                           'trivia_endless_reconciliations_rpc_only')
           AND polcmd='*' AND polpermissive IS FALSE
           AND polroles='{0}'::oid[]
           AND pg_get_expr(polqual,polrelid)='false'
           AND pg_get_expr(polwithcheck,polrelid)='false') <> 3 THEN
        RAISE EXCEPTION 'phase9 authority postflight: explicit deny-all RLS policy is incomplete';
    END IF;
    IF (SELECT count(*) FROM pg_indexes
         WHERE schemaname='public'
           AND indexname IN ('trivia_paid_skip_receipts_question_idx',
                             'trivia_paid_skip_receipts_wallet_transaction_idx',
                             'trivia_endless_high_score_reconciliations_evidence_session_idx')) <> 3 THEN
        RAISE EXCEPTION 'phase9 authority postflight: foreign-key support indexes are incomplete';
    END IF;
    IF has_table_privilege('anon', 'public.trivia_paid_skip_receipts_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.trivia_paid_skip_receipts_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', 'public.trivia_paid_skip_receipts_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('anon', 'public.trivia_endless_high_score_projections_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.trivia_endless_high_score_projections_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', 'public.trivia_endless_high_score_projections_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('anon', 'public.trivia_endless_high_score_reconciliations_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.trivia_endless_high_score_reconciliations_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', 'public.trivia_endless_high_score_reconciliations_v1', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'phase9 authority postflight: receipt table authority leaked';
    END IF;
    IF has_table_privilege('anon', 'public.endless_high_scores', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.endless_high_scores', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('service_role', 'public.endless_high_scores', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR NOT has_table_privilege('anon', 'public.endless_high_scores', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.endless_high_scores', 'SELECT') THEN
        RAISE EXCEPTION 'phase9 authority postflight: Endless table ACL is incorrect';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policy
         WHERE polrelid = 'public.endless_high_scores'::regclass
           AND polcmd IN ('a','w','d','*')
    ) THEN
        RAISE EXCEPTION 'phase9 authority postflight: browser Endless write policy remains';
    END IF;
    IF has_function_privilege('anon', 'public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_solo_spend(uuid,integer,text,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_solo_spend(uuid,integer,text,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_solo_spend_before_phase9_v1(uuid,integer,text,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_phase9_guard_lifeline_ledger_v1()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_phase9_guard_lifeline_ledger_v1()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_phase9_guard_lifeline_ledger_v1()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_paid_skip_adopt_legacy_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_paid_skip_adopt_legacy_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_paid_skip_adopt_legacy_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_paid_skip_status_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_paid_skip_status_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_solo_answer_v1(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_solo_answer_v1(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_endless_high_score_project_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_endless_high_score_project_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_session_settle_solo_v5(uuid,uuid,integer,jsonb,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_session_settle_solo_v5(uuid,uuid,integer,jsonb,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.award_trivia_run_v5(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.award_trivia_run_v5(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_solo_miss_status_v1(uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_session_answer_before_phase9_v4(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_legacy_session_answer_before_phase9_v1(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_session_settle_solo_before_phase9_v4(uuid,uuid,integer,jsonb,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.award_trivia_run_before_phase9_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_solo_spend(uuid,integer,text,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_paid_skip_status_v1(uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_solo_answer_v1(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_endless_high_score_project_v1(uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_session_settle_solo_v5(uuid,uuid,integer,jsonb,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.award_trivia_run_v5(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'phase9 authority postflight: RPC ACL is incorrect';
    END IF;
    SELECT pg_get_functiondef('public.trivia_solo_spend(uuid,integer,text,text,text)'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'paid_skip_requires_session_authority'
       OR v_definition !~ 'trivia_solo_spend_before_phase9_v1' THEN
        RAISE EXCEPTION 'phase9 authority postflight: generic paid-skip debit remains reachable';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid='public.diamond_transactions'::regclass
           AND tgname='trg_phase9_guard_lifeline_ledger'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'phase9 authority postflight: committed ledger guard is missing';
    END IF;
    IF (SELECT count(*) FROM pg_trigger
         WHERE NOT tgisinternal
           AND tgname IN ('trg_trivia_paid_skip_receipts_immutable',
                          'trg_trivia_endless_high_score_projections_immutable',
                          'trg_trivia_endless_high_score_reconciliations_immutable')) <> 3 THEN
        RAISE EXCEPTION 'phase9 authority postflight: immutable receipt triggers are missing';
    END IF;
    SELECT pg_get_functiondef('public.trivia_paid_skip_v1(uuid,uuid,uuid,uuid)'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'FOR UPDATE'
       OR v_definition !~ 'trivia_solo_spend_before_phase9_v1'
       OR v_definition !~ 'trivia.phase9_paid_skip_authority'
       OR v_definition !~ 'trivia_session_answer_before_phase9_v4'
       OR v_definition !~ 'trivia_legacy_session_answer_before_phase9_v1'
       OR v_definition !~ 'paid_skip_limit_reached' THEN
        RAISE EXCEPTION 'phase9 authority postflight: paid-skip choke is incomplete';
    END IF;
    SELECT pg_get_functiondef('public.trivia_solo_answer_v1(uuid,uuid,uuid,integer,uuid)'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'run_miss_limit_reached'
       OR v_definition !~ 'trivia_solo_miss_status_v1'
       OR v_definition !~ 'trivia_session_answer_before_phase9_v4'
       OR v_definition !~ 'trivia_legacy_session_answer_before_phase9_v1' THEN
        RAISE EXCEPTION 'phase9 authority postflight: answer boundary is incomplete';
    END IF;
    SELECT pg_get_functiondef('public.trivia_endless_high_score_project_v1(uuid,uuid)'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'trivia_session_results'
       OR v_definition !~ 'greatest\(hs.high_score, EXCLUDED.high_score\)'
       OR v_definition !~ 'pg_advisory_xact_lock' THEN
        RAISE EXCEPTION 'phase9 authority postflight: Endless projection choke is incomplete';
    END IF;
    SELECT pg_get_functiondef('public.trivia_session_settle_solo_v5(uuid,uuid,integer,jsonb,uuid)'::regprocedure)
      INTO v_definition;
    IF v_definition !~ 'run_miss_limit_reached'
       OR v_definition !~ 'trivia_session_settle_solo_before_phase9_v4'
       OR v_definition !~ 'trivia_endless_high_score_project_v1'
       OR v_definition !~ 'PS002' THEN
        RAISE EXCEPTION 'phase9 authority postflight: V5 settlement choke is incomplete';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.endless_high_scores h
        LEFT JOIN public.trivia_endless_high_score_reconciliations_v1 r
          ON r.user_id = h.user_id AND r.variant = h.mode
       WHERE h.mode = 'random'
         AND (r.reconciliation_id IS NULL
              OR r.action = 'deleted'
              OR r.projected_high_score IS DISTINCT FROM h.high_score)
    ) OR EXISTS (
        SELECT 1 FROM public.trivia_endless_high_score_reconciliations_v1 r
        LEFT JOIN public.endless_high_scores h
          ON h.user_id = r.user_id AND h.mode = r.variant
       WHERE (r.action = 'deleted' AND h.id IS NOT NULL)
          OR (r.action <> 'deleted' AND h.high_score IS DISTINCT FROM r.projected_high_score)
    ) THEN
        RAISE EXCEPTION 'phase9 authority postflight: historical Endless reconciliation is incomplete';
    END IF;
END;
$postflight$;

-- PostgREST caches function signatures.  Reload inside the same transaction
-- so the newly created compatibility and Phase9 RPCs are callable immediately
-- after commit instead of failing with a transient PGRST202.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- ROLLBACK (apply only through a NEW reviewed migration)
-- This is paste-executable only on an empty/no-evidence installation. The
-- migration is intentionally irreversible once reconciliation or operation
-- receipts exist because deleting that evidence would falsify history.
-- ============================================================================
-- BEGIN;
-- DO $$ BEGIN
--   RAISE EXCEPTION
--     'Phase9 solo authority is irreversible: historical board reconciliation and immutable financial/authority receipts must be retained';
-- END $$;
-- -- No destructive rollback statements intentionally follow this refusal.
-- -- A future reversal must be a new forward migration that preserves every
-- -- reconciliation, paid-skip and projection receipt and reloads PostgREST.
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
