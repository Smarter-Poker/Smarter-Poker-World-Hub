-- Atomic diamond deduction for transfers
-- Returns the new balance, or NULL if insufficient funds
-- This prevents race conditions where concurrent transfers
-- can cause stale-snapshot balance calculations
CREATE OR REPLACE FUNCTION transfer_diamonds_deduct(
  sender_id UUID,
  deduct_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  -- Atomic: UPDATE only if balance >= amount, return new balance
  UPDATE profiles
  SET diamonds = diamonds - deduct_amount,
      updated_at = NOW()
  WHERE id = sender_id
    AND diamonds >= deduct_amount
  RETURNING diamonds INTO new_balance;

  -- If no row updated (insufficient funds), return NULL
  RETURN new_balance;
END;
$$;

-- Atomic diamond credit for transfers
-- Returns the new balance after crediting
CREATE OR REPLACE FUNCTION transfer_diamonds_credit(
  recipient_id UUID,
  credit_amount INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE profiles
  SET diamonds = diamonds + credit_amount,
      updated_at = NOW()
  WHERE id = recipient_id
  RETURNING diamonds INTO new_balance;

  RETURN new_balance;
END;
$$;

-- Grant execute to service role (API uses service role key)
GRANT EXECUTE ON FUNCTION transfer_diamonds_deduct(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION transfer_diamonds_credit(UUID, INTEGER) TO service_role;
