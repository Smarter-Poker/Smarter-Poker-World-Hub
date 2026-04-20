-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 41 bug-hunt fix #5 — rpc_hg_change_seat atomic rewrite
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Previous version did: SELECT v_res → UPDATE WHERE id=?. If the reservation
-- flipped to 'released' between the two, UPDATE touched 0 rows but the
-- function still returned success and still ran the shadow-write with stale
-- data from v_res.
--
-- New version:
--   1. Capture table context (max_seats, game_id) up front.
--   2. Ownership check still happens against the pre-update read.
--   3. UPDATE is scoped by (id, status IN ('reserved','seated'), owner) and
--      returns the authoritative post-update row. If 0 rows → RESERVATION_INACTIVE.
--   4. Shadow-write to commander_home_rsvps driven by the RETURNING payload,
--      never by the pre-UPDATE snapshot.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_hg_change_seat(
  p_reservation_id  uuid,
  p_new_seat_number integer
) RETURNS uuid
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

  -- Pre-flight: fetch current reservation + its table's capacity, so we can
  -- validate the requested seat number before we attempt the atomic UPDATE.
  -- If something changes between here and the UPDATE, the UPDATE will catch
  -- it (status gate + unique-index) — this read is advisory, not trusted.
  SELECT r.id, r.seat_number, r.status, r.user_id, r.claimed_by_user_id,
         r.table_id, r.is_guest, r.member_id,
         t.max_seats, t.game_id
    INTO v_preview
    FROM public.commander_home_seat_reservations r
    JOIN public.commander_home_game_tables t ON t.id = r.table_id
   WHERE r.id = p_reservation_id;
  IF v_preview.id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;

  IF v_preview.user_id        IS DISTINCT FROM v_user_id
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
    RETURN p_reservation_id;  -- no-op
  END IF;

  -- Atomic move.  Only touches rows that are still actively reserved/seated
  -- AND that the caller still owns.  Concurrent release of this reservation
  -- (by the same user in another tab, or by a cleanup job) ⇒ FOUND is false.
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

  -- Shadow-write rsvps ONLY for real-user (non-guest) seats, based on the
  -- authoritative RETURNING payload.
  IF v_updated.is_guest = false AND v_updated.user_id IS NOT NULL THEN
    UPDATE public.commander_home_rsvps
       SET seat_number = v_updated.seat_number,
           updated_at  = now()
     WHERE game_id = v_preview.game_id
       AND user_id = v_updated.user_id;
  END IF;

  RETURN p_reservation_id;
END
$function$;
