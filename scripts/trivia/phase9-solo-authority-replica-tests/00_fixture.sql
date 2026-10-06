\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE FUNCTION public.test_q(p integer) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT ('20000000-0000-4000-8000-' || lpad(p::text, 12, '0'))::uuid $$;

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    username text,
    diamonds integer NOT NULL DEFAULT 0,
    is_vip boolean NOT NULL DEFAULT false,
    vip_tier text,
    vip_expires_at timestamptz
);
CREATE TABLE public.diamond_transactions (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    amount integer NOT NULL,
    transaction_type text,
    type text,
    description text,
    balance_after integer,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    reference_id text,
    counterparty text,
    issuance_class text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, reference_id)
);
CREATE TABLE public.trivia_questions (
    id uuid PRIMARY KEY,
    valid boolean NOT NULL DEFAULT true,
    audit_verified boolean NOT NULL DEFAULT true
);
CREATE TABLE public.trivia_question_revisions (
    id uuid PRIMARY KEY,
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id),
    correct_index integer NOT NULL DEFAULT 0,
    options jsonb NOT NULL DEFAULT '["A","B"]'::jsonb,
    structurally_valid boolean NOT NULL DEFAULT true,
    explanation text,
    engine_metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE public.trivia_question_quarantine (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id),
    released_at timestamptz
);
CREATE TABLE public.trivia_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    mode text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    submitted_at timestamptz,
    expires_at timestamptz,
    question_ids uuid[] NOT NULL,
    question_revision_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
    permutations jsonb NOT NULL DEFAULT '{}'::jsonb,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    engine_version text,
    rules_version_id text,
    survival_level integer,
    entry_state text DEFAULT 'charged',
    entry_cost integer DEFAULT 0,
    score integer,
    correct_count integer,
    diamonds_awarded integer DEFAULT 0,
    settlement_request_id uuid,
    settlement_result jsonb
);
CREATE TABLE public.trivia_session_answers (
    session_id uuid NOT NULL REFERENCES public.trivia_sessions(id),
    position integer NOT NULL,
    question_id uuid NOT NULL REFERENCES public.trivia_questions(id),
    revision_id uuid REFERENCES public.trivia_question_revisions(id),
    option_count integer NOT NULL DEFAULT 2,
    outcome text,
    server_voided_at timestamptz,
    server_void_reason text,
    display_index integer,
    original_index integer,
    is_correct boolean,
    sequence integer,
    client_nonce uuid,
    opened_at timestamptz,
    deadline_at timestamptz,
    answered_at timestamptz,
    actor_type text DEFAULT 'human',
    PRIMARY KEY (session_id, position),
    UNIQUE (session_id, question_id)
);
CREATE TABLE public.trivia_session_results (
    session_id uuid PRIMARY KEY REFERENCES public.trivia_sessions(id),
    user_id uuid NOT NULL,
    mode text NOT NULL,
    outcome text NOT NULL,
    score integer NOT NULL,
    correct integer NOT NULL,
    result_hash text NOT NULL,
    request_id uuid,
    completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.trivia_scores (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    mode text NOT NULL,
    score integer NOT NULL DEFAULT 0,
    correct_count integer NOT NULL DEFAULT 0,
    username text,
    total_questions integer,
    diamonds_earned integer DEFAULT 0,
    play_date date,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    session_id uuid REFERENCES public.trivia_sessions(id),
    server_verified boolean NOT NULL DEFAULT false,
    UNIQUE (session_id)
);
CREATE TABLE public.trivia_streaks (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    current_streak integer DEFAULT 0,
    best_streak integer DEFAULT 0,
    last_play_date date,
    total_games_played integer DEFAULT 0,
    total_correct integer DEFAULT 0,
    updated_at timestamptz
);
CREATE TABLE public.trivia_user_items (
    user_id uuid NOT NULL, item_type text NOT NULL, quantity integer NOT NULL DEFAULT 0,
    updated_at timestamptz, PRIMARY KEY(user_id,item_type)
);
CREATE TABLE public.trivia_item_transactions (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(), user_id uuid,item_type text,
    amount integer,balance_after integer,transaction_type text,reference_id text,metadata jsonb
);
CREATE TABLE public.trivia_session_reconciliations (
    session_id uuid,action text,reason text,actor text,UNIQUE(session_id,action,reason)
);
CREATE TABLE public.endless_high_scores (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    mode text NOT NULL DEFAULT 'random',
    high_score integer NOT NULL DEFAULT 0 CHECK (high_score >= 0),
    achieved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (user_id, mode)
);
ALTER TABLE public.endless_high_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY anyone_read_leaderboard ON public.endless_high_scores
    FOR SELECT USING (true);
CREATE POLICY users_insert_own_scores ON public.endless_high_scores
    FOR INSERT WITH CHECK (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY users_update_own_scores ON public.endless_high_scores
    FOR UPDATE USING (((SELECT auth.uid() AS uid) = user_id))
    WITH CHECK (((SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Service role manages endless high scores" ON public.endless_high_scores
    FOR ALL TO service_role
    USING (((SELECT auth.role()) = 'service_role'::text))
    WITH CHECK (((SELECT auth.role()) = 'service_role'::text));
GRANT SELECT ON public.endless_high_scores TO anon;
GRANT SELECT, INSERT, UPDATE ON public.endless_high_scores TO authenticated;
GRANT ALL ON public.endless_high_scores TO service_role;

CREATE OR REPLACE FUNCTION public.trivia_ledger_switch_enabled(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(current_setting('test.solo_shape',true),'off')='on'
$$;

CREATE OR REPLACE FUNCTION public.deduct_diamonds(
    p_user_id uuid,p_amount integer,p_description text DEFAULT '',
    p_transaction_type text DEFAULT 'game_cost',p_source text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb,p_reference_id text DEFAULT NULL,
    p_cooldown_seconds integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE v_balance integer;v_existing public.diamond_transactions%ROWTYPE;
        v_shape text:=coalesce(current_setting('test.solo_shape',true),'off');
BEGIN
  SELECT diamonds INTO v_balance FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  SELECT * INTO v_existing FROM public.diamond_transactions
   WHERE user_id=p_user_id AND reference_id=p_reference_id;
  IF FOUND THEN
    IF v_existing.amount<>-p_amount
       OR coalesce(v_existing.transaction_type,v_existing.type)<>p_transaction_type
       OR v_existing.counterparty<>'revenue:'||p_transaction_type
       OR v_existing.issuance_class<>'spend' THEN
      RETURN jsonb_build_object('success',false,'error','idempotency_conflict','balance',v_balance);
    END IF;
    RETURN jsonb_build_object('success',true,'balance',v_balance,'charged',p_amount,
      'transaction_type',p_transaction_type,'reference_id',p_reference_id,
      'counterparty','revenue:'||p_transaction_type,'issuance_class','spend',
      'idempotent',true,'replayed',true,'path',v_shape);
  END IF;
  IF v_balance<p_amount THEN
    RETURN jsonb_build_object('success',false,'error','Insufficient diamonds','balance',v_balance);
  END IF;
  UPDATE public.profiles SET diamonds=diamonds-p_amount WHERE id=p_user_id RETURNING diamonds INTO v_balance;
  INSERT INTO public.diamond_transactions(user_id,amount,transaction_type,type,description,balance_after,
      reference_id,counterparty,issuance_class)
  VALUES(p_user_id,-p_amount,p_transaction_type,p_transaction_type,p_description,v_balance,p_reference_id,
      'revenue:'||p_transaction_type,'spend');
  RETURN jsonb_build_object('success',true,'balance',v_balance,'charged',p_amount,
    'transaction_type',p_transaction_type,'reference_id',p_reference_id,
    'counterparty','revenue:'||p_transaction_type,'issuance_class','spend',
    'idempotent',false,'replayed',false,'path',v_shape);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_debit(
    p_idempotency_key text,p_user_id uuid,p_amount integer,p_wallet_kind text,
    p_description text,p_source_type text,p_source_id text,
    p_rules_version_id text DEFAULT NULL,p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.deduct_diamonds(p_user_id,p_amount,p_description,p_wallet_kind,NULL,
      p_context,p_idempotency_key,0)
$$;

CREATE OR REPLACE FUNCTION public.trivia_solo_wallet_receipt(p_result jsonb)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p_result
$$;

-- Exact installed Phase2 pre-image. The preceding 061400 migration pins its
-- pg_get_functiondef hash before replacing the canonical OID in place.
CREATE OR REPLACE FUNCTION public.trivia_solo_spend(p_user_id uuid, p_amount integer, p_description text,
  p_transaction_type text, p_reference_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE r jsonb; v_rules text; v_now integer; v_session uuid;
BEGIN
  IF NOT public.trivia_ledger_switch_enabled('solo_journal') OR p_transaction_type IS DISTINCT FROM 'trivia_lifeline' THEN
    RETURN public.deduct_diamonds(p_user_id, p_amount, p_description, p_transaction_type, NULL, '{}'::jsonb, p_reference_id, 0);
  END IF;
  IF p_reference_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'reference_id_required');
  END IF;
  BEGIN
    v_session := substring(p_reference_id FROM 'trivia_lifeline:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid;
  EXCEPTION WHEN OTHERS THEN v_session := NULL;
  END;
  SELECT s.rules_version_id INTO v_rules FROM public.trivia_sessions s WHERE s.id = v_session AND s.user_id = p_user_id;
  r := public.trivia_ledger_debit(p_reference_id, p_user_id, p_amount, 'trivia_lifeline', p_description,
                                  'trivia_lifeline', p_reference_id, v_rules);
  IF COALESCE((r ->> 'success')::boolean, false) AND NOT COALESCE((r ->> 'replayed')::boolean, false) THEN
    r := public.trivia_solo_wallet_receipt(r);
    IF r IS NULL OR COALESCE((r ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'trivia ledger: platform receipt missing for a lifeline spend' USING ERRCODE = 'TL003';
    END IF;
    RETURN r;
  END IF;
  IF COALESCE((r ->> 'replayed')::boolean, false) OR r ->> 'error' = 'reference_already_used_outside_ledger' THEN
    RETURN public.deduct_diamonds(p_user_id, p_amount, p_description, p_transaction_type, NULL, '{}'::jsonb, p_reference_id, 0);
  END IF;
  SELECT diamonds INTO v_now FROM public.profiles WHERE id = p_user_id;
  IF r ->> 'error' = 'insufficient_funds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_now);
  END IF;
  IF r ->> 'error' = 'idempotency_conflict' THEN
    RETURN jsonb_build_object('success', false, 'error', 'idempotency_conflict', 'balance', v_now, 'reference_id', p_reference_id);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', COALESCE(r ->> 'error', 'ledger_error'), 'balance', v_now);
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_p8_lock_and_void_session_questions_v1(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE v_sequence integer;
BEGIN
    SELECT coalesce(max(sequence),0) INTO v_sequence FROM public.trivia_session_answers WHERE session_id=p_session_id;
    WITH invalid AS (
        SELECT a.position,row_number() OVER(ORDER BY a.position) n
          FROM public.trivia_session_answers a JOIN public.trivia_questions q ON q.id=a.question_id
         WHERE a.session_id=p_session_id AND a.outcome IS NULL AND a.server_voided_at IS NULL
           AND (NOT q.valid OR NOT q.audit_verified)
    )
    UPDATE public.trivia_session_answers a
       SET outcome='skip',display_index=-1,original_index=NULL,is_correct=false,
           sequence=v_sequence+invalid.n,answered_at=clock_timestamp(),
           server_voided_at=clock_timestamp(),server_void_reason='audit'
      FROM invalid WHERE a.session_id=p_session_id AND a.position=invalid.position;
    RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_p8_legacy_grade_locked_v1(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; q record;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session_not_found'); END IF;
    FOR q IN SELECT x.question_id,x.ordinality::integer position
               FROM unnest(s.question_ids) WITH ORDINALITY x(question_id,ordinality)
              WHERE NOT(coalesce(s.answers,'{}'::jsonb)?x.question_id::text)
                AND EXISTS(SELECT 1 FROM public.trivia_questions live
                            WHERE live.id=x.question_id AND (NOT live.valid OR NOT live.audit_verified))
    LOOP
        s.answers:=s.answers||jsonb_build_object(q.question_id::text,
            jsonb_build_object('d',-1,'n',q.position-1,'at',clock_timestamp(),'v',true,'vr','audit'));
    END LOOP;
    UPDATE public.trivia_sessions SET answers=s.answers WHERE id=s.id;
    RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_session_answer_v4(
    p_session_id uuid,p_user_id uuid,p_question_id uuid,p_display_index integer,p_client_nonce uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; a public.trivia_session_answers%ROWTYPE;
        v_sequence integer; v_original integer; v_correct boolean; v_valid boolean;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success',false,'error','not_your_session'); END IF;
    SELECT * INTO a FROM public.trivia_session_answers
     WHERE session_id=p_session_id AND question_id=p_question_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','question_not_in_session'); END IF;
    IF a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL THEN
        RETURN jsonb_build_object('success',true,'recorded',true,'duplicate',true,
            'position',a.position,'sequence',a.sequence,'storedDisplayIndex',coalesce(a.display_index,-1),
            'outcome',CASE WHEN a.server_voided_at IS NOT NULL THEN 'voided' ELSE a.outcome END,
            'voided',a.server_voided_at IS NOT NULL);
    END IF;
    SELECT valid AND audit_verified INTO v_valid FROM public.trivia_questions WHERE id=p_question_id;
    IF NOT coalesce(v_valid,false) THEN
        UPDATE public.trivia_session_answers SET outcome='skip',display_index=-1,is_correct=false,
            answered_at=clock_timestamp(),sequence=a.position,server_voided_at=clock_timestamp(),
            server_void_reason='audit' WHERE session_id=p_session_id AND question_id=p_question_id;
        RETURN jsonb_build_object('success',true,'recorded',true,'duplicate',false,
            'position',a.position,'sequence',a.position,'storedDisplayIndex',-1,'outcome','voided','voided',true);
    END IF;
    SELECT coalesce(max(sequence),0)+1 INTO v_sequence FROM public.trivia_session_answers
     WHERE session_id=p_session_id;
    v_original:=CASE WHEN p_display_index>=0
        THEN (s.permutations->p_question_id::text->>p_display_index)::integer END;
    SELECT v_original=r.correct_index INTO v_correct FROM public.trivia_question_revisions r WHERE r.id=a.revision_id;
    UPDATE public.trivia_session_answers
       SET outcome=CASE WHEN p_display_index=-1 THEN 'skip' WHEN v_correct THEN 'correct' ELSE 'wrong' END,
           display_index=p_display_index,original_index=v_original,is_correct=coalesce(v_correct,false),
           answered_at=clock_timestamp(),sequence=v_sequence,client_nonce=p_client_nonce
     WHERE session_id=p_session_id AND question_id=p_question_id;
    RETURN jsonb_build_object('success',true,'recorded',true,'duplicate',false,
        'position',a.position,'sequence',v_sequence,'storedDisplayIndex',p_display_index,
        'outcome',CASE WHEN p_display_index=-1 THEN 'skip' WHEN v_correct THEN 'correct' ELSE 'wrong' END,
        'wasCorrect',coalesce(v_correct,false),'correctDisplayIndex',0);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_legacy_session_answer_v1(
    p_session_id uuid,p_user_id uuid,p_question_id uuid,p_display_index integer,p_client_nonce uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_position integer; v_sequence integer; v_stored jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success',false,'error','not_your_session'); END IF;
    v_position:=array_position(s.question_ids,p_question_id);
    IF v_position IS NULL THEN RETURN jsonb_build_object('success',false,'error','question_not_in_session'); END IF;
    v_stored:=s.answers->p_question_id::text;
    IF v_stored IS NOT NULL THEN
        RETURN jsonb_build_object('success',true,'recorded',true,'duplicate',true,'fresh',false,
            'storedDisplayIndex',(v_stored->>'d')::integer,'stored',v_stored,
            'outcome',CASE WHEN v_stored->'v'='true'::jsonb THEN 'voided' ELSE 'recorded' END,
            'voided',v_stored->'v'='true'::jsonb);
    END IF;
    SELECT count(*)::integer INTO v_sequence FROM jsonb_object_keys(s.answers);
    v_stored:=jsonb_build_object('d',p_display_index,'n',v_sequence,'at',clock_timestamp());
    UPDATE public.trivia_sessions SET answers=answers||jsonb_build_object(p_question_id::text,v_stored) WHERE id=p_session_id;
    RETURN jsonb_build_object('success',true,'recorded',true,'duplicate',false,'fresh',true,
        'storedDisplayIndex',p_display_index,'stored',v_stored,'outcome','recorded');
END $$;

CREATE OR REPLACE FUNCTION public.trivia_session_settle_solo_v4(
    p_session_id uuid,p_user_id uuid,p_diamonds integer,p_grade_basis jsonb,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_result jsonb; v_correct integer; v_score integer;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session_not_found'); END IF;
    IF s.user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('success',false,'error','not_your_session'); END IF;
    IF s.status='submitted' THEN
        RETURN coalesce(s.settlement_result,'{}'::jsonb)||jsonb_build_object('success',true,'replayed',true);
    END IF;
    v_correct:=coalesce((p_grade_basis->>'correct')::integer,0);
    v_score:=coalesce((p_grade_basis->>'score')::integer,v_correct*200);
    v_result:=jsonb_build_object('success',true,'session_id',s.id,'correct',v_correct,'correct_count',v_correct,
        'score',v_score,'graded_total',coalesce((p_grade_basis->>'graded_total')::integer,cardinality(s.question_ids)),
        'voided',0,'diamonds_awarded',greatest(0,p_diamonds),
        'new_balance',(SELECT diamonds FROM public.profiles WHERE id=s.user_id),
        'result_hash',repeat('f',64),'replayed',false,'per_question','[]'::jsonb);
    UPDATE public.trivia_sessions SET status='submitted',submitted_at=clock_timestamp(),score=v_score,
        correct_count=v_correct,diamonds_awarded=greatest(0,p_diamonds),settlement_request_id=p_request_id,
        settlement_result=v_result WHERE id=s.id;
    INSERT INTO public.trivia_session_results(session_id,user_id,mode,outcome,score,correct,result_hash,request_id)
    VALUES(s.id,s.user_id,s.mode,'submitted',v_score,v_correct,repeat('f',64),p_request_id)
    ON CONFLICT(session_id) DO NOTHING;
    INSERT INTO public.trivia_scores(user_id,mode,score,correct_count,session_id,server_verified)
    VALUES(s.user_id,s.mode,v_score,v_correct,s.id,true) ON CONFLICT(session_id) DO NOTHING;
    RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.award_trivia_run_v4(
    p_session_id uuid,p_score integer,p_correct integer,p_total integer,p_answered integer,
    p_diamonds integer,p_completion_total integer,p_completion_answered integer,p_request_id uuid,
    p_settlement_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; v_result jsonb;
BEGIN
    SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session_not_found'); END IF;
    IF s.status='submitted' THEN
        RETURN coalesce(s.settlement_result,'{}'::jsonb)||jsonb_build_object('success',true,'replayed',true);
    END IF;
    v_result:=jsonb_build_object('success',true,'session_id',s.id,'score',p_score,'correct_count',p_correct,
        'diamonds_awarded',greatest(0,p_diamonds),
        'new_balance',(SELECT diamonds FROM public.profiles WHERE id=s.user_id),
        'result_hash',repeat('e',64),'replayed',false,'api_response_v1',coalesce(p_settlement_snapshot,'{}'::jsonb));
    UPDATE public.trivia_sessions SET status='submitted',submitted_at=clock_timestamp(),score=p_score,
        correct_count=p_correct,diamonds_awarded=greatest(0,p_diamonds),settlement_request_id=p_request_id,
        settlement_result=v_result WHERE id=s.id;
    INSERT INTO public.trivia_scores(user_id,mode,score,correct_count,session_id,server_verified)
    VALUES(s.user_id,s.mode,p_score,p_correct,s.id,true) ON CONFLICT(session_id) DO NOTHING;
    RETURN v_result;
END $$;

-- Dependencies used by the exact production predecessor bodies loaded by the
-- runner immediately after this fixture. They model only the bounded facts
-- needed by this authority replica; the four hash-pinned predecessors and the
-- legacy grading dependency loaded over its seed stub remain byte-identical to
-- repository source.
CREATE OR REPLACE FUNCTION public.trivia_record_invalid_question_v1(
 p_session_id uuid,p_user_id uuid,p_question_id uuid,p_client_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; a public.trivia_session_answers%ROWTYPE; v_valid boolean;
BEGIN
 SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
 SELECT * INTO a FROM public.trivia_session_answers WHERE session_id=p_session_id AND question_id=p_question_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','question_not_in_session'); END IF;
 IF a.outcome IS NOT NULL OR a.server_voided_at IS NOT NULL THEN
   RETURN jsonb_build_object('success',false,'error','answer_already_recorded');
 END IF;
 SELECT valid AND audit_verified INTO v_valid FROM public.trivia_questions WHERE id=p_question_id;
 IF coalesce(v_valid,false) THEN RETURN jsonb_build_object('success',false,'error','question_still_valid'); END IF;
 UPDATE public.trivia_session_answers SET outcome='skip',display_index=-1,is_correct=false,
  answered_at=clock_timestamp(),sequence=a.position,client_nonce=p_client_nonce,
  server_voided_at=clock_timestamp(),server_void_reason='audit'
 WHERE session_id=p_session_id AND question_id=p_question_id;
 RETURN jsonb_build_object('success',true,'recorded',true,'duplicate',false,
  'storedDisplayIndex',-1,'outcome','voided','voided',true);
END $$;

CREATE OR REPLACE FUNCTION public.trivia_session_answer_v3(
 p_session_id uuid,p_user_id uuid,p_question_id uuid,p_display_index integer,p_client_nonce uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE; a public.trivia_session_answers%ROWTYPE;
 v_sequence integer; v_original integer; v_correct boolean;
BEGIN
 SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session_not_found'); END IF;
 SELECT * INTO a FROM public.trivia_session_answers WHERE session_id=p_session_id AND question_id=p_question_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','question_not_in_session'); END IF;
 IF a.outcome IS NOT NULL THEN RETURN jsonb_build_object('success',true,'recorded',true,'duplicate',true,
  'position',a.position,'sequence',a.sequence,'storedDisplayIndex',a.display_index,'outcome',a.outcome,
  'wasCorrect',coalesce(a.is_correct,false),'correctDisplayIndex',0); END IF;
 v_original:=CASE WHEN p_display_index>=0 THEN (s.permutations->p_question_id::text->>p_display_index)::integer END;
 SELECT v_original=r.correct_index INTO v_correct FROM public.trivia_question_revisions r WHERE r.id=a.revision_id;
 SELECT coalesce(max(sequence),0)+1 INTO v_sequence FROM public.trivia_session_answers WHERE session_id=p_session_id;
 UPDATE public.trivia_session_answers SET display_index=p_display_index,original_index=v_original,
  is_correct=coalesce(v_correct,false),outcome=CASE WHEN p_display_index=-1 THEN 'skip' WHEN v_correct THEN 'correct' ELSE 'wrong' END,
  sequence=v_sequence,answered_at=clock_timestamp(),client_nonce=p_client_nonce
 WHERE session_id=p_session_id AND question_id=p_question_id;
 RETURN jsonb_build_object('success',true,'recorded',true,'duplicate',false,'position',a.position,
  'sequence',v_sequence,'storedDisplayIndex',p_display_index,
  'outcome',CASE WHEN p_display_index=-1 THEN 'skip' WHEN v_correct THEN 'correct' ELSE 'wrong' END,
  'wasCorrect',coalesce(v_correct,false),'correctDisplayIndex',0);
END $$;
CREATE FUNCTION public.trivia_project_engine_metadata_v1(jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT '{}'::jsonb $$;

CREATE OR REPLACE FUNCTION public.trivia_p3_grade(p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_total integer;v_answered integer;v_correct integer;v_voided integer;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE outcome IS NOT NULL OR server_voided_at IS NOT NULL),
        count(*) FILTER(WHERE is_correct),count(*) FILTER(WHERE server_voided_at IS NOT NULL)
 INTO v_total,v_answered,v_correct,v_voided FROM public.trivia_session_answers WHERE session_id=p_session_id;
 RETURN jsonb_build_object('success',true,'total',v_total,'graded_total',v_total-v_voided,
  'answered',v_answered-v_voided,'correct',v_correct,'voided',v_voided,'score',v_correct*200,
  'answer_time_ms_total',0,'sequence','[]'::jsonb,'per_question','[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.award_trivia_run(
 p_session_id uuid,p_score integer,p_correct integer,p_total integer,p_diamonds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE;v_balance integer;
BEGIN
 SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
 IF s.status='submitted' THEN RETURN coalesce(s.settlement_result,'{}')||jsonb_build_object('success',true,'replayed',true); END IF;
 UPDATE public.profiles SET diamonds=diamonds+greatest(p_diamonds,0) WHERE id=s.user_id RETURNING diamonds INTO v_balance;
 UPDATE public.trivia_sessions SET status='submitted',submitted_at=clock_timestamp(),score=p_score,
  correct_count=p_correct,diamonds_awarded=greatest(p_diamonds,0) WHERE id=p_session_id;
 RETURN jsonb_build_object('success',true,'session_id',p_session_id,'score',p_score,
  'correct_count',p_correct,'diamonds_awarded',greatest(p_diamonds,0),'new_balance',v_balance);
END $$;
CREATE OR REPLACE FUNCTION public.trivia_solo_credit(uuid,integer,text,text,text,text,text,text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('success',false,'error','not_used') $$;
CREATE OR REPLACE FUNCTION public.trivia_p3_finalize_session_v4(p_session_id uuid,p_outcome text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions,pg_temp AS $$
DECLARE s public.trivia_sessions%ROWTYPE;g jsonb;r public.trivia_session_results%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.trivia_sessions WHERE id=p_session_id;
 SELECT * INTO r FROM public.trivia_session_results WHERE session_id=p_session_id;
 IF FOUND THEN RETURN to_jsonb(r)||jsonb_build_object('replayed',true); END IF;
 g:=public.trivia_p3_grade(p_session_id);
 INSERT INTO public.trivia_session_results(session_id,user_id,mode,outcome,score,correct,result_hash,request_id)
 VALUES(s.id,s.user_id,s.mode,p_outcome,(g->>'score')::integer,(g->>'correct')::integer,repeat('a',64),p_request_id)
 RETURNING * INTO r;
 RETURN to_jsonb(r)||jsonb_build_object('replayed',false);
END $$;
CREATE OR REPLACE FUNCTION public.trivia_p3_result_receipt(p_r jsonb,p_status text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('success',true,
 'replayed',coalesce((p_r->>'replayed')::boolean,false),'session_id',p_r->'session_id',
 'correct',p_r->'correct','score',p_r->'score','result_hash',p_r->'result_hash','status',p_status) $$;
CREATE OR REPLACE FUNCTION public.trivia_p3_solo_review(uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$ SELECT '[]'::jsonb $$;

REVOKE ALL ON FUNCTION public.trivia_solo_spend(uuid,integer,text,text,text),
    public.trivia_p8_lock_and_void_session_questions_v1(uuid),
    public.trivia_p8_legacy_grade_locked_v1(uuid),
    public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid),
    public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid),
    public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid),
    public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_solo_spend(uuid,integer,text,text,text),
    public.trivia_p8_lock_and_void_session_questions_v1(uuid),
    public.trivia_p8_legacy_grade_locked_v1(uuid),
    public.trivia_session_answer_v4(uuid,uuid,uuid,integer,uuid),
    public.trivia_legacy_session_answer_v1(uuid,uuid,uuid,integer,uuid),
    public.trivia_session_settle_solo_v4(uuid,uuid,integer,jsonb,uuid),
    public.award_trivia_run_v4(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb)
TO service_role;

INSERT INTO auth.users(id)
SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,30)i;
INSERT INTO public.profiles(id,diamonds,is_vip,vip_tier)
SELECT id,100,false,NULL FROM auth.users;
UPDATE public.profiles SET diamonds=3 WHERE id='10000000-0000-4000-8000-000000000005';
UPDATE public.profiles SET diamonds=33,is_vip=true,vip_tier='lifetime'
 WHERE id='10000000-0000-4000-8000-000000000002';

INSERT INTO public.trivia_questions(id,valid,audit_verified)
SELECT public.test_q(i),i NOT IN(9,19),i NOT IN(9,19) FROM generate_series(1,240)i;
INSERT INTO public.trivia_question_revisions(id,question_id,correct_index)
SELECT ('21000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,public.test_q(i),0
FROM generate_series(1,240)i;

CREATE FUNCTION public.fixture_bind_session(
 p_id uuid,p_user uuid,p_mode text,p_questions uuid[],p_engine boolean DEFAULT true,p_level integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE q uuid; rev uuid; revmap jsonb:='{}'; perms jsonb:='{}';
BEGIN
 FOREACH q IN ARRAY p_questions LOOP
   SELECT id INTO rev FROM public.trivia_question_revisions WHERE question_id=q;
   revmap:=revmap||jsonb_build_object(q::text,rev);
   perms:=perms||jsonb_build_object(q::text,jsonb_build_array(0,1));
 END LOOP;
 INSERT INTO public.trivia_sessions(id,user_id,mode,status,expires_at,question_ids,
   question_revision_ids,permutations,engine_version,survival_level)
 VALUES(p_id,p_user,p_mode,'open',now()+interval '1 hour',p_questions,revmap,perms,
        CASE WHEN p_engine THEN 'trivia-engine/3' END,p_level);
 IF p_engine THEN
   INSERT INTO public.trivia_session_answers(session_id,position,question_id,revision_id,option_count)
   SELECT p_id,x.ord,x.question_id,r.id,2 FROM unnest(p_questions) WITH ORDINALITY x(question_id,ord)
   JOIN public.trivia_question_revisions r ON r.question_id=x.question_id;
 END IF;
END $$;

-- Historical verified Endless evidence present before reconciliation.
INSERT INTO public.trivia_sessions(id,user_id,mode,status,created_at,submitted_at,expires_at,question_ids,
 question_revision_ids,permutations,engine_version,score,correct_count,settlement_request_id,settlement_result)
VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000009','endless','submitted',now()-interval '1 hour',now()-interval '1 minute',now(),ARRAY(SELECT public.test_q(i) FROM generate_series(118,124)i),'{}','{}','trivia-engine/3',1400,7,extensions.gen_random_uuid(),'{"success":true}'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000011','endless','submitted',now()-interval '1 hour',now()-interval '1 minute',now(),ARRAY(SELECT public.test_q(i) FROM generate_series(142,147)i),'{}','{}','trivia-engine/3',1200,6,extensions.gen_random_uuid(),'{"success":true}'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000012','endless','submitted',now()-interval '1 hour',now()-interval '1 minute',now(),ARRAY(SELECT public.test_q(i) FROM generate_series(148,152)i),'{}','{}','trivia-engine/3',1000,5,extensions.gen_random_uuid(),'{"success":true}'),
 ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000012','endless','submitted',now()-interval '1 hour',now()-interval '1 minute',now(),ARRAY[public.test_q(104),public.test_q(105),public.test_q(106),public.test_q(107)],'{}','{}','trivia-engine/3',200,1,extensions.gen_random_uuid(),'{"success":true,"score":200,"correct_count":1}'),
 ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000018','endless','submitted',now()-interval '1 hour',now()-interval '1 minute',now(),ARRAY[public.test_q(108),public.test_q(109),public.test_q(110),public.test_q(111)],'{}','{}','trivia-engine/3',0,0,extensions.gen_random_uuid(),'{"success":true}'),
 ('40000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000019','endless','submitted',now()-interval '1 hour',now()-interval '1 minute',now(),ARRAY[public.test_q(112),public.test_q(113),public.test_q(114),public.test_q(115)],'{}','{}',NULL,0,0,extensions.gen_random_uuid(),'{"success":true}'),
 ('40000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000009','endless','submitted',now()-interval '1 hour',now()-interval '1 minute',now(),ARRAY(SELECT public.test_q(i) FROM generate_series(125,132)i),'{}','{}','trivia-engine/3',1600,8,extensions.gen_random_uuid(),'{"success":true}'),
 ('40000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000009','endless','submitted',now()-interval '1 hour',now()-interval '1 minute',now(),ARRAY(SELECT public.test_q(i) FROM generate_series(133,141)i),'{}','{}','trivia-engine/3',1800,9,extensions.gen_random_uuid(),'{"success":true}');

INSERT INTO public.trivia_session_answers(session_id,position,question_id,revision_id,option_count)
SELECT s.id,q.ord,q.question_id,r.id,2 FROM public.trivia_sessions s
CROSS JOIN LATERAL unnest(s.question_ids) WITH ORDINALITY q(question_id,ord)
JOIN public.trivia_question_revisions r ON r.question_id=q.question_id
WHERE s.engine_version IS NOT NULL;
UPDATE public.trivia_session_answers
   SET outcome='correct',display_index=0,original_index=0,is_correct=true,
       answered_at=clock_timestamp()+position*interval '1 second',sequence=position
 WHERE session_id IN (
   '40000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003',
   '40000000-0000-4000-8000-000000000007',
   '40000000-0000-4000-8000-000000000008');
UPDATE public.trivia_session_answers SET outcome=CASE WHEN position<=3 THEN 'wrong' ELSE 'correct' END,
 display_index=CASE WHEN position<=3 THEN 1 ELSE 0 END,is_correct=position>3,
 answered_at=clock_timestamp()+position*interval '1 second',sequence=position
WHERE session_id='40000000-0000-4000-8000-000000000004';
-- Real pre-Phase9 paid skips were ledger-only: the client charged, advanced,
-- and never bound -1. The three later misses have authoritative engine
-- sequence 1..3 even though their timestamps are deliberately inverted.
UPDATE public.trivia_session_answers SET outcome='wrong',display_index=1,is_correct=false,
 answered_at=CASE position WHEN 2 THEN clock_timestamp()+interval '30 seconds'
                           WHEN 3 THEN clock_timestamp()+interval '10 seconds'
                           ELSE clock_timestamp()+interval '20 seconds' END,
 sequence=position-1
WHERE session_id='40000000-0000-4000-8000-000000000005' AND position>1;

UPDATE public.trivia_sessions s SET
 question_revision_ids=(SELECT jsonb_object_agg(q.question_id::text,r.id)
   FROM unnest(s.question_ids) q(question_id)
   JOIN public.trivia_question_revisions r ON r.question_id=q.question_id),
 permutations=(SELECT jsonb_object_agg(q.question_id::text,jsonb_build_array(0,1))
   FROM unnest(s.question_ids) q(question_id)),
 answers=jsonb_build_object(
   public.test_q(113)::text,jsonb_build_object('d',1,'n',0,'at',now()-interval '20 minutes'),
   public.test_q(114)::text,jsonb_build_object('d',1,'n',1,'at',now()-interval '19 minutes'),
   public.test_q(115)::text,jsonb_build_object('d',1,'n',2,'at',now()-interval '18 minutes'))
WHERE s.id='40000000-0000-4000-8000-000000000006';

INSERT INTO public.trivia_session_results(session_id,user_id,mode,outcome,score,correct,result_hash)
SELECT id,user_id,mode,'submitted',score,correct_count,repeat(substr(id::text,1,1),64)
FROM public.trivia_sessions WHERE id::text LIKE '40000000-%';
INSERT INTO public.trivia_scores(user_id,mode,score,correct_count,session_id,server_verified)
SELECT user_id,mode,score,correct_count,id,true FROM public.trivia_sessions WHERE id::text LIKE '40000000-%';
INSERT INTO public.endless_high_scores(user_id,mode,high_score) VALUES
 ('10000000-0000-4000-8000-000000000009','random',99),
 ('10000000-0000-4000-8000-000000000010','random',55),
 ('10000000-0000-4000-8000-000000000010','category:holdem',88),
 ('10000000-0000-4000-8000-000000000012','random',20);

INSERT INTO public.diamond_transactions(user_id,amount,transaction_type,type,description,balance_after,
 reference_id,counterparty,issuance_class,created_at)
VALUES
 ('10000000-0000-4000-8000-000000000018',-5,'trivia_lifeline','trivia_lifeline','Historical paid skip',95,
  'trivia_lifeline:40000000-0000-4000-8000-000000000005:20000000-0000-4000-8000-000000000108:skip',
  'revenue:trivia_lifeline','spend',now()-interval '30 minutes'),
 ('10000000-0000-4000-8000-000000000019',-5,'trivia_lifeline','trivia_lifeline','Historical paid skip',95,
  'spend:10000000-0000-4000-8000-000000000019:trivia_lifeline:40000000-0000-4000-8000-000000000006:20000000-0000-4000-8000-000000000112:skip',
  'revenue:trivia_lifeline','spend',now()-interval '30 minutes');

-- Open authority cases.
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','endless',ARRAY[public.test_q(1),public.test_q(2),public.test_q(3),public.test_q(4)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','survival',ARRAY(SELECT public.test_q(i) FROM generate_series(21,40)i),true,1);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','endless',ARRAY[public.test_q(6)],false);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','endless',ARRAY[public.test_q(9)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','endless',ARRAY[public.test_q(10)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000006','endless',ARRAY[public.test_q(11)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','endless',ARRAY[public.test_q(12),public.test_q(13),public.test_q(14),public.test_q(15)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008','endless',ARRAY[public.test_q(16)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013','endless',ARRAY[public.test_q(41),public.test_q(42),public.test_q(43),public.test_q(44),public.test_q(45)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000014','endless',ARRAY[public.test_q(46),public.test_q(47)],false);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000015','endless',ARRAY[public.test_q(19),public.test_q(20)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000016','endless',ARRAY[public.test_q(19),public.test_q(20)],false);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000017','survival',ARRAY(SELECT public.test_q(i) FROM generate_series(51,70)i),true,2);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000020','endless',ARRAY[public.test_q(71),public.test_q(72)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000021','endless',ARRAY[public.test_q(73),public.test_q(74)],false);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022','survival',ARRAY(SELECT public.test_q(i) FROM generate_series(160,179)i),true,1);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000023','survival',ARRAY(SELECT public.test_q(i) FROM generate_series(180,199)i),true,4);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000024','survival',ARRAY(SELECT public.test_q(i) FROM generate_series(200,219)i),true,1);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-000000000025','endless',ARRAY[public.test_q(220),public.test_q(221)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000026','10000000-0000-4000-8000-000000000026','endless',ARRAY[public.test_q(222),public.test_q(223),public.test_q(224),public.test_q(225)]);
SELECT public.fixture_bind_session('30000000-0000-4000-8000-000000000027','10000000-0000-4000-8000-000000000027','endless',ARRAY[public.test_q(226),public.test_q(227)]);

-- Pre-cutover open paid skip: exact debit with no answer binding. User became
-- VIP before deployment; install must bind it, retain Diamond entitlement and
-- avoid a second debit.
UPDATE public.profiles SET diamonds=95,is_vip=true,vip_tier='lifetime'
 WHERE id='10000000-0000-4000-8000-000000000003';
INSERT INTO public.diamond_transactions(user_id,amount,transaction_type,type,description,balance_after,
 reference_id,counterparty,issuance_class)
VALUES('10000000-0000-4000-8000-000000000003',-5,'trivia_lifeline','trivia_lifeline','Legacy paid skip',95,
 'trivia_lifeline:30000000-0000-4000-8000-000000000003:20000000-0000-4000-8000-000000000006:skip',
 'revenue:trivia_lifeline','spend');
