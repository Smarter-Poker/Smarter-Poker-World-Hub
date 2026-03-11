-- Fix: live_state column needs to be on 'tables' (Club Arena), not 'poker_tables' (old schema)
-- The poker engine code (StateSerializer, GameController) references from('tables')

ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS live_state JSONB DEFAULT NULL;
COMMENT ON COLUMN public.tables.live_state IS 'Serialized mid-hand game state for crash recovery. Cleared on hand_complete.';

-- ══════════════════════════════════════════════════════════════════════
-- fn_credit_chips: Atomically credit chips to a club member
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_credit_chips(
  p_club_id UUID,
  p_user_id UUID,
  p_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
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

-- ══════════════════════════════════════════════════════════════════════
-- update_table_stats: Atomically update table hand count + avg pot
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_table_stats(
  p_table_id UUID,
  p_pot_total NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Add hands_dealt column if not exists (safe for initial deploy)
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS hands_dealt INTEGER DEFAULT 0;
  ALTER TABLE tables ADD COLUMN IF NOT EXISTS avg_pot NUMERIC DEFAULT 0;

  UPDATE tables
    SET hands_dealt = COALESCE(hands_dealt, 0) + 1,
        avg_pot = (COALESCE(avg_pot, 0) * 0.9) + (p_pot_total * 0.1),
        updated_at = NOW()
    WHERE id = p_table_id;
END;
$$;
