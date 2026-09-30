-- trivia_p2_solo_paths_switch
--
-- Phase 2: routes the solo paid trivia money paths (entry charge, run reward, daily bonus,
-- prize wheel, lifeline spend) through switch-aware wrappers. With the server-side switch
-- trivia_ledger_switches.solo_journal OFF (the installed default) every wrapper calls the
-- platform function with byte-identical arguments, so diamond_transactions history, references
-- and balances are unchanged. With it ON (root flips it after verification) the same platform
-- rows are written AND linked 1:1 to a balanced trivia journal in the same transaction.
-- Pre-image hashes guard against clobbering a concurrent change to the four rewired functions.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.trivia_solo_wallet_receipt(p_result jsonb)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT l.platform_receipt || jsonb_build_object('journal_id', l.journal_id)
    FROM public.trivia_ledger_lines l
   WHERE l.journal_id = (p_result ->> 'journal_id')::uuid AND l.account_kind = 'player_wallet'
   ORDER BY l.line_no LIMIT 1;
$fn$;

-- add_diamonds_to_balance-compatible result for a journaled wallet move (credits and entry debits).
CREATE OR REPLACE FUNCTION public.trivia_solo_add_shape(p_result jsonb, p_user_id uuid, p_reference text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_after integer; v_now integer; v_receipt jsonb;
BEGIN
  IF COALESCE((p_result ->> 'success')::boolean, false) AND NOT COALESCE((p_result ->> 'replayed')::boolean, false) THEN
    v_receipt := public.trivia_solo_wallet_receipt(p_result);
    IF v_receipt IS NULL OR COALESCE((v_receipt ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'trivia ledger: platform receipt missing for journal %', p_result ->> 'journal_id' USING ERRCODE = 'TL003';
    END IF;
    RETURN v_receipt;
  END IF;
  SELECT balance_after INTO v_after FROM public.diamond_transactions WHERE user_id = p_user_id AND reference_id = p_reference;
  IF COALESCE((p_result ->> 'replayed')::boolean, false)
     OR p_result ->> 'error' IN ('reference_already_used_outside_ledger', 'idempotency_conflict') THEN
    -- exactly what add_diamonds_to_balance answers for a reference it has already seen
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_reference', 'duplicate', true, 'new_balance', v_after);
  END IF;
  SELECT diamonds INTO v_now FROM public.profiles WHERE id = p_user_id;
  IF p_result ->> 'error' = 'insufficient_funds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_diamonds', 'new_balance', v_now);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', COALESCE(p_result ->> 'error', 'ledger_error'), 'ledger', p_result);
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_solo_charge_entry(p_session_id uuid, p_user_id uuid, p_mode text, p_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_rules text; v_ref text := 'trivia_entry_' || p_session_id::text;
BEGIN
  IF NOT public.trivia_ledger_switch_enabled('solo_journal') THEN
    RETURN public.add_diamonds_to_balance(p_user_id, -p_cost, 'trivia_entry', 'Trivia entry (' || p_mode || ')', v_ref);
  END IF;
  SELECT rules_version_id INTO v_rules FROM public.trivia_rules_current WHERE rules_key = public.trivia_rules_key_for_mode(p_mode);
  RETURN public.trivia_solo_add_shape(
    public.trivia_ledger_debit(v_ref, p_user_id, p_cost, 'trivia_entry', 'Trivia entry (' || p_mode || ')',
                               'trivia_session', p_session_id::text, v_rules),
    p_user_id, v_ref);
END $fn$;

-- Solo credits funded by platform promotional issuance (trivia_run, trivia_daily_bonus, trivia_prize_wheel).
CREATE OR REPLACE FUNCTION public.trivia_solo_credit(p_user_id uuid, p_amount integer, p_kind text, p_description text,
  p_reference text, p_source_type text, p_source_id text, p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_rules text;
BEGIN
  IF NOT public.trivia_ledger_switch_enabled('solo_journal') THEN
    RETURN public.add_diamonds_to_balance(p_user_id, p_amount, p_kind, p_description, p_reference);
  END IF;
  IF p_mode IS NOT NULL THEN
    SELECT rules_version_id INTO v_rules FROM public.trivia_rules_current WHERE rules_key = public.trivia_rules_key_for_mode(p_mode);
  END IF;
  RETURN public.trivia_solo_add_shape(
    public.trivia_ledger_payout(p_reference, p_user_id, p_amount, p_kind, p_description, 'platform_issuance',
                                p_source_type, p_source_id, NULL, NULL, v_rules),
    p_user_id, p_reference);
END $fn$;

-- /api/diamonds/spend calls this for source 'trivia_lifeline'; it answers exactly like deduct_diamonds.
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
    -- deduct_diamonds owns the replay / conflict answer for a reference it has already recorded
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

DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('create_trivia_session_v2', '556f5964015faf34c7c0e0da2e7d994e', 'ff2770a3c2b27355da1520e15e560908'),
      ('award_trivia_run', '3d8663565eadc1ebc6055af14752bf70', 'f7094f491be0f36d335c303f994c0e40'),
      ('award_trivia_run_v2', 'b5551c6ff7d0134ae65fa8b4eaeb6c08', '6fe2db664da1f5a0db0862cebb180692'),
      ('fn_trivia_prize_wheel_spin', '54939f1df1ae3f04f11ec9960e803559', 'b90fa41c827d01892854996f66c1e853')) AS t(fn, pre, post) LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = r.fn) <> 1
       OR (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = r.fn) NOT IN (r.pre, r.post) THEN
      RAISE EXCEPTION 'pre-image check: % changed since Phase 2 was prepared; re-base before installing', r.fn;
    END IF;
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.create_trivia_session_v2(p_session_id uuid, p_user_id uuid, p_mode text, p_question_ids uuid[], p_permutations jsonb, p_parent_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_existing public.trivia_sessions%ROWTYPE;
    v_parent public.trivia_sessions%ROWTYPE;
    v_cost int := CASE p_mode
        WHEN 'arcade' THEN 10 WHEN 'mtt' THEN 10 WHEN 'cash' THEN 10
        WHEN 'icm' THEN 10 WHEN 'gto' THEN 10 WHEN 'mixed' THEN 10
        WHEN 'endless' THEN 10 WHEN 'survival' THEN 10
        WHEN 'time-attack' THEN 10 ELSE 0 END;
    v_state text := 'free';
    v_charge jsonb;
    v_is_vip boolean := false;
    v_item_qty int;
    v_level int := NULL;
    v_run_id uuid := NULL;
    v_required int;
    v_expires timestamptz := CASE p_mode
        WHEN 'time-attack' THEN now() + interval '30 seconds'
        WHEN 'arcade' THEN now() + interval '180 seconds'
        ELSE now() + interval '6 hours' END;
BEGIN
    IF p_session_id IS NULL OR p_user_id IS NULL OR p_mode IS NULL
       OR COALESCE(array_length(p_question_ids, 1), 0) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
    END IF;

    SELECT * INTO v_existing FROM public.trivia_sessions WHERE id = p_session_id;
    IF FOUND THEN
        IF v_existing.user_id = p_user_id AND v_existing.mode = p_mode THEN
            RETURN jsonb_build_object('success', true, 'duplicate', true,
                'entry_cost', v_existing.entry_cost, 'entry_state', v_existing.entry_state,
                'expires_at', v_existing.expires_at);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'session_id_conflict');
    END IF;

    IF p_mode = 'survival' THEN
        IF p_parent_session_id IS NULL THEN
            v_level := 1;
            v_run_id := p_session_id;
        ELSE
            SELECT * INTO v_parent FROM public.trivia_sessions
             WHERE id = p_parent_session_id FOR UPDATE;
            IF NOT FOUND OR v_parent.user_id IS DISTINCT FROM p_user_id
               OR v_parent.mode <> 'survival' OR v_parent.status <> 'submitted'
               OR v_parent.created_at < now() - interval '6 hours' THEN
                RETURN jsonb_build_object('success', false, 'error', 'invalid_survival_continuation');
            END IF;
            v_level := COALESCE(v_parent.survival_level, 1) + 1;
            v_run_id := COALESCE(v_parent.survival_run_id, v_parent.id);
            IF v_level > 10 THEN
                RETURN jsonb_build_object('success', false, 'error', 'survival_complete');
            END IF;
            v_required := (ARRAY[17,18,18,19,19,19,20,20,20,20])[COALESCE(v_parent.survival_level, 1)];
            IF COALESCE(v_parent.correct_count, 0) < v_required THEN
                RETURN jsonb_build_object('success', false, 'error', 'survival_level_not_passed');
            END IF;
            IF EXISTS (SELECT 1 FROM public.trivia_sessions WHERE parent_session_id = p_parent_session_id) THEN
                RETURN jsonb_build_object('success', false, 'error', 'survival_continuation_used');
            END IF;
            v_cost := 0;
            v_state := 'continuation';
        END IF;
    END IF;

    IF v_cost > 0 AND v_state <> 'continuation' THEN
        SELECT COALESCE(is_vip, false)
               AND (vip_tier = 'lifetime' OR vip_expires_at > now())
          INTO v_is_vip FROM public.profiles WHERE id = p_user_id;
        IF v_is_vip THEN
            v_cost := 0;
            v_state := 'vip';
        ELSIF p_mode = 'arcade' THEN
            UPDATE public.trivia_user_items
               SET quantity = quantity - 1, updated_at = now()
             WHERE user_id = p_user_id AND item_type = 'arcade_ticket' AND quantity > 0
            RETURNING quantity INTO v_item_qty;
            IF FOUND THEN
                v_cost := 0;
                v_state := 'ticket';
                INSERT INTO public.trivia_item_transactions
                    (user_id,item_type,amount,balance_after,transaction_type,reference_id,metadata)
                VALUES (p_user_id,'arcade_ticket',-1,v_item_qty,'arcade_entry',
                        'trivia_ticket_'||p_session_id::text,
                        jsonb_build_object('session_id',p_session_id));
            END IF;
        END IF;

        IF v_cost > 0 THEN
            -- Phase 2: switch-aware entry charge (identical platform call while solo_journal is off)
            SELECT public.trivia_solo_charge_entry(p_session_id, p_user_id, p_mode, v_cost) INTO v_charge;
            IF COALESCE((v_charge->>'success')::boolean, false) IS NOT TRUE THEN
                RETURN jsonb_build_object('success', false, 'error',
                    COALESCE(v_charge->>'error','insufficient_diamonds'));
            END IF;
            v_state := 'charged';
        END IF;
    END IF;

    INSERT INTO public.trivia_sessions (
        id,user_id,mode,question_ids,permutations,status,parent_session_id,
        entry_cost,entry_state,expires_at,survival_run_id,survival_level
    ) VALUES (
        p_session_id,p_user_id,p_mode,p_question_ids,COALESCE(p_permutations,'{}'),
        'open',p_parent_session_id,v_cost,v_state,v_expires,v_run_id,v_level
    );

    RETURN jsonb_build_object('success',true,'duplicate',false,'entry_cost',v_cost,
        'entry_state',v_state,'new_balance',v_charge->'new_balance','expires_at',v_expires,
        'survival_level',v_level);
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_trivia_run(p_session_id uuid, p_score integer, p_correct integer, p_total integer, p_diamonds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_session public.trivia_sessions%ROWTYPE;
    v_score integer := GREATEST(0, COALESCE(p_score, 0));
    v_correct integer := GREATEST(0, COALESCE(p_correct, 0));
    v_total integer := GREATEST(0, COALESCE(p_total, 0));
    v_award integer := GREATEST(0, COALESCE(p_diamonds, 0));
    v_result jsonb;
    v_now timestamptz;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_session_id');
    END IF;
    IF v_correct > v_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'correct_exceeds_total');
    END IF;

    -- One sampled wall-clock instant is used by both assignment and predicate;
    -- separate VOLATILE calls could straddle the exact deadline.
    v_now := clock_timestamp();
    UPDATE public.trivia_sessions
       SET status = 'submitted', submitted_at = v_now, score = v_score,
           correct_count = v_correct, diamonds_awarded = v_award
     WHERE id = p_session_id
       AND status = 'open'
       AND expires_at IS NOT NULL
       AND expires_at >= v_now
     RETURNING * INTO v_session;

    IF NOT FOUND THEN
        SELECT * INTO v_session
          FROM public.trivia_sessions
         WHERE id = p_session_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
        END IF;
        v_now := clock_timestamp();
        IF v_session.status = 'open'
           AND (v_session.expires_at IS NULL OR v_session.expires_at < v_now) THEN
            UPDATE public.trivia_sessions
               SET status = 'expired'
             WHERE id = p_session_id
               AND status = 'open'
               AND (expires_at IS NULL OR expires_at < v_now);
            RETURN jsonb_build_object(
                'success', false,
                'error', 'session_expired',
                'expires_at', v_session.expires_at,
                'deadline_missing', v_session.expires_at IS NULL
            );
        END IF;
        RETURN jsonb_build_object('success', false, 'error',
            CASE WHEN v_session.status = 'submitted' THEN 'already_submitted' ELSE 'session_closed' END);
    END IF;

    IF v_award > 0 THEN
        -- Phase 2: switch-aware reward credit (identical platform call while solo_journal is off)
        SELECT public.trivia_solo_credit(
            v_session.user_id, v_award, 'trivia_run',
            'Trivia run reward (' || COALESCE(v_session.mode, 'unknown') || ')',
            'trivia_session_' || p_session_id::text, 'trivia_session', p_session_id::text, v_session.mode
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           AND COALESCE((v_result ->> 'duplicate')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'trivia payout rejected: %', COALESCE(v_result ->> 'error', 'unknown');
        END IF;
    END IF;
    RETURN jsonb_build_object(
        'success', true, 'session_id', p_session_id, 'score', v_score,
        'correct_count', v_correct, 'diamonds_awarded', v_award,
        'deduped', COALESCE((v_result ->> 'duplicate')::boolean, false),
        'new_balance', v_result -> 'new_balance'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_trivia_run_v2(p_session_id uuid, p_score integer, p_correct integer, p_total integer, p_answered integer, p_diamonds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_session public.trivia_sessions%ROWTYPE;
    v_award jsonb;
    v_result jsonb;
    v_bonus jsonb;
    v_score_id uuid;
    v_existing public.trivia_scores%ROWTYPE;
    v_streak public.trivia_streaks%ROWTYPE;
    v_play_date date:=(now() AT TIME ZONE 'America/Chicago')::date;
    v_total_for_stats int;
    v_mode_cap int;
    v_earned_today int;
    v_clamped int;
    v_bonus_amount int:=0;
    v_new_streak int:=0;
    v_gap int;
    v_item_qty int;
BEGIN
    SELECT * INTO v_session FROM public.trivia_sessions WHERE id=p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session_not_found'); END IF;
    IF v_session.user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','session_owner_missing'); END IF;
    IF v_session.status='submitted' THEN
        IF v_session.settlement_result IS NOT NULL THEN
            RETURN v_session.settlement_result || jsonb_build_object('replayed',true);
        END IF;
        SELECT id INTO v_score_id FROM public.trivia_scores WHERE session_id=p_session_id LIMIT 1;
        RETURN jsonb_build_object('success',true,'replayed',true,'session_id',p_session_id,
            'score',v_session.score,'correct_count',v_session.correct_count,
            'diamonds_awarded',COALESCE(v_session.diamonds_awarded,0),'score_id',v_score_id);
    END IF;
    IF v_session.status<>'open' THEN RETURN jsonb_build_object('success',false,'error','session_closed'); END IF;

    IF v_session.mode IN ('arcade','mtt','cash','icm','gto','mixed','endless','survival','time-attack')
       AND v_session.entry_state NOT IN ('charged','vip','continuation','ticket') THEN
        RETURN jsonb_build_object('success',false,'error','entry_not_verified');
    END IF;
    v_total_for_stats:=CASE WHEN v_session.mode IN ('endless','time-attack')
        THEN GREATEST(COALESCE(p_answered,0),COALESCE(p_correct,0))
        ELSE GREATEST(COALESCE(p_total,0),COALESCE(p_correct,0)) END;
    PERFORM pg_advisory_xact_lock(hashtextextended(
        v_session.user_id::text||':'||v_session.mode||':'||v_play_date::text,0));
    v_mode_cap:=CASE v_session.mode
        WHEN 'daily' THEN 10 WHEN 'history' THEN 10 WHEN 'rules' THEN 10 WHEN 'pro' THEN 10
        WHEN 'arcade' THEN 40 WHEN 'survival' THEN 80 WHEN 'mtt' THEN 40
        WHEN 'cash' THEN 40 WHEN 'icm' THEN 40 WHEN 'gto' THEN 60
        WHEN 'mixed' THEN 40 WHEN 'endless' THEN 40 WHEN 'time-attack' THEN 40 ELSE 0 END;
    SELECT COALESCE(sum(diamonds_awarded),0)::int INTO v_earned_today
      FROM public.trivia_sessions WHERE user_id=v_session.user_id AND mode=v_session.mode
       AND status='submitted'
       AND (COALESCE(submitted_at,created_at) AT TIME ZONE 'America/Chicago')::date=v_play_date;
    v_clamped:=LEAST(GREATEST(COALESCE(p_diamonds,0),0),GREATEST(v_mode_cap-v_earned_today,0));

    SELECT public.award_trivia_run(p_session_id,p_score,p_correct,p_total,v_clamped) INTO v_award;
    IF COALESCE((v_award->>'success')::boolean,false) IS NOT TRUE THEN RETURN v_award; END IF;

    IF v_session.mode='daily' THEN
        SELECT * INTO v_existing FROM public.trivia_scores
         WHERE user_id=v_session.user_id AND mode='daily' AND play_date=v_play_date
         ORDER BY created_at LIMIT 1 FOR UPDATE;
        IF FOUND THEN
            IF v_existing.server_verified IS NOT TRUE OR COALESCE(p_score,0)>COALESCE(v_existing.score,0) THEN
                UPDATE public.trivia_scores SET score=GREATEST(COALESCE(p_score,0),0),
                    correct_count=GREATEST(COALESCE(p_correct,0),0),total_questions=v_total_for_stats,
                    diamonds_earned=v_clamped,session_id=p_session_id,server_verified=true
                 WHERE id=v_existing.id RETURNING id INTO v_score_id;
            ELSE
                v_score_id:=v_existing.id;
            END IF;
        ELSE
            INSERT INTO public.trivia_scores(user_id,username,mode,score,correct_count,total_questions,
                diamonds_earned,play_date,session_id,server_verified)
            SELECT v_session.user_id,p.username,'daily',GREATEST(COALESCE(p_score,0),0),
                GREATEST(COALESCE(p_correct,0),0),v_total_for_stats,v_clamped,v_play_date,p_session_id,true
              FROM public.profiles p WHERE p.id=v_session.user_id RETURNING id INTO v_score_id;
        END IF;
    ELSE
        INSERT INTO public.trivia_scores(user_id,username,mode,score,correct_count,total_questions,
            diamonds_earned,play_date,session_id,server_verified)
        SELECT v_session.user_id,p.username,v_session.mode,GREATEST(COALESCE(p_score,0),0),
            GREATEST(COALESCE(p_correct,0),0),v_total_for_stats,v_clamped,v_play_date,p_session_id,true
          FROM public.profiles p WHERE p.id=v_session.user_id RETURNING id INTO v_score_id;
    END IF;
    IF v_score_id IS NULL THEN RAISE EXCEPTION 'profile_not_found_for_trivia_score'; END IF;

    -- Streak totals now follow the verified settlement path. A shield protects
    -- exactly one missed day and its consumption has an immutable ledger row.
    SELECT * INTO v_streak FROM public.trivia_streaks WHERE user_id=v_session.user_id FOR UPDATE;
    IF NOT FOUND THEN
        v_new_streak:=CASE WHEN v_session.mode='daily' THEN 1 ELSE 0 END;
        INSERT INTO public.trivia_streaks(user_id,current_streak,best_streak,last_play_date,
            total_games_played,total_correct,updated_at)
        VALUES(v_session.user_id,v_new_streak,v_new_streak,
            CASE WHEN v_session.mode='daily' THEN v_play_date ELSE NULL END,
            1,GREATEST(COALESCE(p_correct,0),0),now());
    ELSE
        v_new_streak:=COALESCE(v_streak.current_streak,0);
        IF v_session.mode='daily' AND v_streak.last_play_date IS DISTINCT FROM v_play_date THEN
            v_gap:=CASE WHEN v_streak.last_play_date IS NULL THEN NULL ELSE v_play_date-v_streak.last_play_date END;
            IF v_gap IS NULL THEN v_new_streak:=1;
            ELSIF v_gap=1 THEN v_new_streak:=v_new_streak+1;
            ELSIF v_gap=2 THEN
                UPDATE public.trivia_user_items SET quantity=quantity-1,updated_at=now()
                 WHERE user_id=v_session.user_id AND item_type='streak_shield' AND quantity>0
                RETURNING quantity INTO v_item_qty;
                IF FOUND THEN
                    v_new_streak:=v_new_streak+1;
                    INSERT INTO public.trivia_item_transactions(
                        user_id,item_type,amount,balance_after,transaction_type,reference_id,metadata)
                    VALUES(v_session.user_id,'streak_shield',-1,v_item_qty,'streak_protection',
                        'trivia_shield_'||p_session_id::text,jsonb_build_object('session_id',p_session_id));
                ELSE v_new_streak:=1; END IF;
            ELSE v_new_streak:=1; END IF;
        END IF;
        UPDATE public.trivia_streaks SET current_streak=v_new_streak,
            best_streak=GREATEST(COALESCE(best_streak,0),v_new_streak),
            last_play_date=CASE WHEN v_session.mode='daily' THEN v_play_date ELSE last_play_date END,
            total_games_played=COALESCE(total_games_played,0)+1,
            total_correct=COALESCE(total_correct,0)+GREATEST(COALESCE(p_correct,0),0),updated_at=now()
         WHERE user_id=v_session.user_id;
    END IF;

    IF v_session.mode='daily' AND COALESCE(p_total,0)>=10 AND COALESCE(p_answered,0)>=p_total THEN
        -- Phase 2: switch-aware daily bonus credit (identical platform call while solo_journal is off)
        SELECT public.trivia_solo_credit(v_session.user_id,10,'trivia_daily_bonus',
            'Daily trivia completion bonus','trivia_daily_bonus_'||v_session.user_id::text||'_'||v_play_date::text,
            'trivia_daily_bonus','trivia_daily_bonus_'||v_session.user_id::text||'_'||v_play_date::text,'daily')
          INTO v_bonus;
        IF COALESCE((v_bonus->>'success')::boolean,false) IS TRUE THEN v_bonus_amount:=10;
        ELSIF COALESCE((v_bonus->>'duplicate')::boolean,false) IS NOT TRUE THEN
            RAISE EXCEPTION 'daily bonus rejected: %',COALESCE(v_bonus->>'error','unknown');
        END IF;
    END IF;

    v_result:=v_award||jsonb_build_object('score_id',v_score_id,
        'daily_bonus_awarded',v_bonus_amount,
        'new_balance',COALESCE(v_bonus->'new_balance',v_award->'new_balance'),
        'replayed',false);
    UPDATE public.trivia_sessions SET settlement_result=v_result WHERE id=p_session_id;
    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trivia_prize_wheel_spin(p_score_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user uuid:=(SELECT auth.uid());
    v_score record;
    v_existing public.trivia_prize_wheel_spins%ROWTYPE;
    v_roll int; v_prize_id text; v_type text; v_base int;
    v_streak int:=0; v_mult numeric(4,2):=1; v_amount int;
    v_credit jsonb; v_item_qty int;
BEGIN
    IF (SELECT auth.role())='service_role' THEN
        SELECT user_id INTO v_user FROM public.trivia_scores WHERE id=p_score_id;
    END IF;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','not_authenticated'); END IF;
    SELECT s.id,s.user_id,s.correct_count,s.total_questions,s.created_at,s.session_id,s.server_verified
      INTO v_score FROM public.trivia_scores s WHERE s.id=p_score_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','score_not_found'); END IF;
    IF v_score.user_id IS DISTINCT FROM v_user THEN RETURN jsonb_build_object('success',false,'error','not_your_score'); END IF;
    IF v_score.server_verified IS NOT TRUE OR v_score.session_id IS NULL OR NOT EXISTS(
        SELECT 1 FROM public.trivia_sessions ts WHERE ts.id=v_score.session_id
         AND ts.user_id=v_user AND ts.status='submitted' AND ts.correct_count=v_score.correct_count
    ) THEN RETURN jsonb_build_object('success',false,'error','score_not_server_verified'); END IF;
    IF COALESCE(v_score.total_questions,0)<5 OR v_score.correct_count IS DISTINCT FROM v_score.total_questions THEN
        RETURN jsonb_build_object('success',false,'error','not_a_perfect_game');
    END IF;
    IF v_score.created_at<now()-interval '30 minutes' THEN RETURN jsonb_build_object('success',false,'error','spin_window_expired'); END IF;
    SELECT * INTO v_existing FROM public.trivia_prize_wheel_spins WHERE score_id=p_score_id;
    IF FOUND THEN RETURN jsonb_build_object('success',true,'deduped',true,'prize_id',v_existing.prize_id,
        'prize_type',v_existing.prize_type,'prize_amount',v_existing.prize_amount,'multiplier',v_existing.multiplier); END IF;
    v_roll:=floor(random()*100)::int;
    IF v_roll<30 THEN v_prize_id:='diamond_5';v_type:='diamonds';v_base:=5;
    ELSIF v_roll<55 THEN v_prize_id:='diamond_10';v_type:='diamonds';v_base:=10;
    ELSIF v_roll<70 THEN v_prize_id:='diamond_25';v_type:='diamonds';v_base:=25;
    ELSIF v_roll<80 THEN v_prize_id:='diamond_50';v_type:='diamonds';v_base:=50;
    ELSIF v_roll<85 THEN v_prize_id:='diamond_100';v_type:='diamonds';v_base:=100;
    ELSIF v_roll<93 THEN v_prize_id:='streak_shield';v_type:='streak_shield';v_base:=1;
    ELSIF v_roll<98 THEN v_prize_id:='free_entry';v_type:='arcade_ticket';v_base:=1;
    ELSE v_prize_id:='mystery';v_type:='diamonds';v_base:=15; END IF;
    SELECT COALESCE(current_streak,0) INTO v_streak FROM public.trivia_streaks WHERE user_id=v_user;
    v_mult:=CASE WHEN v_streak>=100 THEN 5 WHEN v_streak>=30 THEN 3 WHEN v_streak>=14 THEN 2.5 WHEN v_streak>=7 THEN 2 ELSE 1 END;
    IF v_type='diamonds' THEN v_amount:=floor(v_base*v_mult)::int; ELSE v_amount:=v_base;v_mult:=1; END IF;
    INSERT INTO public.trivia_prize_wheel_spins(user_id,score_id,prize_id,prize_type,prize_amount,multiplier)
    VALUES(v_user,p_score_id,v_prize_id,v_type,v_amount,v_mult);
    IF v_type='diamonds' THEN
        -- Phase 2: switch-aware wheel credit (identical platform call while solo_journal is off)
        SELECT public.trivia_solo_credit(v_user,v_amount,'trivia_prize_wheel',
            'Prize Wheel - '||v_prize_id,'trivia_wheel_'||p_score_id::text,'trivia_prize_wheel_spin',p_score_id::text,NULL) INTO v_credit;
        IF COALESCE((v_credit->>'success')::boolean,false) IS NOT TRUE
           AND COALESCE((v_credit->>'duplicate')::boolean,false) IS NOT TRUE THEN
            RAISE EXCEPTION 'wheel credit rejected: %',COALESCE(v_credit->>'error','unknown');
        END IF;
    ELSE
        INSERT INTO public.trivia_user_items AS i(user_id,item_type,quantity,created_at,updated_at)
        VALUES(v_user,v_type,v_amount,now(),now()) ON CONFLICT(user_id,item_type)
        DO UPDATE SET quantity=i.quantity+v_amount,updated_at=now() RETURNING quantity INTO v_item_qty;
        INSERT INTO public.trivia_item_transactions(user_id,item_type,amount,balance_after,
            transaction_type,reference_id,metadata)
        VALUES(v_user,v_type,v_amount,v_item_qty,'prize_wheel','trivia_wheel_item_'||p_score_id::text,
            jsonb_build_object('score_id',p_score_id,'prize_id',v_prize_id));
    END IF;
    RETURN jsonb_build_object('success',true,'deduped',false,'prize_id',v_prize_id,
        'prize_type',v_type,'prize_amount',v_amount,'multiplier',v_mult,'credit',v_credit);
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_solo_wallet_receipt(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_solo_add_shape(jsonb, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_solo_charge_entry(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_solo_credit(uuid, integer, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_solo_spend(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_solo_spend(uuid, integer, text, text, text) TO service_role;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('create_trivia_session_v2', 'ff2770a3c2b27355da1520e15e560908'), ('award_trivia_run', 'f7094f491be0f36d335c303f994c0e40'),
      ('award_trivia_run_v2', '6fe2db664da1f5a0db0862cebb180692'), ('fn_trivia_prize_wheel_spin', 'b90fa41c827d01892854996f66c1e853')) AS t(fn, post) LOOP
    IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = r.fn) IS DISTINCT FROM r.post
       OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = r.fn
                     AND (p.prosrc LIKE '%add_diamonds_to_balance%' OR has_function_privilege('anon', p.oid, 'EXECUTE')
                          OR has_function_privilege('authenticated', p.oid, 'EXECUTE') OR NOT p.prosecdef)) THEN
      RAISE EXCEPTION 'postcondition: % was not rewired exactly as prepared', r.fn;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.trivia_solo_spend(uuid,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.trivia_solo_spend(uuid,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.trivia_solo_spend(uuid,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.trivia_solo_credit(uuid,integer,text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.trivia_solo_charge_entry(uuid,uuid,text,integer)', 'EXECUTE')
     OR public.trivia_ledger_switch_enabled('solo_journal') THEN
    RAISE EXCEPTION 'postcondition: solo wrapper ACL or switch state is wrong';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname LIKE 'trivia\_solo\_%'
                AND (NOT p.prosecdef OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))) THEN
    RAISE EXCEPTION 'postcondition: a solo wrapper is not security definer with a pinned search_path';
  END IF;
END $do$;

-- BEGIN BUILD FINGERPRINT (generated by the Phase 2 build; do not edit by hand)
-- The objects this migration installs must equal the build that was tested on the replica.
DO $fp$
DECLARE v_path text := pg_catalog.current_setting('search_path'); v_fp text;
BEGIN
  PERFORM pg_catalog.set_config('search_path', 'pg_catalog', true);
  WITH items(k, name, val) AS (
  SELECT 'fn', p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         pg_catalog.md5(p.prosrc) || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':' || p.prokind::text || ':'
         || COALESCE(pg_catalog.array_to_string(p.proconfig, ','), '') || ':' || pg_catalog.pg_get_function_result(p.oid)
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname ~ '^trivia_solo_'
)
  SELECT pg_catalog.md5(pg_catalog.string_agg(k || '|' || name || '|' || val, E'\n' ORDER BY k COLLATE "C", name COLLATE "C")) FROM items INTO v_fp;
  PERFORM pg_catalog.set_config('search_path', v_path, true);
  IF v_fp IS DISTINCT FROM 'be29a30df69ad267978c2c452f0f288d' THEN
    RAISE EXCEPTION 'trivia_p2_solo_paths_switch: installed objects differ from the tested build (fingerprint %)', v_fp;
  END IF;
END $fp$;
-- END BUILD FINGERPRINT
