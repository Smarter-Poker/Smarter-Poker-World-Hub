-- ═══════════════════════════════════════════════════════════════════════════
-- PROMO CHIP RESTRICTIONS & PLAYTHROUGH SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- RULES:
--   1. Agents can NEVER send promo to their own account
--   2. Accounts < 14 days old: max 25 promo per distribution
--   3. Lifetime cap: 100 promo chips per player per club (from ALL agents)
--   4. Promo chips = regular chips for cash game / tournament buy-ins
--   5. 3x playthrough required before cashout (promo_wagered >= promo_received * 3)
--
-- FLOW:  Union → Club Owner → Agent → Player
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. ADD TRACKING COLUMNS TO club_members
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  -- Total promo chips ever received by this player in this club
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_members' AND column_name = 'promo_received_total') THEN
    ALTER TABLE club_members ADD COLUMN promo_received_total NUMERIC(14,2) DEFAULT 0;
    COMMENT ON COLUMN club_members.promo_received_total IS
      'Lifetime total promo chips received (from agents). Used for 100-chip cap.';
  END IF;

  -- Total amount wagered at tables (counts toward playthrough)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_members' AND column_name = 'promo_wagered') THEN
    ALTER TABLE club_members ADD COLUMN promo_wagered NUMERIC(14,2) DEFAULT 0;
    COMMENT ON COLUMN club_members.promo_wagered IS
      'Total chips wagered at tables. Must reach promo_received_total * 3 to unlock cashout.';
  END IF;

  -- Playthrough requirement (auto-calculated: promo_received_total * 3)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'club_members' AND column_name = 'promo_playthrough_required') THEN
    ALTER TABLE club_members ADD COLUMN promo_playthrough_required NUMERIC(14,2) DEFAULT 0;
    COMMENT ON COLUMN club_members.promo_playthrough_required IS
      'Required wagering to unlock cashout = promo_received_total * 3.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 2. PROMO DISTRIBUTION LEDGER — tracks every agent→player promo send
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  agent_user_id UUID NOT NULL REFERENCES auth.users(id),
  player_user_id UUID NOT NULL REFERENCES auth.users(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_dist_club_player
  ON promo_distributions(club_id, player_user_id);
CREATE INDEX IF NOT EXISTS idx_promo_dist_club_agent
  ON promo_distributions(club_id, agent_user_id);
CREATE INDEX IF NOT EXISTS idx_promo_dist_created
  ON promo_distributions(created_at DESC);

ALTER TABLE promo_distributions ENABLE ROW LEVEL SECURITY;

-- Agents can see their own distributions; admins/owners see all club distributions
DO $$ BEGIN
  DROP POLICY IF EXISTS promo_dist_read ON promo_distributions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY promo_dist_read ON promo_distributions
  FOR SELECT USING (
    agent_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM club_members
      WHERE club_id = promo_distributions.club_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 3. RESTRICTED AGENT → PLAYER PROMO TRANSFER
--    Replaces the old unrestricted transfer_promo_agent_to_player
-- ─────────────────────────────────────────────────────────────
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
  v_player RECORD;
  v_player_age_days INTEGER;
  v_lifetime_received NUMERIC;
  v_max_per_send NUMERIC;
  v_remaining_cap NUMERIC;
  v_new_promo NUMERIC;
BEGIN
  -- ── BASIC VALIDATION ──
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- ── RULE 1: Agent cannot send promo to themselves ──
  IF p_agent_user_id = p_player_user_id THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Agents cannot send promo chips to their own account');
  END IF;

  -- ── CHECK AGENT BALANCE ──
  SELECT COALESCE(promo_balance, 0) INTO v_agent_promo
  FROM agents WHERE club_id = p_club_id AND user_id = p_agent_user_id FOR UPDATE;

  IF v_agent_promo IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found in this club');
  END IF;

  IF v_agent_promo < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient agent promo balance',
      'balance', v_agent_promo);
  END IF;

  -- ── GET PLAYER INFO ──
  SELECT cm.*, cm.joined_at AS member_joined
  INTO v_player
  FROM club_members cm
  WHERE cm.club_id = p_club_id AND cm.user_id = p_player_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found in this club');
  END IF;

  -- Calculate account age in days
  v_player_age_days := EXTRACT(DAY FROM (NOW() - COALESCE(v_player.member_joined, v_player.created_at, NOW())));

  -- ── RULE 2: Accounts < 14 days old → max 25 per send ──
  IF v_player_age_days < 14 THEN
    v_max_per_send := 25;
    IF p_amount > v_max_per_send THEN
      RETURN jsonb_build_object('success', false,
        'error', format('New accounts (< 14 days) can receive max %s promo per distribution', v_max_per_send),
        'account_age_days', v_player_age_days,
        'max_per_send', v_max_per_send);
    END IF;
  END IF;

  -- ── RULE 3: Lifetime cap of 100 promo per player per club ──
  v_lifetime_received := COALESCE(v_player.promo_received_total, 0);
  v_remaining_cap := GREATEST(100 - v_lifetime_received, 0);

  IF v_remaining_cap <= 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Player has reached the 100-chip lifetime promo limit',
      'lifetime_received', v_lifetime_received,
      'cap', 100);
  END IF;

  IF p_amount > v_remaining_cap THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Amount exceeds remaining promo cap. Player can receive %s more promo chips.', v_remaining_cap),
      'remaining_cap', v_remaining_cap,
      'lifetime_received', v_lifetime_received);
  END IF;

  -- ── ALL CHECKS PASSED — EXECUTE TRANSFER ──

  -- Debit agent promo
  UPDATE agents SET
    promo_balance = promo_balance - p_amount,
    updated_at = NOW()
  WHERE club_id = p_club_id AND user_id = p_agent_user_id;

  -- Credit player: add to chip_balance (promo = regular chips for play)
  -- AND track promo accounting
  UPDATE club_members SET
    chip_balance = COALESCE(chip_balance, 0) + p_amount,
    promo_received_total = COALESCE(promo_received_total, 0) + p_amount,
    promo_playthrough_required = (COALESCE(promo_received_total, 0) + p_amount) * 3,
    updated_at = NOW()
  WHERE club_id = p_club_id AND user_id = p_player_user_id
  RETURNING chip_balance INTO v_new_promo;

  -- Record in promo_distributions ledger
  INSERT INTO promo_distributions (club_id, agent_user_id, player_user_id, amount, note)
  VALUES (p_club_id, p_agent_user_id, p_player_user_id, p_amount,
    COALESCE(p_note, 'Agent promo distribution'));

  -- Log in chip_transactions
  BEGIN
    INSERT INTO chip_transactions (
      club_id, from_user_id, to_user_id, amount, transaction_type, notes
    ) VALUES (
      p_club_id, p_agent_user_id, p_player_user_id, p_amount,
      'promo_distribution',
      format('Promo: %s chips from agent. Lifetime: %s/100. Playthrough: %sx required.',
        p_amount, COALESCE(v_player.promo_received_total, 0) + p_amount, 3)
    );
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'amount', p_amount,
    'agent_promo_after', v_agent_promo - p_amount,
    'player_balance_after', v_new_promo,
    'lifetime_received', COALESCE(v_player.promo_received_total, 0) + p_amount,
    'remaining_cap', 100 - (COALESCE(v_player.promo_received_total, 0) + p_amount),
    'playthrough_required', (COALESCE(v_player.promo_received_total, 0) + p_amount) * 3,
    'playthrough_current', COALESCE(v_player.promo_wagered, 0),
    'account_age_days', v_player_age_days
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. RECORD PROMO WAGERING (called by engine after each hand)
--    Increments promo_wagered for a player by their invested amount
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_promo_wagering(
  p_club_id UUID,
  p_player_user_id UUID,
  p_amount_wagered NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
BEGIN
  IF p_amount_wagered <= 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', true);
  END IF;

  UPDATE club_members SET
    promo_wagered = COALESCE(promo_wagered, 0) + p_amount_wagered,
    updated_at = NOW()
  WHERE club_id = p_club_id AND user_id = p_player_user_id
  RETURNING
    promo_wagered,
    promo_playthrough_required,
    promo_received_total
  INTO v_member;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'promo_wagered', v_member.promo_wagered,
    'playthrough_required', v_member.promo_playthrough_required,
    'playthrough_met', v_member.promo_wagered >= v_member.promo_playthrough_required
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 5. GET PROMO STATUS for a player (playthrough progress)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_promo_status(
  p_club_id UUID,
  p_player_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_age_days INTEGER;
BEGIN
  SELECT
    cm.*,
    EXTRACT(DAY FROM (NOW() - COALESCE(cm.joined_at, cm.created_at, NOW()))) AS age_days
  INTO v_member
  FROM club_members cm
  WHERE cm.club_id = p_club_id AND cm.user_id = p_player_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'chip_balance', COALESCE(v_member.chip_balance, 0),
    'promo_received_total', COALESCE(v_member.promo_received_total, 0),
    'promo_wagered', COALESCE(v_member.promo_wagered, 0),
    'promo_playthrough_required', COALESCE(v_member.promo_playthrough_required, 0),
    'playthrough_met', COALESCE(v_member.promo_wagered, 0) >= COALESCE(v_member.promo_playthrough_required, 0),
    'playthrough_pct', CASE
      WHEN COALESCE(v_member.promo_playthrough_required, 0) > 0
      THEN ROUND((COALESCE(v_member.promo_wagered, 0) / v_member.promo_playthrough_required) * 100, 1)
      ELSE 100
    END,
    'remaining_promo_cap', GREATEST(100 - COALESCE(v_member.promo_received_total, 0), 0),
    'account_age_days', COALESCE(v_member.age_days, 0),
    'is_new_account', COALESCE(v_member.age_days, 0) < 14,
    'max_per_send', CASE
      WHEN COALESCE(v_member.age_days, 0) < 14 THEN 25
      ELSE GREATEST(100 - COALESCE(v_member.promo_received_total, 0), 0)
    END
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 6. REPLACE fn_request_cashout WITH PLAYTHROUGH CHECK
--    Now blocks cashout if promo playthrough not met
-- ─────────────────────────────────────────────────────────────
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
  v_locked_chips NUMERIC;
  v_cashable NUMERIC;
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

  -- ── PROMO PLAYTHROUGH CHECK ──
  -- If player has received promo and hasn't met 3x playthrough,
  -- the original promo amount is locked until playthrough is met.
  IF COALESCE(v_member.promo_received_total, 0) > 0
     AND COALESCE(v_member.promo_wagered, 0) < COALESCE(v_member.promo_playthrough_required, 0)
  THEN
    -- Locked amount = promo received (since they haven't cleared it yet)
    v_locked_chips := COALESCE(v_member.promo_received_total, 0);
    v_cashable := GREATEST(COALESCE(v_member.chip_balance, 0) - v_locked_chips, 0);

    IF p_amount > v_cashable THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format(
          'Promo playthrough not met. %s chips are locked until you wager %s more chips (3x requirement). You can cash out up to %s.',
          v_locked_chips,
          COALESCE(v_member.promo_playthrough_required, 0) - COALESCE(v_member.promo_wagered, 0),
          v_cashable
        ),
        'locked_chips', v_locked_chips,
        'cashable', v_cashable,
        'promo_wagered', COALESCE(v_member.promo_wagered, 0),
        'playthrough_required', COALESCE(v_member.promo_playthrough_required, 0),
        'playthrough_remaining', COALESCE(v_member.promo_playthrough_required, 0) - COALESCE(v_member.promo_wagered, 0)
      );
    END IF;
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
