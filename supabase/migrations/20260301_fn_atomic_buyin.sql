-- ================================================================
-- fn_atomic_buyin — Race-safe diamond→chip conversion
-- Uses row-level locks to prevent double-spend on concurrent requests.
-- ================================================================

CREATE OR REPLACE FUNCTION fn_atomic_buyin(
  p_user_id UUID,
  p_club_id UUID,
  p_chip_amount INTEGER,
  p_diamond_cost INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_diamonds INTEGER;
  v_chips NUMERIC;
  v_new_diamonds INTEGER;
  v_new_chips NUMERIC;
BEGIN
  -- Lock and read current diamond balance
  SELECT diamonds INTO v_diamonds
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_diamonds IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF v_diamonds < p_diamond_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient diamonds',
      'needed', p_diamond_cost,
      'available', v_diamonds
    );
  END IF;

  -- Lock and read current chip balance
  SELECT chip_balance INTO v_chips
    FROM club_members
    WHERE club_id = p_club_id AND user_id = p_user_id
    FOR UPDATE;

  IF v_chips IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a club member');
  END IF;

  -- Atomic debit diamonds
  v_new_diamonds := v_diamonds - p_diamond_cost;
  UPDATE profiles SET diamonds = v_new_diamonds WHERE id = p_user_id;

  -- Atomic credit chips
  v_new_chips := v_chips + p_chip_amount;
  UPDATE club_members SET chip_balance = v_new_chips
    WHERE club_id = p_club_id AND user_id = p_user_id;

  -- Record transaction
  INSERT INTO chip_transactions (from_user_id, to_user_id, club_id, transaction_type, amount, notes)
    VALUES (p_user_id, p_user_id, p_club_id, 'buyin', p_chip_amount,
      'Buy-in: ' || p_chip_amount || ' chips for ' || p_diamond_cost || ' 💎');

  RETURN jsonb_build_object(
    'success', true,
    'chipAmount', p_chip_amount,
    'diamondCost', p_diamond_cost,
    'newChipBalance', v_new_chips,
    'newDiamondBalance', v_new_diamonds
  );
END;
$$;
