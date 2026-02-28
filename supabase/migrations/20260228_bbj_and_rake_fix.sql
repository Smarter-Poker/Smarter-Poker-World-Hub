-- ================================================================
-- CLUB ARENA — BBJ Pool System + Dealt-Method Rake Attribution
-- 
-- FIXES:
-- 1. Adds BBJ pool columns to unions table (main/backup/promo)
-- 2. Updates record_rake() to accept dealt player IDs and split 
--    rake EQUALLY among all dealt players (Dealt Method)
-- 3. Routes BBJ contributions to union-level pools
-- 4. Adds bbj_percent column to tables if missing
-- ================================================================

-- Drop old function signatures (hand_id was UUID, now TEXT)
DROP FUNCTION IF EXISTS record_rake(UUID, UUID, UUID, NUMERIC, NUMERIC, INTEGER, NUMERIC);
DROP FUNCTION IF EXISTS calculate_cascading_commission(UUID, UUID, UUID, NUMERIC);

-- ─────────────────────────────────────────────────────────────
-- 1. ADD BBJ POOL COLUMNS TO UNIONS
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Main BBJ pool (pays out on qualifying bad beats)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unions' AND column_name = 'main_bbj_balance') THEN
    ALTER TABLE unions ADD COLUMN main_bbj_balance NUMERIC(14,2) DEFAULT 0;
  END IF;
  
  -- Backup BBJ pool (seeds next jackpot after payout)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unions' AND column_name = 'backup_bbj_balance') THEN
    ALTER TABLE unions ADD COLUMN backup_bbj_balance NUMERIC(14,2) DEFAULT 0;
  END IF;
  
  -- Promo fund (union-wide promotions, high hands, etc)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unions' AND column_name = 'promo_fund_balance') THEN
    ALTER TABLE unions ADD COLUMN promo_fund_balance NUMERIC(14,2) DEFAULT 0;
  END IF;
  
  -- Total rake tracked at union level
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unions' AND column_name = 'total_rake') THEN
    ALTER TABLE unions ADD COLUMN total_rake NUMERIC(14,2) DEFAULT 0;
  END IF;
  
  -- Updated timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unions' AND column_name = 'updated_at') THEN
    ALTER TABLE unions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- BBJ split config lives in unions.settings JSONB:
--   "bbj_main_pct": 50      (% of BBJ drop going to main pool)
--   "bbj_backup_pct": 25    (% going to backup pool) 
--   "bbj_promo_pct": 25     (% going to promo fund)
-- Default: 50/25/25

COMMENT ON COLUMN unions.main_bbj_balance IS 'Main bad beat jackpot pool - pays on qualifying hands';
COMMENT ON COLUMN unions.backup_bbj_balance IS 'Backup BBJ pool - seeds next jackpot after payout';
COMMENT ON COLUMN unions.promo_fund_balance IS 'Promotional fund for high hands, splash pots, etc';

-- ─────────────────────────────────────────────────────────────
-- 2. ADD bbj_percent TO tables (if not already there)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tables' AND column_name = 'bbj_percent') THEN
    ALTER TABLE tables ADD COLUMN bbj_percent NUMERIC(5,2) DEFAULT 0;
    COMMENT ON COLUMN tables.bbj_percent IS 'Additional rake % taken for BBJ pool (e.g. 1 = $1 per pot max)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tables' AND column_name = 'rake_percent') THEN
    ALTER TABLE tables ADD COLUMN rake_percent NUMERIC(5,2) DEFAULT 5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tables' AND column_name = 'rake_cap_bb') THEN
    ALTER TABLE tables ADD COLUMN rake_cap_bb NUMERIC(8,2) DEFAULT 3;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. BBJ LEDGER — Track every BBJ contribution/payout
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS union_bbj_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id UUID NOT NULL REFERENCES unions(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  hand_id TEXT,
  
  -- What happened
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'contribution',   -- BBJ drop from a hand
    'payout_main',    -- Main BBJ paid out
    'payout_table',   -- Table share of BBJ payout
    'seed_backup',    -- Backup pool seeded new main
    'promo_debit',    -- Promo fund used
    'admin_adjust'    -- Manual adjustment by union admin
  )),
  
  -- Amounts (positive = credit, negative = debit)
  main_amount NUMERIC(12,2) DEFAULT 0,
  backup_amount NUMERIC(12,2) DEFAULT 0,
  promo_amount NUMERIC(12,2) DEFAULT 0,
  
  -- Running balances after this entry
  main_balance_after NUMERIC(14,2) DEFAULT 0,
  backup_balance_after NUMERIC(14,2) DEFAULT 0,
  promo_balance_after NUMERIC(14,2) DEFAULT 0,
  
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bbj_ledger_union ON union_bbj_ledger(union_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bbj_ledger_club ON union_bbj_ledger(club_id);

-- ─────────────────────────────────────────────────────────────
-- 4. REPLACE record_rake() — Now with Dealt Method + correct routing
--
--    RAKE MODEL (Dealt Method):
--    - Rake = min(pot × rake_percent/100, rake_cap)
--    - Split EQUALLY among ALL dealt players (not weighted by investment)
--    - BBJ = separate drop from pot
--
--    ROUTING:
--    Club IN a union  → 100% rake + 100% BBJ → UNION
--                       BBJ splits into main/backup/promo pools
--    Standalone club  → 100% rake + 100% BBJ → CLUB treasury
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_rake(
  p_hand_id TEXT,
  p_club_id UUID,
  p_table_id UUID,
  p_rake_amount NUMERIC,
  p_pot_size NUMERIC,
  p_num_players INTEGER,
  p_bbj_contribution NUMERIC DEFAULT 0,
  p_dealt_player_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club RECORD;
  v_union_settings JSONB;
  v_union_id UUID;
  v_union_share NUMERIC;
  v_club_share NUMERIC;
  v_rake_id UUID;
  v_player_contributions JSONB := '{}'::JSONB;
  v_per_player_rake NUMERIC;
  v_player_id UUID;
  -- BBJ split
  v_bbj_main_pct NUMERIC;
  v_bbj_backup_pct NUMERIC;
  v_bbj_promo_pct NUMERIC;
  v_bbj_main NUMERIC := 0;
  v_bbj_backup NUMERIC := 0;
  v_bbj_promo NUMERIC := 0;
  v_new_main NUMERIC;
  v_new_backup NUMERIC;
  v_new_promo NUMERIC;
BEGIN
  IF p_rake_amount <= 0 AND COALESCE(p_bbj_contribution, 0) <= 0 THEN
    RETURN jsonb_build_object('success', true, 'rake', 0, 'note', 'No rake taken');
  END IF;

  -- Get club + union info
  SELECT c.*, uc.union_id,
    COALESCE(u.settings, '{}'::JSONB) AS union_settings
  INTO v_club
  FROM clubs c
  LEFT JOIN union_clubs uc ON uc.club_id = c.id
  LEFT JOIN unions u ON u.id = uc.union_id
  WHERE c.id = p_club_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club not found');
  END IF;

  v_union_id := v_club.union_id;
  v_union_settings := v_club.union_settings;

  -- ══════════════════════════════════════════════════════════
  -- DEALT METHOD: Split rake equally among all dealt players
  -- ══════════════════════════════════════════════════════════
  IF p_dealt_player_ids IS NOT NULL AND array_length(p_dealt_player_ids, 1) > 0 AND p_rake_amount > 0 THEN
    v_per_player_rake := ROUND(p_rake_amount / array_length(p_dealt_player_ids, 1), 4);
    FOREACH v_player_id IN ARRAY p_dealt_player_ids LOOP
      v_player_contributions := v_player_contributions || jsonb_build_object(v_player_id::TEXT, v_per_player_rake);
    END LOOP;
  ELSIF p_num_players > 0 AND p_rake_amount > 0 THEN
    -- Fallback: if no player IDs provided, just record the per-player amount
    v_per_player_rake := ROUND(p_rake_amount / p_num_players, 4);
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- RAKE + BBJ ROUTING:
  --   Club IN a union  → 100% rake + 100% BBJ go to UNION
  --   Standalone club  → 100% rake + 100% BBJ go to CLUB
  -- ══════════════════════════════════════════════════════════

  IF v_union_id IS NOT NULL THEN
    -- ┌─────────────────────────────────────────────────────┐
    -- │ UNION CLUB: Everything goes to union                │
    -- └─────────────────────────────────────────────────────┘
    v_union_share := p_rake_amount;
    v_club_share := 0;

    -- BBJ split into 3 pools
    IF COALESCE(p_bbj_contribution, 0) > 0 THEN
      v_bbj_main_pct := COALESCE((v_union_settings->>'bbj_main_pct')::NUMERIC, 50);
      v_bbj_backup_pct := COALESCE((v_union_settings->>'bbj_backup_pct')::NUMERIC, 25);
      v_bbj_promo_pct := COALESCE((v_union_settings->>'bbj_promo_pct')::NUMERIC, 25);
      
      IF v_bbj_main_pct + v_bbj_backup_pct + v_bbj_promo_pct != 100 THEN
        v_bbj_main_pct := 50; v_bbj_backup_pct := 25; v_bbj_promo_pct := 25;
      END IF;

      v_bbj_main := ROUND(p_bbj_contribution * (v_bbj_main_pct / 100.0), 2);
      v_bbj_backup := ROUND(p_bbj_contribution * (v_bbj_backup_pct / 100.0), 2);
      v_bbj_promo := p_bbj_contribution - v_bbj_main - v_bbj_backup;
    END IF;

    -- Credit union: rake + BBJ pools
    UPDATE unions SET
      total_rake = COALESCE(total_rake, 0) + p_rake_amount,
      main_bbj_balance = COALESCE(main_bbj_balance, 0) + v_bbj_main,
      backup_bbj_balance = COALESCE(backup_bbj_balance, 0) + v_bbj_backup,
      promo_fund_balance = COALESCE(promo_fund_balance, 0) + v_bbj_promo,
      updated_at = NOW()
    WHERE id = v_union_id
    RETURNING main_bbj_balance, backup_bbj_balance, promo_fund_balance
    INTO v_new_main, v_new_backup, v_new_promo;

    -- Log BBJ ledger if contribution exists
    IF COALESCE(p_bbj_contribution, 0) > 0 THEN
      INSERT INTO union_bbj_ledger (
        union_id, club_id, hand_id, entry_type,
        main_amount, backup_amount, promo_amount,
        main_balance_after, backup_balance_after, promo_balance_after,
        note
      ) VALUES (
        v_union_id, p_club_id, p_hand_id, 'contribution',
        v_bbj_main, v_bbj_backup, v_bbj_promo,
        v_new_main, v_new_backup, v_new_promo,
        'BBJ drop from hand'
      );
    END IF;

  ELSE
    -- ┌─────────────────────────────────────────────────────┐
    -- │ STANDALONE CLUB: Everything goes to club            │
    -- └─────────────────────────────────────────────────────┘
    v_union_share := 0;
    v_club_share := p_rake_amount + COALESCE(p_bbj_contribution, 0);
    -- Standalone clubs don't have BBJ pools, full amount goes to treasury
    -- (club owner manages their own promotions/jackpots)
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- RECORD: Insert rake_record with player contributions
  -- ══════════════════════════════════════════════════════════
  INSERT INTO rake_records (
    club_id, table_id, hand_id, rake_amount, pot_size, 
    num_players, bbj_contribution, player_contributions
  ) VALUES (
    p_club_id, p_table_id, p_hand_id, p_rake_amount, p_pot_size,
    COALESCE(array_length(p_dealt_player_ids, 1), p_num_players),
    COALESCE(p_bbj_contribution, 0),
    CASE WHEN v_player_contributions != '{}'::JSONB THEN v_player_contributions ELSE NULL END
  ) RETURNING id INTO v_rake_id;

  -- Update club: always track total rake + hands for stats
  -- But only credit treasury if standalone (v_club_share > 0)
  UPDATE clubs SET
    chip_treasury = COALESCE(chip_treasury, 0) + v_club_share,
    total_rake = COALESCE(total_rake, 0) + p_rake_amount,
    hands_played = COALESCE(hands_played, 0) + 1,
    updated_at = NOW()
  WHERE id = p_club_id;

  -- Log transaction (shows club_share=0 for union clubs, full amount for standalone)
  INSERT INTO club_transactions (club_id, transaction_type, amount, description, reference_id, metadata)
  VALUES (p_club_id, 'rake', v_club_share, 
    CASE WHEN v_union_id IS NOT NULL THEN 'Rake collected (routed to union)' ELSE 'Rake from hand' END,
    v_rake_id,
    jsonb_build_object(
      'hand_id', p_hand_id,
      'total_rake', p_rake_amount,
      'routed_to', CASE WHEN v_union_id IS NOT NULL THEN 'union' ELSE 'club' END,
      'union_id', v_union_id,
      'union_share', v_union_share,
      'club_share', v_club_share,
      'bbj', COALESCE(p_bbj_contribution, 0),
      'bbj_main', v_bbj_main,
      'bbj_backup', v_bbj_backup,
      'bbj_promo', v_bbj_promo,
      'num_dealt', COALESCE(array_length(p_dealt_player_ids, 1), p_num_players),
      'per_player_rake', v_per_player_rake
    ));

  RETURN jsonb_build_object(
    'success', true,
    'rake_id', v_rake_id,
    'total_rake', p_rake_amount,
    'routed_to', CASE WHEN v_union_id IS NOT NULL THEN 'union' ELSE 'club' END,
    'club_share', v_club_share,
    'union_share', v_union_share,
    'bbj_contribution', COALESCE(p_bbj_contribution, 0),
    'bbj_main', v_bbj_main,
    'bbj_backup', v_bbj_backup,
    'bbj_promo', v_bbj_promo,
    'per_player_rake', v_per_player_rake,
    'num_dealt', COALESCE(array_length(p_dealt_player_ids, 1), p_num_players),
    'player_contributions', v_player_contributions
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. GET_UNION_BBJ_STATUS — View current BBJ pool balances
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_union_bbj_status(p_union_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_union RECORD;
  v_recent_entries JSONB;
BEGIN
  SELECT * INTO v_union FROM unions WHERE id = p_union_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Union not found');
  END IF;

  -- Last 20 BBJ ledger entries
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', l.id, 'entry_type', l.entry_type, 'club_id', l.club_id,
    'main_amount', l.main_amount, 'backup_amount', l.backup_amount, 
    'promo_amount', l.promo_amount, 'note', l.note, 'created_at', l.created_at
  ) ORDER BY l.created_at DESC), '[]'::JSONB) INTO v_recent_entries
  FROM union_bbj_ledger l
  WHERE l.union_id = p_union_id
  LIMIT 20;

  RETURN jsonb_build_object(
    'success', true,
    'union_id', p_union_id,
    'main_bbj', COALESCE(v_union.main_bbj_balance, 0),
    'backup_bbj', COALESCE(v_union.backup_bbj_balance, 0),
    'promo_fund', COALESCE(v_union.promo_fund_balance, 0),
    'total_bbj', COALESCE(v_union.main_bbj_balance, 0) + 
                 COALESCE(v_union.backup_bbj_balance, 0) + 
                 COALESCE(v_union.promo_fund_balance, 0),
    'split_config', jsonb_build_object(
      'main_pct', COALESCE((v_union.settings->>'bbj_main_pct')::NUMERIC, 50),
      'backup_pct', COALESCE((v_union.settings->>'bbj_backup_pct')::NUMERIC, 25),
      'promo_pct', COALESCE((v_union.settings->>'bbj_promo_pct')::NUMERIC, 25)
    ),
    'recent_entries', v_recent_entries
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. AWARD_BBJ — Pay out the bad beat jackpot
--    Main pool pays out, backup seeds new main, promo untouched
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION award_bbj(
  p_union_id UUID,
  p_club_id UUID,
  p_hand_id TEXT,
  p_awarded_by UUID,
  p_loser_amount NUMERIC,    -- % of main to losing hand (e.g. 50%)
  p_winner_amount NUMERIC,   -- % of main to winning hand (e.g. 25%)
  p_table_share NUMERIC,     -- % of main split among table (e.g. 25%)
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_union RECORD;
  v_main_pool NUMERIC;
  v_backup_pool NUMERIC;
  v_seed_amount NUMERIC;
BEGIN
  SELECT * INTO v_union FROM unions WHERE id = p_union_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Union not found');
  END IF;

  v_main_pool := COALESCE(v_union.main_bbj_balance, 0);
  v_backup_pool := COALESCE(v_union.backup_bbj_balance, 0);

  IF v_main_pool <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No BBJ funds to award');
  END IF;

  -- Verify percentages add up
  IF p_loser_amount + p_winner_amount + p_table_share > v_main_pool THEN
    RETURN jsonb_build_object('success', false, 'error', 'Award amounts exceed pool');
  END IF;

  -- Seed new main from backup
  v_seed_amount := v_backup_pool;

  -- Zero out main, move backup to main, zero backup
  UPDATE unions SET
    main_bbj_balance = v_seed_amount,  -- backup becomes new main
    backup_bbj_balance = 0,            -- backup depleted
    updated_at = NOW()
  WHERE id = p_union_id;

  -- Log the payout
  INSERT INTO union_bbj_ledger (
    union_id, club_id, hand_id, entry_type,
    main_amount, backup_amount, promo_amount,
    main_balance_after, backup_balance_after, promo_balance_after,
    note, created_by
  ) VALUES (
    p_union_id, p_club_id, p_hand_id, 'payout_main',
    -v_main_pool, -v_backup_pool, 0,
    v_seed_amount, 0, COALESCE(v_union.promo_fund_balance, 0),
    COALESCE(p_note, 'BBJ awarded! Loser: ' || p_loser_amount || ', Winner: ' || p_winner_amount || ', Table: ' || p_table_share),
    p_awarded_by
  );

  -- Log the re-seed
  INSERT INTO union_bbj_ledger (
    union_id, entry_type, main_amount, backup_amount, promo_amount,
    main_balance_after, backup_balance_after, promo_balance_after,
    note, created_by
  ) VALUES (
    p_union_id, 'seed_backup', v_seed_amount, 0, 0,
    v_seed_amount, 0, COALESCE(v_union.promo_fund_balance, 0),
    'Backup pool seeded new main jackpot',
    p_awarded_by
  );

  RETURN jsonb_build_object(
    'success', true,
    'awarded_total', v_main_pool,
    'loser_share', p_loser_amount,
    'winner_share', p_winner_amount,
    'table_share', p_table_share,
    'new_main_bbj', v_seed_amount,
    'new_backup_bbj', 0
  );
END;
$$;

-- Done
SELECT 'BBJ pool system + dealt-method rake attribution installed' AS result;

-- ─────────────────────────────────────────────────────────────
-- 8. BBJ STAKES TIERS — Reference table for payout %s per tier
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bbj_stakes_tiers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  blind_range TEXT NOT NULL,
  min_bb NUMERIC(10,2),
  max_bb NUMERIC(10,2),
  rake_percent NUMERIC(5,2) NOT NULL,
  rake_cap_bb NUMERIC(5,2) NOT NULL,
  bbj_fee_bb NUMERIC(5,2) NOT NULL,
  payout_total_pct NUMERIC(5,2) NOT NULL,
  payout_loser_pct NUMERIC(5,2) NOT NULL,
  payout_winner_pct NUMERIC(5,2) NOT NULL,
  payout_table_pct NUMERIC(5,2) NOT NULL
);

INSERT INTO bbj_stakes_tiers (id, label, blind_range, min_bb, max_bb, rake_percent, rake_cap_bb, bbj_fee_bb, payout_total_pct, payout_loser_pct, payout_winner_pct, payout_table_pct) VALUES
  ('nano',       'Nano',       '0.05/0.1 – 0.1/0.2', 0.1,  0.2,  5,  10,   0.60, 15,   7.50,  3.75,  3.75),
  ('micro',      'Micro',      '0.2/0.4 – 0.4/0.8',  0.4,  0.8,  7,   8,   0.40, 25,  12.50,  6.25,  6.25),
  ('small',      'Small',      '0.5/1 – 1.5/3',       1.0,  3.0, 10,   5,   0.25, 40,  20.00, 10.00, 10.00),
  ('mid',        'Mid',        '2/4 – 4/8',            4.0,  8.0,  8,   3,   0.12, 55,  27.50, 13.75, 13.75),
  ('high',       'High',       '5/10 – 20/40',        10.0, 40.0,  5,   2,   0.06, 70,  35.00, 17.50, 17.50),
  ('nosebleeds', 'Nosebleeds', '25/50+',              50.0, 99999, 3,   1,   0.03, 85,  42.50, 21.25, 21.25)
ON CONFLICT (id) DO UPDATE SET
  rake_percent = EXCLUDED.rake_percent,
  rake_cap_bb = EXCLUDED.rake_cap_bb,
  bbj_fee_bb = EXCLUDED.bbj_fee_bb,
  payout_total_pct = EXCLUDED.payout_total_pct,
  payout_loser_pct = EXCLUDED.payout_loser_pct,
  payout_winner_pct = EXCLUDED.payout_winner_pct,
  payout_table_pct = EXCLUDED.payout_table_pct;

-- ─────────────────────────────────────────────────────────────
-- 9. BBJ QUALIFYING HANDS — Reference table per game variant
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bbj_qualifying_hands (
  variant TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  min_losing_hand TEXT,
  description TEXT NOT NULL,
  hand_rank TEXT,
  eligible BOOLEAN DEFAULT true
);

INSERT INTO bbj_qualifying_hands (variant, label, min_losing_hand, description, hand_rank, eligible) VALUES
  ('nlh',        'NLH / FLH',   'AAAJJ',  'Full House (Aces full of Jacks+) must lose to Quads or Straight Flush. Must have at least one Ace in hole cards.', 'full_house', true),
  ('plo4',       'PLO4 / FLO4', 'KKKK2',  'Four of a Kind (Kings+) must lose. Both players must use two cards from hole cards.', 'four_of_a_kind', true),
  ('plo5',       'PLO5 / FLO5', '87654',  'Straight Flush (8-high+) must lose. Both players must use two cards from hole cards.', 'straight_flush', true),
  ('plo6',       'PLO6',        '87654',  'Straight Flush (8-high+) must lose.', 'straight_flush', true),
  ('short_deck', 'Short Deck',   NULL,     'BBJ not available for Short Deck.', NULL, false),
  ('ofc',        'OFC',          NULL,     'BBJ not available for Open Face Chinese.', NULL, false)
ON CONFLICT (variant) DO UPDATE SET
  min_losing_hand = EXCLUDED.min_losing_hand,
  description = EXCLUDED.description,
  eligible = EXCLUDED.eligible;

-- ─────────────────────────────────────────────────────────────
-- 7. FIX calculate_cascading_commission to accept TEXT hand_id
-- ─────────────────────────────────────────────────────────────
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

    v_agent_commission := ROUND(p_rake_amount * (COALESCE(v_agent.commission_rate, 0) / 100.0), 2);

    IF v_agent_commission > v_remaining_rake THEN
      v_agent_commission := v_remaining_rake;
    END IF;

    IF v_agent_commission > 0 THEN
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
