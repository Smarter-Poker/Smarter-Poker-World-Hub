CREATE OR REPLACE FUNCTION increment_tournament_bounty(
  p_tournament_id UUID,
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tournament_registrations
  SET payout_amount = COALESCE(payout_amount, 0) + p_amount
  WHERE tournament_id = p_tournament_id
    AND user_id = p_user_id;
END;
$$;
