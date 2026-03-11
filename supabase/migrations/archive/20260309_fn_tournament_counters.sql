-- ═══════════════════════════════════════════════════════════
-- Atomic tournament counter updates
-- Prevents TOCTOU race conditions in registration/unregistration
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_tournament_register_counter(
  p_tournament_id UUID,
  p_buy_in NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INT;
  v_new_pool NUMERIC;
  v_max INT;
BEGIN
  UPDATE public.club_tournaments
  SET registered_count = registered_count + 1,
      prize_pool = COALESCE(prize_pool, 0) + p_buy_in
  WHERE id = p_tournament_id
  RETURNING registered_count, prize_pool, max_players
  INTO v_new_count, v_new_pool, v_max;

  IF v_new_count IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'registered_count', v_new_count,
    'prize_pool', v_new_pool,
    'max_players', v_max
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_tournament_unregister_counter(
  p_tournament_id UUID,
  p_buy_in NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INT;
  v_new_pool NUMERIC;
BEGIN
  UPDATE public.club_tournaments
  SET registered_count = GREATEST(registered_count - 1, 0),
      prize_pool = GREATEST(COALESCE(prize_pool, 0) - p_buy_in, 0)
  WHERE id = p_tournament_id
  RETURNING registered_count, prize_pool
  INTO v_new_count, v_new_pool;

  IF v_new_count IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'registered_count', v_new_count,
    'prize_pool', v_new_pool
  );
END;
$$;

DO $$ BEGIN RAISE NOTICE 'fn_tournament_register_counter + fn_tournament_unregister_counter created'; END $$;
