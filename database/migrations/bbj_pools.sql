-- ═══════════════════════════════════════════════════════════════════
-- BAD BEAT JACKPOT — Pool tracking + winner history
-- ═══════════════════════════════════════════════════════════════════

-- BBJ Pool: One per club (or union). Tracks running total.
CREATE TABLE IF NOT EXISTS bbj_pools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  union_id UUID REFERENCES unions(id) ON DELETE SET NULL,
  pool_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  hands_contributed BIGINT NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  last_hit_amount NUMERIC(14,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id)
);

-- BBJ Winners: Full history of every jackpot hit
CREATE TABLE IF NOT EXISTS bbj_winners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID NOT NULL REFERENCES bbj_pools(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id),
  table_id UUID,
  hand_number BIGINT,
  -- Loser (gets biggest share)
  loser_user_id UUID NOT NULL,
  loser_display_name TEXT,
  loser_hand TEXT NOT NULL,           -- e.g. 'Aces Full of Kings'
  loser_cards TEXT,                    -- e.g. 'AhAs' 
  loser_payout NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Winner (beat the loser)
  winner_user_id UUID NOT NULL,
  winner_display_name TEXT,
  winner_hand TEXT NOT NULL,           -- e.g. 'Four of a Kind, Nines'
  winner_cards TEXT,
  winner_payout NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Table share
  table_share_payout NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_payout NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Context
  pool_before NUMERIC(14,2) NOT NULL DEFAULT 0,
  pool_after NUMERIC(14,2) NOT NULL DEFAULT 0,
  stakes_tier TEXT,                    -- 'nano','micro','small','mid','high','nosebleeds'
  game_variant TEXT DEFAULT 'nlh',
  big_blind NUMERIC(10,2),
  awarded_at TIMESTAMPTZ DEFAULT NOW()
);

-- BBJ Contributions: Per-hand fee log (for auditing)
CREATE TABLE IF NOT EXISTS bbj_contributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID NOT NULL REFERENCES bbj_pools(id) ON DELETE CASCADE,
  table_id UUID,
  hand_number BIGINT,
  amount NUMERIC(10,4) NOT NULL,
  big_blind NUMERIC(10,2),
  stakes_tier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bbj_pools_club ON bbj_pools(club_id);
CREATE INDEX IF NOT EXISTS idx_bbj_winners_pool ON bbj_winners(pool_id);
CREATE INDEX IF NOT EXISTS idx_bbj_winners_club ON bbj_winners(club_id);
CREATE INDEX IF NOT EXISTS idx_bbj_winners_awarded ON bbj_winners(awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bbj_contributions_pool ON bbj_contributions(pool_id);
CREATE INDEX IF NOT EXISTS idx_bbj_contributions_created ON bbj_contributions(created_at DESC);

-- RPC: Add BBJ contribution (called each qualifying hand)
CREATE OR REPLACE FUNCTION add_bbj_contribution(
  p_club_id UUID,
  p_table_id UUID,
  p_hand_number BIGINT,
  p_amount NUMERIC,
  p_big_blind NUMERIC,
  p_stakes_tier TEXT
) RETURNS JSONB AS $$
DECLARE
  v_pool bbj_pools%ROWTYPE;
  v_new_amount NUMERIC;
BEGIN
  -- Upsert pool
  INSERT INTO bbj_pools (club_id, pool_amount, hands_contributed)
  VALUES (p_club_id, p_amount, 1)
  ON CONFLICT (club_id) DO UPDATE SET
    pool_amount = bbj_pools.pool_amount + p_amount,
    hands_contributed = bbj_pools.hands_contributed + 1,
    updated_at = NOW()
  RETURNING * INTO v_pool;

  -- Log contribution
  INSERT INTO bbj_contributions (pool_id, table_id, hand_number, amount, big_blind, stakes_tier)
  VALUES (v_pool.id, p_table_id, p_hand_number, p_amount, p_big_blind, p_stakes_tier);

  RETURN jsonb_build_object(
    'success', true,
    'pool_id', v_pool.id,
    'new_total', v_pool.pool_amount,
    'hands_contributed', v_pool.hands_contributed
  );
END;
$$ LANGUAGE plpgsql;

-- RPC: Award BBJ (called when qualifying hand hits)
CREATE OR REPLACE FUNCTION award_bbj(
  p_club_id UUID,
  p_table_id UUID,
  p_hand_number BIGINT,
  p_loser_user_id UUID,
  p_loser_display_name TEXT,
  p_loser_hand TEXT,
  p_loser_cards TEXT,
  p_winner_user_id UUID,
  p_winner_display_name TEXT,
  p_winner_hand TEXT,
  p_winner_cards TEXT,
  p_payout_total_pct NUMERIC,
  p_payout_loser_pct NUMERIC,
  p_payout_winner_pct NUMERIC,
  p_payout_table_pct NUMERIC,
  p_stakes_tier TEXT DEFAULT 'small',
  p_game_variant TEXT DEFAULT 'nlh',
  p_big_blind NUMERIC DEFAULT 2
) RETURNS JSONB AS $$
DECLARE
  v_pool bbj_pools%ROWTYPE;
  v_total_payout NUMERIC;
  v_loser_payout NUMERIC;
  v_winner_payout NUMERIC;
  v_table_payout NUMERIC;
BEGIN
  SELECT * INTO v_pool FROM bbj_pools WHERE club_id = p_club_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No BBJ pool for this club');
  END IF;

  -- Calculate payouts
  v_total_payout := ROUND(v_pool.pool_amount * p_payout_total_pct / 100, 2);
  v_loser_payout := ROUND(v_pool.pool_amount * p_payout_loser_pct / 100, 2);
  v_winner_payout := ROUND(v_pool.pool_amount * p_payout_winner_pct / 100, 2);
  v_table_payout := ROUND(v_pool.pool_amount * p_payout_table_pct / 100, 2);

  -- Record the win
  INSERT INTO bbj_winners (
    pool_id, club_id, table_id, hand_number,
    loser_user_id, loser_display_name, loser_hand, loser_cards, loser_payout,
    winner_user_id, winner_display_name, winner_hand, winner_cards, winner_payout,
    table_share_payout, total_payout, pool_before, pool_after,
    stakes_tier, game_variant, big_blind
  ) VALUES (
    v_pool.id, p_club_id, p_table_id, p_hand_number,
    p_loser_user_id, p_loser_display_name, p_loser_hand, p_loser_cards, v_loser_payout,
    p_winner_user_id, p_winner_display_name, p_winner_hand, p_winner_cards, v_winner_payout,
    v_table_payout, v_total_payout, v_pool.pool_amount, v_pool.pool_amount - v_total_payout,
    p_stakes_tier, p_game_variant, p_big_blind
  );

  -- Deduct from pool
  UPDATE bbj_pools SET
    pool_amount = pool_amount - v_total_payout,
    last_hit_at = NOW(),
    last_hit_amount = v_total_payout,
    updated_at = NOW()
  WHERE id = v_pool.id;

  RETURN jsonb_build_object(
    'success', true,
    'total_payout', v_total_payout,
    'loser_payout', v_loser_payout,
    'winner_payout', v_winner_payout,
    'table_payout', v_table_payout,
    'pool_before', v_pool.pool_amount,
    'pool_after', v_pool.pool_amount - v_total_payout
  );
END;
$$ LANGUAGE plpgsql;

-- Enable realtime on bbj_pools for live ticker
ALTER PUBLICATION supabase_realtime ADD TABLE bbj_pools;
