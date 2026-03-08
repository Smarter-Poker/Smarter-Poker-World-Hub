-- ================================================================
-- HAND ID SYSTEM + FULL TRACKING
--
-- 1. Global hand ID sequence (SP-XXXXXXX)
-- 2. global_hand_id + is_tournament on rake_records
-- 3. player_bbj_contributions on union_bbj_ledger
-- 4. Updated record_rake() — adds global_hand_id + per-player BBJ
-- 5. record_tournament_buyin_rake() — per-player at registration
-- ================================================================

-- ─────────────────────────────────────────────────────────────
-- 1. GLOBAL HAND ID SEQUENCE
--    Every hand across all clubs/tables gets a unique integer.
--    Display format: SP-0001234567 (10-digit, zero-padded)
-- ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS hand_id_seq
  START WITH 1000000
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 100;   -- Pre-allocate 100 IDs to reduce round-trip latency

COMMENT ON SEQUENCE hand_id_seq IS
  'Global sequential hand ID. Every rake-recorded hand gets a unique integer. Display as SP-XXXXXXXXXX.';

-- ─────────────────────────────────────────────────────────────
-- 2. ADD COLUMNS TO rake_records
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Global unique sequential hand number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rake_records' AND column_name = 'global_hand_id'
  ) THEN
    ALTER TABLE rake_records
      ADD COLUMN global_hand_id BIGINT DEFAULT nextval('hand_id_seq');
    COMMENT ON COLUMN rake_records.global_hand_id IS
      'Globally unique sequential hand ID from hand_id_seq. Used in display as SP-XXXXXXXXXX.';
  END IF;

  -- Tournament flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rake_records' AND column_name = 'is_tournament'
  ) THEN
    ALTER TABLE rake_records
      ADD COLUMN is_tournament BOOLEAN NOT NULL DEFAULT false;
    COMMENT ON COLUMN rake_records.is_tournament IS
      'True when this record is for tournament buy-in rake (not a cash game hand).';
  END IF;

  -- Tournament ID (NULL for cash game hands)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rake_records' AND column_name = 'tournament_id'
  ) THEN
    ALTER TABLE rake_records
      ADD COLUMN tournament_id UUID REFERENCES club_tournaments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rake_records_global_hand ON rake_records(global_hand_id);
CREATE INDEX IF NOT EXISTS idx_rake_records_tournament ON rake_records(tournament_id) WHERE tournament_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. ADD player_bbj_contributions TO union_bbj_ledger
--    Tracks each dealt player's share of the BBJ drop per hand.
--    Format: {"user_id": amount, ...}  (same dealt-method split)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'union_bbj_ledger' AND column_name = 'player_contributions'
  ) THEN
    ALTER TABLE union_bbj_ledger
      ADD COLUMN player_contributions JSONB DEFAULT NULL;
    COMMENT ON COLUMN union_bbj_ledger.player_contributions IS
      'Per-player BBJ contribution amounts for this hand. Dealt-method split: bbj_amount / num_dealt_players per player. Format: {"user_id": amount}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'union_bbj_ledger' AND column_name = 'num_players'
  ) THEN
    ALTER TABLE union_bbj_ledger
      ADD COLUMN num_players INTEGER DEFAULT NULL;
    COMMENT ON COLUMN union_bbj_ledger.num_players IS
      'Number of players dealt into the hand that generated this BBJ contribution.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. REPLACE record_rake() — adds global_hand_id + BBJ player tracking
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
  v_global_hand_id BIGINT;
  v_player_contributions JSONB := '{}'::JSONB;
  v_bbj_player_contributions JSONB := '{}'::JSONB;
  v_per_player_rake NUMERIC;
  v_per_player_bbj NUMERIC;
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

  -- Assign global sequential hand ID
  v_global_hand_id := nextval('hand_id_seq');

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
  -- Cash games: rake / num_players dealt
  -- Tournament: 100% per registering player (handled by record_tournament_buyin_rake)
  -- ══════════════════════════════════════════════════════════
  IF p_dealt_player_ids IS NOT NULL AND array_length(p_dealt_player_ids, 1) > 0 AND p_rake_amount > 0 THEN
    v_per_player_rake := ROUND(p_rake_amount / array_length(p_dealt_player_ids, 1), 4);
    FOREACH v_player_id IN ARRAY p_dealt_player_ids LOOP
      v_player_contributions := v_player_contributions || jsonb_build_object(v_player_id::TEXT, v_per_player_rake);
    END LOOP;
  ELSIF p_num_players > 0 AND p_rake_amount > 0 THEN
    v_per_player_rake := ROUND(p_rake_amount / p_num_players, 4);
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- BBJ PLAYER ATTRIBUTION (Dealt Method)
  -- Each dealt player gets credited with their proportional share
  -- of the BBJ drop for that hand.
  -- ══════════════════════════════════════════════════════════
  IF COALESCE(p_bbj_contribution, 0) > 0 THEN
    IF p_dealt_player_ids IS NOT NULL AND array_length(p_dealt_player_ids, 1) > 0 THEN
      v_per_player_bbj := ROUND(p_bbj_contribution / array_length(p_dealt_player_ids, 1), 4);
      FOREACH v_player_id IN ARRAY p_dealt_player_ids LOOP
        v_bbj_player_contributions := v_bbj_player_contributions
          || jsonb_build_object(v_player_id::TEXT, v_per_player_bbj);
      END LOOP;
    ELSIF p_num_players > 0 THEN
      v_per_player_bbj := ROUND(p_bbj_contribution / p_num_players, 4);
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- ROUTING:
  --   Union club  → 100% rake + 100% BBJ → UNION
  --   Standalone  → 100% rake + 100% BBJ → CLUB
  -- ══════════════════════════════════════════════════════════
  IF v_union_id IS NOT NULL THEN
    v_union_share := p_rake_amount;
    v_club_share := 0;

    IF COALESCE(p_bbj_contribution, 0) > 0 THEN
      v_bbj_main_pct := COALESCE((v_union_settings->>'bbj_main_pct')::NUMERIC, 40);
      v_bbj_backup_pct := COALESCE((v_union_settings->>'bbj_backup_pct')::NUMERIC, 30);
      v_bbj_promo_pct := COALESCE((v_union_settings->>'bbj_promo_pct')::NUMERIC, 30);

      IF v_bbj_main_pct + v_bbj_backup_pct + v_bbj_promo_pct != 100 THEN
        v_bbj_main_pct := 40; v_bbj_backup_pct := 30; v_bbj_promo_pct := 30;
      END IF;

      v_bbj_main := ROUND(p_bbj_contribution * (v_bbj_main_pct / 100.0), 2);
      v_bbj_backup := ROUND(p_bbj_contribution * (v_bbj_backup_pct / 100.0), 2);
      v_bbj_promo := p_bbj_contribution - v_bbj_main - v_bbj_backup;
    END IF;

    UPDATE unions SET
      total_rake = COALESCE(total_rake, 0) + p_rake_amount,
      main_bbj_balance = COALESCE(main_bbj_balance, 0) + v_bbj_main,
      backup_bbj_balance = COALESCE(backup_bbj_balance, 0) + v_bbj_backup,
      promo_fund_balance = COALESCE(promo_fund_balance, 0) + v_bbj_promo,
      updated_at = NOW()
    WHERE id = v_union_id
    RETURNING main_bbj_balance, backup_bbj_balance, promo_fund_balance
    INTO v_new_main, v_new_backup, v_new_promo;

    IF COALESCE(p_bbj_contribution, 0) > 0 THEN
      INSERT INTO union_bbj_ledger (
        union_id, club_id, hand_id, entry_type,
        main_amount, backup_amount, promo_amount,
        main_balance_after, backup_balance_after, promo_balance_after,
        player_contributions,
        num_players,
        note
      ) VALUES (
        v_union_id, p_club_id, p_hand_id, 'contribution',
        v_bbj_main, v_bbj_backup, v_bbj_promo,
        v_new_main, v_new_backup, v_new_promo,
        CASE WHEN v_bbj_player_contributions != '{}'::JSONB
          THEN v_bbj_player_contributions ELSE NULL END,
        COALESCE(array_length(p_dealt_player_ids, 1), p_num_players),
        'BBJ drop from hand — per-player contributions tracked'
      );
    END IF;

  ELSE
    v_union_share := 0;
    v_club_share := p_rake_amount + COALESCE(p_bbj_contribution, 0);
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- INSERT rake_record with global_hand_id
  -- ══════════════════════════════════════════════════════════
  INSERT INTO rake_records (
    club_id, table_id, hand_id, global_hand_id, rake_amount, pot_size,
    num_players, bbj_contribution, player_contributions, is_tournament
  ) VALUES (
    p_club_id, p_table_id, p_hand_id,
    v_global_hand_id,
    p_rake_amount, p_pot_size,
    COALESCE(array_length(p_dealt_player_ids, 1), p_num_players),
    COALESCE(p_bbj_contribution, 0),
    CASE WHEN v_player_contributions != '{}'::JSONB THEN v_player_contributions ELSE NULL END,
    false
  ) RETURNING id INTO v_rake_id;

  UPDATE clubs SET
    chip_treasury = COALESCE(chip_treasury, 0) + v_club_share,
    total_rake = COALESCE(total_rake, 0) + p_rake_amount,
    hands_played = COALESCE(hands_played, 0) + 1,
    updated_at = NOW()
  WHERE id = p_club_id;

  INSERT INTO club_transactions (club_id, transaction_type, amount, description, reference_id, metadata)
  VALUES (p_club_id, 'rake', v_club_share,
    CASE WHEN v_union_id IS NOT NULL THEN 'Rake collected (routed to union)' ELSE 'Rake from hand' END,
    v_rake_id,
    jsonb_build_object(
      'hand_id', p_hand_id,
      'global_hand_id', v_global_hand_id,
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
      'per_player_rake', v_per_player_rake,
      'per_player_bbj', v_per_player_bbj
    ));

  RETURN jsonb_build_object(
    'success', true,
    'rake_id', v_rake_id,
    'global_hand_id', v_global_hand_id,
    'total_rake', p_rake_amount,
    'routed_to', CASE WHEN v_union_id IS NOT NULL THEN 'union' ELSE 'club' END,
    'club_share', v_club_share,
    'union_share', v_union_share,
    'bbj_contribution', COALESCE(p_bbj_contribution, 0),
    'bbj_main', v_bbj_main,
    'bbj_backup', v_bbj_backup,
    'bbj_promo', v_bbj_promo,
    'per_player_rake', v_per_player_rake,
    'per_player_bbj', v_per_player_bbj,
    'num_dealt', COALESCE(array_length(p_dealt_player_ids, 1), p_num_players),
    'player_contributions', v_player_contributions,
    'player_bbj_contributions', v_bbj_player_contributions
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. record_tournament_buyin_rake()
--    Called at each player registration.
--    100% of buyinFee is credited as that player's rake generated.
--    Flows through union routing + cascading agent commissions.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_tournament_buyin_rake(
  p_tournament_id UUID,
  p_club_id UUID,
  p_player_user_id UUID,
  p_buyin_fee NUMERIC,            -- The rake/fee portion of the buy-in
  p_buyin_amount NUMERIC,         -- The full buy-in (for context)
  p_tournament_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_club RECORD;
  v_union_id UUID;
  v_union_settings JSONB;
  v_union_share NUMERIC;
  v_club_share NUMERIC;
  v_rake_id UUID;
  v_global_hand_id BIGINT;
  v_hand_id TEXT;
  v_bbj_main_pct NUMERIC;
  v_bbj_backup_pct NUMERIC;
  v_bbj_promo_pct NUMERIC;
BEGIN
  IF p_buyin_fee <= 0 THEN
    RETURN jsonb_build_object('success', true, 'note', 'No fee to record');
  END IF;

  -- Generate unique global ID for this registration event
  v_global_hand_id := nextval('hand_id_seq');
  v_hand_id := 'TOURN-' || p_tournament_id::TEXT || '-REG-' || p_player_user_id::TEXT;

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

  -- Route 100% of tournament fee to union (or club if standalone)
  IF v_union_id IS NOT NULL THEN
    v_union_share := p_buyin_fee;
    v_club_share := 0;

    UPDATE unions SET
      total_rake = COALESCE(total_rake, 0) + p_buyin_fee,
      updated_at = NOW()
    WHERE id = v_union_id;
  ELSE
    v_union_share := 0;
    v_club_share := p_buyin_fee;

    UPDATE clubs SET
      chip_treasury = COALESCE(chip_treasury, 0) + v_club_share,
      total_rake = COALESCE(total_rake, 0) + p_buyin_fee,
      updated_at = NOW()
    WHERE id = p_club_id;
  END IF;

  -- Record in rake_records: 100% attributed to this single player
  INSERT INTO rake_records (
    club_id, hand_id, global_hand_id, rake_amount, pot_size,
    num_players, bbj_contribution, player_contributions,
    is_tournament, tournament_id
  ) VALUES (
    p_club_id, v_hand_id, v_global_hand_id, p_buyin_fee, p_buyin_amount,
    1, 0,
    -- 100% attributed to this player
    jsonb_build_object(p_player_user_id::TEXT, p_buyin_fee),
    true,
    p_tournament_id
  ) RETURNING id INTO v_rake_id;

  -- Log club transaction
  INSERT INTO club_transactions (club_id, transaction_type, amount, description, reference_id, metadata)
  VALUES (p_club_id, 'rake', v_club_share,
    COALESCE(p_tournament_name, 'Tournament') || ' — registration fee (rake)',
    v_rake_id,
    jsonb_build_object(
      'tournament_id', p_tournament_id,
      'player_id', p_player_user_id,
      'buyin_fee', p_buyin_fee,
      'buyin_amount', p_buyin_amount,
      'global_hand_id', v_global_hand_id,
      'routed_to', CASE WHEN v_union_id IS NOT NULL THEN 'union' ELSE 'club' END,
      'union_id', v_union_id
    ));

  RETURN jsonb_build_object(
    'success', true,
    'rake_id', v_rake_id,
    'global_hand_id', v_global_hand_id,
    'buyin_fee', p_buyin_fee,
    'routed_to', CASE WHEN v_union_id IS NOT NULL THEN 'union' ELSE 'club' END,
    'union_share', v_union_share,
    'club_share', v_club_share,
    'player_id', p_player_user_id,
    'tournament_id', p_tournament_id
  );
END;
$$;

-- Lock down new RPCs to service role only
REVOKE ALL ON FUNCTION record_tournament_buyin_rake(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_tournament_buyin_rake(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT) FROM anon;
REVOKE ALL ON FUNCTION record_tournament_buyin_rake(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_tournament_buyin_rake(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT) TO service_role;

SELECT 'Hand ID sequence + BBJ player tracking + tournament rake attribution installed' AS result;
