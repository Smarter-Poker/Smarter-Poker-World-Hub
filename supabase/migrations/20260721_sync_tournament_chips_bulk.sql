-- Bulk tournament-chip sync — the elimination checker ran one UPDATE per seat per
-- table every 5s (N+1, Postgres log flood). Applies all (user_id -> chips) for a
-- tournament in ONE statement via jsonb_to_recordset. chips floored (INTEGER col).
CREATE OR REPLACE FUNCTION public.fn_sync_tournament_chips(p_tournament_id uuid, p_updates jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF p_tournament_id IS NULL OR p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN RETURN 0; END IF;
  UPDATE public.tournament_players tp SET chips = floor(GREATEST(u.chips, 0))::integer
  FROM jsonb_to_recordset(p_updates) AS u(user_id uuid, chips numeric)
  WHERE tp.tournament_id = p_tournament_id AND tp.user_id = u.user_id AND tp.status = 'playing';
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END; $function$;
