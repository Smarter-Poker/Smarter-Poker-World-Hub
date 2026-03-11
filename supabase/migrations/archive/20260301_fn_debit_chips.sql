-- ================================================================
-- fn_debit_chips — Atomic chip deduction with balance check
-- Returns error if insufficient balance (prevents going negative).
-- ================================================================

CREATE OR REPLACE FUNCTION fn_debit_chips(
  p_club_id UUID,
  p_user_id UUID,
  p_amount NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Lock row and read balance atomically
  SELECT chip_balance INTO v_balance
    FROM club_members
    WHERE club_id = p_club_id AND user_id = p_user_id
    FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Club member not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient chip balance: has %, needs %', v_balance, p_amount;
  END IF;

  UPDATE club_members
    SET chip_balance = chip_balance - p_amount
    WHERE club_id = p_club_id AND user_id = p_user_id;
END;
$$;
