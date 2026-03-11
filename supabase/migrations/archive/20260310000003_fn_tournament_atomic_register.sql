-- ═══════════════════════════════════════════════════════════════
-- fn_tournament_atomic_register
-- Mandate 1: Mass Registration Advisory Lock
--
-- Wraps the entire registration flow (validation → chip deduction →
-- registration insert → counter increment) inside a single transaction
-- with a pg_advisory_xact_lock keyed to the tournament ID.
-- This serializes all concurrent registrations and guarantees the
-- prize pool and registered_count can never desync.
--
-- Replaces the 3-step API dance:
--   1. lock_chips_for_table()   →
--   2. INSERT tournament_registrations →
--   3. fn_tournament_register_counter()
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
BEGIN
  -- ══ 1. Advisory lock: serialize all registrations for this tournament ══
  -- pg_advisory_xact_lock auto-releases when the transaction commits/rolls back
  PERFORM pg_advisory_xact_lock(hashtext(p_tournament_id::text));

  -- ══ 2. Validate tournament state ══
  SELECT id, status, registered_count, max_players, club_id, buy_in
  INTO v_tournament
  FROM public.club_tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;  -- row-level lock on the tournament row itself

  IF v_tournament.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  IF v_tournament.status NOT IN ('scheduled', 'registering') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration not open');
  END IF;

  IF v_tournament.registered_count >= v_tournament.max_players THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament full');
  END IF;

  -- ══ 3. Validate player is a club member with sufficient balance ══
  SELECT chip_balance INTO v_balance
  FROM public.club_members
  WHERE club_id = p_club_id AND user_id = p_user_id
  FOR UPDATE;  -- row-level lock on the player's balance

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

  -- ══ 5. Deduct buy-in (same pattern as lock_chips_for_table) ══
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
