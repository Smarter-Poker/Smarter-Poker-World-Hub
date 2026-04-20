-- =====================================================================
-- Phase 41 bug-hunt pass 2: make commander_home_rsvps shadow-writes
-- multi-table-aware.
--
-- The legacy commander_home_rsvps table has UNIQUE(game_id, user_id),
-- which is a 1:1 per-game-per-user assumption that predates multi-table.
-- When a user has active seat reservations at 2+ tables of the same game:
--
--   - rpc_hg_release_seat used to flip rsvp.response -> 'no' for ANY
--     release, even if the user was still seated at another table.
--     Legacy counters (games_attended, flake tracking, check-in) would
--     treat the user as a no-show despite being present elsewhere.
--
--   - rpc_hg_change_seat used to clobber rsvps.seat_number
--     unconditionally, even if that field was tracking a different table.
--
-- This migration rewrites both RPCs to be multi-table aware.
-- rpc_hg_claim_seat and rpc_hg_host_claim_for_member intentionally keep
-- their ON CONFLICT DO UPDATE semantics ("latest claim wins" for display)
-- since the seat_number in rsvps is a best-effort representative only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) rpc_hg_release_seat
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hg_release_seat(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id       uuid := auth.uid();
  v_res           RECORD;
  v_fallback_seat integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT r.*, t.game_id
    INTO v_res
    FROM public.commander_home_seat_reservations r
    JOIN public.commander_home_game_tables t ON t.id = r.table_id
   WHERE r.id = p_reservation_id;
  IF v_res.id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;

  IF v_res.user_id <> v_user_id AND v_res.claimed_by_user_id <> v_user_id THEN
    RAISE EXCEPTION 'NOT_YOUR_RESERVATION';
  END IF;

  IF v_res.status NOT IN ('reserved','seated') THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_INACTIVE' USING HINT = v_res.status;
  END IF;

  -- Release the reservation FIRST so the fallback-check below reflects
  -- the post-release world. Under concurrent releases of two reservations
  -- belonging to the same user on the same game, the second one will
  -- correctly see the first one already in status='released' and flip
  -- the rsvp to 'no'. TOCTOU-safe.
  UPDATE public.commander_home_seat_reservations
     SET status = 'released', released_at = now()
   WHERE id = p_reservation_id;

  -- Shadow-write only for real-user (non-guest) seats.
  IF v_res.is_guest = false AND v_res.user_id IS NOT NULL THEN
    -- Multi-table aware: any OTHER active reservation for this user on
    -- this game means the user is still "yes" for the game.
    SELECT r2.seat_number
      INTO v_fallback_seat
      FROM public.commander_home_seat_reservations r2
      JOIN public.commander_home_game_tables t2 ON t2.id = r2.table_id
     WHERE t2.game_id = v_res.game_id
       AND r2.user_id = v_res.user_id
       AND r2.status IN ('reserved','seated')
       AND r2.id <> p_reservation_id
     ORDER BY r2.created_at ASC
     LIMIT 1;

    IF v_fallback_seat IS NOT NULL THEN
      -- Still at another table of the same game: keep rsvp 'yes',
      -- point rsvps.seat_number at the surviving reservation.
      UPDATE public.commander_home_rsvps
         SET seat_number = v_fallback_seat,
             updated_at  = now()
       WHERE game_id = v_res.game_id
         AND user_id = v_res.user_id;
    ELSE
      -- Truly the last active seat for this user on this game: flip
      -- rsvp to 'no' exactly as the pre-multitable behavior did.
      UPDATE public.commander_home_rsvps
         SET response     = 'no',
             seat_number  = NULL,
             updated_at   = now()
       WHERE game_id = v_res.game_id
         AND user_id = v_res.user_id;
    END IF;
  END IF;
END
$function$;

-- ---------------------------------------------------------------------
-- 2) rpc_hg_change_seat
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hg_change_seat(p_reservation_id uuid, p_new_seat_number integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  uuid := auth.uid();
  v_preview  RECORD;
  v_updated  RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT r.id, r.seat_number, r.status, r.user_id, r.claimed_by_user_id,
         r.table_id, r.is_guest, r.member_id,
         t.max_seats, t.game_id
    INTO v_preview
    FROM public.commander_home_seat_reservations r
    JOIN public.commander_home_game_tables t ON t.id = r.table_id
   WHERE r.id = p_reservation_id;
  IF v_preview.id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;

  IF v_preview.user_id IS DISTINCT FROM v_user_id
     AND v_preview.claimed_by_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'NOT_YOUR_RESERVATION';
  END IF;

  IF v_preview.status NOT IN ('reserved','seated') THEN
    RAISE EXCEPTION 'RESERVATION_INACTIVE';
  END IF;

  IF p_new_seat_number < 1 OR p_new_seat_number > v_preview.max_seats THEN
    RAISE EXCEPTION 'SEAT_OUT_OF_BOUNDS';
  END IF;

  IF p_new_seat_number = v_preview.seat_number THEN
    RETURN p_reservation_id;
  END IF;

  UPDATE public.commander_home_seat_reservations
     SET seat_number = p_new_seat_number,
         updated_at  = now()
   WHERE id = p_reservation_id
     AND status IN ('reserved','seated')
     AND (user_id = v_user_id OR claimed_by_user_id = v_user_id)
  RETURNING id, table_id, seat_number, user_id, is_guest, status
       INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_INACTIVE'
      USING HINT = 'reservation was just released or reassigned';
  END IF;

  -- Multi-table-aware shadow-write: only clobber rsvps.seat_number if it
  -- was currently tracking THIS reservation (i.e., matched the OLD seat
  -- number). If the rsvp is tracking a different table's seat, leave it
  -- so the cross-table state isn't lost.
  IF v_updated.is_guest = false AND v_updated.user_id IS NOT NULL THEN
    UPDATE public.commander_home_rsvps
       SET seat_number = v_updated.seat_number,
           updated_at  = now()
     WHERE game_id    = v_preview.game_id
       AND user_id    = v_updated.user_id
       AND seat_number IS NOT DISTINCT FROM v_preview.seat_number;
  END IF;

  RETURN p_reservation_id;
END
$function$;
