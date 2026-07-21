-- Atomic leave-club that moves the member's club chips into the club treasury
-- (clubs.chip_treasury — the balance the SPA displays as the club "bank" in
-- DynamicWallet / ClubLobby), NOT the player's main wallet. Replaces the old
-- ClubsService.leaveClub flow which called atomic_deduct_wallet_and_log to DEBIT
-- the player's main wallet (wrong direction and wrong account — joining never
-- credits the main wallet, so it was destroying real player balance), and which
-- ignored that RPC's boolean result and deleted the membership regardless.
--
-- SECURITY DEFINER: club money tables are service-role-write-only under RLS, so
-- the treasury credit must run with definer rights. Operates on the canonical
-- club_members base table (club_memberships is a VIEW over it).

CREATE OR REPLACE FUNCTION public.fn_member_leave_to_treasury(
  p_club_id uuid,
  p_user_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role  text;
  v_chips numeric;
  v_after numeric;
BEGIN
  IF p_club_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'club and user required');
  END IF;

  SELECT role, COALESCE(chip_balance, 0)
    INTO v_role, v_chips
  FROM club_members
  WHERE club_id = p_club_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not a member');
  END IF;

  IF v_role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'owner must transfer ownership first');
  END IF;

  -- Move club chips into the treasury the SPA shows (clubs.chip_treasury).
  IF v_chips > 0 THEN
    UPDATE clubs
    SET chip_treasury = COALESCE(chip_treasury, 0) + v_chips,
        updated_at = NOW()
    WHERE id = p_club_id
    RETURNING chip_treasury INTO v_after;

    IF v_after IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'club not found');
    END IF;

    INSERT INTO chip_transactions (
      id, club_id, from_user_id, amount, transaction_type, notes, balance_after, created_at
    ) VALUES (
      gen_random_uuid(), p_club_id, p_user_id, v_chips,
      'leave_club_chip_return', 'Chips returned to treasury on club departure',
      v_after, NOW()
    );
  END IF;

  -- Remove membership. member_count stays in sync via the existing
  -- trg_sync_club_member_count trigger on DELETE from club_members.
  DELETE FROM club_members WHERE club_id = p_club_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'chips_returned', COALESCE(v_chips, 0));
END;
$function$;

-- Assertion: null args rejected without side effects.
DO $$
DECLARE r jsonb;
BEGIN
  SELECT fn_member_leave_to_treasury(NULL, NULL) INTO r;
  IF (r->>'success') <> 'false' THEN
    RAISE EXCEPTION 'null-arg guard not active: %', r;
  END IF;
END $$;
