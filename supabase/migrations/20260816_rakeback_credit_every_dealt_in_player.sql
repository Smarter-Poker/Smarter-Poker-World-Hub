-- ============================================================================
-- 20260816_rakeback_credit_every_dealt_in_player.sql
-- TIER 3 (money-moving function body change).  APPLIED 2026-08-16.
--
-- WHY
-- ---
-- Dan's binding ruling (2026-08-15, DECISION D-001 / FIX 144):
--   "IT'S SUPPOSED TO BE EVENLY DISTRIBUTED AND CREDITED TO EVERY PLAYER
--    DEALT IN, ONLY USE THIS MODEL AND DELETE ANYTHING THAT CONFLICTS
--    WITH THIS."
--
-- fn_close_settlement_period already split equally, but filtered
-- player_contributions to entries whose value is > 0 in TWO places:
--   1. the denominator  -> count(*) ... WHERE (e.value)::numeric > 0
--   2. the eligibility  -> AND (player_contributions->>user_id)::numeric > 0
--
-- "Contributed chips to the pot" is not "was dealt in". A player dealt a hand
-- who folds preflop without posting has a contribution of 0: under the old
-- body they were paid nothing AND removed from the denominator, so everyone
-- else was overpaid relative to the ruling.
--
-- Measured on production 2026-08-16:
--   trailing 30d: 623,557 raked hands, 3,238,258 dealt-in slots,
--                 2,264,465 with value > 0  -> 973,793 excluded (30.1%)
--   trailing  7d: 525,982 dealt-in slots, ALL belonging to real auth users,
--                 128,802 of them (24.5%) had zero contribution and so
--                 earned no rakeback at all.
--
-- WHAT CHANGES
-- ------------
-- Denominator becomes the count of KEYS in player_contributions (every player
-- dealt into the hand); eligibility becomes mere presence of the key. The
-- contribution VALUE is no longer consulted for either purpose.
--
-- JUDGEMENT CALL - HORSES ARE COUNTED
-- -----------------------------------
-- player_contributions includes horse seats, so a human at a 2-human/3-horse
-- table earns rake/5 rather than rake/3; the horses' shares are simply never
-- paid out (horses have no rakeback_periods rows). This is the conservative
-- reading, it is the literal reading of "every player dealt in", and it
-- matches the stated intent of the prior migration, which was named
-- 20260721_rakeback_include_horses_equal_share.sql. Flagged so it stays a
-- conscious, reversible choice.
--
-- NOT RETROACTIVE
-- ---------------
-- Periods already status='paid' are skipped by the guard at the top of the
-- function. Back-crediting the excluded slots would need separate, explicitly
-- approved remediation.
--
-- APPLIED VIA: Supabase MCP apply_migration, name
-- "rakeback_credit_every_dealt_in_player". Pre-flight and post-apply
-- assertion blocks below both passed. Verified live afterwards:
--   uses_dealt_in_denominator = true, still_excludes_zero = false.
-- ============================================================================

-- -- PRE-FLIGHT: refuse to run against an unexpected baseline ----------------
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_close_settlement_period';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT: fn_close_settlement_period does not exist';
  END IF;
  IF v_def NOT LIKE '%(e.value)::numeric > 0%' THEN
    RAISE EXCEPTION 'PRE-FLIGHT: expected the >0 contributor filter in the live body; it is absent.';
  END IF;
END $$;

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

  -- EQUAL-SHARE across EVERY PLAYER DEALT IN (DECISION D-001).
  -- Denominator = number of keys in player_contributions (all dealt-in seats).
  -- Eligibility = the user's key is present. The contribution VALUE is
  -- deliberately not consulted: contributing 0 chips does not make a player
  -- any less dealt in.
  SELECT COALESCE(SUM(
           r.rake_amount / GREATEST(
             (SELECT count(*) FROM jsonb_object_keys(r.player_contributions) k), 1)
         ), 0)
    INTO v_rake_total
    FROM public.rake_records r
   WHERE r.club_id = v_period.club_id
     AND r.created_at::date >= v_period.period_start
     AND r.created_at::date <= v_period.period_end
     AND r.rake_amount > 0
     AND r.player_contributions IS NOT NULL
     AND (r.player_contributions ? v_period.user_id::text);

  v_rake_total := ROUND(v_rake_total, 2);

  -- Tier rate (same thresholds as pages/api/club-arena/rakeback.js).
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

-- -- POST-APPLY ASSERTIONS ---------------------------------------------------
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_close_settlement_period';
  IF v_def LIKE '%(e.value)::numeric > 0%' THEN
    RAISE EXCEPTION 'POST-APPLY: the >0 contributor filter is still present';
  END IF;
  IF v_def NOT LIKE '%jsonb_object_keys(r.player_contributions)%' THEN
    RAISE EXCEPTION 'POST-APPLY: dealt-in denominator not found';
  END IF;
  RAISE NOTICE 'OK: fn_close_settlement_period now credits every player dealt in';
END $$;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Re-apply the body above with these two clauses restored:
--
--   denominator:
--     (SELECT count(*) FROM jsonb_each_text(r.player_contributions) e
--       WHERE (e.value)::numeric > 0)
--
--   and re-add this line after the `?` presence check:
--     AND (r.player_contributions->>(v_period.user_id::text))::numeric > 0;
--
-- Everything else is byte-identical to the pre-change version, so restoring
-- those two clauses is a complete rollback. This migration writes no data
-- (computation only), and already-paid periods are skipped by the status
-- guard, so nothing needs reversing.
-- ============================================================================
