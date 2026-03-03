-- ================================================================
-- BUG #154 (MEDIUM): fn_credit_chips missing positive amount check
--
-- fn_debit_chips, fn_credit_treasury, fn_debit_treasury, fn_credit_diamonds,
-- and lock_chips_for_table ALL validate p_amount > 0.
-- fn_credit_chips had NO such check — a negative amount would subtract
-- chips from a player without the balance guard that fn_debit_chips provides.
--
-- While the RPC is locked to service_role (per lockdown migration),
-- defense-in-depth requires validation at the SQL level.
-- ================================================================

CREATE OR REPLACE FUNCTION fn_credit_chips(
  p_club_id UUID,
  p_user_id UUID,
  p_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  -- BUG #154 FIX: Reject non-positive amounts
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE club_members
    SET chip_balance = COALESCE(chip_balance, 0) + p_amount,
        updated_at = NOW()
    WHERE club_id = p_club_id AND user_id = p_user_id
    RETURNING chip_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
