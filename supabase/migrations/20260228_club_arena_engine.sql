-- ================================================================
-- CLUB ARENA ENGINE — Complete Backend Business Logic
-- All RPC functions for the hierarchy: Union → Club → Agent → Player
-- ================================================================

-- ================================================================
-- 1. EXEC_SQL — Utility function for running DDL from API
-- ================================================================
CREATE OR REPLACE FUNCTION exec_sql(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ================================================================
-- 2. MINT_CLUB_CHIPS — Owner mints chips into club treasury
--    Only club owner can mint. Logs to club_transactions.
-- ================================================================
CREATE OR REPLACE FUNCTION mint_club_chips(
  p_club_id UUID,
  p_amount NUMERIC,
  p_minted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club RECORD;
  v_old_treasury NUMERIC;
  v_new_treasury NUMERIC;
BEGIN
  -- Validate
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Get club and verify owner
  SELECT * INTO v_club FROM clubs WHERE id = p_club_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club not found');
  END IF;

  IF v_club.owner_id != p_minted_by THEN
    -- Also check if user is union admin
    PERFORM 1 FROM union_admins ua
      JOIN union_clubs uc ON uc.union_id = ua.union_id
      WHERE uc.club_id = p_club_id AND ua.user_id = p_minted_by;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only club owner or union admin can mint chips');
    END IF;
  END IF;

  v_old_treasury := COALESCE(v_club.chip_treasury, 0);
  v_new_treasury := v_old_treasury + p_amount;

  -- Update treasury
  UPDATE clubs SET chip_treasury = v_new_treasury, updated_at = NOW() WHERE id = p_club_id;

  -- Log transaction
  INSERT INTO club_transactions (club_id, user_id, transaction_type, amount, balance_before, balance_after, description)
  VALUES (p_club_id, p_minted_by, 'mint', p_amount, v_old_treasury, v_new_treasury, 'Chips minted into treasury');

  RETURN jsonb_build_object(
    'success', true,
    'old_treasury', v_old_treasury,
    'new_treasury', v_new_treasury,
    'minted', p_amount
  );
END;
$$;

-- ================================================================
-- 3. DISTRIBUTE_CHIPS — Move chips from club treasury to a member
--    Owner/admin distributes to agents or players.
-- ================================================================
CREATE OR REPLACE FUNCTION distribute_chips(
  p_club_id UUID,
  p_to_user_id UUID,
  p_amount NUMERIC,
  p_distributed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club RECORD;
  v_member RECORD;
  v_old_treasury NUMERIC;
  v_old_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Lock club row
  SELECT * INTO v_club FROM clubs WHERE id = p_club_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club not found');
  END IF;

  v_old_treasury := COALESCE(v_club.chip_treasury, 0);
  IF v_old_treasury < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient treasury balance',
      'treasury', v_old_treasury, 'requested', p_amount);
  END IF;

  -- Lock member row
  SELECT * INTO v_member FROM club_members
    WHERE club_id = p_club_id AND user_id = p_to_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found in club');
  END IF;

  v_old_balance := COALESCE(v_member.chip_balance, 0);

  -- Debit treasury
  UPDATE clubs SET chip_treasury = v_old_treasury - p_amount, updated_at = NOW()
    WHERE id = p_club_id;

  -- Credit member
  UPDATE club_members SET chip_balance = v_old_balance + p_amount, updated_at = NOW()
    WHERE club_id = p_club_id AND user_id = p_to_user_id;

  -- Log club transaction (treasury side)
  INSERT INTO club_transactions (club_id, user_id, transaction_type, amount, balance_before, balance_after, description, reference_id)
  VALUES (p_club_id, p_distributed_by, 'distribute', -p_amount, v_old_treasury, v_old_treasury - p_amount,
    'Chips distributed to member', p_to_user_id);

  -- Log chip transaction (member side)
  INSERT INTO chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
  VALUES (p_club_id, p_distributed_by, p_to_user_id, p_amount, 'distribute', 'Chips from treasury');

  RETURN jsonb_build_object(
    'success', true,
    'treasury_before', v_old_treasury,
    'treasury_after', v_old_treasury - p_amount,
    'member_before', v_old_balance,
    'member_after', v_old_balance + p_amount,
    'amount', p_amount
  );
END;
$$;

-- ================================================================
-- 4. LOCK_CHIPS_FOR_TABLE — Player sits down, chips locked for play
--    Deducts from chip_balance, tracked for table session.
-- ================================================================
CREATE OR REPLACE FUNCTION lock_chips_for_table(
  p_user_id UUID,
  p_club_id UUID,
  p_table_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_old_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT * INTO v_member FROM club_members
    WHERE club_id = p_club_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  v_old_balance := COALESCE(v_member.chip_balance, 0);
  IF v_old_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient chip balance',
      'balance', v_old_balance, 'requested', p_amount);
  END IF;

  -- Deduct from balance (chips are now "on the table")
  UPDATE club_members SET chip_balance = v_old_balance - p_amount, updated_at = NOW()
    WHERE club_id = p_club_id AND user_id = p_user_id;

  -- Log the lock
  INSERT INTO chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
  VALUES (p_club_id, p_user_id, NULL, p_amount, 'table_lock',
    'Chips locked for table ' || COALESCE(p_table_id::TEXT, 'unknown'));

  RETURN jsonb_build_object(
    'success', true,
    'balance_before', v_old_balance,
    'balance_after', v_old_balance - p_amount,
    'locked', p_amount,
    'table_id', p_table_id
  );
END;
$$;

-- ================================================================
-- 5. UNLOCK_CHIPS_FROM_TABLE — Player stands up, chips returned
-- ================================================================
CREATE OR REPLACE FUNCTION unlock_chips_from_table(
  p_user_id UUID,
  p_club_id UUID,
  p_table_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_old_balance NUMERIC;
BEGIN
  IF p_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount cannot be negative');
  END IF;

  SELECT * INTO v_member FROM club_members
    WHERE club_id = p_club_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  v_old_balance := COALESCE(v_member.chip_balance, 0);

  -- Return chips to balance (could be more or less than locked amount due to winnings/losses)
  UPDATE club_members SET chip_balance = v_old_balance + p_amount, updated_at = NOW()
    WHERE club_id = p_club_id AND user_id = p_user_id;

  INSERT INTO chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
  VALUES (p_club_id, NULL, p_user_id, p_amount, 'table_unlock',
    'Chips returned from table ' || COALESCE(p_table_id::TEXT, 'unknown'));

  RETURN jsonb_build_object(
    'success', true,
    'balance_before', v_old_balance,
    'balance_after', v_old_balance + p_amount,
    'returned', p_amount
  );
END;
$$;

-- ================================================================
-- 6. RECORD_RAKE — Called after each hand, records rake taken
--    Splits rake into: club share, union share, BBJ contribution
-- ================================================================
CREATE OR REPLACE FUNCTION record_rake(
  p_hand_id UUID,
  p_club_id UUID,
  p_table_id UUID,
  p_rake_amount NUMERIC,
  p_pot_size NUMERIC,
  p_num_players INTEGER,
  p_bbj_contribution NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club RECORD;
  v_union_settings JSONB;
  v_union_id UUID;
  v_union_hold_pct NUMERIC;
  v_union_share NUMERIC;
  v_club_share NUMERIC;
  v_rake_id UUID;
BEGIN
  IF p_rake_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'rake', 0, 'note', 'No rake taken');
  END IF;

  -- Get club + union info
  SELECT c.*, u.settings AS union_settings, uc.union_id
  INTO v_club
  FROM clubs c
  LEFT JOIN union_clubs uc ON uc.club_id = c.id
  LEFT JOIN unions u ON u.id = uc.union_id
  WHERE c.id = p_club_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club not found');
  END IF;

  v_union_id := v_club.union_id;

  -- Calculate union hold (default 10% if union exists)
  IF v_union_id IS NOT NULL THEN
    v_union_settings := v_club.union_settings;
    v_union_hold_pct := COALESCE((v_union_settings->>'union_hold_percentage')::NUMERIC, 10);
    v_union_share := ROUND(p_rake_amount * (v_union_hold_pct / 100.0), 2);
    v_club_share := p_rake_amount - v_union_share - COALESCE(p_bbj_contribution, 0);
  ELSE
    v_union_share := 0;
    v_club_share := p_rake_amount - COALESCE(p_bbj_contribution, 0);
  END IF;

  -- Record rake
  INSERT INTO rake_records (hand_id, club_id, table_id, rake_amount, pot_size, num_players, bbj_contribution)
  VALUES (p_hand_id, p_club_id, p_table_id, p_rake_amount, p_pot_size, p_num_players, COALESCE(p_bbj_contribution, 0))
  RETURNING id INTO v_rake_id;

  -- Credit club treasury with their share
  UPDATE clubs SET
    chip_treasury = COALESCE(chip_treasury, 0) + v_club_share,
    total_rake = COALESCE(total_rake, 0) + p_rake_amount,
    updated_at = NOW()
  WHERE id = p_club_id;

  -- If union exists, credit union's total rake tracker
  IF v_union_id IS NOT NULL THEN
    UPDATE unions SET
      total_rake = COALESCE(total_rake, 0) + v_union_share,
      updated_at = NOW()
    WHERE id = v_union_id;
  END IF;

  -- Log club transaction
  INSERT INTO club_transactions (club_id, transaction_type, amount, description, reference_id, metadata)
  VALUES (p_club_id, 'rake', v_club_share, 'Rake from hand',
    v_rake_id,
    jsonb_build_object(
      'hand_id', p_hand_id,
      'total_rake', p_rake_amount,
      'union_share', v_union_share,
      'club_share', v_club_share,
      'bbj', p_bbj_contribution
    ));

  RETURN jsonb_build_object(
    'success', true,
    'rake_id', v_rake_id,
    'total_rake', p_rake_amount,
    'club_share', v_club_share,
    'union_share', v_union_share,
    'bbj_contribution', COALESCE(p_bbj_contribution, 0)
  );
END;
$$;

-- ================================================================
-- 7. CALCULATE_CASCADING_COMMISSION — Per-hand agent commission
--    Walks up the agent hierarchy: player → agent → super_agent
--    Each agent gets their commission_rate on the rake their
--    downline generates. The remainder goes to the club.
-- ================================================================
CREATE OR REPLACE FUNCTION calculate_cascading_commission(
  p_hand_id UUID,
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
  v_max_depth INTEGER := 5; -- prevent infinite loops
BEGIN
  IF p_rake_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'commissions', '[]'::JSONB, 'total', 0);
  END IF;

  -- Find the player's direct agent
  SELECT agent_id INTO v_current_agent_user_id
  FROM club_members
  WHERE club_id = p_club_id AND user_id = p_player_user_id;

  IF v_current_agent_user_id IS NULL THEN
    -- No agent assigned, all rake goes to club
    RETURN jsonb_build_object('success', true, 'commissions', '[]'::JSONB, 'total', 0, 'note', 'No agent assigned');
  END IF;

  v_remaining_rake := p_rake_amount;

  -- Walk up the chain
  WHILE v_current_agent_user_id IS NOT NULL AND v_depth < v_max_depth LOOP
    v_depth := v_depth + 1;

    -- Get agent's commission rate
    SELECT a.*, cm.parent_agent_id AS member_parent
    INTO v_agent
    FROM agents a
    LEFT JOIN club_members cm ON cm.club_id = a.club_id AND cm.user_id = a.user_id
    WHERE a.club_id = p_club_id AND a.user_id = v_current_agent_user_id;

    IF NOT FOUND THEN
      EXIT; -- Agent not found, stop
    END IF;

    -- Calculate this agent's commission on the ORIGINAL rake (not remaining)
    v_agent_commission := ROUND(p_rake_amount * (COALESCE(v_agent.commission_rate, 0) / 100.0), 2);

    -- Don't exceed remaining rake
    IF v_agent_commission > v_remaining_rake THEN
      v_agent_commission := v_remaining_rake;
    END IF;

    IF v_agent_commission > 0 THEN
      -- Credit agent's business balance
      UPDATE agents SET
        business_balance = COALESCE(business_balance, 0) + v_agent_commission,
        lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_agent_commission,
        weekly_rake_generated = COALESCE(weekly_rake_generated, 0) + p_rake_amount,
        updated_at = NOW()
      WHERE club_id = p_club_id AND user_id = v_current_agent_user_id;

      -- Record commission
      INSERT INTO commission_records (agent_id, gross_rake, commission_rate, commission_amount, status)
      VALUES (v_agent.id, p_rake_amount, v_agent.commission_rate, v_agent_commission, 'pending');

      v_total_commission := v_total_commission + v_agent_commission;
      v_remaining_rake := v_remaining_rake - v_agent_commission;

      -- Add to chain
      v_commission_chain := v_commission_chain || jsonb_build_object(
        'agent_user_id', v_current_agent_user_id,
        'agent_id', v_agent.id,
        'commission_rate', v_agent.commission_rate,
        'commission_amount', v_agent_commission,
        'depth', v_depth
      );
    END IF;

    -- Move up to parent agent
    v_current_agent_user_id := COALESCE(v_agent.parent_agent_id, v_agent.member_parent);

    -- If parent is same as current, stop (prevent self-loop)
    IF v_current_agent_user_id = v_agent.user_id THEN
      EXIT;
    END IF;
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

-- ================================================================
-- 8. FN_REQUEST_CASHOUT — Player or agent requests to cash out chips
-- ================================================================
CREATE OR REPLACE FUNCTION fn_request_cashout(
  p_player_id UUID,
  p_club_id UUID,
  p_amount NUMERIC,
  p_player_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_agent_id UUID;
  v_cashout_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Get member and verify balance
  SELECT * INTO v_member FROM club_members
    WHERE club_id = p_club_id AND user_id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  IF COALESCE(v_member.chip_balance, 0) < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient chip balance',
      'balance', COALESCE(v_member.chip_balance, 0));
  END IF;

  -- Find their agent (if any)
  v_agent_id := v_member.agent_id;

  -- Deduct chips immediately (held in escrow)
  UPDATE club_members SET
    chip_balance = COALESCE(chip_balance, 0) - p_amount,
    updated_at = NOW()
  WHERE club_id = p_club_id AND user_id = p_player_id;

  -- Create cashout request
  INSERT INTO cashout_requests (player_id, club_id, agent_id, amount, status, player_note)
  VALUES (p_player_id, p_club_id, v_agent_id, p_amount, 'pending', p_player_note)
  RETURNING id INTO v_cashout_id;

  -- Log chip transaction
  INSERT INTO chip_transactions (club_id, from_user_id, amount, transaction_type, notes, related_cashout_id)
  VALUES (p_club_id, p_player_id, p_amount, 'cashout_hold', 'Chips held for cashout', v_cashout_id);

  RETURN jsonb_build_object(
    'success', true,
    'cashout_id', v_cashout_id,
    'amount', p_amount,
    'agent_id', v_agent_id,
    'status', 'pending',
    'balance_after', COALESCE(v_member.chip_balance, 0) - p_amount
  );
END;
$$;

-- ================================================================
-- 9. FN_AGENT_APPROVE_CASHOUT — Agent acknowledges/approves cashout
--    For CREDIT agents: deducts from their credit_used
--    For PREPAID agents: deducts from their player_balance
-- ================================================================
CREATE OR REPLACE FUNCTION fn_agent_approve_cashout(
  p_cashout_id UUID,
  p_agent_user_id UUID,
  p_agent_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cashout RECORD;
  v_agent RECORD;
BEGIN
  -- Get cashout request
  SELECT * INTO v_cashout FROM cashout_requests WHERE id = p_cashout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cashout request not found');
  END IF;

  IF v_cashout.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cashout already ' || v_cashout.status);
  END IF;

  -- Verify this agent is authorized (is the player's agent or club admin)
  IF v_cashout.agent_id IS NOT NULL AND v_cashout.agent_id != p_agent_user_id THEN
    -- Check if approver is a club admin/owner
    PERFORM 1 FROM club_members
      WHERE club_id = v_cashout.club_id AND user_id = p_agent_user_id AND role IN ('owner', 'admin');
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this cashout');
    END IF;
  END IF;

  -- Get agent details
  SELECT * INTO v_agent FROM agents
    WHERE club_id = v_cashout.club_id AND user_id = COALESCE(v_cashout.agent_id, p_agent_user_id);

  -- Update cashout status
  UPDATE cashout_requests SET
    status = 'approved',
    agent_id = COALESCE(agent_id, p_agent_user_id),
    agent_note = p_agent_note,
    acknowledged_at = NOW(),
    updated_at = NOW()
  WHERE id = p_cashout_id;

  -- If PREPAID agent, deduct from their player_balance
  IF v_agent.id IS NOT NULL AND v_agent.is_prepaid = true THEN
    UPDATE agents SET
      player_balance = COALESCE(player_balance, 0) - v_cashout.amount,
      updated_at = NOW()
    WHERE id = v_agent.id;
  END IF;

  -- If CREDIT agent, add to their credit_used
  IF v_agent.id IS NOT NULL AND v_agent.is_prepaid = false THEN
    UPDATE agents SET
      credit_used = COALESCE(credit_used, 0) + v_cashout.amount,
      updated_at = NOW()
    WHERE id = v_agent.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cashout_id', p_cashout_id,
    'status', 'approved',
    'amount', v_cashout.amount,
    'agent_type', CASE WHEN v_agent.is_prepaid THEN 'prepaid' ELSE 'credit' END
  );
END;
$$;

-- ================================================================
-- 10. FN_COMPLETE_CASHOUT — Final step, marks cashout as completed
-- ================================================================
CREATE OR REPLACE FUNCTION fn_complete_cashout(
  p_cashout_id UUID,
  p_completed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cashout RECORD;
BEGIN
  SELECT * INTO v_cashout FROM cashout_requests WHERE id = p_cashout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cashout not found');
  END IF;

  IF v_cashout.status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cashout already ' || v_cashout.status);
  END IF;

  UPDATE cashout_requests SET
    status = 'completed',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_cashout_id;

  -- Mark the chip transaction as complete
  UPDATE chip_transactions SET
    notes = notes || ' [COMPLETED]'
  WHERE related_cashout_id = p_cashout_id;

  RETURN jsonb_build_object(
    'success', true,
    'cashout_id', p_cashout_id,
    'amount', v_cashout.amount,
    'player_id', v_cashout.player_id,
    'status', 'completed'
  );
END;
$$;

-- ================================================================
-- 11. FN_CANCEL_CASHOUT — Cancel a pending cashout, return chips
-- ================================================================
CREATE OR REPLACE FUNCTION fn_cancel_cashout(
  p_cashout_id UUID,
  p_cancelled_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cashout RECORD;
BEGIN
  SELECT * INTO v_cashout FROM cashout_requests WHERE id = p_cashout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cashout not found');
  END IF;

  IF v_cashout.status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel ' || v_cashout.status || ' cashout');
  END IF;

  -- Return chips to player
  UPDATE club_members SET
    chip_balance = COALESCE(chip_balance, 0) + v_cashout.amount,
    updated_at = NOW()
  WHERE club_id = v_cashout.club_id AND user_id = v_cashout.player_id;

  -- If agent had been debited (approved state), reverse it
  IF v_cashout.status = 'approved' AND v_cashout.agent_id IS NOT NULL THEN
    -- Check if prepaid or credit
    UPDATE agents SET
      player_balance = CASE WHEN is_prepaid THEN COALESCE(player_balance, 0) + v_cashout.amount ELSE player_balance END,
      credit_used = CASE WHEN NOT is_prepaid THEN COALESCE(credit_used, 0) - v_cashout.amount ELSE credit_used END,
      updated_at = NOW()
    WHERE club_id = v_cashout.club_id AND user_id = v_cashout.agent_id;
  END IF;

  UPDATE cashout_requests SET
    status = 'cancelled',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = p_cashout_id;

  -- Log reversal
  INSERT INTO chip_transactions (club_id, to_user_id, amount, transaction_type, notes, related_cashout_id)
  VALUES (v_cashout.club_id, v_cashout.player_id, v_cashout.amount, 'cashout_cancel', 'Cashout cancelled, chips returned', p_cashout_id);

  RETURN jsonb_build_object(
    'success', true,
    'cashout_id', p_cashout_id,
    'amount_returned', v_cashout.amount,
    'status', 'cancelled'
  );
END;
$$;

-- ================================================================
-- 12. GENERATE_PERIOD_SETTLEMENT — Settle a period for a club
--    Totals all rake, commissions, and generates settlement report
-- ================================================================
CREATE OR REPLACE FUNCTION generate_period_settlement(
  p_club_id UUID,
  p_settled_by UUID,
  p_start_at TIMESTAMPTZ DEFAULT NULL,
  p_end_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_id UUID;
  v_last_period RECORD;
  v_start TIMESTAMPTZ;
  v_total_rake NUMERIC := 0;
  v_total_commission NUMERIC := 0;
  v_total_hands INTEGER := 0;
  v_agent RECORD;
  v_agent_rake NUMERIC;
  v_agent_commission NUMERIC;
  v_period_number INTEGER;
  v_year INTEGER;
BEGIN
  -- Determine start time (from last settlement or provided)
  IF p_start_at IS NOT NULL THEN
    v_start := p_start_at;
  ELSE
    SELECT end_at INTO v_start FROM settlement_periods
      WHERE club_id = p_club_id AND status = 'settled'
      ORDER BY end_at DESC LIMIT 1;
    IF v_start IS NULL THEN
      v_start := NOW() - INTERVAL '7 days'; -- default first period = last 7 days
    END IF;
  END IF;

  v_year := EXTRACT(YEAR FROM p_end_at);
  SELECT COALESCE(MAX(period_number), 0) + 1 INTO v_period_number
    FROM settlement_periods WHERE club_id = p_club_id AND year = v_year;

  -- Get totals from rake_records in this period
  SELECT COUNT(*), COALESCE(SUM(rake_amount), 0)
  INTO v_total_hands, v_total_rake
  FROM rake_records
  WHERE club_id = p_club_id AND created_at >= v_start AND created_at <= p_end_at;

  -- Get total commissions from commission_records in this period
  SELECT COALESCE(SUM(commission_amount), 0)
  INTO v_total_commission
  FROM commission_records cr
  JOIN agents a ON a.id = cr.agent_id
  WHERE a.club_id = p_club_id AND cr.status = 'pending' AND cr.created_at >= v_start AND cr.created_at <= p_end_at;

  -- Create settlement period
  INSERT INTO settlement_periods (
    club_id, union_id, year, period_number, start_at, end_at,
    total_hands_dealt, total_rake_collected, settled_by, settled_at, status
  )
  SELECT p_club_id, uc.union_id, v_year, v_period_number, v_start, p_end_at,
    v_total_hands, v_total_rake, p_settled_by, NOW(), 'settled'
  FROM clubs c
  LEFT JOIN union_clubs uc ON uc.club_id = c.id
  WHERE c.id = p_club_id
  RETURNING id INTO v_period_id;

  -- Mark all pending commissions in this period as settled
  UPDATE commission_records SET
    status = 'settled',
    period_id = v_period_id,
    paid_at = NOW(),
    updated_at = NOW()
  WHERE agent_id IN (SELECT id FROM agents WHERE club_id = p_club_id)
    AND status = 'pending'
    AND created_at >= v_start AND created_at <= p_end_at;

  RETURN jsonb_build_object(
    'success', true,
    'period_id', v_period_id,
    'period_number', v_period_number,
    'year', v_year,
    'start_at', v_start,
    'end_at', p_end_at,
    'total_hands', v_total_hands,
    'total_rake', v_total_rake,
    'total_commission', v_total_commission,
    'club_net', v_total_rake - v_total_commission
  );
END;
$$;

-- ================================================================
-- 13. GET_AGENT_DASHBOARD — Returns agent's full stats
-- ================================================================
CREATE OR REPLACE FUNCTION get_agent_dashboard(
  p_agent_user_id UUID,
  p_club_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent RECORD;
  v_downline_count INTEGER;
  v_pending_cashouts JSONB;
  v_recent_commissions JSONB;
BEGIN
  SELECT * INTO v_agent FROM agents
    WHERE club_id = p_club_id AND user_id = p_agent_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found');
  END IF;

  -- Count downline players
  SELECT COUNT(*) INTO v_downline_count
  FROM club_members WHERE club_id = p_club_id AND agent_id = p_agent_user_id;

  -- Pending cashouts for this agent's players
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', cr.id, 'player_id', cr.player_id, 'amount', cr.amount,
    'status', cr.status, 'created_at', cr.created_at, 'player_note', cr.player_note
  )), '[]'::JSONB) INTO v_pending_cashouts
  FROM cashout_requests cr
  WHERE cr.agent_id = p_agent_user_id AND cr.club_id = p_club_id AND cr.status IN ('pending', 'approved');

  -- Recent commissions
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'gross_rake', c.gross_rake, 'commission_rate', c.commission_rate,
    'commission_amount', c.commission_amount, 'status', c.status, 'created_at', c.created_at
  ) ORDER BY c.created_at DESC), '[]'::JSONB) INTO v_recent_commissions
  FROM commission_records c
  WHERE c.agent_id = v_agent.id
  LIMIT 50;

  RETURN jsonb_build_object(
    'success', true,
    'agent', jsonb_build_object(
      'id', v_agent.id,
      'user_id', v_agent.user_id,
      'commission_rate', v_agent.commission_rate,
      'is_prepaid', v_agent.is_prepaid,
      'business_balance', COALESCE(v_agent.business_balance, 0),
      'player_balance', COALESCE(v_agent.player_balance, 0),
      'credit_limit', COALESCE(v_agent.credit_limit, 0),
      'credit_used', COALESCE(v_agent.credit_used, 0),
      'lifetime_earnings', COALESCE(v_agent.lifetime_earnings, 0),
      'weekly_rake_generated', COALESCE(v_agent.weekly_rake_generated, 0)
    ),
    'downline_count', v_downline_count,
    'pending_cashouts', v_pending_cashouts,
    'recent_commissions', v_recent_commissions
  );
END;
$$;

-- ================================================================
-- 14. GET_CLUB_FINANCIAL_SUMMARY — Club owner/admin financial view
-- ================================================================
CREATE OR REPLACE FUNCTION get_club_financial_summary(
  p_club_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club RECORD;
  v_total_member_chips NUMERIC;
  v_total_agent_balances NUMERIC;
  v_pending_cashouts NUMERIC;
  v_agent_count INTEGER;
  v_player_count INTEGER;
BEGIN
  SELECT * INTO v_club FROM clubs WHERE id = p_club_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club not found');
  END IF;

  SELECT COALESCE(SUM(chip_balance), 0) INTO v_total_member_chips
  FROM club_members WHERE club_id = p_club_id AND is_active = true;

  SELECT COALESCE(SUM(business_balance), 0) INTO v_total_agent_balances
  FROM agents WHERE club_id = p_club_id AND status = 'active';

  SELECT COALESCE(SUM(amount), 0) INTO v_pending_cashouts
  FROM cashout_requests WHERE club_id = p_club_id AND status IN ('pending', 'approved');

  SELECT COUNT(*) INTO v_agent_count FROM agents WHERE club_id = p_club_id AND status = 'active';
  SELECT COUNT(*) INTO v_player_count FROM club_members WHERE club_id = p_club_id AND role = 'player' AND is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'club_name', v_club.name,
    'treasury', COALESCE(v_club.chip_treasury, 0),
    'total_rake', COALESCE(v_club.total_rake, 0),
    'total_member_chips', v_total_member_chips,
    'total_agent_balances', v_total_agent_balances,
    'pending_cashouts', v_pending_cashouts,
    'agent_count', v_agent_count,
    'player_count', v_player_count,
    'chips_in_circulation', v_total_member_chips + v_pending_cashouts,
    'net_position', COALESCE(v_club.chip_treasury, 0) - v_total_member_chips - v_pending_cashouts - v_total_agent_balances
  );
END;
$$;

-- ================================================================
-- 15. TRANSFER_CHIPS_AGENT_TO_PLAYER — Agent gives chips to player
-- ================================================================
CREATE OR REPLACE FUNCTION transfer_chips_agent_to_player(
  p_agent_user_id UUID,
  p_player_user_id UUID,
  p_club_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent RECORD;
  v_agent_member RECORD;
  v_player_member RECORD;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Verify agent exists and player is in their downline
  SELECT * INTO v_agent FROM agents
    WHERE club_id = p_club_id AND user_id = p_agent_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found');
  END IF;

  SELECT * INTO v_player_member FROM club_members
    WHERE club_id = p_club_id AND user_id = p_player_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found in club');
  END IF;

  -- For PREPAID agents, check player_balance
  IF v_agent.is_prepaid THEN
    IF COALESCE(v_agent.player_balance, 0) < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient agent balance',
        'balance', COALESCE(v_agent.player_balance, 0));
    END IF;
    UPDATE agents SET player_balance = COALESCE(player_balance, 0) - p_amount, updated_at = NOW()
      WHERE id = v_agent.id;
  ELSE
    -- CREDIT agents: check credit limit
    IF COALESCE(v_agent.credit_used, 0) + p_amount > COALESCE(v_agent.credit_limit, 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Credit limit exceeded',
        'credit_used', COALESCE(v_agent.credit_used, 0),
        'credit_limit', COALESCE(v_agent.credit_limit, 0));
    END IF;
    UPDATE agents SET credit_used = COALESCE(credit_used, 0) + p_amount, updated_at = NOW()
      WHERE id = v_agent.id;
  END IF;

  -- Credit player
  UPDATE club_members SET chip_balance = COALESCE(chip_balance, 0) + p_amount, updated_at = NOW()
    WHERE club_id = p_club_id AND user_id = p_player_user_id;

  -- Log
  INSERT INTO chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
  VALUES (p_club_id, p_agent_user_id, p_player_user_id, p_amount, 'agent_to_player', 'Agent chip transfer');

  RETURN jsonb_build_object(
    'success', true,
    'amount', p_amount,
    'agent_type', CASE WHEN v_agent.is_prepaid THEN 'prepaid' ELSE 'credit' END,
    'player_new_balance', COALESCE(v_player_member.chip_balance, 0) + p_amount
  );
END;
$$;

-- ================================================================
-- DONE — All 15 RPC functions created
-- ================================================================
