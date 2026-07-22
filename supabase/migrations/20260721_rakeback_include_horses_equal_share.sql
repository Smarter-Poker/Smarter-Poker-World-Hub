-- Per Dan: horses SHOULD earn rakeback (to exercise + prove the pipeline end-to-end).
-- This REVERSES the earlier horse-exclusion (20260721_fix_rakeback_payout_and_horse_
-- exclusion.sql) and fixes two further bugs found while proving it works at volume.
-- Applied to prod via Supabase MCP 2026-07-21.
--
-- Bugs fixed here:
--   1. wallet_transactions.category CHECK rejected 'rakeback' (the insert only ever
--      fired now that the payout path actually reaches it). Widened to allow 'rakeback'.
--   2. fn_close_settlement_period computed the payout from each player's OWN rake
--      contribution, but the daemon accrues + the UI shows EQUAL-SHARE rakeback
--      (decision D-001 / FIX 144: rake/N per dealt-in player). The two disagreed, so it
--      overpaid big contributors (test settle paid 848k instead of the correct ~47k).
--      fn_close now recomputes EQUAL-SHARE self-consistently and derives the tier rate
--      with the same thresholds as the daemon.
-- The daemon (server/src/services/RakebackSettlerService.ts) no longer excludes horses
-- (deployed with the engine). The 186 previously-expired horse periods were un-expired
-- and settled correctly (47,220 chips equal-share, verified tie-out).

-- 1. Allow the 'rakeback' wallet_transactions category.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT wallet_transactions_category_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_category_check
  CHECK (category = ANY (ARRAY[
    'buyin','cashout','promo','rake','transfer','tournament_buyin','tournament_winnings',
    'tournament_cashout','horse_refill','deposit','withdrawal','refund','bbj','bonus','mint',
    'settlement','commission','TIP','INSURANCE','prize','rebuy','addon','funding','promotion',
    'rakeback'
  ]));

-- 2. Equal-share, horse-inclusive rakeback payout.
CREATE OR REPLACE FUNCTION public.fn_close_settlement_period(p_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period         record;
  v_rake_total     numeric;
  v_rate           numeric;
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

  -- EQUAL-SHARE rake for this user across the period: for each raked hand the user was
  -- dealt into, add rake_amount / (number of dealt-in players). Matches the daemon.
  SELECT COALESCE(SUM(
           r.rake_amount / GREATEST(
             (SELECT count(*) FROM jsonb_each_text(r.player_contributions) e WHERE (e.value)::numeric > 0), 1)
         ), 0)
    INTO v_rake_total
    FROM public.rake_records r
   WHERE r.club_id = v_period.club_id
     AND r.created_at::date >= v_period.period_start
     AND r.created_at::date <= v_period.period_end
     AND r.rake_amount > 0
     AND r.player_contributions IS NOT NULL
     AND (r.player_contributions ? v_period.user_id::text)
     AND (r.player_contributions->>(v_period.user_id::text))::numeric > 0;

  v_rake_total := ROUND(v_rake_total, 2);

  v_rate := CASE
    WHEN v_rake_total >= 10000 THEN 0.30
    WHEN v_rake_total >=  2000 THEN 0.20
    WHEN v_rake_total >=   500 THEN 0.15
    WHEN v_rake_total >=   100 THEN 0.10
    ELSE                            0.05
  END;
  v_payout := ROUND(v_rake_total * v_rate, 4);

  UPDATE public.rakeback_periods
     SET rake_generated  = v_rake_total,
         total_rake_paid = v_rake_total,
         rakeback_rate   = v_rate,
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
     ROUND(v_rate * 100, 2), v_payout, 'paid', NOW())
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
    'rake_total', v_rake_total, 'rakeback_rate', v_rate,
    'payout', v_payout, 'payout_id', v_payout_id);
END;
$function$;
