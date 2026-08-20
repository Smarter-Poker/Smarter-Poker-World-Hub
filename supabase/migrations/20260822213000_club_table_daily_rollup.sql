-- CLUB TABLE DAILY -- the rollup behind the real-time Club Data screen.
--
-- WHY A ROLLUP AND NOT A LIVE QUERY: rake attribution means expanding
-- rake_records.player_contributions, one row per player per hand. The union
-- books 58,508 raked hands a day and 638,361 over a fourteen-day window;
-- expanding that window live was measured and it does not complete inside the
-- statement timeout. Per day it is a few seconds, which is fine for a
-- scheduled refresh and far too slow for a screen. So the screen reads days.
--
-- GRAIN: (club_id, table_id, stat_date). club_id is the MEMBER club the
-- players belong to, not the table's owner -- union tables are shared, and a
-- club owner asking "what did my club generate" means their own players.
--
-- ATTRIBUTION: identical rule to the settlement and to ECO -- a player counts
-- for the earliest club they joined within the union that owns the table
-- (DISTINCT ON (user_id, union_id) ORDER BY joined_at). Club-owned tables with
-- no union fall back to that club. Using the same rule everywhere is what
-- stops the screen and the invoice from ever disagreeing. Verified against
-- fn_union_rake_paid_readonly for the live week: 942,388.72 rollup vs
-- 942,543.69 authoritative, the difference being rake booked in the seconds
-- between the two reads.
--
-- Backfilled 14 days on apply. Kept current by fn_club_table_daily_catchup.
--
-- Applied to production via Supabase MCP as 'club_table_daily_rollup'.

CREATE TABLE IF NOT EXISTS public.club_table_daily (
  club_id     uuid NOT NULL,
  table_id    uuid NOT NULL,
  stat_date   date NOT NULL,
  union_id    uuid NULL,
  rake        numeric NOT NULL DEFAULT 0,
  hands       integer NOT NULL DEFAULT 0,
  players     integer NOT NULL DEFAULT 0,
  buyins      numeric NOT NULL DEFAULT 0,
  cashouts    numeric NOT NULL DEFAULT 0,
  net         numeric NOT NULL DEFAULT 0,
  source_rows integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, table_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_ctd_club_date  ON public.club_table_daily (club_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_ctd_date       ON public.club_table_daily (stat_date);
CREATE INDEX IF NOT EXISTS idx_ctd_union_date ON public.club_table_daily (union_id, stat_date DESC);

ALTER TABLE public.club_table_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.club_table_daily FROM anon;
REVOKE ALL ON TABLE public.club_table_daily FROM authenticated;

DROP POLICY IF EXISTS club_table_daily_service ON public.club_table_daily;
CREATE POLICY club_table_daily_service ON public.club_table_daily
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.fn_club_table_daily_refresh_day(p_day date)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
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
       AND e.key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_club_table_daily_refresh_day(date) FROM PUBLIC, anon, authenticated;

-- Catch-up. Always redoes today and yesterday (still moving), and fills any
-- day in the window whose stored source_rows no longer matches reality.
CREATE OR REPLACE FUNCTION public.fn_club_table_daily_catchup(p_days integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
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
       AND e.key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

    IF d >= v_today - 1 OR v_stored IS DISTINCT FROM v_actual THEN
      PERFORM fn_club_table_daily_refresh_day(d);
      v_done := v_done || jsonb_build_array(jsonb_build_object('day', d, 'refreshed', true));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'days', v_done);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_club_table_daily_catchup(integer) FROM PUBLIC, anon, authenticated;

-- Backfill the window the screen offers. Done one day at a time on apply;
-- a single statement over all 14 days exceeds the statement timeout.
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT gs::date
             FROM generate_series((now() AT TIME ZONE 'UTC')::date - 13,
                                  (now() AT TIME ZONE 'UTC')::date, interval '1 day') gs LOOP
    PERFORM fn_club_table_daily_refresh_day(d);
  END LOOP;
END $$;
