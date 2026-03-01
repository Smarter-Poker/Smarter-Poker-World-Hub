-- ================================================================
-- fn_credit_diamonds — Atomic diamond increment (no read-then-write race)
-- ================================================================

CREATE OR REPLACE FUNCTION fn_credit_diamonds(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE profiles
    SET diamonds = COALESCE(diamonds, 0) + p_amount
    WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;
END;
$$;
