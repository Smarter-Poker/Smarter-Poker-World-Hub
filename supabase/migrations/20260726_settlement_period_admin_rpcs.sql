-- settlement_periods (club/union settlement) is service-role-write-only, and NO
-- RPC operated on it (the misleadingly-named fn_create/fn_close_settlement_period
-- act on rakeback_periods, and fn_finalize on settlement_journal). So the admin
-- panel "open/close period" and union closePeriod did direct writes that silently
-- affected 0 rows (or used the invalid status 'closed'). These two RPCs give an
-- authorized write path. Status-only transitions — no chip movement.
-- Applied to prod via Supabase MCP 2026-07-26.

CREATE OR REPLACE FUNCTION public.fn_open_settlement_period(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_caller uuid := (SELECT auth.uid());
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM clubs c WHERE c.id = p_club_id AND (
      c.owner_id = v_caller
      OR EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = p_club_id
                 AND cm.user_id = v_caller AND cm.role IN ('owner','co_owner','admin'))))
  THEN RAISE EXCEPTION 'not authorized to manage this club''s settlement periods'; END IF;

  IF EXISTS (SELECT 1 FROM settlement_periods WHERE club_id = p_club_id AND status = 'open') THEN
    RAISE EXCEPTION 'an open settlement period already exists for this club';
  END IF;

  INSERT INTO settlement_periods
    (club_id, status, start_at, year, period_number, created_at, updated_at)
  VALUES
    (p_club_id, 'open', now(), EXTRACT(YEAR FROM now())::int,
     COALESCE((SELECT max(period_number) FROM settlement_periods WHERE club_id = p_club_id), 0) + 1,
     now(), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_set_settlement_period_status(p_period_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club uuid;
  v_union uuid;
  v_caller uuid := (SELECT auth.uid());
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'authentication required'); END IF;
  IF p_status NOT IN ('open','processing','settled','disputed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid status'); END IF;

  SELECT club_id, union_id INTO v_club, v_union FROM settlement_periods WHERE id = p_period_id;
  IF v_club IS NULL AND v_union IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'period not found'); END IF;

  IF NOT (
    (v_club IS NOT NULL AND EXISTS (
      SELECT 1 FROM clubs c WHERE c.id = v_club AND (
        c.owner_id = v_caller
        OR EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = v_club
                   AND cm.user_id = v_caller AND cm.role IN ('owner','co_owner','admin')))))
    OR (v_union IS NOT NULL AND EXISTS (
      SELECT 1 FROM unions u WHERE u.id = v_union AND u.owner_id = v_caller))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized'); END IF;

  UPDATE settlement_periods SET
    status = p_status,
    end_at = CASE WHEN p_status IN ('processing','settled') THEN COALESCE(end_at, now()) ELSE end_at END,
    settled_at = CASE WHEN p_status = 'settled' THEN now() ELSE settled_at END,
    settled_by = CASE WHEN p_status = 'settled' THEN v_caller ELSE settled_by END,
    updated_at = now()
  WHERE id = p_period_id;

  RETURN jsonb_build_object('success', true, 'period_id', p_period_id, 'status', p_status);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_open_settlement_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_settlement_period_status(uuid, text) TO authenticated;
