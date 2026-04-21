ALTER FUNCTION award_bbj(p_club_id uuid, p_table_id uuid, p_hand_number bigint, p_loser_user_id uuid, p_loser_display_name text, p_loser_hand text, p_loser_cards text, p_winner_user_id uuid, p_winner_display_name text, p_winner_hand text, p_winner_cards text, p_payout_total_pct numeric, p_payout_loser_pct numeric, p_payout_winner_pct numeric, p_payout_table_pct numeric, p_stakes_tier text, p_game_variant text, p_big_blind numeric) SECURITY DEFINER;
ALTER FUNCTION expire_settlement_locks() SECURITY DEFINER;
ALTER FUNCTION unlock_free_avatars(p_user_id uuid) SECURITY DEFINER;
