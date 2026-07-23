-- Three client-called money RPCs that never existed in the DB, so the calling
-- UI paths silently broke. Verified LIVE-BREAKAGE by call-site tracing:
--   * atomic_table_rebuy      - cash-game bust rebuy (TablePage BuyInModal)
--   * deduct_table_chip_lock  - dealer tip from a player's table stack (TipDealer)
--   * process_tournament_rebuy- tournament rebuy/reentry/addon (Rebuy/AddOn modals)
-- Modeled on the proven, guard-compatible siblings atomic_table_buyin /
-- atomic_table_addon / atomic_tournament_register. Chips are conserved
-- (wallet<->seat stack; seat stack->club treasury for tips).
-- Applied to prod via Supabase MCP 2026-07-23.
--
-- The client already calls these three with matching params (TablePage.tsx,
-- WalletService.processDealerTip, TournamentService.processRebuy/AddOn) - only
-- the DB functions were missing.

-- === 1. Cash-game rebuy: wallet -> existing seat stack (mirror atomic_table_addon;
--        atomic_table_rebuy is already whitelisted in guard_wallet_balance_write).
CREATE OR REPLACE FUNCTION public.atomic_table_rebuy(
  p_user_id uuid, p_table_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_balance numeric;
  v_club_id uuid;
  v_union_id uuid;
  v_ban_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Rebuy amount must be positive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM table_seats
     WHERE table_id = p_table_id AND user_id = p_user_id AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Player not seated at this table (cannot rebuy a vacated seat)';
  END IF;

  SELECT t.club_id, c.union_id INTO v_club_id, v_union_id
    FROM tables t LEFT JOIN clubs c ON c.id = t.club_id
   WHERE t.id = p_table_id LIMIT 1;
  IF v_club_id IS NOT NULL THEN
    SELECT id INTO v_ban_id FROM blacklists
     WHERE user_id = p_user_id
       AND (expires_at IS NULL OR expires_at > now())
       AND (club_id = v_club_id OR (v_union_id IS NOT NULL AND union_id = v_union_id))
     LIMIT 1;
    IF v_ban_id IS NOT NULL THEN
      RAISE EXCEPTION 'Banned from this club';
    END IF;
  END IF;

  UPDATE wallets
     SET balance = balance - p_amount, updated_at = NOW()
   WHERE user_id = p_user_id AND wallet_type = 'PLAYER' AND balance >= p_amount
   RETURNING balance INTO v_new_balance;
  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance for rebuy';
  END IF;

  UPDATE table_seats
     SET stack = stack + p_amount
   WHERE table_id = p_table_id AND user_id = p_user_id AND left_at IS NULL;

  INSERT INTO wallet_transactions
    (user_id, wallet_type, type, amount, category, description, table_id, balance_after)
    VALUES (p_user_id, 'PLAYER', 'debit', -p_amount, 'rebuy',
            'Cash game rebuy at table', p_table_id, v_new_balance);

  RETURN v_new_balance;
END;
$function$;

-- === 2. Dealer tip: player table stack -> club treasury (chip-conserving).
--        Does not touch wallets, so the wallet guard is not involved.
CREATE OR REPLACE FUNCTION public.deduct_table_chip_lock(
  p_user_id uuid, p_table_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_stack numeric;
  v_club_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Deduction amount must be positive';
  END IF;

  UPDATE table_seats
     SET stack = stack - p_amount
   WHERE table_id = p_table_id AND user_id = p_user_id AND left_at IS NULL
     AND stack >= p_amount
   RETURNING stack INTO v_new_stack;
  IF v_new_stack IS NULL THEN
    RAISE EXCEPTION 'Insufficient table chips for this deduction';
  END IF;

  SELECT club_id INTO v_club_id FROM tables WHERE id = p_table_id;
  IF v_club_id IS NOT NULL THEN
    UPDATE clubs SET chip_treasury = COALESCE(chip_treasury, 0) + p_amount
     WHERE id = v_club_id;
  END IF;

  RETURN v_new_stack;
END;
$function$;

-- === 3. Tournament rebuy / reentry / addon: deduct wallet, top up tournament_players
--        stack, log to history. Direct wallet mutation -> whitelisted below.
CREATE OR REPLACE FUNCTION public.process_tournament_rebuy(
  p_tournament_id uuid,
  p_user_id uuid,
  p_rebuy_type text,
  p_cost numeric,
  p_chips numeric,
  p_current_level integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_new_chips integer;
  v_exists boolean;
  v_add integer := COALESCE(p_chips, 0)::integer;
BEGIN
  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'Invalid rebuy cost';
  END IF;
  IF p_rebuy_type NOT IN ('rebuy','reentry','addon') THEN
    RAISE EXCEPTION 'Invalid rebuy type: %', p_rebuy_type;
  END IF;

  SELECT true INTO v_exists FROM tournament_players
   WHERE tournament_id = p_tournament_id AND user_id = p_user_id LIMIT 1;
  IF v_exists IS NULL THEN
    RAISE EXCEPTION 'Player not registered in this tournament';
  END IF;

  SELECT balance INTO v_balance FROM wallets
   WHERE user_id = p_user_id AND wallet_type = 'PLAYER' FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_cost THEN
    RAISE EXCEPTION 'Insufficient chips for rebuy';
  END IF;
  UPDATE wallets SET balance = balance - p_cost, updated_at = NOW()
   WHERE user_id = p_user_id AND wallet_type = 'PLAYER';

  IF p_rebuy_type = 'reentry' THEN
    UPDATE tournament_players
       SET chips = v_add, status = 'active', eliminated_at = NULL,
           rebuys = COALESCE(rebuys, 0) + 1
     WHERE tournament_id = p_tournament_id AND user_id = p_user_id
     RETURNING chips INTO v_new_chips;
  ELSIF p_rebuy_type = 'addon' THEN
    UPDATE tournament_players
       SET chips = COALESCE(chips, 0) + v_add, add_on = true
     WHERE tournament_id = p_tournament_id AND user_id = p_user_id
     RETURNING chips INTO v_new_chips;
  ELSE  -- rebuy
    UPDATE tournament_players
       SET chips = COALESCE(chips, 0) + v_add, status = 'active',
           rebuys = COALESCE(rebuys, 0) + 1
     WHERE tournament_id = p_tournament_id AND user_id = p_user_id
     RETURNING chips INTO v_new_chips;
  END IF;

  INSERT INTO wallet_transactions
    (user_id, wallet_type, type, amount, category, description, balance_after)
    VALUES (p_user_id, 'PLAYER', 'debit', -p_cost, 'tournament_buyin',
            'Tournament ' || p_rebuy_type, v_balance - p_cost);

  RETURN jsonb_build_object('success', true, 'new_stack', v_new_chips, 'rebuy_type', p_rebuy_type);
END;
$function$;

-- === Whitelist process_tournament_rebuy in the wallet guard (additive).
CREATE OR REPLACE FUNCTION public.guard_wallet_balance_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stack   TEXT;
  v_bypass  TEXT;
  v_allowed TEXT[] := ARRAY[
    'atomic_credit_wallet_and_log','atomic_deduct_wallet_and_log','atomic_wallet_transfer',
    'atomic_chip_transfer','fn_idempotent_credit_wallet','fn_idempotent_deduct_wallet',
    'fn_idempotent_wallet_transfer','atomic_table_buyin','atomic_table_cashout',
    'atomic_table_rebuy','atomic_seat_horse','player_leave_table','atomic_tournament_register',
    'atomic_tournament_unregister','atomic_cancel_tournament','distribute_tournament_prizes',
    'process_tournament_rebuy',
    'atomic_pay_agent_settlement','atomic_pay_player_rakeback','credit_agent_commission',
    'credit_player_rakeback','execute_commission_payout','fn_cancel_cashout','fn_reject_cashout',
    'fn_clawback_chips_atomic','distribute_chips','mint_club_chips','add_chips','add_to_promo_wallet',
    'credit_player_wallet','deduct_player_wallet','wallet_internal_transfer','wallet_user_transfer',
    'create_user_wallets','reconcile_ledger_nightly'
  ];
  v_fn TEXT;
BEGIN
  v_bypass := current_setting('app.bypass_wallet_guard', true);
  IF v_bypass = 'on' THEN RETURN NEW; END IF;
  GET DIAGNOSTICS v_stack = PG_CONTEXT;
  FOREACH v_fn IN ARRAY v_allowed LOOP
    IF v_stack ~ ('function (public\.)?' || v_fn || '\(') THEN
      RETURN NEW;
    END IF;
  END LOOP;
  RAISE EXCEPTION
    'Direct balance mutation on %.% is forbidden by Phase 4.1.6a guard. '
    'All balance changes must flow through the whitelisted SECURITY DEFINER '
    'RPCs (atomic_*, fn_idempotent_*, distribute_chips, mint_club_chips, etc.) '
    'that log to chip_ledger. Admin override: '
    'SELECT set_config(''app.bypass_wallet_guard'', ''on'', true);',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.atomic_table_rebuy(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_table_chip_lock(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_tournament_rebuy(uuid,uuid,text,numeric,numeric,integer) TO authenticated;
