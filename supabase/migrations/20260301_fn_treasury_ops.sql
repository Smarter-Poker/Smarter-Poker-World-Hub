-- ================================================================
-- fn_debit_treasury: Atomically deduct from club chip_treasury
-- Prevents overdraw via CHECK in UPDATE WHERE clause
-- ================================================================

CREATE OR REPLACE FUNCTION fn_debit_treasury(
  p_club_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE clubs
  SET chip_treasury = chip_treasury - p_amount
  WHERE id = p_club_id
    AND chip_treasury >= p_amount
  RETURNING chip_treasury INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient treasury balance';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'balance_after', v_new_balance
  );
END;
$$;

-- Also create fn_credit_treasury for completeness
CREATE OR REPLACE FUNCTION fn_credit_treasury(
  p_club_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE clubs
  SET chip_treasury = chip_treasury + p_amount
  WHERE id = p_club_id
  RETURNING chip_treasury INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'balance_after', v_new_balance
  );
END;
$$;
