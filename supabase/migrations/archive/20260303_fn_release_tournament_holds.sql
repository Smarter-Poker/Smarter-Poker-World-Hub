-- ============================================================================
-- BUG #163 FIX: Release held_chips after tournament completion
-- 
-- Tournament registration locks chips via lock_chips_for_table which moves
-- buy-in from chip_balance to held_chips. On completion, payouts are credited
-- via fn_credit_chips but held_chips is never decremented.
-- 
-- This RPC releases held_chips WITHOUT adding to chip_balance (since the
-- buy-in was already spent and payouts were already distributed separately).
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_release_tournament_holds(
  p_tournament_id UUID,
  p_club_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_released INT := 0;
  v_reg RECORD;
BEGIN
  -- Release held_chips for all registrants
  FOR v_reg IN
    SELECT tr.user_id, tr.buy_in_amount
    FROM tournament_registrations tr
    WHERE tr.tournament_id = p_tournament_id
      AND tr.status IN ('registered', 'eliminated', 'busted')
      AND tr.buy_in_amount > 0
  LOOP
    -- Decrement held_chips (floor at 0)
    UPDATE club_members
    SET held_chips = GREATEST(0, COALESCE(held_chips, 0) - v_reg.buy_in_amount),
        updated_at = NOW()
    WHERE club_id = COALESCE(
      (SELECT club_id FROM tournament_registrations 
       WHERE tournament_id = p_tournament_id AND user_id = v_reg.user_id LIMIT 1),
      p_club_id
    )
    AND user_id = v_reg.user_id;

    v_released := v_released + 1;
  END LOOP;

  -- Release chip_escrow entries
  UPDATE chip_escrow
  SET status = 'released', released_at = NOW()
  WHERE table_id = p_tournament_id::TEXT
    AND status = 'locked';

  RETURN jsonb_build_object(
    'success', true,
    'released_count', v_released
  );
END;
$$;

-- Lock it down
REVOKE ALL ON FUNCTION fn_release_tournament_holds(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_release_tournament_holds(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION fn_release_tournament_holds(UUID, UUID) FROM authenticated;
