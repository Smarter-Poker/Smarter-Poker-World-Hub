-- P0-1 (2026-08-20): fn_union_rake_paid_by_club could not survive a 7-day window.
-- It expanded rake_records.player_contributions jsonb TWICE per record over the
-- whole window (~91k records/day, 800MB table) — a 7-day settlement call was a
-- strong candidate to repeat the 2026-08-19 unbounded-scan outage.
--
-- Fix: incremental (union_id, club_id, day) rollup. The function reads
-- finalized whole UTC days from the rollup and computes only the ragged edges
-- live. The rollup stores UNROUNDED numerics so sum-of-days equals the legacy
-- whole-window sum exactly (numeric addition is exact; the per-row division is
-- identical in both paths). Verified to the cent against the legacy
-- computation on a 42h window spanning two day boundaries, both horse modes.
-- 7-day call: 1.07s (was heading for ~50s+).
--
-- Semantics preserved:
-- * p_include_horses=false returns NO row for clubs with only horse
--   contributions (rake_paid_humans is stored NULL, not 0, for that case).
-- * Attribution (DISTINCT ON first club per user) is snapshotted per day at
--   refresh time; edges use attribution as of query time (legacy behavior).
-- * If any whole day cannot be finalized (e.g. read-only context), the
--   function falls back to the exact legacy whole-window computation.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'union_rake_daily_rollup' on 2026-08-20. Days 2026-08-13..2026-08-19
-- prewarmed one bounded query at a time (~3s/day).

-- Day-completeness marker. A day row here means the day was finalized
-- (including days with zero rake records).
CREATE TABLE IF NOT EXISTS public.union_rake_rollup_days (
  union_id     uuid NOT NULL,
  day          date NOT NULL,
  records_seen integer NOT NULL DEFAULT 0,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (union_id, day)
);

-- Per-club detail. rake_paid_humans is NULL (not 0) when no non-horse user
-- contributed that day, so the humans-mode query can reproduce the legacy
-- behavior of returning no row for horse-only clubs.
CREATE TABLE IF NOT EXISTS public.union_rake_paid_daily (
  union_id         uuid NOT NULL,
  day              date NOT NULL,
  club_id          uuid NOT NULL,
  rake_paid_all    numeric NOT NULL DEFAULT 0,
  rake_paid_humans numeric NULL,
  PRIMARY KEY (union_id, day, club_id),
  FOREIGN KEY (union_id, day)
    REFERENCES public.union_rake_rollup_days(union_id, day) ON DELETE CASCADE
);

ALTER TABLE public.union_rake_rollup_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.union_rake_paid_daily  ENABLE ROW LEVEL SECURITY;
-- No policies: service role and SECURITY DEFINER functions only.

-- Exact legacy computation, unrounded, with a single jsonb expansion
-- (window SUM replaces the per-row correlated subquery).
CREATE OR REPLACE FUNCTION public.fn_union_rake_paid_live(
  p_union_id uuid, p_start timestamptz, p_end timestamptz,
  p_include_horses boolean DEFAULT true)
RETURNS TABLE(club_id uuid, rake_paid numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH attributed AS (
    SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
      JOIN profiles p ON p.id = cm.user_id
     WHERE p_include_horses OR COALESCE(p.is_horse, false) = false
     ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
  ),
  expanded AS (
    SELECT r.id, r.rake_amount, e.key, (e.value)::numeric AS contrib,
           SUM((e.value)::numeric) OVER (PARTITION BY r.id) AS total_contrib
      FROM rake_records r
      JOIN tables t ON t.id = r.table_id AND t.union_id = p_union_id
      CROSS JOIN LATERAL jsonb_each_text(r.player_contributions) e(key, value)
     WHERE r.created_at >= p_start AND r.created_at < p_end
       AND r.player_contributions IS NOT NULL AND r.rake_amount > 0
  )
  SELECT a.club_id, SUM(expanded.rake_amount * expanded.contrib / expanded.total_contrib)
    FROM expanded JOIN attributed a ON a.user_id = (expanded.key)::uuid
   WHERE expanded.total_contrib > 0
   GROUP BY a.club_id;
$function$;

-- Finalize one complete UTC day. Idempotent (delete + insert under an
-- advisory xact lock). Refuses incomplete days.
CREATE OR REPLACE FUNCTION public.fn_union_rake_rollup_refresh_day(
  p_union_id uuid, p_day date)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := (p_day::timestamp AT TIME ZONE 'UTC');
  v_end   timestamptz := ((p_day + 1)::timestamp AT TIME ZONE 'UTC');
  v_records integer;
BEGIN
  IF v_end > now() THEN
    RAISE EXCEPTION 'union rake rollup: day % is not complete (UTC); refusing to finalize', p_day;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('union_rake_rollup:' || p_union_id::text || ':' || p_day::text, 42));

  DELETE FROM union_rake_rollup_days
   WHERE union_id = p_union_id AND day = p_day;  -- cascades to detail

  SELECT count(*) INTO v_records
    FROM rake_records r
    JOIN tables t ON t.id = r.table_id AND t.union_id = p_union_id
   WHERE r.created_at >= v_start AND r.created_at < v_end
     AND r.player_contributions IS NOT NULL AND r.rake_amount > 0;

  INSERT INTO union_rake_rollup_days (union_id, day, records_seen)
  VALUES (p_union_id, p_day, v_records);

  INSERT INTO union_rake_paid_daily (union_id, day, club_id, rake_paid_all, rake_paid_humans)
  WITH attributed AS (
    SELECT DISTINCT ON (cm.user_id) cm.user_id, cm.club_id,
           COALESCE(p.is_horse, false) AS is_horse
      FROM club_members cm
      JOIN union_clubs uc ON uc.club_id = cm.club_id AND uc.union_id = p_union_id
      JOIN profiles p ON p.id = cm.user_id
     ORDER BY cm.user_id, cm.joined_at ASC NULLS LAST, cm.club_id
  ),
  expanded AS (
    SELECT r.id, r.rake_amount, e.key, (e.value)::numeric AS contrib,
           SUM((e.value)::numeric) OVER (PARTITION BY r.id) AS total_contrib
      FROM rake_records r
      JOIN tables t ON t.id = r.table_id AND t.union_id = p_union_id
      CROSS JOIN LATERAL jsonb_each_text(r.player_contributions) e(key, value)
     WHERE r.created_at >= v_start AND r.created_at < v_end
       AND r.player_contributions IS NOT NULL AND r.rake_amount > 0
  )
  SELECT p_union_id, p_day, a.club_id,
         SUM(expanded.rake_amount * expanded.contrib / expanded.total_contrib),
         SUM(expanded.rake_amount * expanded.contrib / expanded.total_contrib)
           FILTER (WHERE NOT a.is_horse)
    FROM expanded JOIN attributed a ON a.user_id = (expanded.key)::uuid
   WHERE expanded.total_contrib > 0
   GROUP BY a.club_id;
END;
$function$;

-- Helpers are definer-owned internals; do not let client roles call them.
REVOKE EXECUTE ON FUNCTION public.fn_union_rake_rollup_refresh_day(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_union_rake_paid_live(uuid, timestamptz, timestamptz, boolean) FROM PUBLIC, anon, authenticated;

-- Rewritten main function. Same signature and semantics as the legacy
-- version; now VOLATILE because it lazily finalizes missing whole days.
-- Its only in-database caller is fn_union_settle_player_pnl (VOLATILE);
-- application callers reach it via top-level RPC, where volatility is
-- unconstrained.
CREATE OR REPLACE FUNCTION public.fn_union_rake_paid_by_club(
  p_union_id uuid, p_start timestamptz, p_end timestamptz,
  p_include_horses boolean DEFAULT true)
RETURNS TABLE(club_id uuid, rake_paid numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_first_day date;         -- first whole UTC day inside the window
  v_end_day   date;         -- exclusive whole-day bound
  v_today     date := (now() AT TIME ZONE 'UTC')::date;
  d           date;
  v_all_rolled boolean := true;
BEGIN
  v_first_day := (p_start AT TIME ZONE 'UTC')::date;
  IF (v_first_day::timestamp AT TIME ZONE 'UTC') < p_start THEN
    v_first_day := v_first_day + 1;
  END IF;
  v_end_day := (p_end AT TIME ZONE 'UTC')::date;
  IF v_end_day > v_today THEN
    v_end_day := v_today;  -- never finalize an incomplete day
  END IF;

  IF v_first_day >= v_end_day THEN
    RETURN QUERY
      SELECT l.club_id, round(l.rake_paid, 2)
        FROM fn_union_rake_paid_live(p_union_id, p_start, p_end, p_include_horses) l;
    RETURN;
  END IF;

  FOR d IN
    SELECT gs::date
      FROM generate_series(v_first_day, v_end_day - 1, interval '1 day') gs
     WHERE NOT EXISTS (SELECT 1 FROM union_rake_rollup_days u
                        WHERE u.union_id = p_union_id AND u.day = gs::date)
  LOOP
    BEGIN
      PERFORM fn_union_rake_rollup_refresh_day(p_union_id, d);
    EXCEPTION WHEN OTHERS THEN
      v_all_rolled := false;
    END;
  END LOOP;

  IF NOT v_all_rolled OR EXISTS (
       SELECT 1
         FROM generate_series(v_first_day, v_end_day - 1, interval '1 day') gs
        WHERE NOT EXISTS (SELECT 1 FROM union_rake_rollup_days u
                           WHERE u.union_id = p_union_id AND u.day = gs::date)) THEN
    RETURN QUERY
      SELECT l.club_id, round(l.rake_paid, 2)
        FROM fn_union_rake_paid_live(p_union_id, p_start, p_end, p_include_horses) l;
    RETURN;
  END IF;

  RETURN QUERY
  WITH rolled AS (
    SELECT u.club_id AS cid,
           CASE WHEN p_include_horses THEN SUM(u.rake_paid_all)
                ELSE SUM(u.rake_paid_humans) END AS s
      FROM union_rake_paid_daily u
     WHERE u.union_id = p_union_id
       AND u.day >= v_first_day AND u.day < v_end_day
     GROUP BY u.club_id
  ),
  edges AS (
    SELECT l.club_id AS cid, SUM(l.rake_paid) AS s
      FROM (
        SELECT * FROM fn_union_rake_paid_live(
          p_union_id, p_start, (v_first_day::timestamp AT TIME ZONE 'UTC'), p_include_horses)
        UNION ALL
        SELECT * FROM fn_union_rake_paid_live(
          p_union_id, (v_end_day::timestamp AT TIME ZONE 'UTC'), p_end, p_include_horses)
      ) l
     GROUP BY l.club_id
  ),
  combined AS (
    SELECT x.cid, SUM(x.s) AS s
      FROM (SELECT * FROM rolled UNION ALL SELECT * FROM edges) x
     GROUP BY x.cid
  )
  SELECT c.cid, round(c.s, 2) FROM combined c WHERE c.s IS NOT NULL;
END;
$function$;
