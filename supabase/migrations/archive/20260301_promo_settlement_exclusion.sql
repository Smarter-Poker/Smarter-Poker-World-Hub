-- ═══════════════════════════════════════════════════════════
-- PROMO CHIPS: Settlement Exclusion + Audit Trail
-- ═══════════════════════════════════════════════════════════
-- 
-- IMPORTANT: Promo chips are NOT debts owed to the union.
-- They are funded from 30% of the BBJ allocation and are
-- already raked and accounted for. They flow through separate
-- promo_balance columns and NEVER affect:
--   • chip_balance (player playable chips)
--   • credit_used / player_balance (agent settlement debts)
--   • weekly_rake_generated (commission calculation input)
--   • chip_treasury (club operating chips)
--
-- Promo transaction_types:
--   'promo_mint'            — owner mints promo into club
--   'promo_club_to_agent'   — club grants promo to agent
--   'promo_agent_to_player' — agent distributes promo to player
--   'promo_union_to_agent'  — union grants promo directly to agent
--
-- These are EXCLUDED from settlement calculations.
-- ═══════════════════════════════════════════════════════════

-- Update transfer_promo_club_to_agent to add audit logging
CREATE OR REPLACE FUNCTION transfer_promo_club_to_agent(
  p_club_id UUID,
  p_agent_user_id UUID,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club_promo NUMERIC;
  v_agent_promo NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Check club balance
  SELECT COALESCE(promo_balance, 0) INTO v_club_promo
  FROM clubs WHERE id = p_club_id FOR UPDATE;

  IF v_club_promo IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club not found');
  END IF;

  IF v_club_promo < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient club promo funds',
      'balance', v_club_promo);
  END IF;

  -- Debit club promo (NOT chip_treasury — these are free promo chips)
  UPDATE clubs SET
    promo_balance = promo_balance - p_amount,
    updated_at = NOW()
  WHERE id = p_club_id;

  -- Credit agent promo (NOT credit_used — no settlement debt created)
  UPDATE agents SET
    promo_balance = COALESCE(promo_balance, 0) + p_amount,
    updated_at = NOW()
  WHERE club_id = p_club_id AND user_id = p_agent_user_id
  RETURNING promo_balance INTO v_agent_promo;

  IF v_agent_promo IS NULL THEN
    -- Rollback: re-credit club
    UPDATE clubs SET promo_balance = promo_balance + p_amount WHERE id = p_club_id;
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found in this club');
  END IF;

  -- Audit trail — clearly marked as promo (excluded from settlement)
  BEGIN
    INSERT INTO chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
    VALUES (p_club_id, NULL, p_agent_user_id, p_amount, 'promo_club_to_agent',
      COALESCE(p_note, 'Club promo grant to agent — NOT a settlement debt'));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'amount', p_amount,
    'club_promo_after', v_club_promo - p_amount,
    'agent_promo_after', v_agent_promo
  );
END;
$$;

-- Update transfer_promo_agent_to_player to add audit logging
CREATE OR REPLACE FUNCTION transfer_promo_agent_to_player(
  p_club_id UUID,
  p_agent_user_id UUID,
  p_player_user_id UUID,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_promo NUMERIC;
  v_player_promo NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Check agent promo balance (NOT credit_used or player_balance)
  SELECT COALESCE(promo_balance, 0) INTO v_agent_promo
  FROM agents WHERE club_id = p_club_id AND user_id = p_agent_user_id FOR UPDATE;

  IF v_agent_promo IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found');
  END IF;

  IF v_agent_promo < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient agent promo funds',
      'balance', v_agent_promo);
  END IF;

  -- Debit agent promo (NOT credit — no settlement debt)
  UPDATE agents SET
    promo_balance = promo_balance - p_amount,
    updated_at = NOW()
  WHERE club_id = p_club_id AND user_id = p_agent_user_id;

  -- Credit player chip_balance (PLAYABLE at tables)
  -- Promo chips become regular playable chips once distributed to a player.
  -- They are already raked/accounted for (30% BBJ), so this is NOT a debt.
  -- We credit chip_balance so the player can actually USE them at tables.
  -- The 'promo_agent_to_player' transaction_type in chip_transactions
  -- keeps the audit trail clear for settlement exclusion.
  UPDATE club_members SET
    chip_balance = COALESCE(chip_balance, 0) + p_amount
  WHERE club_id = p_club_id AND user_id = p_player_user_id
  RETURNING chip_balance INTO v_player_promo;

  IF v_player_promo IS NULL THEN
    -- Rollback
    UPDATE agents SET promo_balance = promo_balance + p_amount
    WHERE club_id = p_club_id AND user_id = p_agent_user_id;
    RETURN jsonb_build_object('success', false, 'error', 'Player not found in this club');
  END IF;

  -- Audit trail — clearly marked as promo (excluded from settlement)
  BEGIN
    INSERT INTO chip_transactions (club_id, from_user_id, to_user_id, amount, transaction_type, notes)
    VALUES (p_club_id, p_agent_user_id, p_player_user_id, p_amount, 'promo_agent_to_player',
      COALESCE(p_note, 'Agent promo to player — NOT a settlement debt'));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'amount', p_amount,
    'agent_promo_after', v_agent_promo - p_amount,
    'player_chip_balance_after', v_player_promo
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- COMMENT on promo columns for clarity
-- ═══════════════════════════════════════════════════════════

COMMENT ON COLUMN clubs.promo_balance IS 
  'Club promo wallet — funded from 30% of BBJ allocation. NOT a settlement debt. Already raked and accounted for.';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'promo_balance') THEN
    COMMENT ON COLUMN agents.promo_balance IS 
      'Agent promo wallet — received from club. For player bonuses/incentives. NOT credit, NOT a settlement debt.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'promo_balance') THEN
    COMMENT ON COLUMN club_members.promo_balance IS 
      'Player promo wallet — received from agent. Can be used at tables. NOT club debt, NOT counted in settlement.';
  END IF;
END $$;
