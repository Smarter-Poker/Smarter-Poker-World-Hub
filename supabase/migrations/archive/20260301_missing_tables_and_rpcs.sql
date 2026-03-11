-- ═══════════════════════════════════════════════════════════════════════════════
-- CRITICAL MIGRATION: Missing Tables & RPCs
-- 
-- 9 tables that code inserts/selects from but were never created:
--   1. chip_transactions      — Audit trail for all chip movements
--   2. club_transactions      — Club-level financial audit trail
--   3. commission_records     — Agent commission per settlement period
--   4. commission_history     — Historical commission detail (cross-period)
--   5. anti_cheat_events      — Anti-cheat event logging
--   6. bbj_contributions      — Per-hand BBJ contribution records
--   7. bbj_pools              — Per-club BBJ pool tracking
--   8. bbj_winners            — BBJ payout winner records
--   9. table_sessions         — Player session tracking (anti-cheat)
--
-- 2 RPCs that code calls but were never created:
--   1. add_bbj_contribution   — LobbyManager calls after every hand
--   2. close_table_session    — AntiCheat calls on player removal
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. chip_transactions — Audit trail for ALL chip movements
--    Minting, distributing, agent→player, cashout, promo, clawback, etc.
--    Referenced by: mint_club_chips, distribute_chips, transfer_chips_agent_to_player,
--                   transfer_promo_agent_to_player, transfer_promo_club_to_agent RPCs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chip_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL,
  from_user_id UUID,                        -- NULL for minting (no source user)
  to_user_id UUID,                          -- NULL for clawback (no target user)
  amount NUMERIC(14,2) NOT NULL,
  transaction_type TEXT NOT NULL,            -- mint, distribute, agent_to_player, cashout_approved,
                                            -- cashout_rejected, clawback, promo_mint,
                                            -- promo_club_to_agent, promo_agent_to_player,
                                            -- promo_union_to_agent, table_lock, table_unlock
  notes TEXT,
  related_cashout_id UUID,                  -- FK to cashout_requests if applicable
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chip_tx_club ON chip_transactions (club_id);
CREATE INDEX IF NOT EXISTS idx_chip_tx_from ON chip_transactions (from_user_id) WHERE from_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chip_tx_to ON chip_transactions (to_user_id) WHERE to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chip_tx_type ON chip_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_chip_tx_created ON chip_transactions (created_at DESC);

ALTER TABLE chip_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chip_transactions_all" ON chip_transactions FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. club_transactions — Club-level financial audit trail
--    Tracks treasury changes: minting, distributions, rake deposits, etc.
--    Referenced by: mint_club_chips RPC, distribute_chips RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL,
  user_id UUID,                             -- Who initiated (NULL for system)
  transaction_type TEXT NOT NULL,            -- mint, distribute, rake_deposit, bbj_contribution,
                                            -- promo_mint, settlement, cashout
  amount NUMERIC(14,2) NOT NULL,
  balance_before NUMERIC(14,2),
  balance_after NUMERIC(14,2),
  description TEXT,
  reference_id UUID,                        -- FK to related record
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_tx_club ON club_transactions (club_id);
CREATE INDEX IF NOT EXISTS idx_club_tx_type ON club_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_club_tx_created ON club_transactions (created_at DESC);

ALTER TABLE club_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "club_transactions_all" ON club_transactions FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. commission_records — Agent commission per settlement period
--    Created when settlement period is closed. Tracks pending→paid lifecycle.
--    Referenced by: settle-period.js (insert on close, update on pay)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES settlement_periods(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  gross_rake NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending, paid, void
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_rec_period ON commission_records (period_id);
CREATE INDEX IF NOT EXISTS idx_commission_rec_agent ON commission_records (agent_id);
CREATE INDEX IF NOT EXISTS idx_commission_rec_status ON commission_records (status);

ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_records_all" ON commission_records FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. commission_history — Cross-period commission history per agent
--    Detailed view with sub-agent splits, used in dashboards.
--    Referenced by: settle-period.js (insert on close, update on pay)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ,
  player_rake_generated NUMERIC(14,2) DEFAULT 0,
  commission_rate NUMERIC(5,4) DEFAULT 0,
  commission_earned NUMERIC(14,2) DEFAULT 0,
  sub_agent_commission NUMERIC(14,2) DEFAULT 0,
  net_commission NUMERIC(14,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending, paid
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_hist_club ON commission_history (club_id);
CREATE INDEX IF NOT EXISTS idx_commission_hist_agent ON commission_history (agent_id);
CREATE INDEX IF NOT EXISTS idx_commission_hist_status ON commission_history (status);

ALTER TABLE commission_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_history_all" ON commission_history FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. anti_cheat_events — Event log for all anti-cheat activity
--    Player kicks, flag reviews, session closures, auto-boot, GPS proximity, etc.
--    Referenced by: anti-cheat.js API, AntiCheat.js, AntiCheatMonitor.js
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anti_cheat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,                 -- player_kicked, flag_reviewed, flag_dismissed,
                                            -- flag_actioned, session_ended, gps_alert,
                                            -- collusion_detected, ip_duplicate
  player_id UUID,
  club_id UUID,
  table_id UUID,
  details JSONB DEFAULT '{}',
  triggered_by TEXT,                        -- user UUID or 'anti_cheat_monitor' for system
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ace_club ON anti_cheat_events (club_id);
CREATE INDEX IF NOT EXISTS idx_ace_player ON anti_cheat_events (player_id);
CREATE INDEX IF NOT EXISTS idx_ace_type ON anti_cheat_events (event_type);
CREATE INDEX IF NOT EXISTS idx_ace_created ON anti_cheat_events (created_at DESC);

ALTER TABLE anti_cheat_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anti_cheat_events_all" ON anti_cheat_events FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. bbj_contributions — Per-hand BBJ contribution records
--    Tracks every hand's BBJ fee for audit + recent-rate calculations.
--    Referenced by: bbj.js API (select recent), add_bbj_contribution RPC (insert)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bbj_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID,                             -- FK to bbj_pools
  club_id UUID NOT NULL,
  table_id UUID,
  hand_number BIGINT DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL,
  big_blind NUMERIC(10,2),
  stakes_tier TEXT,                         -- nano, micro, small, medium, high, nosebleed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bbj_contrib_pool ON bbj_contributions (pool_id);
CREATE INDEX IF NOT EXISTS idx_bbj_contrib_club ON bbj_contributions (club_id);
CREATE INDEX IF NOT EXISTS idx_bbj_contrib_created ON bbj_contributions (created_at DESC);

ALTER TABLE bbj_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bbj_contributions_all" ON bbj_contributions FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. bbj_pools — Per-club BBJ pool tracking
--    Tracks current pool amount, hands contributed, last hit info.
--    Referenced by: bbj.js API (select for display), add_bbj_contribution RPC (update)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bbj_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL UNIQUE,
  union_id UUID,                            -- Which union this pool belongs to (if any)
  pool_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  hands_contributed BIGINT DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  last_hit_amount NUMERIC(14,2) DEFAULT 0,
  last_winner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bbj_pools_club ON bbj_pools (club_id);
CREATE INDEX IF NOT EXISTS idx_bbj_pools_union ON bbj_pools (union_id) WHERE union_id IS NOT NULL;

ALTER TABLE bbj_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bbj_pools_all" ON bbj_pools FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. bbj_winners — BBJ payout records
--    Historical record of every BBJ hit + payout details.
--    Referenced by: bbj.js API (select last 10 winners)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bbj_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL,
  pool_id UUID,
  loser_id UUID,                            -- Player with losing qualifying hand
  winner_id UUID,                           -- Player with winning hand
  loser_hand TEXT,                          -- e.g. 'Quad Aces beaten by Straight Flush'
  winner_hand TEXT,
  loser_payout NUMERIC(14,2) DEFAULT 0,
  winner_payout NUMERIC(14,2) DEFAULT 0,
  table_share_payout NUMERIC(14,2) DEFAULT 0,
  total_payout NUMERIC(14,2) DEFAULT 0,
  pool_amount_at_hit NUMERIC(14,2) DEFAULT 0,
  stakes_tier TEXT,
  table_id UUID,
  hand_number BIGINT,
  awarded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bbj_winners_club ON bbj_winners (club_id);
CREATE INDEX IF NOT EXISTS idx_bbj_winners_awarded ON bbj_winners (awarded_at DESC);

ALTER TABLE bbj_winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bbj_winners_all" ON bbj_winners FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. table_sessions — Player session tracking for anti-cheat
--    Tracks who is sitting where, with IP/GPS/fingerprint for collusion detection.
--    Referenced by: AntiCheat.js (upsert on seat), anti-cheat.js API (select active),
--                   close_table_session RPC (update on leave)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL,
  player_id UUID NOT NULL,
  club_id UUID,
  seat_index INTEGER,
  ip_address TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  fingerprint TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  seated_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  kick_reason TEXT,
  UNIQUE(table_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_tsess_table ON table_sessions (table_id);
CREATE INDEX IF NOT EXISTS idx_tsess_player ON table_sessions (player_id);
CREATE INDEX IF NOT EXISTS idx_tsess_club ON table_sessions (club_id);
CREATE INDEX IF NOT EXISTS idx_tsess_active ON table_sessions (is_active) WHERE is_active = true;

ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_sessions_all" ON table_sessions FOR ALL USING (true);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 1: add_bbj_contribution
-- Called by LobbyManager.js after every hand to record BBJ fee + update pool.
-- Creates bbj_pools row if it doesn't exist yet (auto-init per club).
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION add_bbj_contribution(
  p_club_id UUID,
  p_table_id UUID,
  p_hand_number BIGINT,
  p_amount NUMERIC,
  p_big_blind NUMERIC,
  p_stakes_tier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pool bbj_pools%ROWTYPE;
  v_contribution_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Get or create pool for this club
  SELECT * INTO v_pool FROM bbj_pools WHERE club_id = p_club_id;
  
  IF v_pool.id IS NULL THEN
    INSERT INTO bbj_pools (club_id, pool_amount, hands_contributed)
    VALUES (p_club_id, 0, 0)
    RETURNING * INTO v_pool;
  END IF;

  -- Record the contribution
  INSERT INTO bbj_contributions (pool_id, club_id, table_id, hand_number, amount, big_blind, stakes_tier)
  VALUES (v_pool.id, p_club_id, p_table_id, p_hand_number, p_amount, p_big_blind, p_stakes_tier)
  RETURNING id INTO v_contribution_id;

  -- Update pool totals
  UPDATE bbj_pools
  SET pool_amount = pool_amount + p_amount,
      hands_contributed = hands_contributed + 1,
      updated_at = NOW()
  WHERE id = v_pool.id;

  -- Also update union BBJ balances if club belongs to a union
  -- (The 3-way split: 40% main, 30% backup, 30% promo is handled by record_rake RPC)

  RETURN jsonb_build_object(
    'success', true,
    'contribution_id', v_contribution_id,
    'pool_amount', v_pool.pool_amount + p_amount,
    'hands_contributed', v_pool.hands_contributed + 1
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 2: close_table_session
-- Called by AntiCheat.js when a player leaves or is kicked from a table.
-- Marks the session inactive and records the reason.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION close_table_session(
  p_table_id UUID,
  p_player_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session table_sessions%ROWTYPE;
BEGIN
  -- Find the active session
  SELECT * INTO v_session
  FROM table_sessions
  WHERE table_id = p_table_id
    AND player_id = p_player_id
    AND is_active = true;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active session found');
  END IF;

  -- Close it
  UPDATE table_sessions
  SET is_active = false,
      left_at = NOW(),
      kick_reason = p_reason
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'duration_minutes', EXTRACT(EPOCH FROM (NOW() - v_session.seated_at)) / 60
  );
END;
$$;
