-- ============================================================================
-- Migration: Fix insurance chip inflation
-- Date: 2026-03-03
--
-- BUG #158 (HIGH): Insurance premiums and payouts only update a separate
--   insurance_balance column, but don't adjust chip_treasury. This means:
--   - Premiums: chips vanish from table (player stack goes down) but never
--     return to club treasury — chip supply decreases
--   - Payouts: chips appear from nothing (player stack goes up) without
--     debiting club treasury — chip supply increases
--
-- FIX: record_insurance_transaction now also adjusts chip_treasury:
--   - Premium collected → credit chip_treasury (premium enters treasury)
--   - Payout disbursed → debit chip_treasury (payout leaves treasury)
--   - insurance_balance tracking is kept for P&L reporting
-- ============================================================================

CREATE OR REPLACE FUNCTION record_insurance_transaction(
  p_club_id UUID,
  p_table_id TEXT,
  p_player_id UUID,
  p_amount NUMERIC,
  p_type TEXT,
  p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_union_id UUID;
  v_target_type TEXT;
  v_target_id UUID;
BEGIN
  -- Determine if club belongs to a union
  SELECT uc.union_id INTO v_union_id
  FROM union_clubs uc
  WHERE uc.club_id = p_club_id
  LIMIT 1;

  IF v_union_id IS NOT NULL THEN
    v_target_type := 'union';
    v_target_id := v_union_id;

    IF p_type = 'premium' THEN
      UPDATE unions SET insurance_balance = insurance_balance + p_amount
      WHERE id = v_union_id;
    ELSIF p_type = 'payout' THEN
      UPDATE unions SET insurance_balance = insurance_balance - p_amount
      WHERE id = v_union_id;
    END IF;
  ELSE
    v_target_type := 'club';
    v_target_id := p_club_id;

    IF p_type = 'premium' THEN
      UPDATE clubs SET insurance_balance = insurance_balance + p_amount
      WHERE id = p_club_id;
    ELSIF p_type = 'payout' THEN
      UPDATE clubs SET insurance_balance = insurance_balance - p_amount
      WHERE id = p_club_id;
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- BUG #158 FIX: Also adjust chip_treasury to keep chip
  -- supply balanced.
  --
  -- Premium: player's stack decreased → those chips left the
  --   table ecosystem. Credit them to the club's chip_treasury
  --   so total chip supply stays constant.
  --
  -- Payout: player's stack increased → those chips entered the
  --   table ecosystem from nothing. Debit chip_treasury so the
  --   club is funding the payout. If treasury goes negative,
  --   it means the insurance fund owes the club.
  -- ═══════════════════════════════════════════════════════════
  IF p_type = 'premium' THEN
    UPDATE clubs SET chip_treasury = chip_treasury + p_amount
    WHERE id = p_club_id;
  ELSIF p_type = 'payout' THEN
    UPDATE clubs SET chip_treasury = chip_treasury - p_amount
    WHERE id = p_club_id;
  END IF;

  -- Record in chip_transactions for audit trail
  INSERT INTO chip_transactions (
    club_id, from_user_id, to_user_id, amount,
    transaction_type, notes, metadata
  ) VALUES (
    p_club_id,
    CASE WHEN p_type = 'premium' THEN p_player_id ELSE NULL END,
    CASE WHEN p_type = 'payout' THEN p_player_id ELSE NULL END,
    p_amount,
    'insurance_' || p_type,
    CASE WHEN p_type = 'premium'
      THEN 'Insurance premium collected'
      ELSE 'Insurance payout to player'
    END,
    jsonb_build_object(
      'table_id', p_table_id,
      'target_type', v_target_type,
      'target_id', v_target_id
    ) || p_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_type', v_target_type,
    'target_id', v_target_id,
    'amount', p_amount,
    'type', p_type
  );
END;
$$;
