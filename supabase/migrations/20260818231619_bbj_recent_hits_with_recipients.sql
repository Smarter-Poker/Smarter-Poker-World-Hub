-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (version 20260818231619, name bbj_recent_hits_with_recipients)
-- Mirror of the applied migration (decoded from schema_migrations). Do not re-run.
-- ═══════════════════════════════════════════════════════════════════════════
-- BBJ RECENT HITS + PER-RECIPIENT BREAKDOWN (2026-08-18)
-- Powers the "last 5 jackpots" view players open by tapping the jackpot amount
-- at the table: the hands, the total, and who got paid what.
--
-- A NAMING TRAP, RESOLVED AGAINST THE MONEY. The stored column names are
-- crossed relative to intuition, and getting this wrong would credit the wrong
-- player on screen. Verified empirically against bbj_payout_recipients:
--
--   bbj_payouts.winner_user_id RECEIVES bbj_payouts.loser_share (the 50%)
--     -> the BAD-BEAT HOLDER: lost the hand, won the jackpot.
--     -> hand = bbj_winners.winner_hand, name = winner_display_name.
--   bbj_payouts.loser_user_id RECEIVES bbj_payouts.winner_share (the 25%)
--     -> the player who WON THE HAND.
--     -> hand = bbj_winners.loser_hand, name = loser_display_name.
--
-- Confirmed on every hit where the hand names differ: loser_hand is always the
-- STRONGER hand (Royal Flush over Straight Flush, SF over Quads, Quads over a
-- Full House) - it belongs to the pot winner, exactly as the money says.
-- "winner"/"loser" in these tables means winner/loser OF THE JACKPOT.
--
-- This function does NOT trust the column names: each recipient's role is
-- derived by comparing user_id to the payout uids.

CREATE OR REPLACE FUNCTION public.fn_bbj_recent_hits(
  p_pool_id uuid,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  payout_id uuid,
  awarded_at timestamptz,
  hand_number bigint,
  total_payout numeric,
  bad_beat_name text,
  bad_beat_hand text,
  bad_beat_amount numeric,
  hand_winner_name text,
  hand_winner_hand text,
  hand_winner_amount numeric,
  table_player_count integer,
  recipients jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.created_at,
    p.hand_number,
    p.total_amount,
    COALESCE(bb.display_name, w.winner_display_name, 'Player'),
    w.winner_hand,
    (SELECT r.amount FROM public.bbj_payout_recipients r
      WHERE r.payout_id = p.id AND r.user_id = p.winner_user_id),
    COALESCE(hw.display_name, w.loser_display_name, 'Player'),
    w.loser_hand,
    (SELECT r.amount FROM public.bbj_payout_recipients r
      WHERE r.payout_id = p.id AND r.user_id = p.loser_user_id),
    p.table_player_count,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'name', COALESCE(pr.display_name, pr.username, 'Player'),
                 'amount', r.amount,
                 'role', CASE
                           WHEN r.user_id = p.winner_user_id THEN 'bad_beat'
                           WHEN r.user_id = p.loser_user_id  THEN 'hand_winner'
                           ELSE 'table'
                         END
               )
               ORDER BY r.amount DESC
             )
      FROM public.bbj_payout_recipients r
      LEFT JOIN public.profiles pr ON pr.id = r.user_id
      WHERE r.payout_id = p.id
    ), '[]'::jsonb)
  FROM public.bbj_payouts p
  LEFT JOIN public.bbj_winners w
         ON w.table_id = p.table_id AND w.hand_number = p.hand_number
  LEFT JOIN public.profiles bb ON bb.id = p.winner_user_id
  LEFT JOIN public.profiles hw ON hw.id = p.loser_user_id
  WHERE p.pool_id = p_pool_id
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 25));
$$;

REVOKE ALL ON FUNCTION public.fn_bbj_recent_hits(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bbj_recent_hits(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_bbj_recent_hits(uuid, integer) IS
  'Last N jackpot hits for a pool with per-recipient breakdown. Roles are derived from which uid actually received which share, NOT from the crossed winner/loser column names.';