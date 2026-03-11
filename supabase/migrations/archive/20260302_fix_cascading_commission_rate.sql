-- ============================================================================
-- Migration: Fix commission_rate interpretation in calculate_cascading_commission
-- Date: 2026-03-02
--
-- BUG #112: commission_rate is stored as decimal (0.20 = 20%) but the RPC
--           divides by 100 again → agents receive 1/100th of correct commission
--           per hand.
--
-- Impact:
--   - business_balance accumulated 100x too small throughout each week
--   - lifetime_earnings accumulated 100x too small per hand
--   - commission_records per hand have wrong amounts
--   - Weekly auto-settlement masks the bug by resetting business_balance
--     and re-crediting correctly, but lifetime_earnings drifts
--
-- FIX: Remove the / 100.0 division since commission_rate is already a decimal.
--
-- Evidence: manage-agent.js line 142:
--   `(parentAgent.commission_rate * 100).toFixed(1)}%`
--   This confirms storage format is 0.20 for 20%.
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_cascading_commission(
  p_hand_id TEXT,
  p_club_id UUID,
  p_player_user_id UUID,
  p_rake_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_agent RECORD;
  v_current_agent_user_id UUID;
  v_commission_chain JSONB := '[]'::JSONB;
  v_total_commission NUMERIC := 0;
  v_agent_commission NUMERIC;
  v_remaining_rake NUMERIC;
  v_depth INTEGER := 0;
  v_max_depth INTEGER := 5;
BEGIN
  IF p_rake_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'commissions', '[]'::JSONB, 'total', 0);
  END IF;

  SELECT agent_id INTO v_current_agent_user_id
  FROM club_members
  WHERE club_id = p_club_id AND user_id = p_player_user_id;

  IF v_current_agent_user_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'commissions', '[]'::JSONB, 'total', 0, 'note', 'No agent assigned');
  END IF;

  v_remaining_rake := p_rake_amount;

  WHILE v_current_agent_user_id IS NOT NULL AND v_depth < v_max_depth LOOP
    v_depth := v_depth + 1;

    SELECT a.*, cm.parent_agent_id AS member_parent
    INTO v_agent
    FROM agents a
    LEFT JOIN club_members cm ON cm.club_id = a.club_id AND cm.user_id = a.user_id
    WHERE a.club_id = p_club_id AND a.user_id = v_current_agent_user_id;

    IF NOT FOUND THEN EXIT; END IF;

    -- FIX: commission_rate is already a decimal (0.20 = 20%).
    -- Previously had: (commission_rate / 100.0) which gave 100x too small results.
    v_agent_commission := ROUND(p_rake_amount * COALESCE(v_agent.commission_rate, 0), 2);

    IF v_agent_commission > v_remaining_rake THEN
      v_agent_commission := v_remaining_rake;
    END IF;

    IF v_agent_commission > 0 THEN
      -- NOTE: Per-hand crediting of business_balance and lifetime_earnings
      -- is now correct. The auto-settlement cron still resets business_balance
      -- weekly, but lifetime_earnings accumulates correctly throughout the week.
      UPDATE agents SET
        business_balance = COALESCE(business_balance, 0) + v_agent_commission,
        lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_agent_commission,
        weekly_rake_generated = COALESCE(weekly_rake_generated, 0) + p_rake_amount,
        updated_at = NOW()
      WHERE club_id = p_club_id AND user_id = v_current_agent_user_id;

      INSERT INTO commission_records (agent_id, gross_rake, commission_rate, commission_amount, status)
      VALUES (v_agent.id, p_rake_amount, v_agent.commission_rate, v_agent_commission, 'pending');

      v_total_commission := v_total_commission + v_agent_commission;
      v_remaining_rake := v_remaining_rake - v_agent_commission;

      v_commission_chain := v_commission_chain || jsonb_build_object(
        'agent_user_id', v_current_agent_user_id,
        'agent_id', v_agent.id,
        'commission_rate', v_agent.commission_rate,
        'commission_amount', v_agent_commission,
        'depth', v_depth
      );
    END IF;

    v_current_agent_user_id := COALESCE(v_agent.parent_agent_id, v_agent.member_parent);
    IF v_current_agent_user_id = v_agent.user_id THEN EXIT; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'hand_id', p_hand_id,
    'total_rake', p_rake_amount,
    'total_commission', v_total_commission,
    'club_keeps', p_rake_amount - v_total_commission,
    'chain_depth', v_depth,
    'commissions', v_commission_chain
  );
END;
$$;
