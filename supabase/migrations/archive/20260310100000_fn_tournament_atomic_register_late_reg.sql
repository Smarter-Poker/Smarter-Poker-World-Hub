-- ═══════════════════════════════════════════════════════════════
-- BUG-7 FIX: fn_tournament_atomic_register — allow late registration
--
-- The original function rejected all registrations when
-- status NOT IN ('scheduled', 'registering'). This blocked
-- late-registration during 'running' status (which is valid
-- while currentLevel <= late_reg_levels).
--
-- Fix: Accept 'running' status if late_reg_levels > 0.
-- The engine-level validation (current level check) is handled
-- by the TournamentBridge, not by this RPC.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_tournament_atomic_register(
  p_user_id       UUID,
  p_club_id       UUID,
  p_tournament_id UUID,
  p_buy_in        NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament    RECORD;
  v_balance       NUMERIC;
  v_existing_id   UUID;
  v_new_count     INT;
  v_new_pool      NUMERIC;
  v_late_reg      INT;
BEGIN
  -- ══ 1. Advisory lock: serialize all registrations for this tournament ══
  PERFORM pg_advisory_xact_lock(hashtext(p_tournament_id::text));

  -- ══ 2. Validate tournament state ══
  SELECT id, status, registered_count, max_players, club_id, buy_in,
         COALESCE(late_reg_levels, 0) AS late_reg_levels,
         settings
  INTO v_tournament
  FROM public.club_tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF v_tournament.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- BUG-7 FIX: Allow 'running' if late_reg_levels > 0
  -- (Engine validates current level; RPC validates tournament-level eligibility)
  v_late_reg := COALESCE(v_tournament.late_reg_levels, 0);

  IF v_tournament.status IN ('scheduled', 'registering') THEN
    -- Always allow: registration is open
    NULL;
  ELSIF v_tournament.status = 'running' AND v_late_reg > 0 THEN
    -- Late registration: allowed while engine is within late_reg_levels
    NULL;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Registration not open');
  END IF;

  IF v_tournament.registered_count >= v_tournament.max_players THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament full');
  END IF;

  -- ══ 3. Validate player is a club member with sufficient balance ══
  SELECT chip_balance INTO v_balance
  FROM public.club_members
  WHERE club_id = p_club_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a member of this club');
  END IF;

  IF v_balance < p_buy_in THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient chips',
      'balance', v_balance,
      'required', p_buy_in
    );
  END IF;

  -- ══ 4. Check not already registered ══
  SELECT id INTO v_existing_id
  FROM public.tournament_registrations
  WHERE tournament_id = p_tournament_id
    AND user_id = p_user_id
    AND status = 'registered'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already registered');
  END IF;

  -- ══ 5. Deduct buy-in ══
  UPDATE public.club_members
  SET chip_balance = chip_balance - p_buy_in,
      chips_locked = COALESCE(chips_locked, 0) + p_buy_in
  WHERE club_id = p_club_id AND user_id = p_user_id;

  -- ══ 6. Insert registration row ══
  INSERT INTO public.tournament_registrations (
    tournament_id, user_id, club_id, buy_in_amount, status
  ) VALUES (
    p_tournament_id, p_user_id, p_club_id, p_buy_in, 'registered'
  );

  -- ══ 7. Atomic counter increment ══
  UPDATE public.club_tournaments
  SET registered_count = registered_count + 1,
      prize_pool = COALESCE(prize_pool, 0) + p_buy_in
  WHERE id = p_tournament_id
  RETURNING registered_count, prize_pool
  INTO v_new_count, v_new_pool;

  -- ══ 8. Return success with new counts ══
  RETURN jsonb_build_object(
    'success', true,
    'registered_count', v_new_count,
    'prize_pool', v_new_pool,
    'max_players', v_tournament.max_players
  );
END;
$$;
