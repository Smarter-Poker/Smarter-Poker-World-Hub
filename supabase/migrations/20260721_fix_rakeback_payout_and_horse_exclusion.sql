-- AUDIT FIX (rakeback payout + horse exclusion). Applied to prod via Supabase MCP
-- 2026-07-21. Two live bugs meant NO rakeback ever reached a player wallet, and the
-- daemon was accruing rakeback for HORSES (house AI) which — had the payout worked —
-- would have minted ~55k chips into house wallets.
--
-- Bugs:
--   1. fn_close_settlement_period credited wallet_type='main' (invalid; CHECK allows only
--      BUSINESS/PLAYER/PROMO) -> 0 rows matched, guarded audit insert skipped.
--   2. Even with the right type, the raw UPDATE wallets is blocked by
--      guard_wallet_balance_write (fn_close_settlement_period is not whitelisted).
--   3. The client claim (RakebackPage) marked periods 'paid' then called the SECURITY
--      INVOKER credit_player_rakeback with a client-supplied amount — it cannot write
--      wallets under RLS, so periods flipped to paid with no chips delivered.
--   4. 186 of 188 rakeback_periods belonged to horses (55,750 chips); accruing/paying
--      rakeback to house players is chip inflation.
--
-- Fixes in this migration:
--   A. fn_close_settlement_period: credit via the whitelisted atomic_credit_wallet_and_log,
--      NEVER credit a horse (terminalize horse periods to 'expired'), and order the credit
--      BEFORE the status flip so it is atomic + idempotent on the payout row.
--   B. fn_claim_rakeback(p_club_id): new SECURITY DEFINER self-claim keyed on auth.uid()
--      (a user can only claim their own rakeback), delegating to fn_close_settlement_period.
--   C. Expire the 141 pending horse periods + delete false horse payout rows.
-- The daemon (server/src/services/RakebackSettlerService.ts) is also updated to exclude
-- horses from all accrual going forward (deployed with the engine).

CREATE OR REPLACE FUNCTION public.fn_close_settlement_period(p_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period         record;
  v_is_horse       boolean;
  v_rake_total     numeric;
  v_payout         numeric;
  v_payout_id      uuid;
  v_wallet_balance numeric;
BEGIN
  SELECT * INTO v_period FROM public.rakeback_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period not found');
  END IF;

  IF v_period.status IN ('paid', 'expired') THEN
    RETURN jsonb_build_object('success', true, 'skipped', v_period.status, 'period_id', p_period_id);
  END IF;

  SELECT COALESCE(is_horse, false) INTO v_is_horse FROM public.profiles WHERE id = v_period.user_id;
  IF v_is_horse THEN
    UPDATE public.rakeback_periods SET status = 'expired' WHERE id = p_period_id;
    RETURN jsonb_build_object('success', true, 'skipped', 'horse', 'period_id', p_period_id);
  END IF;

  SELECT COALESCE(SUM(COALESCE((r.player_contributions->v_period.user_id::text)::numeric, 0)), 0)
    INTO v_rake_total
    FROM public.rake_records r
   WHERE r.club_id = v_period.club_id
     AND r.created_at::date >= v_period.period_start
     AND r.created_at::date <= v_period.period_end;

  v_payout := ROUND(v_rake_total * v_period.rakeback_rate, 4);

  UPDATE public.rakeback_periods
     SET rake_generated  = v_rake_total,
         total_rake_paid = v_rake_total,
         rakeback_amount = v_payout,
         rakeback_earned = v_payout
   WHERE id = p_period_id;

  IF v_payout <= 0 THEN
    UPDATE public.rakeback_periods SET status = 'paid', paid_at = NOW() WHERE id = p_period_id;
    RETURN jsonb_build_object('success', true, 'period_id', p_period_id, 'payout', 0);
  END IF;

  INSERT INTO public.rakeback_period_payouts
    (rakeback_period_id, club_id, user_id, user_rake_contribution,
     rakeback_pct, payout_amount, status, paid_at)
  VALUES
    (p_period_id, v_period.club_id, v_period.user_id, v_rake_total,
     ROUND(v_period.rakeback_rate * 100, 2), v_payout, 'paid', NOW())
  ON CONFLICT (rakeback_period_id, user_id) DO NOTHING
  RETURNING id INTO v_payout_id;

  IF v_payout_id IS NULL THEN
    UPDATE public.rakeback_periods SET status = 'paid', paid_at = NOW() WHERE id = p_period_id;
    RETURN jsonb_build_object('success', true, 'skipped', 'payout_exists', 'period_id', p_period_id);
  END IF;

  PERFORM public.atomic_credit_wallet_and_log(
    v_period.user_id, v_payout, 'rakeback',
    'Rakeback payout ' || v_period.period_start::text || ' to ' || v_period.period_end::text,
    NULL, NULL, v_payout_id
  );

  -- Per-wallet history row (the UI reads wallet_transactions), with balance_after.
  SELECT balance INTO v_wallet_balance FROM public.wallets
   WHERE user_id = v_period.user_id AND wallet_type = 'PLAYER';
  INSERT INTO public.wallet_transactions
    (user_id, wallet_type, amount, type, category, description, related_entity_id, balance_after)
  VALUES
    (v_period.user_id, 'PLAYER', v_payout, 'credit', 'rakeback',
     'Rakeback payout ' || v_period.period_start::text || ' to ' || v_period.period_end::text,
     v_payout_id, v_wallet_balance);

  UPDATE public.rakeback_periods SET status = 'paid', paid_at = NOW() WHERE id = p_period_id;

  RETURN jsonb_build_object('success', true, 'period_id', p_period_id,
    'rake_total', v_rake_total, 'rakeback_rate', v_period.rakeback_rate,
    'payout', v_payout, 'payout_id', v_payout_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_claim_rakeback(p_club_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user    uuid := (SELECT auth.uid());
  v_period  record;
  v_res     jsonb;
  v_count   int := 0;
  v_total   numeric := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'authentication required');
  END IF;
  FOR v_period IN
    SELECT id FROM public.rakeback_periods
     WHERE user_id = v_user AND status = 'pending'
       AND (p_club_id IS NULL OR club_id = p_club_id)
     ORDER BY period_start
     FOR UPDATE
  LOOP
    v_res := public.fn_close_settlement_period(v_period.id);
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      v_total := v_total + COALESCE((v_res->>'payout')::numeric, 0);
      IF COALESCE((v_res->>'payout')::numeric, 0) > 0 THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'periods_claimed', v_count, 'total_payout', v_total);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_claim_rakeback(uuid) TO authenticated;

-- Data remediation: neutralize all horse rakeback periods (no chips were ever delivered).
DELETE FROM rakeback_period_payouts rpp USING rakeback_periods rp, profiles p
 WHERE rpp.rakeback_period_id = rp.id AND rp.user_id = p.id AND COALESCE(p.is_horse,false)=true;
UPDATE rakeback_periods rp SET status='expired'
 FROM profiles p WHERE p.id=rp.user_id AND COALESCE(p.is_horse,false)=true AND rp.status IN ('pending','paid');
