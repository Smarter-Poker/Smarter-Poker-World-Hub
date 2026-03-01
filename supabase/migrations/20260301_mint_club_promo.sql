-- ═══════════════════════════════════════════════════════════
-- PROMO WALLET: Mint promo chips into club balance
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mint_club_promo(
  p_club_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF p_amount > 10000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount exceeds maximum (10M)');
  END IF;

  -- Atomic increment
  SELECT COALESCE(promo_balance, 0) INTO v_old_balance
  FROM clubs WHERE id = p_club_id FOR UPDATE;

  IF v_old_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club not found');
  END IF;

  v_new_balance := v_old_balance + p_amount;

  UPDATE clubs SET
    promo_balance = v_new_balance,
    updated_at = NOW()
  WHERE id = p_club_id;

  -- Log the mint in chip_transactions if table exists
  BEGIN
    INSERT INTO chip_transactions (club_id, amount, transaction_type, notes)
    VALUES (p_club_id, p_amount, 'promo_mint', 'Admin minted promo chips');
  EXCEPTION WHEN undefined_table THEN
    NULL; -- chip_transactions may not exist
  END;

  RETURN jsonb_build_object(
    'success', true,
    'oldBalance', v_old_balance,
    'newBalance', v_new_balance,
    'amount', p_amount
  );
END;
$$;
