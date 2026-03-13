-- ═══════════════════════════════════════════════════════════════════════════════
-- BBJ TRIPLE-BANK SCHEMA — Implement full Triple-Bank system
--
-- PROBLEM: bbj_pools only has pool_amount (single balance). The BBJService
-- sends p_main_portion, p_backup_portion, p_promo_portion but the RPC
-- ignores them. All BBJ goes into one undifferentiated pool.
--
-- FIX: Add backup_balance + promo_balance columns, rename pool_amount to 
-- main_balance semantically (keep pool_amount as total), and update the
-- add_bbj_contribution RPC to split contributions into three banks.
--
-- Triple-Bank Split (Standard: pool < $100k):
--   MAIN:   50% — Active jackpot displayed to players
--   BACKUP: 25% — Seeds next jackpot after a hit
--   PROMO:  25% — Union promotions wallet (high-hand rewards, rain events)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add Triple-Bank columns to bbj_pools
ALTER TABLE bbj_pools ADD COLUMN IF NOT EXISTS main_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bbj_pools ADD COLUMN IF NOT EXISTS backup_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bbj_pools ADD COLUMN IF NOT EXISTS promo_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bbj_pools ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 2. Migrate existing pool_amount into main_balance (one-time data migration)
UPDATE bbj_pools SET main_balance = pool_amount WHERE main_balance = 0 AND pool_amount > 0;

-- 3. Add Triple-Bank columns to bbj_contributions for audit trail
ALTER TABLE bbj_contributions ADD COLUMN IF NOT EXISTS club_id UUID;
ALTER TABLE bbj_contributions ADD COLUMN IF NOT EXISTS main_portion NUMERIC(10,4);
ALTER TABLE bbj_contributions ADD COLUMN IF NOT EXISTS backup_portion NUMERIC(10,4);
ALTER TABLE bbj_contributions ADD COLUMN IF NOT EXISTS promo_portion NUMERIC(10,4);

-- 4. Replace add_bbj_contribution RPC to support Triple-Bank allocation
CREATE OR REPLACE FUNCTION add_bbj_contribution(
  p_club_id UUID,
  p_table_id UUID,
  p_hand_number BIGINT,
  p_amount NUMERIC,
  p_big_blind NUMERIC,
  p_stakes_tier TEXT,
  p_main_portion NUMERIC DEFAULT NULL,
  p_backup_portion NUMERIC DEFAULT NULL,
  p_promo_portion NUMERIC DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_pool bbj_pools%ROWTYPE;
  v_main NUMERIC;
  v_backup NUMERIC;
  v_promo NUMERIC;
BEGIN
  -- Calculate portions: if not provided, use 50/25/25 standard split
  v_main := COALESCE(p_main_portion, ROUND(p_amount * 0.50, 4));
  v_backup := COALESCE(p_backup_portion, ROUND(p_amount * 0.25, 4));
  v_promo := COALESCE(p_promo_portion, p_amount - v_main - v_backup);

  -- Upsert pool with Triple-Bank split
  INSERT INTO bbj_pools (club_id, pool_amount, main_balance, backup_balance, promo_balance, hands_contributed)
  VALUES (p_club_id, p_amount, v_main, v_backup, v_promo, 1)
  ON CONFLICT (club_id) DO UPDATE SET
    pool_amount = bbj_pools.pool_amount + p_amount,
    main_balance = bbj_pools.main_balance + v_main,
    backup_balance = bbj_pools.backup_balance + v_backup,
    promo_balance = bbj_pools.promo_balance + v_promo,
    hands_contributed = bbj_pools.hands_contributed + 1,
    updated_at = NOW()
  RETURNING * INTO v_pool;

  -- Log contribution with portion breakdown
  INSERT INTO bbj_contributions (pool_id, club_id, table_id, hand_number, amount, big_blind, stakes_tier, main_portion, backup_portion, promo_portion)
  VALUES (v_pool.id, p_club_id, p_table_id, p_hand_number, p_amount, p_big_blind, p_stakes_tier, v_main, v_backup, v_promo);

  RETURN jsonb_build_object(
    'success', true,
    'pool_id', v_pool.id,
    'new_total', v_pool.pool_amount,
    'main_balance', v_pool.main_balance,
    'backup_balance', v_pool.backup_balance,
    'promo_balance', v_pool.promo_balance,
    'hands_contributed', v_pool.hands_contributed
  );
END;
$$ LANGUAGE plpgsql;

-- 5. Update award_bbj to use main_balance instead of pool_amount for payouts
-- After a hit, move backup_balance into main_balance to seed next jackpot
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
  v_seed_amount NUMERIC;
BEGIN
  SELECT * INTO v_pool FROM bbj_pools WHERE club_id = p_club_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No BBJ pool for this club');
  END IF;

  -- Payout comes from MAIN BALANCE only (not backup or promo)
  v_total_payout := ROUND(v_pool.main_balance * p_payout_total_pct / 100, 2);
  v_loser_payout := ROUND(v_pool.main_balance * p_payout_loser_pct / 100, 2);
  v_winner_payout := ROUND(v_pool.main_balance * p_payout_winner_pct / 100, 2);
  v_table_payout := ROUND(v_pool.main_balance * p_payout_table_pct / 100, 2);

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
    v_table_payout, v_total_payout, v_pool.main_balance, v_pool.main_balance - v_total_payout,
    p_stakes_tier, p_game_variant, p_big_blind
  );

  -- After hit: 
  -- 1. Deduct payout from main_balance
  -- 2. Move backup_balance → main_balance (seed next jackpot)
  -- 3. Reset backup_balance to 0
  -- 4. Keep promo_balance untouched (for union to use)
  v_seed_amount := v_pool.backup_balance;

  UPDATE bbj_pools SET
    pool_amount = pool_amount - v_total_payout,
    main_balance = (main_balance - v_total_payout) + v_seed_amount,
    backup_balance = 0,
    -- promo_balance stays untouched
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
    'pool_before', v_pool.main_balance,
    'pool_after', (v_pool.main_balance - v_total_payout) + v_seed_amount,
    'seed_from_backup', v_seed_amount,
    'promo_balance_preserved', v_pool.promo_balance
  );
END;
$$ LANGUAGE plpgsql;

-- 6. Enable realtime on bbj_contributions for live tracking
-- ALTER PUBLICATION supabase_realtime ADD TABLE bbj_contributions;
-- bbj_pools realtime already enabled in original migration
