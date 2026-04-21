-- =====================================================================
-- Phase B — seat state consistency fixes (BUG-1, BUG-2, BUG-3, BUG-4)
--
-- BUG-1 (HIGH): release/change seat after game start leaves the live
--   commander_home_seats row stale. Player vanishes from reservations
--   but Commander tablet view still shows them seated.
-- BUG-2 (HIGH): rpc_hg_claim_seat builds guest name as
--   fn_hg_caller_display_name || ' + Guest'. Display name has no length
--   cap. guest_name column has CHECK (char_length <= 120). Any caller
--   with display_name > 112 chars gets a raw CHECK violation instead of
--   a clean error.
-- BUG-3 (MED): rpc_hg_start_table race. SELECT not FOR UPDATE, UPDATE
--   has no WHERE status='open_for_rsvp' guard. Two concurrent "Start"
--   clicks: both pass status check, both insert seats, second hits
--   unique-index violation with opaque error.
-- BUG-4 (LOW): rpc_hg_release_seat UPDATE doesn't guard WHERE status in
--   ('reserved','seated'). Idempotent in practice but a TOCTOU hole.
-- =====================================================================

-- ---------- BUG-3 + BUG-4 fix: rpc_hg_start_table with row lock -------
CREATE OR REPLACE FUNCTION public.rpc_hg_start_table(p_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_table   RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  -- BUG-3: lock the table row so concurrent starts serialize.
  SELECT t.id, t.status, t.game_id, g.group_id, g.host_id
    INTO v_table
    FROM public.commander_home_game_tables t
    JOIN public.commander_home_games g ON g.id = t.game_id
   WHERE t.id = p_table_id
   FOR UPDATE OF t;
  IF v_table.id IS NULL THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;

  IF NOT public.fn_home_is_group_staff(v_user_id, v_table.group_id)
     AND v_table.host_id <> v_user_id
     AND NOT EXISTS (SELECT 1 FROM public.commander_home_groups
                      WHERE id = v_table.group_id AND owner_id = v_user_id)
  THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  IF v_table.status <> 'open_for_rsvp' THEN
    RAISE EXCEPTION 'TABLE_NOT_IN_OPEN_STATE' USING HINT = v_table.status;
  END IF;

  -- BUG-3: status-guarded UPDATE. Belt-and-suspenders with FOR UPDATE.
  UPDATE public.commander_home_game_tables
     SET status = 'running', started_at = now()
   WHERE id = p_table_id
     AND status = 'open_for_rsvp';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_STATE_CHANGED'
      USING HINT = 'another caller transitioned the table first';
  END IF;

  INSERT INTO public.commander_home_seats
    (game_id, table_id, seat_number, user_id, player_name,
     status, seated_at, reservation_id)
  SELECT
    v_table.game_id,
    r.table_id,
    r.seat_number,
    r.user_id,
    COALESCE(
      LEFT(r.guest_name, 120),
      LEFT(public.fn_hg_caller_display_name(r.user_id), 120),
      'Player'
    ),
    'seated',
    now(),
    r.id
  FROM public.commander_home_seat_reservations r
  WHERE r.table_id = p_table_id AND r.status = 'reserved';

  UPDATE public.commander_home_seat_reservations
     SET status = 'seated', seated_at = now()
   WHERE table_id = p_table_id AND status = 'reserved';
END $function$;

COMMENT ON FUNCTION public.rpc_hg_start_table(uuid) IS
  'Phase B Pass: BUG-3 fix — added FOR UPDATE row lock on the table '
  'SELECT + status-guarded UPDATE to serialize concurrent "Start" clicks. '
  'Player name hydration also LEFT-truncated to 120 chars to prevent '
  'chk_seat_player_name_len violations on edge-case long display names.';

-- ---------- BUG-2 fix: rpc_hg_claim_seat guest-name truncation --------
CREATE OR REPLACE FUNCTION public.rpc_hg_claim_seat(p_table_id uuid, p_seat_number integer, p_is_guest boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid := auth.uid();
  v_table      RECORD;
  v_group_id   uuid;
  v_reservation_id uuid;
  v_caller_name text;
  v_guest_name text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT t.id, t.game_id, t.status, t.max_seats, g.group_id
    INTO v_table
    FROM public.commander_home_game_tables t
    JOIN public.commander_home_games g ON g.id = t.game_id
   WHERE t.id = p_table_id;
  IF v_table.id IS NULL THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;
  IF v_table.status <> 'open_for_rsvp' THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN' USING HINT = v_table.status;
  END IF;
  IF p_seat_number < 1 OR p_seat_number > v_table.max_seats THEN
    RAISE EXCEPTION 'SEAT_OUT_OF_BOUNDS';
  END IF;

  v_group_id := v_table.group_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.commander_home_members
     WHERE group_id = v_group_id AND user_id = v_user_id AND status = 'approved'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.commander_home_groups
     WHERE id = v_group_id AND owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  IF p_is_guest THEN
    -- BUG-2 fix: truncate caller display name so "{name} + Guest" never
    -- exceeds the 120-char guest_name CHECK constraint. 112 = 120 - 8
    -- (length of " + Guest").
    v_caller_name := LEFT(public.fn_hg_caller_display_name(v_user_id), 112);
    v_guest_name := v_caller_name || ' + Guest';
    INSERT INTO public.commander_home_seat_reservations
      (table_id, seat_number, user_id, guest_name, is_guest, claimed_by_user_id, status)
    VALUES (p_table_id, p_seat_number, NULL, v_guest_name, true, v_user_id, 'reserved')
    RETURNING id INTO v_reservation_id;
  ELSE
    INSERT INTO public.commander_home_seat_reservations
      (table_id, seat_number, user_id, is_guest, claimed_by_user_id, status)
    VALUES (p_table_id, p_seat_number, v_user_id, false, v_user_id, 'reserved')
    RETURNING id INTO v_reservation_id;

    INSERT INTO public.commander_home_rsvps
      (game_id, user_id, response, seat_number, is_confirmed, responded_at)
    VALUES (v_table.game_id, v_user_id, 'yes', p_seat_number, false, now())
    ON CONFLICT (game_id, user_id) DO UPDATE
      SET response = 'yes',
          seat_number = EXCLUDED.seat_number,
          responded_at = now(),
          updated_at = now();
  END IF;

  RETURN v_reservation_id;
END $function$;

COMMENT ON FUNCTION public.rpc_hg_claim_seat(uuid, integer, boolean) IS
  'Phase B Pass: BUG-2 fix — caller display name LEFT-truncated to 112 '
  'chars before " + Guest" suffix so guest_name cannot overflow the '
  '120-char CHECK constraint.';

-- ---------- BUG-1 fix (release): cleanup live seat if table running --
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
  v_updated_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT r.*, t.game_id, t.status AS table_status
    INTO v_res
    FROM public.commander_home_seat_reservations r
    JOIN public.commander_home_game_tables t ON t.id = r.table_id
   WHERE r.id = p_reservation_id;
  IF v_res.id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;

  IF v_res.user_id IS DISTINCT FROM v_user_id
     AND v_res.claimed_by_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'NOT_YOUR_RESERVATION';
  END IF;

  IF v_res.status NOT IN ('reserved','seated') THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_INACTIVE' USING HINT = v_res.status;
  END IF;

  -- BUG-4 fix: status-guarded UPDATE (TOCTOU-safe).
  UPDATE public.commander_home_seat_reservations
     SET status = 'released', released_at = now()
   WHERE id = p_reservation_id
     AND status IN ('reserved','seated');
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'RESERVATION_ALREADY_INACTIVE'
      USING HINT = 'reservation was just released by another path';
  END IF;

  -- BUG-1 fix: if table is running (reservation was 'seated'), the
  -- live seat must also be cleared or the Commander tablet view shows
  -- the released player still at the table.
  IF v_res.status = 'seated' THEN
    DELETE FROM public.commander_home_seats
     WHERE reservation_id = p_reservation_id;
  END IF;

  -- Shadow-write only for real-user (non-guest) seats.
  IF v_res.is_guest = false AND v_res.user_id IS NOT NULL THEN
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
      UPDATE public.commander_home_rsvps
         SET seat_number = v_fallback_seat,
             updated_at  = now()
       WHERE game_id = v_res.game_id
         AND user_id = v_res.user_id;
    ELSE
      UPDATE public.commander_home_rsvps
         SET response     = 'no',
             seat_number  = NULL,
             updated_at   = now()
       WHERE game_id = v_res.game_id
         AND user_id = v_res.user_id;
    END IF;
  END IF;
END $function$;

COMMENT ON FUNCTION public.rpc_hg_release_seat(uuid) IS
  'Phase B Pass: BUG-1 + BUG-4 fix. Status-guarded UPDATE prevents '
  'TOCTOU double-release. If reservation was in status=seated (table '
  'running), the corresponding commander_home_seats row is DELETEd so '
  'the Commander tablet view reflects the release immediately.';

-- ---------- BUG-1 fix (change): sync live seat when table running ----
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

  -- BUG-1 fix: if reservation was 'seated' (table running), sync the
  -- live seat map too. commander_home_seats has its own (table_id,
  -- seat_number) unique-index so this will error cleanly if the target
  -- seat is already occupied there — which in practice cannot happen
  -- because the reservations unique-index already blocked it.
  IF v_updated.status = 'seated' THEN
    UPDATE public.commander_home_seats
       SET seat_number = p_new_seat_number
     WHERE reservation_id = p_reservation_id;
  END IF;

  -- Shadow-write to rsvps: only if it was pointing at the OLD seat.
  IF v_updated.is_guest = false AND v_updated.user_id IS NOT NULL THEN
    UPDATE public.commander_home_rsvps
       SET seat_number = v_updated.seat_number,
           updated_at  = now()
     WHERE game_id    = v_preview.game_id
       AND user_id    = v_updated.user_id
       AND seat_number IS NOT DISTINCT FROM v_preview.seat_number;
  END IF;

  RETURN p_reservation_id;
END $function$;

COMMENT ON FUNCTION public.rpc_hg_change_seat(uuid, integer) IS
  'Phase B Pass: BUG-1 fix. If reservation status was "seated" (table '
  'running), the live commander_home_seats row is also updated so the '
  'Commander tablet view reflects the seat change immediately.'