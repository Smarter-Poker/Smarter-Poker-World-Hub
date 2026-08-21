-- ═══════════════════════════════════════════════════════════════════════
-- 20260821070000_horse_bankroll_tools.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER 2. AUTHOR: Cowork (Claude). IRREVERSIBLE: no (ROLLBACK at bottom).
--
-- WHY: Dan, 2026-08-21 — "FUND ALL HORSES, ADD MORE CHIPS, THIS IS ALL BETA
-- TESTING ANYWAYS."
--
-- Two reusable functions rather than a fourth one-off UPDATE. Horses keep
-- being seeded unfunded, and this was the third roster in one night that
-- needed topping up. Beta or not, chips get a provenance row: the moment this
-- platform is not beta, an untraceable balance is a liability, and a mint that
-- was never recorded cannot be unwound.
--
--   fn_mint_club_chips(club, amount, reason)
--     Adds chips to a treasury and writes a treasury_mint ledger row. This is
--     the ONLY place in the codebase that creates chips from nothing, which is
--     the point: one door, and it is signposted.
--
--   fn_seed_horses_to_floor(club, floor)
--     Tops every horse UP TO the floor, never reducing one already above it.
--     Debits the treasury by exactly the sum credited, writes a
--     horse_treasury_funding row per horse, and refuses to run at all if the
--     treasury cannot cover the whole batch — a partial seeding that silently
--     funds the first 200 horses is worse than none.
--
-- APPLIED 2026-08-21 across Shark Club, Club JAQK and Midway Union:
--   3 mints of 6,000,000 (18,000,000 total)
--   774 horses topped up to a 25,000 floor (13,271,302 moved)
--   Result: 1,486 horses, none below 25,000, none at zero. 25,000 is five
--   buy-ins at the largest table on the platform (max_buy_in 5,000), so every
--   horse can now sit in any game running.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_mint_club_chips(
    p_club_id uuid, p_amount numeric, p_reason text DEFAULT 'beta top-up'
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_after numeric;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'mint amount must be positive, got %', p_amount;
    END IF;
    UPDATE public.clubs SET chip_treasury = coalesce(chip_treasury,0) + p_amount
     WHERE id = p_club_id RETURNING chip_treasury INTO v_after;
    IF v_after IS NULL THEN RAISE EXCEPTION 'mint failed: club % not found', p_club_id; END IF;
    INSERT INTO public.chip_transactions
        (club_id, from_user_id, to_user_id, amount, transaction_type, notes, balance_after)
    VALUES (p_club_id, NULL, NULL, p_amount, 'treasury_mint', p_reason, v_after);
    RETURN v_after;
END; $function$;

CREATE OR REPLACE FUNCTION public.fn_seed_horses_to_floor(
    p_club_id uuid, p_floor numeric
) RETURNS TABLE(horses_funded integer, chips_moved numeric, treasury_after numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_needed numeric; v_count integer; v_before numeric; v_after numeric;
BEGIN
    IF p_floor IS NULL OR p_floor <= 0 THEN
        RAISE EXCEPTION 'floor must be positive, got %', p_floor;
    END IF;
    SELECT coalesce(chip_treasury,0) INTO v_before FROM public.clubs WHERE id = p_club_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'club % not found', p_club_id; END IF;

    SELECT count(*), coalesce(sum(p_floor - cm.chip_balance),0) INTO v_count, v_needed
      FROM public.club_members cm JOIN public.profiles p ON p.id = cm.user_id
     WHERE cm.club_id = p_club_id AND p.is_horse AND cm.chip_balance < p_floor;

    IF v_count = 0 THEN RETURN QUERY SELECT 0, 0::numeric, v_before; RETURN; END IF;

    IF v_before < v_needed THEN
        RAISE EXCEPTION 'treasury % cannot cover % for % horses (floor %) — mint first',
              v_before, v_needed, v_count, p_floor;
    END IF;

    INSERT INTO public.chip_transactions
        (club_id, from_user_id, to_user_id, amount, transaction_type, notes, balance_after)
    SELECT p_club_id, NULL, cm.user_id, p_floor - cm.chip_balance, 'horse_treasury_funding',
           'Topped up to the club bankroll floor so the horse can buy into any table', p_floor
      FROM public.club_members cm JOIN public.profiles p ON p.id = cm.user_id
     WHERE cm.club_id = p_club_id AND p.is_horse AND cm.chip_balance < p_floor;

    UPDATE public.club_members cm SET chip_balance = p_floor
      FROM public.profiles p
     WHERE p.id = cm.user_id AND cm.club_id = p_club_id AND p.is_horse AND cm.chip_balance < p_floor;

    UPDATE public.clubs SET chip_treasury = chip_treasury - v_needed WHERE id = p_club_id
    RETURNING chip_treasury INTO v_after;

    IF v_after < 0 THEN RAISE EXCEPTION 'post-apply failed: treasury negative (%)', v_after; END IF;
    IF (v_before - v_after) <> v_needed THEN
        RAISE EXCEPTION 'post-apply failed: conservation broken — moved %, credited %',
              (v_before - v_after), v_needed;
    END IF;
    RETURN QUERY SELECT v_count, v_needed, v_after;
END; $function$;

-- ROLLBACK (functions only — the chips they moved are recorded in
-- chip_transactions and must be reconciled from there, not guessed at):
--   DROP FUNCTION IF EXISTS public.fn_seed_horses_to_floor(uuid, numeric);
--   DROP FUNCTION IF EXISTS public.fn_mint_club_chips(uuid, numeric, text);
