-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (version 20260818172856, name bbj_solvency_overhaul_single_payer_and_clamp)
-- Mirror of the applied migration (decoded from schema_migrations). Do not re-run.
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- BBJ SOLVENCY OVERHAUL (2026-08-18) — Dan's rule: a BBJ payout can NEVER
-- exceed what is inside main + backup. Forensics + fix in the mirror header
-- (WH supabase/migrations). Authoritative ledger (bbj_payouts==bbj_winners,
-- 39 rows) is clean; the 87/$210k counters were legacy-payer pollution.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Harden the sole payer: structural clamp + percent assert ─────────────
CREATE OR REPLACE FUNCTION public.bbj_atomic_payout_v2(p_pool_id uuid, p_table_id uuid, p_hand_number bigint, p_payout_total_percent numeric, p_loser_user_id uuid, p_winner_user_id uuid, p_dealt_in_ids uuid[], p_seated_ids uuid[], p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(applied boolean, already_paid boolean, recovered boolean, payout_id uuid, total_payout numeric, loser_share numeric, winner_share numeric, table_share numeric, per_player_share numeric, balance_after numeric)
 LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_main numeric; v_backup numeric; v_available numeric;
  v_total numeric; v_loser numeric; v_winner numeric; v_table numeric;
  v_per numeric; v_remainder numeric; v_payout_id uuid; v_existing uuid;
  v_club_id uuid; v_pre_hit_balance numeric; v_winner_name text; v_loser_name text;
  v_table_ids uuid[]; v_n_table integer; v_recovered boolean := false; v_uid uuid;
BEGIN
  IF p_payout_total_percent IS NULL OR p_payout_total_percent <= 0 OR p_payout_total_percent > 100 THEN
    RAISE EXCEPTION 'bbj payout percent % out of range (0,100]', p_payout_total_percent;
  END IF;

  SELECT COALESCE(array_agg(x), ARRAY[]::uuid[]) INTO v_table_ids
    FROM unnest(COALESCE(p_dealt_in_ids, ARRAY[]::uuid[])) AS x
   WHERE x <> p_loser_user_id AND x <> p_winner_user_id;
  v_n_table := COALESCE(array_length(v_table_ids, 1), 0);

  SELECT id INTO v_existing FROM bbj_payouts
   WHERE pool_id = p_pool_id AND table_id = p_table_id AND hand_number = p_hand_number LIMIT 1;

  IF v_existing IS NOT NULL THEN
    SELECT bp.total_amount, bp.loser_share, bp.winner_share, bp.table_share
      INTO v_total, v_loser, v_winner, v_table FROM bbj_payouts bp WHERE bp.id = v_existing;
    IF v_n_table > 0 THEN v_per := ROUND(v_table / v_n_table, 2); ELSE v_per := 0; END IF;
    IF bbj_credit_one_recipient(v_existing, p_table_id, p_loser_user_id, v_loser, p_loser_user_id = ANY(p_seated_ids)) THEN v_recovered := true; END IF;
    IF bbj_credit_one_recipient(v_existing, p_table_id, p_winner_user_id, v_winner, p_winner_user_id = ANY(p_seated_ids)) THEN v_recovered := true; END IF;
    FOREACH v_uid IN ARRAY v_table_ids LOOP
      IF bbj_credit_one_recipient(v_existing, p_table_id, v_uid, v_per, v_uid = ANY(p_seated_ids)) THEN v_recovered := true; END IF;
    END LOOP;
    RETURN QUERY SELECT false, true, v_recovered, v_existing, v_total, v_loser, v_winner, v_table, v_per, NULL::numeric;
    RETURN;
  END IF;

  SELECT main_balance, COALESCE(backup_balance,0) INTO v_main, v_backup FROM bbj_pools WHERE id = p_pool_id FOR UPDATE;
  IF v_main IS NULL OR v_main <= 0 THEN
    RETURN QUERY SELECT false, false, false, NULL::uuid, 0::numeric,0::numeric,0::numeric,0::numeric,0::numeric, COALESCE(v_main,0);
    RETURN;
  END IF;

  v_available := v_main + v_backup;
  v_pre_hit_balance := v_main;
  v_total  := ROUND(v_main * (p_payout_total_percent / 100.0), 2);
  v_total  := LEAST(v_total, v_available);  -- STRUCTURAL CLAMP: never exceed main+backup
  v_loser  := ROUND(v_total * 0.50, 2);
  v_winner := ROUND(v_total * 0.25, 2);
  v_table  := ROUND(v_total - v_loser - v_winner, 2);
  IF v_n_table > 0 THEN v_per := ROUND(v_table / v_n_table, 2); ELSE v_per := 0; END IF;
  v_remainder := ROUND(v_table - (v_per * v_n_table), 2);
  v_loser := v_loser + v_remainder;
  v_table := v_per * v_n_table;

  INSERT INTO bbj_payouts (pool_id, hand_id, table_id, hand_number, winner_user_id, loser_user_id,
    total_amount, winner_share, loser_share, table_share, table_player_count, metadata)
  VALUES (p_pool_id, NULL, p_table_id, p_hand_number, p_loser_user_id, p_winner_user_id,
    v_total, v_winner, v_loser, v_table, v_n_table, COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT (pool_id, table_id, hand_number) DO NOTHING RETURNING id INTO v_payout_id;

  IF v_payout_id IS NULL THEN
    RETURN QUERY SELECT false, true, false, NULL::uuid, 0::numeric,0::numeric,0::numeric,0::numeric,0::numeric, v_main;
    RETURN;
  END IF;

  UPDATE bbj_pools
     SET main_balance   = GREATEST(0, main_balance - v_total)
                          + GREATEST(0, COALESCE(backup_balance,0) - GREATEST(0, v_total - main_balance)),
         backup_balance = GREATEST(0, COALESCE(backup_balance,0) - GREATEST(0, v_total - main_balance)),
         total_paid_out = COALESCE(total_paid_out, 0) + v_total,
         hit_count      = COALESCE(hit_count, 0) + 1,
         last_hit_at    = now(), last_hit_amount = v_total,
         last_winner_id = p_loser_user_id, last_loser_id = p_winner_user_id, updated_at = now()
   WHERE id = p_pool_id RETURNING main_balance, club_id INTO v_main, v_club_id;

  PERFORM bbj_credit_one_recipient(v_payout_id, p_table_id, p_loser_user_id, v_loser, p_loser_user_id = ANY(p_seated_ids));
  PERFORM bbj_credit_one_recipient(v_payout_id, p_table_id, p_winner_user_id, v_winner, p_winner_user_id = ANY(p_seated_ids));
  FOREACH v_uid IN ARRAY v_table_ids LOOP
    PERFORM bbj_credit_one_recipient(v_payout_id, p_table_id, v_uid, v_per, v_uid = ANY(p_seated_ids));
  END LOOP;

  SELECT COALESCE(NULLIF(display_name,''), NULLIF(username,''), 'Player') INTO v_winner_name FROM profiles WHERE id = p_loser_user_id;
  SELECT COALESCE(NULLIF(display_name,''), NULLIF(username,''), 'Player') INTO v_loser_name FROM profiles WHERE id = p_winner_user_id;

  INSERT INTO bbj_winners (pool_id, club_id, winner_id, loser_id, winner_display_name, loser_display_name,
    winner_hand, loser_hand, winner_payout, loser_payout, table_share_payout, total_payout,
    pool_amount_at_hit, table_id, hand_number, awarded_at)
  VALUES (p_pool_id, v_club_id, p_loser_user_id, p_winner_user_id, v_winner_name, v_loser_name,
    COALESCE(p_metadata->>'winner_hand_name', 'Unknown'), COALESCE(p_metadata->>'loser_hand_name', 'Unknown'),
    v_loser, v_winner, v_table, v_total, v_pre_hit_balance, p_table_id, p_hand_number, now())
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT true, false, false, v_payout_id, v_total, v_loser, v_winner, v_table, v_per, v_main;
END;
$function$;

REVOKE ALL ON FUNCTION public.bbj_atomic_payout_v2(uuid,uuid,bigint,numeric,uuid,uuid,uuid[],uuid[],jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bbj_atomic_payout_v2(uuid,uuid,bigint,numeric,uuid,uuid,uuid[],uuid[],jsonb) TO service_role;

-- ── 2. Retire the four legacy payers ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.award_bbj(p_club_id uuid, p_table_id uuid, p_hand_number bigint, p_loser_user_id uuid, p_loser_display_name text, p_loser_hand text, p_loser_cards text, p_winner_user_id uuid, p_winner_display_name text, p_winner_hand text, p_winner_cards text, p_payout_total_pct numeric, p_payout_loser_pct numeric, p_payout_winner_pct numeric, p_payout_table_pct numeric, p_stakes_tier text DEFAULT 'small'::text, p_game_variant text DEFAULT 'nlh'::text, p_big_blind numeric DEFAULT 2)
RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $f$
  SELECT jsonb_build_object('success', false, 'error', 'retired_use_bbj_atomic_payout_v2');
$f$;

CREATE OR REPLACE FUNCTION public.fn_union_bbj_pool_payout(p_union_id uuid, p_pool_id uuid, p_club_id uuid, p_loser_id uuid, p_winner_id uuid, p_loser_share numeric, p_winner_share numeric, p_table_share numeric)
RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $f$
  SELECT jsonb_build_object('success', false, 'error', 'retired_use_bbj_atomic_payout_v2');
$f$;

CREATE OR REPLACE FUNCTION public.bbj_promo_payout(p_pool_id uuid, p_amount numeric, p_recipient_user_ids uuid[], p_reason text DEFAULT NULL, p_triggered_by uuid DEFAULT NULL, p_event_type text DEFAULT 'custom')
RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $f$
  SELECT jsonb_build_object('success', false, 'error', 'retired_use_fn_bbj_promo_payout_atomic');
$f$;

CREATE OR REPLACE FUNCTION public.bbj_atomic_payout(p_pool_id uuid, p_table_id uuid, p_hand_number bigint, p_payout_total_percent numeric, p_loser_user_id uuid, p_winner_user_id uuid, p_dealt_in_count integer, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(applied boolean, already_paid boolean, payout_id uuid, total_payout numeric, loser_share numeric, winner_share numeric, table_share numeric, balance_after numeric)
LANGUAGE plpgsql SET search_path TO 'public' AS $f$
BEGIN RAISE EXCEPTION 'bbj_atomic_payout retired 2026-08-18 - use bbj_atomic_payout_v2'; END;
$f$;

REVOKE ALL ON FUNCTION public.award_bbj(uuid,uuid,bigint,uuid,text,text,text,uuid,text,text,text,numeric,numeric,numeric,numeric,text,text,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bbj_atomic_payout(uuid,uuid,bigint,numeric,uuid,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_union_bbj_pool_payout(uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bbj_promo_payout(uuid,numeric,uuid[],text,uuid,text) FROM PUBLIC, anon, authenticated;

-- ── 3. Reconcile polluted counters to the authoritative ledger ──────────────
UPDATE bbj_pools p SET
  total_paid_out = COALESCE((SELECT SUM(total_amount) FROM bbj_payouts bp WHERE bp.pool_id = p.id), 0),
  hit_count      = COALESCE((SELECT COUNT(*)          FROM bbj_payouts bp WHERE bp.pool_id = p.id), 0),
  pool_amount    = 0,
  updated_at     = now();

-- ── 4. Solvency + single-payer invariant ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_platform_invariants_health()
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int; n2 int; n3 int;
BEGIN
  RETURN QUERY SELECT g.check_name, g.status, g.detail FROM public.fn_grant_guard_health() g;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.prokind='f' AND btrim(p.prosrc) ~ '^BEGIN\s+END;?$';
  RETURN QUERY SELECT 'empty_stubs'::text, CASE WHEN n=0 THEN 'OK' ELSE 'STUBS_PRESENT' END, n || ' functions with a BEGIN END; body';
  SELECT count(*) INTO n FROM pg_constraint WHERE conname='wallet_transactions_amount_non_negative';
  SELECT count(*) INTO n2 FROM public.wallet_transactions wt WHERE wt.type='debit' AND wt.amount<0 AND wt.category IN ('buyin','addon','rebuy','tournament_buyin');
  RETURN QUERY SELECT 'debit_sign_convention'::text, CASE WHEN n=1 AND n2=0 THEN 'OK' ELSE 'REGRESSED' END, 'constraint=' || n || ', negative debit rows in fixed categories=' || n2;
  SELECT count(*) INTO n FROM public.daily_challenge_catalog;
  RETURN QUERY SELECT 'challenge_catalog'::text, CASE WHEN n>=18 THEN 'OK' ELSE 'CATALOG_SHRUNK' END, n || ' rows (>=18 expected)';
  SELECT COALESCE(sum(weight),0) INTO n FROM public.lucky_wheel_segments s WHERE s.active;
  RETURN QUERY SELECT 'lucky_wheel_weights'::text, CASE WHEN n=100 THEN 'OK' ELSE 'WEIGHTS_DRIFTED' END, 'active weights sum ' || n;
  SELECT count(*) INTO n FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
   WHERE (c.relname='clubs' AND p.polname IN ('Authenticated users can create clubs','Owners can update clubs') AND pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%owner_id%')
      OR (c.relname='club_members' AND p.polname='Club staff can read club rosters');
  RETURN QUERY SELECT 'club_rls_trio'::text, CASE WHEN n=3 THEN 'OK' ELSE 'POLICY_MISSING' END, n || ' of 3 policies intact';
  SELECT count(*) INTO n FROM pg_proc WHERE proname='fn_increment_vip_usage' AND prosrc LIKE '%vip_feature_usage_monthly%';
  RETURN QUERY SELECT 'vip_monthly_ledger'::text, CASE WHEN n=1 THEN 'OK' ELSE 'UNWIRED' END, 'fn_increment_vip_usage writes the monthly table: ' || (n=1);
  SELECT count(*) INTO n FROM pg_proc WHERE proname='deduct_diamonds' AND prosrc LIKE '%Cannot deduct diamonds for another user%' AND prosrc LIKE '%positive integer%';
  RETURN QUERY SELECT 'deduct_diamonds_guards'::text, CASE WHEN n=1 THEN 'OK' ELSE 'GUARDS_REMOVED' END, 'identity + positive-amount guards present: ' || (n=1);
  RETURN QUERY SELECT 'engine_recovery_events'::text, CASE WHEN to_regclass('public.engine_recovery_events') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, COALESCE((SELECT count(*) FROM public.engine_recovery_events)::text,'0') || ' recovery events recorded';
  SELECT count(*) INTO n FROM (SELECT bp.union_id FROM public.bbj_pools bp WHERE bp.club_id IS NULL AND bp.union_id IS NOT NULL AND bp.status='active' GROUP BY bp.union_id HAVING count(*) > 1) d;
  SELECT count(*) INTO n2 FROM public.bbj_contributions bc WHERE bc.pool_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bbj_pools p WHERE p.id = bc.pool_id);
  SELECT count(*) INTO n3 FROM pg_indexes WHERE schemaname='public' AND indexname IN ('uq_bbj_pools_union_active','uq_bbj_pools_club_active');
  RETURN QUERY SELECT 'bbj_pool_integrity'::text, CASE WHEN n=0 AND n2=0 AND n3=2 THEN 'OK' ELSE 'FRAGMENTED' END, 'fragmented unions=' || n || ', orphaned contributions=' || n2 || ', unique indexes=' || n3 || '/2';
  -- BBJ SOLVENCY (Dan 2026-08-18): no live payout exceeded the pool at hit, and only one payer keeps pool write privileges.
  SELECT count(*) INTO n FROM public.bbj_winners w WHERE w.pool_amount_at_hit IS NOT NULL AND w.total_payout > w.pool_amount_at_hit + 0.01;
  SELECT count(*) INTO n2 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN ('award_bbj','bbj_atomic_payout','fn_union_bbj_pool_payout','bbj_promo_payout','fn_bbj_payout')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  RETURN QUERY SELECT 'bbj_solvency'::text, CASE WHEN n=0 AND n2=0 THEN 'OK' ELSE 'VIOLATED' END, 'payouts exceeding pool=' || n || ', legacy payers authenticated-exec=' || n2;
END;
$function$;

-- ── 5. Probes ───────────────────────────────────────────────────────────────
DO $probe$
DECLARE v_user uuid; v_club uuid; v_table uuid; v_pool uuid; v_row record; v_after numeric;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at DESC LIMIT 1;
  IF v_user IS NULL THEN RAISE NOTICE 'no users; skipping'; RETURN; END IF;

  IF (public.award_bbj(gen_random_uuid(),gen_random_uuid(),1::bigint,v_user,''::text,''::text,''::text,v_user,''::text,''::text,''::text,100::numeric,50::numeric,25::numeric,25::numeric)->>'success')::boolean THEN
    RAISE EXCEPTION 'award_bbj must refuse'; END IF;
  IF (public.fn_union_bbj_pool_payout(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),v_user,v_user,10::numeric,10::numeric,10::numeric)->>'success')::boolean THEN
    RAISE EXCEPTION 'fn_union_bbj_pool_payout must refuse'; END IF;
  IF (public.bbj_promo_payout(gen_random_uuid(),10::numeric,ARRAY[v_user],NULL::text,NULL::uuid,'custom'::text)->>'success')::boolean THEN
    RAISE EXCEPTION 'bbj_promo_payout must refuse'; END IF;

  BEGIN
    INSERT INTO clubs (id, name, owner_id) VALUES (gen_random_uuid(), ':bbj_probe_club:', v_user) RETURNING id INTO v_club;
    INSERT INTO tables (name, club_id) VALUES (':bbj_probe_table:', v_club) RETURNING id INTO v_table;
    INSERT INTO bbj_pools (id, club_id, main_balance, backup_balance, promo_balance, status)
    VALUES (gen_random_uuid(), v_club, 100, 40, 0, 'active') RETURNING id INTO v_pool;

    BEGIN
      PERFORM bbj_atomic_payout_v2(v_pool, v_table, 1::bigint, 150::numeric, v_user, v_user, ARRAY[]::uuid[], ARRAY[]::uuid[]);
      RAISE EXCEPTION 'v2 accepted percent > 100';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'v2 accepted percent > 100' THEN RAISE; END IF;
    END;

    SELECT * INTO v_row FROM bbj_atomic_payout_v2(v_pool, v_table, 2::bigint, 100::numeric, v_user, v_user, ARRAY[]::uuid[], ARRAY[]::uuid[]);
    IF NOT v_row.applied THEN RAISE EXCEPTION 'v2 100%% did not apply: %', v_row; END IF;
    IF v_row.total_payout > 140.0001 THEN RAISE EXCEPTION 'v2 paid % > main+backup 140', v_row.total_payout; END IF;
    SELECT main_balance INTO v_after FROM bbj_pools WHERE id = v_pool;
    IF v_after < 0 THEN RAISE EXCEPTION 'v2 drove pool negative: %', v_after; END IF;

    RAISE EXCEPTION 'PROBE-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PROBE-ROLLBACK' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'BBJ solvency probes passed';
END
$probe$;