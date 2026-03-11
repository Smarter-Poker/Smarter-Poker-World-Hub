-- ================================================================
-- Insurance Financial Recording
-- Premiums and payouts flow to/from the UNION treasury.
-- If the club is standalone (no union), they flow to/from the club treasury.
-- ================================================================

-- Add insurance_balance to unions table
ALTER TABLE unions ADD COLUMN IF NOT EXISTS insurance_balance NUMERIC(14,2) DEFAULT 0;

-- Add insurance_balance to clubs table (for standalone clubs)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS insurance_balance NUMERIC(14,2) DEFAULT 0;

-- RPC: Record insurance transaction (premium or payout)
CREATE OR REPLACE FUNCTION record_insurance_transaction(
  p_club_id UUID,
  p_table_id TEXT,
  p_player_id UUID,
  p_amount NUMERIC,
  p_type TEXT,           -- 'premium' or 'payout'
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
      -- Premium: credit to union insurance balance (house revenue)
      UPDATE unions SET insurance_balance = insurance_balance + p_amount
      WHERE id = v_union_id;
    ELSIF p_type = 'payout' THEN
      -- Payout: debit from union insurance balance (house expense)
      UPDATE unions SET insurance_balance = insurance_balance - p_amount
      WHERE id = v_union_id;
    END IF;
  ELSE
    v_target_type := 'club';
    v_target_id := p_club_id;

    IF p_type = 'premium' THEN
      -- Premium: credit to standalone club insurance balance
      UPDATE clubs SET insurance_balance = insurance_balance + p_amount
      WHERE id = p_club_id;
    ELSIF p_type = 'payout' THEN
      -- Payout: debit from standalone club insurance balance
      UPDATE clubs SET insurance_balance = insurance_balance - p_amount
      WHERE id = p_club_id;
    END IF;
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
