-- CLUB DATA: prior-period comparison, and who is actually winning.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'club_data_prior_period_and_players' (version 20260821031936).
-- Mirrored here so the repo and the database cannot disagree.
--
-- 1. PRIOR PERIOD. "Fee 46,364" on its own says nothing. The same figure for
--    the immediately preceding window of equal length is what makes it mean
--    something. Rather than duplicate 150 lines of game-set logic, the row set
--    is extracted into fn_ca_club_games so ca_club_data_snapshot can call it
--    twice with identical filters.
--
-- 2. PER PLAYER. The screen answered "what did my games generate". The
--    question a club owner actually asks is "which of my players is winning".
--
-- A NOTE ON THE PLAYER RAKE FIGURE: per-player rake comes from
-- union_rake_paid_daily_user, the daily rollup, which by design only finalises
-- COMPLETE UTC days. Today's rake is therefore not in it. Recomputing live
-- means expanding rake_records.player_contributions across the window, which
-- does not finish inside the statement timeout. So the response carries
-- rake_complete_through and the UI says so, rather than quietly showing a
-- number that is a few hours short.

CREATE OR REPLACE FUNCTION public.fn_ca_club_games(
  p_club_id uuid,
  p_start   date,
  p_end     date,
  p_game    text DEFAULT 'ALL',
  p_stakes  text DEFAULT 'ALL',
  p_search  text DEFAULT NULL)
RETURNS TABLE(
  kind text, id text, name text, variant text, game_class text,
  stakes_tier text, small_blind numeric, big_blind numeric,
  rake_percent numeric, started_at timestamptz, created_by uuid, status text,
  fee numeric, winnings numeric, hands bigint, players integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_from   timestamptz := (p_start::timestamp AT TIME ZONE 'UTC');
  v_to     timestamptz := ((p_end + 1)::timestamp AT TIME ZONE 'UTC');
  v_game   text := UPPER(COALESCE(NULLIF(p_game, ''), 'ALL'));
  v_stakes text := UPPER(COALESCE(NULLIF(p_stakes, ''), 'ALL'));
  v_q      text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_union  uuid;
BEGIN
  SELECT uc.union_id INTO v_union FROM union_clubs uc WHERE uc.club_id = p_club_id LIMIT 1;

  RETURN QUERY
  WITH att_club AS (
    SELECT a.user_id
      FROM (
        SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
          FROM club_members cm
          JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = v_union
         WHERE v_union IS NOT NULL
         ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
      ) a
     WHERE a.club_id = p_club_id
    UNION
    SELECT cm.user_id FROM club_members cm
     WHERE v_union IS NULL AND cm.club_id = p_club_id
  ),
  cash AS (
    SELECT c.table_id,
           SUM(c.rake) AS fee, SUM(c.net) AS winnings,
           SUM(c.hands) AS hands, MAX(c.players) AS players
      FROM club_table_daily c
     WHERE c.club_id = p_club_id AND c.stat_date BETWEEN p_start AND p_end
     GROUP BY c.table_id
  ),
  cash_rows AS (
    SELECT 'CASH'::text, t.id::text, COALESCE(t.name, 'Unnamed'),
           UPPER(COALESCE(t.game_variant, 'nlh')),
           CASE
             WHEN COALESCE(t.game_variant,'') ILIKE '%plo%'
               OR COALESCE(t.game_variant,'') ILIKE '%omaha%' THEN 'OMAHA'
             WHEN COALESCE(t.game_variant,'') ILIKE '%mixed%'
               OR COALESCE(t.game_mode,'')    ILIKE '%mixed%' THEN 'MIXED'
             ELSE 'HOLDEM'
           END,
           COALESCE(t.small_blind, 0), COALESCE(t.big_blind, 0),
           CASE WHEN COALESCE(t.rake_percent, -1) >= 0 THEN t.rake_percent ELSE NULL END,
           t.created_at, t.created_by, t.status,
           round(cash.fee, 2), round(cash.winnings, 2), cash.hands, cash.players
      FROM cash JOIN tables t ON t.id = cash.table_id
  ),
  trn_rake AS (
    SELECT r.tournament_id,
           SUM(CASE WHEN r.metadata ? 'user_id' THEN r.rake_amount
                    ELSE r.rake_amount
                         * (SELECT count(*) FROM tournament_players tp
                              JOIN att_club a ON a.user_id = tp.user_id
                             WHERE tp.tournament_id = r.tournament_id)::numeric
                         / NULLIF((SELECT count(*) FROM tournament_players tp2
                                    WHERE tp2.tournament_id = r.tournament_id), 0)
               END) AS fee
      FROM rake_records r
     WHERE r.is_tournament
       AND r.created_at >= v_from AND r.created_at < v_to
       AND r.rake_amount <> 0 AND r.tournament_id IS NOT NULL
       AND ((r.metadata ? 'user_id'
             AND EXISTS (SELECT 1 FROM att_club a WHERE a.user_id::text = r.metadata->>'user_id'))
            OR NOT (r.metadata ? 'user_id'))
     GROUP BY r.tournament_id
  ),
  trn_pnl AS (
    SELECT wt.related_entity_id AS tournament_id,
           SUM(CASE WHEN wt.category = 'tournament_buyin' THEN -wt.amount ELSE wt.amount END) AS winnings,
           count(DISTINCT wt.user_id) AS players
      FROM wallet_transactions wt
      JOIN att_club a ON a.user_id = wt.user_id
     WHERE wt.created_at >= v_from AND wt.created_at < v_to
       AND wt.category IN ('tournament_buyin','prize','bounty')
       AND wt.related_entity_id IS NOT NULL
     GROUP BY wt.related_entity_id
  ),
  trn_rows AS (
    SELECT CASE WHEN tr.tournament_type = 'SPIN' THEN 'SPIN'
                WHEN tr.tournament_type = 'SNG'  THEN 'SNG'
                ELSE 'MTT' END::text,
           tr.id::text, COALESCE(tr.name, 'Tournament'),
           UPPER(COALESCE(tr.variant, tr.game_type, 'nlh')),
           CASE WHEN tr.tournament_type = 'SNG' THEN 'SNG' ELSE 'MTT' END,
           0::numeric, 0::numeric, NULL::numeric,
           tr.start_time, NULL::uuid, tr.status,
           round(COALESCE(k.fee, 0), 2), round(COALESCE(p.winnings, 0), 2),
           0::bigint, COALESCE(p.players, 0)::integer
      FROM tournaments tr
      LEFT JOIN trn_rake k ON k.tournament_id = tr.id
      LEFT JOIN trn_pnl  p ON p.tournament_id = tr.id
     WHERE k.tournament_id IS NOT NULL OR p.tournament_id IS NOT NULL
  ),
  all_rows AS (
    SELECT * FROM cash_rows UNION ALL SELECT * FROM trn_rows
  ),
  tagged AS (
    SELECT r.*,
           CASE
             WHEN r.game_class IN ('MTT','SNG') THEN 'NA'
             WHEN r.big_blind <  1 THEN 'MICRO'
             WHEN r.big_blind <  5 THEN 'SMALL'
             WHEN r.big_blind < 25 THEN 'MID'
             ELSE 'HIGH'
           END AS stakes_tier
      FROM all_rows r(kind, id, name, variant, game_class, small_blind, big_blind,
                      rake_percent, started_at, created_by, status, fee, winnings,
                      hands, players)
  )
  SELECT t.kind, t.id, t.name, t.variant, t.game_class, t.stakes_tier,
         t.small_blind, t.big_blind, t.rake_percent, t.started_at, t.created_by,
         t.status, t.fee, t.winnings, t.hands, t.players
    FROM tagged t
   WHERE (v_game   = 'ALL' OR t.game_class = v_game)
     AND (v_stakes = 'ALL' OR t.stakes_tier = v_stakes)
     AND (v_q IS NULL
          OR t.name ILIKE '%' || v_q || '%'
          OR t.id ILIKE '%' || v_q || '%'
          OR EXISTS (SELECT 1 FROM profiles pr
                      WHERE pr.id = t.created_by
                        AND (COALESCE(pr.username,'') ILIKE '%' || v_q || '%'
                             OR pr.id::text ILIKE '%' || v_q || '%')));
END;
$function$;

-- deliberately granted to nobody: only the SECURITY DEFINER callers that do
-- their own ca_can_view_club_finances check may reach it
REVOKE EXECUTE ON FUNCTION public.fn_ca_club_games(uuid, date, date, text, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ca_club_player_breakdown(
  p_club_id uuid,
  p_start   date DEFAULT NULL,
  p_end     date DEFAULT NULL,
  p_limit   integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_end   date := LEAST(COALESCE(p_end, v_today), v_today);
  v_start date := COALESCE(p_start, v_end - 13);
  v_from  timestamptz;
  v_to    timestamptz;
  v_lim   int := GREATEST(LEAST(COALESCE(p_limit, 100), 500), 1);
  v_union uuid;
  v_out   jsonb;
BEGIN
  IF NOT ca_can_view_club_finances(p_club_id) THEN
    RAISE EXCEPTION 'not authorized for this club' USING ERRCODE = '42501';
  END IF;

  IF v_start < v_end - 92 THEN v_start := v_end - 92; END IF;
  IF v_start > v_end THEN v_start := v_end; END IF;
  v_from := (v_start::timestamp AT TIME ZONE 'UTC');
  v_to   := ((v_end + 1)::timestamp AT TIME ZONE 'UTC');

  SELECT uc.union_id INTO v_union FROM union_clubs uc WHERE uc.club_id = p_club_id LIMIT 1;

  WITH att_club AS (
    SELECT a.user_id
      FROM (
        SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
          FROM club_members cm
          JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = v_union
         WHERE v_union IS NOT NULL
         ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
      ) a
     WHERE a.club_id = p_club_id
    UNION
    SELECT cm.user_id FROM club_members cm
     WHERE v_union IS NULL AND cm.club_id = p_club_id
  ),
  union_tables AS (
    SELECT id FROM tables WHERE union_id = v_union AND tournament_id IS NULL
  ),
  cash_pnl AS (
    SELECT wt.user_id,
           SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE 0 END)
             - SUM(CASE WHEN wt.type = 'debit' THEN wt.amount ELSE 0 END) AS net
      FROM wallet_transactions wt
      JOIN att_club a ON a.user_id = wt.user_id
     WHERE wt.created_at >= v_from AND wt.created_at < v_to
       AND wt.category IN ('buyin','cashout')
       AND wt.table_id IN (SELECT id FROM union_tables)
     GROUP BY wt.user_id
  ),
  trn_pnl AS (
    SELECT wt.user_id,
           SUM(CASE WHEN wt.category = 'tournament_buyin' THEN -wt.amount ELSE wt.amount END) AS net
      FROM wallet_transactions wt
      JOIN att_club a ON a.user_id = wt.user_id
     WHERE wt.created_at >= v_from AND wt.created_at < v_to
       AND wt.category IN ('tournament_buyin','prize','bounty')
       AND wt.related_entity_id IS NOT NULL
     GROUP BY wt.user_id
  ),
  rake AS (
    SELECT u.user_id, SUM(u.rake_amount) AS rake
      FROM union_rake_paid_daily_user u
      JOIN att_club a ON a.user_id = u.user_id
     WHERE u.union_id = v_union AND u.day BETWEEN v_start AND v_end
     GROUP BY u.user_id
  ),
  hands AS (
    SELECT s.user_id, SUM(s.hands_played)::bigint AS hands
      FROM club_member_daily_stats s
      JOIN att_club a ON a.user_id = s.user_id
     WHERE s.stat_date BETWEEN v_start AND v_end
     GROUP BY s.user_id
  ),
  merged AS (
    SELECT a.user_id,
           round(COALESCE(c.net, 0), 2)              AS cash_net,
           round(COALESCE(t.net, 0), 2)              AS tournament_net,
           round(COALESCE(c.net, 0) + COALESCE(t.net, 0), 2) AS net,
           round(COALESCE(r.rake, 0), 2)             AS rake,
           COALESCE(h.hands, 0)                      AS hands
      FROM att_club a
      LEFT JOIN cash_pnl c ON c.user_id = a.user_id
      LEFT JOIN trn_pnl  t ON t.user_id = a.user_id
      LEFT JOIN rake     r ON r.user_id = a.user_id
      LEFT JOIN hands    h ON h.user_id = a.user_id
     WHERE COALESCE(c.net,0) <> 0 OR COALESCE(t.net,0) <> 0
        OR COALESCE(r.rake,0) <> 0 OR COALESCE(h.hands,0) <> 0
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('start', v_start, 'end', v_end,
                                'days', (v_end - v_start) + 1),
    'rake_complete_through', LEAST(v_end, v_today - 1),
    'totals', (SELECT jsonb_build_object(
                 'players', count(*),
                 'net',   round(COALESCE(SUM(m.net), 0), 2),
                 'rake',  round(COALESCE(SUM(m.rake), 0), 2),
                 'hands', COALESCE(SUM(m.hands), 0))
                 FROM merged m),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', q.user_id,
               'username', COALESCE(pr.display_name, pr.username, 'Player'),
               'avatar_url', pr.avatar_url,
               'is_horse', COALESCE(pr.is_horse, false),
               'net', q.net,
               'cash_net', q.cash_net,
               'tournament_net', q.tournament_net,
               'rake', q.rake,
               'hands', q.hands)
             ORDER BY q.net DESC)
        FROM (SELECT * FROM merged ORDER BY net DESC LIMIT v_lim) q
        LEFT JOIN profiles pr ON pr.id = q.user_id
    ), '[]'::jsonb),
    'player_count', (SELECT count(*) FROM merged),
    'generated_at', now()
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ca_club_player_breakdown(uuid, date, date, integer)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ca_club_player_breakdown(uuid, date, date, integer)
  TO authenticated;
