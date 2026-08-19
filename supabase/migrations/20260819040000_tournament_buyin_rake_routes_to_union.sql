-- APPLIED TO PRODUCTION 2026-08-19 as `tournament_buyin_rake_routes_to_union_v2`.
-- Mirror only. Do not re-run.
--
-- WHY: Dan's rule -- tournament HANDS are never raked; the BUY-IN is raked
-- (10+1, the +1 is the rake). That fee must be held in the UNION wallet when the
-- club belongs to a union, and only in the CLUB wallet when the club is a
-- standalone. Before this migration `record_tournament_buyin_rake` credited
-- `club_wallets.chip_balance` unconditionally, so a union club's tournament rake
-- landed in the club while its cash-game rake correctly landed in the union.
--
-- The payer must also get the fee credited to their weekly `rake_generated`.
-- That half works through the `rake_records` row: `player_contributions` names
-- the payer, and `RakebackSettlerService` processes tournament/SNG fee rows
-- (keying idempotency on `rake_records.id`, since these rows carry no hand_id).
--
-- NOTE: the DROP is required -- Postgres refuses `CREATE OR REPLACE` here with
-- "cannot remove parameter defaults from existing function".
--
-- VERIFIED 2026-08-19 by a rolled-back probe against synthetic union/club/
-- tournament rows (synthetic so concurrent live rake could not pollute the
-- deltas -- an earlier probe against live rows read +12.20 instead of +11.00
-- purely from real traffic landing in the same wallet mid-probe). 15/15 exact:
--   union club  -> union_wallets.rake_wallet +11.00, chip_balance +11.00,
--                  total_rake_collected +11.00, 1 union_wallet_transactions row,
--                  club_wallets.chip_balance +0.00 (correct: union holds it),
--                  club period/lifetime_rake_collected +11.00 (accounting only),
--                  clubs.total_rake +11.00, tournaments.total_rake +11.00,
--                  1 rake_records row, source='tournament_buyin',
--                  player_contributions = {payer: 11.00}
--   standalone  -> club_wallets.chip_balance +11.00, period_rake +11.00,
--                  1 club_wallet_transactions row

DROP FUNCTION IF EXISTS public.record_tournament_buyin_rake(uuid, numeric, uuid);

CREATE FUNCTION public.record_tournament_buyin_rake(
  p_tournament_id uuid DEFAULT NULL::uuid,
  p_amount numeric DEFAULT 0,
  p_player_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_union_id uuid;
  v_rake_id uuid;
  v_union_rake numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_tournament_id IS NULL THEN RETURN; END IF;

  SELECT club_id INTO v_club_id FROM public.tournaments WHERE id = p_tournament_id;
  IF v_club_id IS NULL THEN RETURN; END IF;

  SELECT union_id INTO v_union_id FROM public.clubs WHERE id = v_club_id;

  -- The ledger row. player_contributions names the payer, and that is what
  -- credits their weekly rake_generated downstream.
  INSERT INTO public.rake_records (
    hand_id, table_id, club_id, rake_amount, bbj_contribution, pot_size,
    num_players, player_contributions, is_tournament, tournament_id, source
  ) VALUES (
    NULL, NULL, v_club_id, p_amount, 0, 0, 1,
    jsonb_build_object(p_player_id::text, p_amount), TRUE, p_tournament_id, 'tournament_buyin'
  ) RETURNING id INTO v_rake_id;

  IF v_union_id IS NOT NULL THEN
    INSERT INTO public.union_wallets (union_id, chip_balance, rake_wallet, total_rake_collected)
         VALUES (v_union_id, p_amount, p_amount, p_amount)
    ON CONFLICT (union_id) DO UPDATE SET
         chip_balance         = public.union_wallets.chip_balance + p_amount,
         rake_wallet          = public.union_wallets.rake_wallet + p_amount,
         total_rake_collected = COALESCE(public.union_wallets.total_rake_collected, 0) + p_amount,
         updated_at           = NOW()
    RETURNING rake_wallet INTO v_union_rake;

    INSERT INTO public.union_wallet_transactions (
      union_id, club_id, amount, tx_type, wallet, direction, balance_after, notes
    ) VALUES (
      v_union_id, v_club_id, p_amount, 'rake', 'rake_wallet', 'credit', v_union_rake,
      'Tournament buy-in rake (tournament ' || p_tournament_id::text || ')'
    );

    -- Club keeps its accounting counters, but NOT the chips.
    UPDATE public.club_wallets
       SET period_rake_collected   = COALESCE(period_rake_collected, 0) + p_amount,
           lifetime_rake_collected = COALESCE(lifetime_rake_collected, 0) + p_amount,
           updated_at = NOW()
     WHERE club_id = v_club_id;
  ELSE
    UPDATE public.club_wallets
       SET period_rake_collected   = COALESCE(period_rake_collected, 0) + p_amount,
           lifetime_rake_collected = COALESCE(lifetime_rake_collected, 0) + p_amount,
           chip_balance            = chip_balance + p_amount,
           updated_at = NOW()
     WHERE club_id = v_club_id;

    INSERT INTO public.club_wallet_transactions
      (club_id, type, amount, balance_after, related_id, reason)
    SELECT v_club_id, 'rake_in', p_amount, chip_balance, v_rake_id,
           'Tournament buy-in rake (tournament ' || p_tournament_id::text || ')'
      FROM public.club_wallets WHERE club_id = v_club_id;
  END IF;

  UPDATE public.clubs SET total_rake = COALESCE(total_rake,0) + p_amount, updated_at = NOW()
   WHERE id = v_club_id;
  UPDATE public.tournaments SET total_rake = COALESCE(total_rake,0) + p_amount, updated_at = NOW()
   WHERE id = p_tournament_id;
END;
$function$;
