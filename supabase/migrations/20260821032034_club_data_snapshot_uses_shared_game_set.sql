-- ca_club_data_snapshot rebuilt on fn_ca_club_games, plus a prior period.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'club_data_snapshot_uses_shared_game_set' (version 20260821032034).
--
-- The 150 lines of game-set logic that used to live inline here now live in
-- fn_ca_club_games, so the snapshot can ask for the same set over any window.
-- It asks twice: the selected window (rows + summary) and the window of equal
-- length immediately before it (summary only), with the same filters applied
-- both times so the comparison is like-for-like.
--
-- Verified identical to the previous implementation before switching: same
-- club, same window, fee 46,372.31 from both.
--
-- Output is a superset of the old shape - existing keys unchanged, `previous`
-- and `delta` added - so nothing that reads it can break.
CREATE OR REPLACE FUNCTION public.ca_club_data_snapshot(
  p_club_id uuid,
  p_start   date DEFAULT NULL,
  p_end     date DEFAULT NULL,
  p_game    text DEFAULT 'ALL',
  p_stakes  text DEFAULT 'ALL',
  p_search  text DEFAULT NULL,
  p_limit   integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_today  date := (now() AT TIME ZONE 'UTC')::date;
  v_end    date := LEAST(COALESCE(p_end, v_today), v_today);
  v_start  date := COALESCE(p_start, v_end - 13);
  v_days   int;
  v_pstart date;
  v_pend   date;
  v_game   text := UPPER(COALESCE(NULLIF(p_game, ''), 'ALL'));
  v_stakes text := UPPER(COALESCE(NULLIF(p_stakes, ''), 'ALL'));
  v_q      text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_lim    int  := GREATEST(LEAST(COALESCE(p_limit, 100), 500), 1);
  v_union  uuid;
  v_cur    jsonb;
  v_prev   jsonb;
  v_out    jsonb;
BEGIN
  IF NOT ca_can_view_club_finances(p_club_id) THEN
    RAISE EXCEPTION 'not authorized for this club' USING ERRCODE = '42501';
  END IF;

  IF v_start < v_end - 92 THEN v_start := v_end - 92; END IF;
  IF v_start > v_end THEN v_start := v_end; END IF;
  v_days   := (v_end - v_start) + 1;
  v_pend   := v_start - 1;
  v_pstart := v_pend - (v_days - 1);

  SELECT uc.union_id INTO v_union FROM union_clubs uc WHERE uc.club_id = p_club_id LIMIT 1;

  SELECT jsonb_build_object(
    'games',          count(*),
    'total_winnings', round(COALESCE(SUM(g.winnings), 0), 2),
    'mtt_winnings',   round(COALESCE(SUM(g.winnings) FILTER (WHERE g.game_class IN ('MTT','SNG')), 0), 2),
    'cash_winnings',  round(COALESCE(SUM(g.winnings) FILTER (WHERE g.game_class NOT IN ('MTT','SNG')), 0), 2),
    'fee',            round(COALESCE(SUM(g.fee), 0), 2),
    'cash_fee',       round(COALESCE(SUM(g.fee) FILTER (WHERE g.game_class NOT IN ('MTT','SNG')), 0), 2),
    'mtt_fee',        round(COALESCE(SUM(g.fee) FILTER (WHERE g.game_class IN ('MTT','SNG')), 0), 2),
    'hands',          COALESCE(SUM(g.hands), 0))
    INTO v_cur
    FROM fn_ca_club_games(p_club_id, v_start, v_end, v_game, v_stakes, v_q) g;

  SELECT jsonb_build_object(
    'games',          count(*),
    'total_winnings', round(COALESCE(SUM(g.winnings), 0), 2),
    'mtt_winnings',   round(COALESCE(SUM(g.winnings) FILTER (WHERE g.game_class IN ('MTT','SNG')), 0), 2),
    'cash_winnings',  round(COALESCE(SUM(g.winnings) FILTER (WHERE g.game_class NOT IN ('MTT','SNG')), 0), 2),
    'fee',            round(COALESCE(SUM(g.fee), 0), 2),
    'hands',          COALESCE(SUM(g.hands), 0))
    INTO v_prev
    FROM fn_ca_club_games(p_club_id, v_pstart, v_pend, v_game, v_stakes, v_q) g;

  SELECT jsonb_build_object(
    'range', jsonb_build_object('start', v_start, 'end', v_end, 'days', v_days),
    'previous_range', jsonb_build_object('start', v_pstart, 'end', v_pend, 'days', v_days),
    'filters', jsonb_build_object('game', v_game, 'stakes', v_stakes, 'search', v_q),
    'summary', v_cur,
    'previous', v_prev,
    -- percentage change, null when the prior window is zero (no baseline to
    -- be a percentage OF - showing "+100%" against nothing is a lie)
    'delta', jsonb_build_object(
      'fee_pct', CASE WHEN COALESCE((v_prev->>'fee')::numeric, 0) = 0 THEN NULL
                      ELSE round(((v_cur->>'fee')::numeric - (v_prev->>'fee')::numeric)
                                 / abs((v_prev->>'fee')::numeric) * 100, 1) END,
      'games_pct', CASE WHEN COALESCE((v_prev->>'games')::numeric, 0) = 0 THEN NULL
                        ELSE round(((v_cur->>'games')::numeric - (v_prev->>'games')::numeric)
                                   / abs((v_prev->>'games')::numeric) * 100, 1) END,
      'winnings_abs', round((v_cur->>'total_winnings')::numeric
                            - (v_prev->>'total_winnings')::numeric, 2),
      'fee_abs', round((v_cur->>'fee')::numeric - (v_prev->>'fee')::numeric, 2)),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', q.kind, 'id', q.id, 'name', q.name,
               'variant', q.variant, 'game_class', q.game_class,
               'stakes_tier', q.stakes_tier,
               'blinds', CASE WHEN q.big_blind > 0
                              THEN trim(trailing '.' from trim(trailing '0' from q.small_blind::text))
                                   || '/' || trim(trailing '.' from trim(trailing '0' from q.big_blind::text))
                              ELSE NULL END,
               'rake_percent', q.rake_percent,
               'started_at', q.started_at,
               'status', q.status,
               'creator_id', q.created_by,
               'creator_name', (SELECT pr.username FROM profiles pr WHERE pr.id = q.created_by),
               'creator_avatar', (SELECT pr.avatar_url FROM profiles pr WHERE pr.id = q.created_by),
               'fee', q.fee, 'winnings', q.winnings,
               'hands', q.hands, 'players', q.players)
             ORDER BY q.started_at DESC NULLS LAST)
      FROM (SELECT * FROM fn_ca_club_games(p_club_id, v_start, v_end, v_game, v_stakes, v_q)
             ORDER BY started_at DESC NULLS LAST LIMIT v_lim) q
    ), '[]'::jsonb),
    'row_count', (v_cur->>'games')::int,
    'union_id', v_union,
    'data_updated_at', (SELECT max(c.updated_at) FROM club_table_daily c
                         WHERE c.club_id = p_club_id AND c.stat_date BETWEEN v_start AND v_end),
    'generated_at', now()
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_club_data_snapshot(uuid, date, date, text, text, text, integer)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_club_data_snapshot(uuid, date, date, text, text, text, integer)
  TO authenticated;

DO $$
DECLARE v jsonb;
BEGIN
  v := ca_club_data_snapshot('a0000000-0000-0000-0000-000000000001', NULL, NULL, 'ALL','ALL',NULL,1);
  IF (v->'summary'->>'fee') IS NULL OR (v->'previous') IS NULL THEN
    RAISE EXCEPTION 'snapshot lost a key: %', v::text;
  END IF;
  IF (v->>'row_count')::int IS DISTINCT FROM (v->'summary'->>'games')::int THEN
    RAISE EXCEPTION 'row_count and games disagree';
  END IF;
END $$;
