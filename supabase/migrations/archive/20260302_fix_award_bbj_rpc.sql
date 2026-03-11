-- ============================================================================
-- Migration: Fix award_bbj RPC (engine param mismatch)
-- Date: 2026-03-02
--
-- BUG: Engine calls award_bbj with 18 parameters but the RPC only accepts 8
--      with completely different names. Every BBJ trigger silently fails.
--      Players never receive jackpot payouts.
--
-- FIX: Replace award_bbj with correct signature matching LobbyManager call.
--      Credits winning/losing player chip_balance via fn_credit_chips pattern.
--      Records to bbj_winners table. Resets bbj_pools.pool_amount.
-- ============================================================================

-- Drop the old function signature to avoid overload conflicts
DROP FUNCTION IF EXISTS award_bbj(UUID, UUID, TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT);

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
  p_stakes_tier TEXT,
  p_game_variant TEXT,
  p_big_blind NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pool RECORD;
  v_pool_amount NUMERIC;
  v_total_payout NUMERIC;
  v_loser_payout NUMERIC;
  v_winner_payout NUMERIC;
  v_table_share NUMERIC;
BEGIN
  -- Get pool for this club (with row lock)
  SELECT * INTO v_pool FROM bbj_pools WHERE club_id = p_club_id FOR UPDATE;

  IF v_pool IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No BBJ pool for this club');
  END IF;

  v_pool_amount := COALESCE(v_pool.pool_amount, 0);

  IF v_pool_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'BBJ pool is empty');
  END IF;

  -- Calculate payouts from pool using percentages
  -- p_payout_total_pct is % of pool to award (e.g. 100 = entire pool)
  v_total_payout := FLOOR(v_pool_amount * (COALESCE(p_payout_total_pct, 100) / 100.0));
  v_loser_payout := FLOOR(v_total_payout * (COALESCE(p_payout_loser_pct, 50) / 100.0));
  v_winner_payout := FLOOR(v_total_payout * (COALESCE(p_payout_winner_pct, 25) / 100.0));
  v_table_share := v_total_payout - v_loser_payout - v_winner_payout; -- remainder to table

  -- Credit loser (player with the bad beat hand gets biggest share)
  IF v_loser_payout > 0 AND p_loser_user_id IS NOT NULL THEN
    UPDATE club_members
    SET chip_balance = COALESCE(chip_balance, 0) + v_loser_payout,
        updated_at = NOW()
    WHERE club_id = p_club_id AND user_id = p_loser_user_id;

    INSERT INTO chip_transactions (club_id, to_user_id, amount, transaction_type, notes)
    VALUES (p_club_id, p_loser_user_id, v_loser_payout, 'tournament_payout',
            'BBJ loser share: ' || p_loser_hand || ' (' || v_loser_payout || ' chips)');
  END IF;

  -- Credit winner (player who made the winning hand)
  IF v_winner_payout > 0 AND p_winner_user_id IS NOT NULL THEN
    UPDATE club_members
    SET chip_balance = COALESCE(chip_balance, 0) + v_winner_payout,
        updated_at = NOW()
    WHERE club_id = p_club_id AND user_id = p_winner_user_id;

    INSERT INTO chip_transactions (club_id, to_user_id, amount, transaction_type, notes)
    VALUES (p_club_id, p_winner_user_id, v_winner_payout, 'tournament_payout',
            'BBJ winner share: ' || p_winner_hand || ' (' || v_winner_payout || ' chips)');
  END IF;

  -- Table share: credited to club treasury for owner to distribute
  IF v_table_share > 0 THEN
    UPDATE clubs
    SET chip_treasury = COALESCE(chip_treasury, 0) + v_table_share
    WHERE id = p_club_id;
  END IF;

  -- Record the BBJ hit
  INSERT INTO bbj_winners (
    club_id, pool_id, loser_id, winner_id,
    loser_hand, winner_hand,
    loser_payout, winner_payout, table_share_payout, total_payout,
    pool_amount_at_hit, stakes_tier, table_id, hand_number
  ) VALUES (
    p_club_id, v_pool.id, p_loser_user_id, p_winner_user_id,
    p_loser_hand || ' (' || COALESCE(p_loser_cards, '') || ')',
    p_winner_hand || ' (' || COALESCE(p_winner_cards, '') || ')',
    v_loser_payout, v_winner_payout, v_table_share, v_total_payout,
    v_pool_amount, p_stakes_tier, p_table_id, p_hand_number
  );

  -- Reset pool (deduct awarded amount)
  UPDATE bbj_pools SET
    pool_amount = GREATEST(0, pool_amount - v_total_payout),
    last_hit_at = NOW(),
    last_hit_amount = v_total_payout,
    last_winner_id = p_loser_user_id, -- "winner" of BBJ is the player who had the bad beat
    updated_at = NOW()
  WHERE club_id = p_club_id;

  RETURN jsonb_build_object(
    'success', true,
    'total_payout', v_total_payout,
    'loser_payout', v_loser_payout,
    'winner_payout', v_winner_payout,
    'table_share', v_table_share,
    'pool_before', v_pool_amount,
    'pool_after', GREATEST(0, v_pool_amount - v_total_payout),
    'loser_user_id', p_loser_user_id,
    'winner_user_id', p_winner_user_id
  );
END;
$$;
