-- ═══════════════════════════════════════════════════════════════════════════
-- UNION ATOMIC DEPOSIT + CLAWBACK RPCs — 2026-07-21
--
-- The union dashboard's deposit flow chained two client-side RPC calls:
--   1. atomic_deduct_wallet_and_log  (player wallet debit — WORKED under RLS)
--   2. increment_union_chip_balance  (union credit — RLS-BLOCKED, not SECDEF)
-- For a real browser user, step 1 succeeded and step 2 failed: chips left the
-- owner's wallet and never reached the union bank. The clawback flow had the
-- same shape (decrement_club_treasury -> increment). These two SECURITY
-- DEFINER functions make each flow a single atomic transaction with the
-- union-lead check INSIDE the function (auth.uid()), so no client-side
-- pairing can strand money.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_union_deposit_from_wallet(
  p_union_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_lead boolean;
  v_balance numeric;
  v_after numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount must be > 0');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM union_admins ua
     WHERE ua.union_id = p_union_id AND ua.user_id = v_uid AND ua.role = 'union_lead'
  ) OR EXISTS (
    SELECT 1 FROM unions u WHERE u.id = p_union_id AND u.owner_id = v_uid
  ) INTO v_is_lead;
  IF NOT v_is_lead THEN
    RETURN jsonb_build_object('success', false, 'error', 'union lead access required');
  END IF;

  -- Debit the caller's PLAYER wallet (locked)
  SELECT balance INTO v_balance FROM wallets
   WHERE user_id = v_uid AND wallet_type = 'PLAYER' FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient wallet balance');
  END IF;
  UPDATE wallets SET balance = balance - p_amount, updated_at = NOW()
   WHERE user_id = v_uid AND wallet_type = 'PLAYER';

  -- Credit the union bank (canonical union_wallets store)
  INSERT INTO union_wallets (union_id, chip_balance)
  VALUES (p_union_id, p_amount)
  ON CONFLICT (union_id) DO UPDATE
    SET chip_balance = COALESCE(union_wallets.chip_balance, 0) + p_amount,
        updated_at = NOW()
  RETURNING chip_balance INTO v_after;

  INSERT INTO union_wallet_transactions (
    union_id, wallet, direction, amount, balance_after, tx_type, notes, created_by
  ) VALUES (
    p_union_id, 'chip_balance', 'credit', p_amount, v_after, 'owner_deposit',
    COALESCE(NULLIF(p_notes, ''), 'Union bank deposit from owner wallet'), v_uid
  );

  RETURN jsonb_build_object('success', true, 'amount', p_amount, 'union_balance', v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_union_clawback_from_club(
  p_union_id uuid,
  p_club_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_lead boolean;
  v_treasury numeric;
  v_after numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount must be > 0');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM union_admins ua
     WHERE ua.union_id = p_union_id AND ua.user_id = v_uid AND ua.role = 'union_lead'
  ) OR EXISTS (
    SELECT 1 FROM unions u WHERE u.id = p_union_id AND u.owner_id = v_uid
  ) INTO v_is_lead;
  IF NOT v_is_lead THEN
    RETURN jsonb_build_object('success', false, 'error', 'union lead access required');
  END IF;

  -- The club must belong to this union (IDOR guard)
  IF NOT EXISTS (
    SELECT 1 FROM union_clubs uc WHERE uc.union_id = p_union_id AND uc.club_id = p_club_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'club is not in this union');
  END IF;

  -- Debit the club treasury (guarded against negative)
  UPDATE clubs SET chip_treasury = COALESCE(chip_treasury, 0) - p_amount
   WHERE id = p_club_id AND COALESCE(chip_treasury, 0) >= p_amount
  RETURNING chip_treasury INTO v_treasury;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient club treasury balance');
  END IF;

  -- Credit the union bank
  INSERT INTO union_wallets (union_id, chip_balance)
  VALUES (p_union_id, p_amount)
  ON CONFLICT (union_id) DO UPDATE
    SET chip_balance = COALESCE(union_wallets.chip_balance, 0) + p_amount,
        updated_at = NOW()
  RETURNING chip_balance INTO v_after;

  INSERT INTO union_wallet_transactions (
    union_id, wallet, direction, amount, balance_after, tx_type, club_id, notes, created_by
  ) VALUES (
    p_union_id, 'chip_balance', 'credit', p_amount, v_after, 'clawback',
    p_club_id, COALESCE(NULLIF(p_notes, ''), 'Clawback from club treasury'), v_uid
  );

  INSERT INTO chip_transactions (club_id, amount, transaction_type, notes)
  VALUES (p_club_id, p_amount, 'union_clawback',
          COALESCE(NULLIF(p_notes, ''), 'Union clawback from club treasury'));

  RETURN jsonb_build_object(
    'success', true, 'amount', p_amount,
    'club_treasury', v_treasury, 'union_balance', v_after
  );
END;
$$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.fn_union_deposit_from_wallet(uuid, numeric, text);
-- DROP FUNCTION IF EXISTS public.fn_union_clawback_from_club(uuid, uuid, numeric, text);
