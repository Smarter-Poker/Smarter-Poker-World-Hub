-- Horse (AI) chips must be funded from the club's treasury (clubs.chip_treasury),
-- not minted from nothing — horses put chips into pots real players can win, so
-- the chips must come from a real account for conservation. Two SECURITY DEFINER
-- RPCs, both all-or-nothing and both failing on insufficient treasury:
--   fn_horse_fund_from_treasury  — recurring rebuy/top-up on an existing seat
--   fn_horse_seat_from_treasury  — initial seating (insert seat + debit)
-- Applied to prod via MCP (horse_fund_from_treasury_20260721 +
-- horse_seat_from_treasury_20260721).
--
-- SCOPE NOTE: this covers the CLIENT horse path (AutoRebuyService.rebuyHorse +
-- HorseOrchestrator seeding). The SERVER-side engine AutoRebuyService still
-- refills horse *wallets* globally (per-horse, not club-scoped) via
-- atomic_credit_wallet_and_log with no offsetting debit — that is the primary
-- live mint and needs a GLOBAL house account decision (a per-club treasury does
-- not map to global per-horse wallet funding). Tracked as a follow-up.

CREATE OR REPLACE FUNCTION public.fn_horse_fund_from_treasury(
  p_table_id uuid, p_user_id uuid, p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $function$
DECLARE v_club_id uuid; v_treasury numeric; v_new_stack numeric;
BEGIN
  IF p_table_id IS NULL OR p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'table, user and positive amount required'); END IF;
  SELECT club_id INTO v_club_id FROM tables WHERE id = p_table_id;
  IF v_club_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'table has no club'); END IF;
  SELECT COALESCE(chip_treasury,0) INTO v_treasury FROM clubs WHERE id = v_club_id FOR UPDATE;
  IF v_treasury IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'club not found'); END IF;
  IF v_treasury < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient club treasury', 'treasury', v_treasury, 'needed', p_amount); END IF;
  UPDATE table_seats SET stack = COALESCE(stack,0) + p_amount
    WHERE table_id = p_table_id AND user_id = p_user_id AND left_at IS NULL RETURNING stack INTO v_new_stack;
  IF v_new_stack IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'no active seat for user at table'); END IF;
  UPDATE clubs SET chip_treasury = COALESCE(chip_treasury,0) - p_amount, updated_at = NOW() WHERE id = v_club_id;
  INSERT INTO chip_transactions (id, club_id, from_user_id, to_user_id, amount, transaction_type, notes, balance_after, created_at)
    VALUES (gen_random_uuid(), v_club_id, NULL, p_user_id, p_amount, 'horse_treasury_funding', 'Horse buy-in/rebuy funded from club treasury', v_treasury - p_amount, NOW());
  RETURN jsonb_build_object('success', true, 'new_stack', v_new_stack, 'treasury_after', v_treasury - p_amount);
END; $function$;

CREATE OR REPLACE FUNCTION public.fn_horse_seat_from_treasury(
  p_table_id uuid, p_user_id uuid, p_seat_number integer, p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $function$
DECLARE v_club_id uuid; v_treasury numeric;
BEGIN
  IF p_table_id IS NULL OR p_user_id IS NULL OR p_seat_number IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'table, user, seat and positive amount required'); END IF;
  SELECT club_id INTO v_club_id FROM tables WHERE id = p_table_id;
  IF v_club_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'table has no club'); END IF;
  SELECT COALESCE(chip_treasury,0) INTO v_treasury FROM clubs WHERE id = v_club_id FOR UPDATE;
  IF v_treasury IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'club not found'); END IF;
  IF v_treasury < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient club treasury', 'treasury', v_treasury, 'needed', p_amount); END IF;
  BEGIN
    INSERT INTO table_seats (table_id, user_id, seat_number, stack, is_sitting_out)
      VALUES (p_table_id, p_user_id, p_seat_number, p_amount, false);
  EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success', false, 'error', 'seat already taken'); END;
  UPDATE clubs SET chip_treasury = COALESCE(chip_treasury,0) - p_amount, updated_at = NOW() WHERE id = v_club_id;
  INSERT INTO chip_transactions (id, club_id, from_user_id, to_user_id, amount, transaction_type, notes, balance_after, created_at)
    VALUES (gen_random_uuid(), v_club_id, NULL, p_user_id, p_amount, 'horse_treasury_funding', 'Horse seated + funded from club treasury', v_treasury - p_amount, NOW());
  RETURN jsonb_build_object('success', true, 'treasury_after', v_treasury - p_amount);
END; $function$;
