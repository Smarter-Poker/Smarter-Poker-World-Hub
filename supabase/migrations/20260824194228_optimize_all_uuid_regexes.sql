CREATE OR REPLACE FUNCTION public.ca_club_activity(p_club_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id text, activity_type text, message text, created_at timestamp with time zone, user_id uuid, display_name text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT ca_can_view_club(p_club_id) THEN
    RAISE EXCEPTION 'not authorized for this club' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH events AS (
    (SELECT
       'join-' || cm.user_id::text AS id,
       'member_join'::text         AS activity_type,
       'joined the club'::text     AS message,
       cm.created_at               AS created_at,
       cm.user_id                  AS user_id
     FROM club_members cm
     WHERE cm.club_id = p_club_id
       AND cm.created_at > now() - interval '30 days'
     ORDER BY cm.created_at DESC
     LIMIT 50)
    UNION ALL
    (SELECT
       'ann-' || an.id::text,
       'announcement',
       coalesce(nullif(an.title, ''), left(coalesce(an.content, an.message, 'New announcement'), 120)),
       an.created_at,
       coalesce(an.author_id, an.created_by)
     FROM club_announcements an
     WHERE an.club_id = p_club_id
       AND an.created_at > now() - interval '30 days'
       AND coalesce(an.is_active, true)
     ORDER BY an.created_at DESC
     LIMIT 20)
    UNION ALL
    (SELECT
       'hand-' || hh.id::text,
       'big_hand',
       'won a ' || to_char(coalesce(hh.pot_size, 0), 'FM999,999,990.00') || ' pot'
         || CASE WHEN hh.hand_name IS NOT NULL THEN ' with ' || hh.hand_name ELSE '' END,
       hh.created_at,
       CASE
         WHEN length((hh.winners->0->>'userId')) = 36
         THEN (hh.winners->0->>'userId')::uuid
         ELSE NULL
       END
     FROM hand_history hh
     JOIN tables t ON t.id = hh.table_id
     WHERE t.club_id = p_club_id
       AND hh.created_at > now() - interval '48 hours'
       AND coalesce(hh.pot_size, 0) >= 40 * greatest(coalesce(hh.big_blind, 0.02), 0.02)
     ORDER BY hh.created_at DESC
     LIMIT 30)
    UNION ALL
    (SELECT
       'table-' || t.id::text,
       'table_start',
       'Table "' || coalesce(t.name, 'Unnamed') || '" was created',
       t.created_at,
       t.created_by
     FROM tables t
     WHERE t.club_id = p_club_id
       AND t.created_at > now() - interval '7 days'
       AND coalesce(t.is_deleted, false) = false
     ORDER BY t.created_at DESC
     LIMIT 10)
  )
  SELECT
    e.id, e.activity_type, e.message, e.created_at, e.user_id,
    pr.display_name, pr.avatar_url
  FROM events e
  LEFT JOIN profiles pr ON pr.id = e.user_id
  WHERE e.created_at IS NOT NULL
  ORDER BY e.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 100);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ca_rebuild_club_member_stats_table(p_table_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '170s'
AS $function$
DECLARE
  v_club uuid;
  v_rows integer;
BEGIN
  SELECT club_id INTO v_club FROM tables WHERE id = p_table_id;
  IF v_club IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM club_member_daily_stats WHERE table_id = p_table_id;

  WITH hseq AS (
    SELECT hh.hand_number, hh.created_at, coalesce(hh.pot_size, 0) AS pot_size,
           coalesce(hh.rake_amount, 0) + coalesce(hh.bbj_amount, 0) AS rake_bbj,
           hh.players, hh.winners,
           row_number() OVER (ORDER BY hh.hand_number, hh.created_at) AS rn
    FROM hand_history hh
    WHERE hh.table_id = p_table_id
  ),
  seats AS (
    SELECT
      h.rn, h.created_at, h.pot_size, h.rake_bbj,
      (p->>'userId')::uuid   AS uid,
      (p->>'stack')::numeric AS stack,
      coalesce((SELECT sum((w->>'amount')::numeric)
                FROM jsonb_array_elements(coalesce(h.winners, '[]'::jsonb)) w
                WHERE w->>'userId' = p->>'userId'), 0) AS won
    FROM hseq h
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(h.players, '[]'::jsonb)) p
    WHERE length((p->>'userId')) = 36
      AND (p->>'stack') IS NOT NULL
  ),
  d AS (
    SELECT s.*,
           lag(stack) OVER (PARTITION BY uid ORDER BY rn) AS prev_stack,
           lag(rn)    OVER (PARTITION BY uid ORDER BY rn) AS prev_rn
    FROM seats s
  ),
  marked AS (
    SELECT d.*,
           (prev_rn = rn - 1) AS adjacent,
           CASE WHEN prev_stack IS NOT NULL THEN stack - prev_stack ELSE 0 END AS delta
    FROM d
  ),
  per_hand AS (
    SELECT rn,
           count(*) AS seated,
           count(*) FILTER (WHERE prev_stack IS NOT NULL) AS with_prior,
           coalesce(sum(delta) FILTER (WHERE prev_stack IS NOT NULL), 0) AS dsum,
           max(rake_bbj) AS rake_bbj
    FROM marked GROUP BY rn
  ),
  calc AS (
    SELECT
      m.uid,
      (m.created_at AT TIME ZONE 'UTC')::date AS stat_date,
      m.won, m.pot_size, m.delta,
      CASE
        WHEN ph.seated = ph.with_prior THEN abs(ph.dsum + ph.rake_bbj) < 0.005
        ELSE m.adjacent AND m.delta <= m.won + 0.001
      END AS attributable
    FROM marked m JOIN per_hand ph ON ph.rn = m.rn
  )
  INSERT INTO club_member_daily_stats
    (club_id, table_id, user_id, stat_date, hands_played, hands_attributed, hands_won,
     total_won, profit, biggest_pot_won, biggest_pot, topup_total)
  SELECT
    v_club, p_table_id, uid, stat_date,
    count(*),
    count(*) FILTER (WHERE attributable),
    count(*) FILTER (WHERE won > 0),
    sum(won),
    coalesce(sum(delta) FILTER (WHERE attributable), 0),
    max(won), max(pot_size),
    coalesce(sum(delta - won) FILTER (WHERE NOT attributable AND delta > won), 0)
  FROM calc
  GROUP BY uid, stat_date
  ON CONFLICT (club_id, table_id, user_id, stat_date) DO UPDATE SET
    hands_played     = EXCLUDED.hands_played,
    hands_attributed = EXCLUDED.hands_attributed,
    hands_won        = EXCLUDED.hands_won,
    total_won        = EXCLUDED.total_won,
    profit           = EXCLUDED.profit,
    biggest_pot_won  = EXCLUDED.biggest_pot_won,
    biggest_pot      = EXCLUDED.biggest_pot,
    topup_total      = EXCLUDED.topup_total,
    updated_at       = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  WITH last_hand AS (
    SELECT hh.players, hh.hand_number
    FROM hand_history hh
    WHERE hh.table_id = p_table_id
    ORDER BY hh.hand_number DESC
    LIMIT 1
  )
  INSERT INTO club_member_table_state AS st (table_id, user_id, last_stack, last_hand_number)
  SELECT DISTINCT ON (p->>'userId')
         p_table_id, (p->>'userId')::uuid, (p->>'stack')::numeric, lh.hand_number
  FROM last_hand lh
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(lh.players, '[]'::jsonb)) p
  WHERE length((p->>'userId')) = 36
    AND (p->>'stack') IS NOT NULL
  ON CONFLICT (table_id, user_id) DO UPDATE SET
    last_stack       = EXCLUDED.last_stack,
    last_hand_number = EXCLUDED.last_hand_number,
    updated_at       = now();

  INSERT INTO club_stats_rebuild_log (table_id, rebuilt_at, rows_written)
  VALUES (p_table_id, now(), v_rows)
  ON CONFLICT (table_id) DO UPDATE SET rebuilt_at = now(), rows_written = EXCLUDED.rows_written;

  RETURN v_rows;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ca_rebuild_table_chunk(p_table_id uuid, p_max_hands integer DEFAULT 3000)
 RETURNS TABLE(hands_processed integer, complete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '170s'
AS $function$
DECLARE
  v_club    uuid;
  v_cur_ts  timestamptz;
  v_cur_id  uuid;
  v_count   integer := 0;
  v_last_ts timestamptz;
  v_last_id uuid;
  v_limit   integer := greatest(coalesce(p_max_hands, 3000), 1);
BEGIN
  SELECT club_id INTO v_club FROM tables WHERE id = p_table_id;
  IF v_club IS NULL THEN
    hands_processed := 0; complete := true; RETURN NEXT; RETURN;
  END IF;

  EXECUTE 'DROP TABLE IF EXISTS _chunk';

  SELECT l.cursor_created_at, l.cursor_id INTO v_cur_ts, v_cur_id
  FROM club_stats_rebuild_log l WHERE l.table_id = p_table_id;

  IF v_cur_ts IS NULL THEN
    DELETE FROM club_member_daily_stats WHERE table_id = p_table_id;
    DELETE FROM club_member_table_state WHERE table_id = p_table_id;
  END IF;

  CREATE TEMP TABLE _chunk ON COMMIT DROP AS
  WITH picked AS (
    SELECT hh.id, hh.created_at, hh.hand_number,
           coalesce(hh.pot_size, 0) AS pot_size,
           coalesce(hh.rake_amount, 0) + coalesce(hh.bbj_amount, 0) AS rake_bbj,
           hh.players, hh.winners
    FROM hand_history hh
    WHERE hh.table_id = p_table_id
      AND (v_cur_ts IS NULL OR (hh.created_at, hh.id) > (v_cur_ts, v_cur_id))
    ORDER BY hh.created_at, hh.id
    LIMIT v_limit
  ),
  seq AS (
    SELECT p.*,
           row_number() OVER (ORDER BY p.created_at, p.id) AS rn,
           lag(p.id) OVER (ORDER BY p.created_at, p.id) AS prev_hand_at_table
    FROM picked p
  )
  SELECT
    s.rn, s.id AS hand_id, s.created_at, s.hand_number, s.pot_size, s.rake_bbj,
    coalesce(s.prev_hand_at_table, v_cur_id) AS prev_hand_at_table,
    (pl->>'userId')::uuid   AS uid,
    (pl->>'stack')::numeric AS stack,
    coalesce((SELECT sum((w->>'amount')::numeric)
              FROM jsonb_array_elements(coalesce(s.winners, '[]'::jsonb)) w
              WHERE w->>'userId' = pl->>'userId'), 0) AS won
  FROM seq s
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.players, '[]'::jsonb)) pl
  WHERE length((pl->>'userId')) = 36
    AND (pl->>'stack') IS NOT NULL;

  SELECT count(DISTINCT hand_id) INTO v_count FROM _chunk;

  IF v_count = 0 THEN
    INSERT INTO club_stats_rebuild_log (table_id, rebuilt_at, complete, rows_written)
    VALUES (p_table_id, now(), true, 0)
    ON CONFLICT (table_id) DO UPDATE SET complete = true, rebuilt_at = now();
    hands_processed := 0; complete := true; RETURN NEXT; RETURN;
  END IF;

  SELECT c.created_at, c.hand_id INTO v_last_ts, v_last_id
  FROM _chunk c ORDER BY c.created_at DESC, c.hand_id DESC LIMIT 1;

  WITH d AS (
    SELECT c.*,
           lag(c.stack)   OVER (PARTITION BY c.uid ORDER BY c.rn) AS prev_stack_in,
           lag(c.hand_id) OVER (PARTITION BY c.uid ORDER BY c.rn) AS prev_hand_in,
           st.last_stack   AS carried_stack,
           st.last_hand_id AS carried_hand
    FROM _chunk c
    LEFT JOIN club_member_table_state st
           ON st.table_id = p_table_id AND st.user_id = c.uid
  ),
  resolved AS (
    SELECT d.*,
           coalesce(d.prev_stack_in, d.carried_stack) AS prev_stack,
           coalesce(d.prev_hand_in,  d.carried_hand)  AS prev_hand
    FROM d
  ),
  marked AS (
    SELECT r.*,
           (r.prev_stack IS NOT NULL AND r.prev_hand IS NOT NULL
            AND r.prev_hand = r.prev_hand_at_table) AS adjacent,
           CASE WHEN r.prev_stack IS NOT NULL THEN r.stack - r.prev_stack ELSE 0 END AS delta
    FROM resolved r
  ),
  per_hand AS (
    SELECT hand_id,
           count(*) AS seated,
           count(*) FILTER (WHERE prev_stack IS NOT NULL) AS with_prior,
           coalesce(sum(delta) FILTER (WHERE prev_stack IS NOT NULL), 0) AS dsum,
           max(rake_bbj) AS rake_bbj
    FROM marked GROUP BY hand_id
  ),
  calc AS (
    SELECT m.uid, (m.created_at AT TIME ZONE 'UTC')::date AS stat_date,
           m.won, m.pot_size, m.delta,
           CASE
             WHEN ph.seated = ph.with_prior THEN abs(ph.dsum + ph.rake_bbj) < 0.005
             ELSE m.adjacent AND m.delta <= m.won + 0.001
           END AS attributable
    FROM marked m JOIN per_hand ph ON ph.hand_id = m.hand_id
  )
  INSERT INTO club_member_daily_stats AS s
    (club_id, table_id, user_id, stat_date, hands_played, hands_attributed, hands_won,
     total_won, profit, biggest_pot_won, biggest_pot, topup_total)
  SELECT
    v_club, p_table_id, uid, stat_date,
    count(*),
    count(*) FILTER (WHERE attributable),
    count(*) FILTER (WHERE won > 0),
    sum(won),
    coalesce(sum(delta) FILTER (WHERE attributable), 0),
    max(won), max(pot_size),
    coalesce(sum(delta - won) FILTER (WHERE NOT attributable AND delta > won), 0)
  FROM calc
  GROUP BY uid, stat_date
  ON CONFLICT (club_id, table_id, user_id, stat_date) DO UPDATE SET
    hands_played     = s.hands_played + EXCLUDED.hands_played,
    hands_attributed = s.hands_attributed + EXCLUDED.hands_attributed,
    hands_won        = s.hands_won + EXCLUDED.hands_won,
    total_won        = s.total_won + EXCLUDED.total_won,
    profit           = s.profit + EXCLUDED.profit,
    biggest_pot_won  = greatest(s.biggest_pot_won, EXCLUDED.biggest_pot_won),
    biggest_pot      = greatest(s.biggest_pot, EXCLUDED.biggest_pot),
    topup_total      = s.topup_total + EXCLUDED.topup_total,
    updated_at       = now();

  INSERT INTO club_member_table_state AS st
    (table_id, user_id, last_stack, last_hand_number, last_created_at, last_hand_id)
  SELECT DISTINCT ON (uid)
         p_table_id, uid, stack, hand_number, created_at, hand_id
  FROM _chunk
  ORDER BY uid, created_at DESC, hand_id DESC
  ON CONFLICT (table_id, user_id) DO UPDATE SET
    last_stack       = EXCLUDED.last_stack,
    last_hand_number = EXCLUDED.last_hand_number,
    last_created_at  = EXCLUDED.last_created_at,
    last_hand_id     = EXCLUDED.last_hand_id,
    updated_at       = now();

  INSERT INTO club_stats_rebuild_log
    (table_id, rebuilt_at, rows_written, cursor_created_at, cursor_id, complete, hands_done)
  VALUES (p_table_id, now(), v_count, v_last_ts, v_last_id, v_count < v_limit, v_count)
  ON CONFLICT (table_id) DO UPDATE SET
    rebuilt_at        = now(),
    rows_written      = EXCLUDED.rows_written,
    cursor_created_at = EXCLUDED.cursor_created_at,
    cursor_id         = EXCLUDED.cursor_id,
    complete          = EXCLUDED.complete,
    hands_done        = club_stats_rebuild_log.hands_done + EXCLUDED.hands_done;

  hands_processed := v_count;
  complete := v_count < v_limit;
  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_club_table_daily_catchup(p_days integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_n int := GREATEST(LEAST(COALESCE(p_days, 3), 30), 1);
  d date;
  v_done jsonb := '[]'::jsonb;
  v_stored bigint;
  v_actual bigint;
BEGIN
  FOR d IN SELECT gs::date FROM generate_series(v_today - (v_n - 1), v_today, interval '1 day') gs LOOP
    SELECT COALESCE(SUM(c.source_rows), 0) INTO v_stored
      FROM club_table_daily c WHERE c.stat_date = d;

    SELECT COUNT(*) INTO v_actual
      FROM rake_records r
      JOIN tables t ON t.id = r.table_id AND t.tournament_id IS NULL
      CROSS JOIN LATERAL jsonb_each_text(r.player_contributions) e(key, value)
     WHERE r.created_at >= (d::timestamp AT TIME ZONE 'UTC')
       AND r.created_at <  ((d + 1)::timestamp AT TIME ZONE 'UTC')
       AND r.player_contributions IS NOT NULL
       AND r.rake_amount > 0
       AND length(e.key) = 36;

    IF d >= v_today - 1 OR v_stored IS DISTINCT FROM v_actual THEN
      PERFORM fn_club_table_daily_refresh_day(d);
      v_done := v_done || jsonb_build_array(jsonb_build_object('day', d, 'refreshed', true));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'days', v_done);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_club_table_daily_refresh_day(p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := (p_day::timestamp AT TIME ZONE 'UTC');
  v_to   timestamptz := ((p_day + 1)::timestamp AT TIME ZONE 'UTC');
  v_rows int;
BEGIN
  IF p_day IS NULL OR p_day > (now() AT TIME ZONE 'UTC')::date THEN
    RETURN jsonb_build_object('success', false, 'error', 'day_out_of_range');
  END IF;

  DELETE FROM club_table_daily WHERE stat_date = p_day;

  WITH att AS (
    SELECT DISTINCT ON (cm.user_id, uc.union_id)
           uc.union_id, cm.user_id, cm.club_id
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id
     ORDER BY cm.user_id, uc.union_id, cm.joined_at ASC NULLS LAST, cm.club_id
  ),
  rr AS (
    SELECT r.id, r.table_id, r.rake_amount, t.union_id, t.club_id AS table_club,
           e.key AS uid, (e.value)::numeric AS contrib,
           SUM((e.value)::numeric) OVER (PARTITION BY r.id) AS tot
      FROM rake_records r
      JOIN tables t ON t.id = r.table_id AND t.tournament_id IS NULL
      CROSS JOIN LATERAL jsonb_each_text(r.player_contributions) e(key, value)
     WHERE r.created_at >= v_from AND r.created_at < v_to
       AND r.player_contributions IS NOT NULL
       AND r.rake_amount > 0
       AND length(e.key) = 36
  ),
  raked AS (
    SELECT COALESCE(a.club_id, rr.table_club) AS club_id,
           rr.table_id,
           rr.union_id,
           SUM(rr.rake_amount * rr.contrib / rr.tot) AS rake,
           COUNT(DISTINCT rr.id)  AS hands,
           COUNT(DISTINCT rr.uid) AS players,
           COUNT(*)               AS src
      FROM rr
      LEFT JOIN att a ON a.user_id = (rr.uid)::uuid AND a.union_id IS NOT DISTINCT FROM rr.union_id
     WHERE rr.tot > 0
     GROUP BY 1, 2, 3
  ),
  wal AS (
    SELECT COALESCE(a.club_id, t.club_id) AS club_id,
           wt.table_id,
           t.union_id,
           SUM(CASE WHEN wt.type = 'debit'  THEN wt.amount ELSE 0 END) AS buyins,
           SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE 0 END) AS cashouts
      FROM wallet_transactions wt
      JOIN tables t ON t.id = wt.table_id AND t.tournament_id IS NULL
      LEFT JOIN att a ON a.user_id = wt.user_id AND a.union_id IS NOT DISTINCT FROM t.union_id
     WHERE wt.created_at >= v_from AND wt.created_at < v_to
       AND wt.category IN ('buyin', 'cashout')
     GROUP BY 1, 2, 3
  ),
  merged AS (
    SELECT COALESCE(k.club_id,  w.club_id)  AS club_id,
           COALESCE(k.table_id, w.table_id) AS table_id,
           COALESCE(k.union_id, w.union_id) AS union_id,
           COALESCE(k.rake, 0)     AS rake,
           COALESCE(k.hands, 0)    AS hands,
           COALESCE(k.players, 0)  AS players,
           COALESCE(k.src, 0)      AS src,
           COALESCE(w.buyins, 0)   AS buyins,
           COALESCE(w.cashouts, 0) AS cashouts
      FROM raked k
      FULL OUTER JOIN wal w
        ON w.club_id = k.club_id AND w.table_id = k.table_id
  )
  INSERT INTO club_table_daily (club_id, table_id, stat_date, union_id,
                                rake, hands, players, buyins, cashouts, net,
                                source_rows, updated_at)
  SELECT m.club_id, m.table_id, p_day, m.union_id,
         round(m.rake, 4), m.hands, m.players,
         round(m.buyins, 2), round(m.cashouts, 2),
         round(m.cashouts - m.buyins, 2),
         m.src, now()
    FROM merged m
   WHERE m.club_id IS NOT NULL AND m.table_id IS NOT NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'day', p_day, 'rows', v_rows);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_union_tournament_rake_by_user(p_union_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(user_id uuid, rake_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH rr AS (
    SELECT r.id, r.tournament_id, r.rake_amount,
           CASE WHEN length(r.metadata->>'user_id') = 36
                THEN (r.metadata->>'user_id')::uuid END AS payer
      FROM rake_records r
     WHERE r.is_tournament
       AND r.created_at >= p_start AND r.created_at < p_end
       AND r.rake_amount <> 0
       AND (r.club_id = p_union_id
            OR EXISTS (SELECT 1 FROM union_clubs uc
                        WHERE uc.union_id = p_union_id AND uc.club_id = r.club_id))
  ),
  direct AS (
    SELECT rr.payer AS uid, SUM(rr.rake_amount) AS amt
      FROM rr WHERE rr.payer IS NOT NULL GROUP BY 1
  ),
  split AS (
    SELECT tp.user_id AS uid, SUM(rr.rake_amount / n.cnt) AS amt
      FROM rr
      JOIN LATERAL (SELECT count(*)::numeric AS cnt
                      FROM tournament_players tp0
                     WHERE tp0.tournament_id = rr.tournament_id) n ON n.cnt > 0
      JOIN tournament_players tp ON tp.tournament_id = rr.tournament_id
     WHERE rr.payer IS NULL AND rr.tournament_id IS NOT NULL
     GROUP BY 1
  )
  SELECT x.uid, round(SUM(x.amt), 4)
    FROM (SELECT * FROM direct UNION ALL SELECT * FROM split) x
   WHERE x.uid IS NOT NULL
   GROUP BY x.uid;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_home(p_club_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club           public.clubs%ROWTYPE;
  v_uid            uuid := auth.uid();
  v_union_id       uuid;
  v_union_club_ids uuid[];
  v_member_count   integer;
  v_playing        integer;
  v_membership     jsonb;
  v_tables         jsonb;
  v_tournaments    jsonb;
  v_bbj            jsonb;
BEGIN
  IF length(p_club_key) = 36 THEN
    SELECT * INTO v_club FROM public.clubs WHERE id = p_club_key::uuid LIMIT 1;
  ELSIF p_club_key ~ '^[0-9]+$' THEN
    SELECT * INTO v_club FROM public.clubs WHERE club_id = p_club_key::integer LIMIT 1;
  ELSE
    SELECT * INTO v_club FROM public.clubs WHERE slug = p_club_key LIMIT 1;
  END IF;

  IF v_club.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT uc.union_id INTO v_union_id
  FROM public.union_clubs uc WHERE uc.club_id = v_club.id LIMIT 1;
  IF v_union_id IS NULL THEN
    v_union_id := v_club.union_id;
  END IF;

  IF v_union_id IS NOT NULL THEN
    SELECT array_agg(uc.club_id) INTO v_union_club_ids
    FROM public.union_clubs uc WHERE uc.union_id = v_union_id;
  END IF;
  v_union_club_ids := COALESCE(v_union_club_ids, ARRAY[]::uuid[]) || v_club.id;

  -- THIS CLUB'S MEMBERS. Not the union's. See the header.
  SELECT count(*)::int INTO v_member_count
  FROM public.club_members cm
  WHERE cm.club_id = v_club.id
    AND cm.status IN ('active', 'approved');

  -- Everyone in a seat at a live table, right now, anywhere on the platform.
  -- Counted from the seats, never from clubs.online_count.
  SELECT count(DISTINCT ts.user_id)::int INTO v_playing
  FROM public.table_seats ts
  JOIN public.tables tb ON tb.id = ts.table_id
  WHERE ts.left_at IS NULL
    AND tb.status IN ('waiting', 'running');

  IF v_uid IS NOT NULL THEN
    SELECT jsonb_build_object('chip_balance', cm.chip_balance, 'role', cm.role)
      INTO v_membership
    FROM public.club_members cm
    WHERE cm.club_id = v_club.id AND cm.user_id = v_uid LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_tables
  FROM (
    SELECT id, name, game_variant, stakes, current_players, max_players, status,
           small_blind, big_blind, min_buy_in, max_buy_in, settings, created_at
    FROM public.tables
    WHERE is_deleted = false
      AND status NOT IN ('closed', 'deleted')
      AND tournament_id IS NULL
      AND public.fn_club_home_in_scope(club_id, is_private, union_id,
                                       v_union_id, v_club.id, v_union_club_ids)
    ORDER BY created_at DESC LIMIT 200
  ) t;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.start_time ASC), '[]'::jsonb) INTO v_tournaments
  FROM (
    SELECT id, name, game_type, variant, table_size, buy_in_amount, buy_in_fee,
           guaranteed_prize, start_time, status, current_players, max_players,
           starting_chips, club_id, union_id, is_xmtt, late_reg_mins,
           late_reg_levels, started_at, current_level
    FROM public.tournaments
    WHERE status IN ('REGISTERING', 'RUNNING', 'LATE_REG', 'STARTING_SOON')
      AND public.fn_club_home_in_scope(club_id, is_private, union_id,
                                       v_union_id, v_club.id, v_union_club_ids)
    ORDER BY start_time ASC LIMIT 200
  ) x;

  SELECT jsonb_build_object('id', bp.id, 'main_balance', bp.main_balance) INTO v_bbj
  FROM public.bbj_pools bp
  WHERE CASE WHEN v_union_id IS NOT NULL
             THEN (bp.union_id = v_union_id OR bp.club_id = ANY (v_union_club_ids))
             ELSE bp.club_id = v_club.id END
  ORDER BY (bp.union_id IS NOT NULL) DESC LIMIT 1;

  RETURN jsonb_build_object(
    'found', true,
    'club', jsonb_build_object(
      'id', v_club.id,
      'club_id', v_club.club_id,
      'name', v_club.name,
      'description', v_club.description,
      'avatar_url', v_club.avatar_url,
      'logo_url', v_club.logo_url,
      -- Both counts come from this one place so the header cannot flip
      -- between two writers again.
      'member_count', v_member_count,
      'online_count', v_playing,
      'owner_id', v_club.owner_id,
      'level', v_club.level,
      'hierarchy_units_rounded_up', v_club.hierarchy_units_rounded_up,
      'player_threshold_current', v_club.player_threshold_current,
      'player_threshold_next', v_club.player_threshold_next,
      'hierarchy_threshold_current', v_club.hierarchy_threshold_current,
      'hierarchy_threshold_next', v_club.hierarchy_threshold_next,
      'created_at', v_club.created_at
    ),
    'membership', v_membership,
    'union_id', v_union_id,
    'union_club_ids', to_jsonb(v_union_club_ids),
    'member_count', v_member_count,
    'players_playing', v_playing,
    'tables', v_tables,
    'tournaments', v_tournaments,
    'bbj', v_bbj
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_hand_history_club_member_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_club uuid;
  v_date date;
BEGIN
  SELECT t.club_id INTO v_club FROM tables t WHERE t.id = NEW.table_id;
  IF v_club IS NULL THEN RETURN NEW; END IF;
  v_date := (NEW.created_at AT TIME ZONE 'UTC')::date;

  -- Per-player and per-table bookkeeping FIRST. These are keyed
  -- (club_id, table_id, user_id, stat_date) and (table_id, user_id), so two
  -- hands at different tables never contend, and this is where the ~99 ms
  -- goes. Doing it before the club-wide counter is the whole point of this
  -- migration: none of it is done while holding the one row every table shares.
  WITH pl AS (
    SELECT DISTINCT ON (p->>'userId') (p->>'userId')::uuid AS uid, (p->>'stack')::numeric AS stack
    FROM jsonb_array_elements(coalesce(NEW.players, '[]'::jsonb)) p
    WHERE length((p->>'userId')) = 36
      AND (p->>'stack') IS NOT NULL
  ), wn AS (
    SELECT (w->>'userId')::uuid AS uid, sum((w->>'amount')::numeric) AS won
    FROM jsonb_array_elements(coalesce(NEW.winners, '[]'::jsonb)) w
    WHERE length((w->>'userId')) = 36
    GROUP BY 1
  ), base AS (
    SELECT pl.uid, pl.stack, coalesce(wn.won, 0) AS won, st.last_stack,
           (st.last_stack IS NOT NULL AND st.last_hand_number IS NOT NULL AND NEW.hand_number IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM hand_history h2
               WHERE h2.table_id = NEW.table_id
                 AND h2.hand_number > st.last_hand_number
                 AND h2.hand_number < NEW.hand_number)) AS adjacent
    FROM pl
    LEFT JOIN wn ON wn.uid = pl.uid
    LEFT JOIN club_member_table_state st ON st.table_id = NEW.table_id AND st.user_id = pl.uid
  ), agg AS (
    SELECT count(*) AS seated,
           count(*) FILTER (WHERE last_stack IS NOT NULL) AS with_prior,
           coalesce(sum(stack - last_stack) FILTER (WHERE last_stack IS NOT NULL), 0) AS dsum
    FROM base
  ), calc AS (
    SELECT b.uid, b.won,
           CASE WHEN b.last_stack IS NOT NULL THEN b.stack - b.last_stack ELSE 0 END AS delta,
           CASE WHEN a.seated = a.with_prior
                THEN abs(a.dsum + coalesce(NEW.rake_amount, 0) + coalesce(NEW.bbj_amount, 0)) < 0.005
                ELSE b.adjacent AND (b.stack - b.last_stack) <= b.won + 0.001 END AS attributable
    FROM base b CROSS JOIN agg a
  )
  INSERT INTO club_member_daily_stats AS s
    (club_id, table_id, user_id, stat_date, hands_played, hands_attributed, hands_won,
     total_won, profit, biggest_pot_won, biggest_pot, topup_total)
  SELECT v_club, NEW.table_id, calc.uid, v_date, 1,
         CASE WHEN calc.attributable THEN 1 ELSE 0 END,
         CASE WHEN calc.won > 0 THEN 1 ELSE 0 END,
         calc.won,
         CASE WHEN calc.attributable THEN calc.delta ELSE 0 END,
         calc.won,
         coalesce(NEW.pot_size, 0),
         CASE WHEN NOT calc.attributable AND calc.delta > calc.won THEN calc.delta - calc.won ELSE 0 END
  FROM calc
  ON CONFLICT (club_id, table_id, user_id, stat_date) DO UPDATE SET
    hands_played = s.hands_played + 1,
    hands_attributed = s.hands_attributed + EXCLUDED.hands_attributed,
    hands_won = s.hands_won + EXCLUDED.hands_won,
    total_won = s.total_won + EXCLUDED.total_won,
    profit = s.profit + EXCLUDED.profit,
    biggest_pot_won = greatest(s.biggest_pot_won, EXCLUDED.biggest_pot_won),
    biggest_pot = greatest(s.biggest_pot, EXCLUDED.biggest_pot),
    topup_total = s.topup_total + EXCLUDED.topup_total,
    updated_at = now();

  INSERT INTO club_member_table_state AS st (table_id, user_id, last_stack, last_hand_number)
  SELECT DISTINCT ON (p->>'userId') NEW.table_id, (p->>'userId')::uuid, (p->>'stack')::numeric, NEW.hand_number
  FROM jsonb_array_elements(coalesce(NEW.players, '[]'::jsonb)) p
  WHERE length((p->>'userId')) = 36
    AND (p->>'stack') IS NOT NULL
  ON CONFLICT (table_id, user_id) DO UPDATE SET
    last_stack = EXCLUDED.last_stack,
    last_hand_number = EXCLUDED.last_hand_number,
    updated_at = now();

  -- THE ONE ROW EVERY TABLE SHARES, TAKEN LAST AND HELD ONLY UNTIL COMMIT.
  -- Club-level per-day rollup (Hands Today / Rake Today / 14-day series).
  INSERT INTO club_hand_daily AS d (club_id, stat_date, hands, rake, bbj, pot_total)
  VALUES (v_club, v_date, 1, coalesce(NEW.rake_amount, 0), coalesce(NEW.bbj_amount, 0), coalesce(NEW.pot_size, 0))
  ON CONFLICT (club_id, stat_date) DO UPDATE SET
    hands = d.hands + 1,
    rake = d.rake + EXCLUDED.rake,
    bbj = d.bbj + EXCLUDED.bbj,
    pot_total = d.pot_total + EXCLUDED.pot_total,
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_hand_history_club_member_stats failed: %', SQLERRM;
  RETURN NEW;
END;
$function$
;

