-- ═══════════════════════════════════════════════════════════════════════════
-- Union wallet detail reports (Dan 2026-08-24)
--
--   "RAKE TREASURY SHOULD OPEN UP TO SEE ALL THE DATA FOR ALL RAKE ACCUMULATED
--    ... BACK UP BBJ NEEDS TO BE CLICKABLE AND EXPAND TO SEE DATA AND
--    TRANSACTION HISTORY AND STATS ... the same way we track 'rake credited to
--    players' we should be tracking the BBJ the same way."
--
-- pages/api/club-arena/union-wallet.js already ships get_rake_detail and
-- get_bbj_detail branches that call four functions which DO NOT EXIST. Every
-- one of those panels would have returned an empty report the moment the UI was
-- wired. This migration creates them.
--
-- WHY THEY READ ROLLUPS, NOT THE RAW TABLES
-- rake_distribution_legs holds 2.27M rows with no index on union_id; the
-- obvious aggregate measured 7.7s of parallel sequential scan (EXPLAIN ANALYZE,
-- 2026-08-24) which would time the API route out on every panel open. The
-- platform already maintains club_rake_daily_user, bbj_daily_user and
-- union_rake_ledger_checkpoint for exactly this, and they are 26k / 4.6k / 1
-- rows. Reading those is both faster and consistent with the numbers the rest
-- of the product already shows.
--
-- COLUMN HONESTY: the daily rollups are keyed (club_id, day, user_id), so their
-- `hands` column is hands-per-player. Summing it across players yields
-- PLAYER-hands, not hands, and it is named player_hands here so nobody reads a
-- pot count off it later.
--
-- NOTE: the handler calls this ledger function as fn_union_rake_ledger_summary.
-- The name fn_union_rake_legs_summary in the pre-existing handler was renamed
-- in the same change, because this reads the ledger checkpoint, not legs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_union_report_caller_ok(p_union_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT p_union_id IS NOT NULL AND (
    COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) = 'service_role'
    OR (
      auth.uid() IS NOT NULL AND (
        EXISTS (SELECT 1 FROM unions u
                 WHERE u.id = p_union_id AND u.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM union_admins ua
                    WHERE ua.union_id = p_union_id AND ua.user_id = auth.uid())
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.fn_union_report_caller_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_union_report_caller_ok(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_union_club_scope(p_union_id uuid)
RETURNS TABLE(club_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT uc.club_id FROM union_clubs uc WHERE uc.union_id = p_union_id
  UNION
  SELECT p_union_id;
$$;

REVOKE ALL ON FUNCTION public.fn_union_club_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_union_club_scope(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_union_rake_ledger_summary(p_union_id uuid)
RETURNS TABLE(
  credits          numeric,
  debits           numeric,
  net              numeric,
  rows_seen        bigint,
  as_of            timestamptz,
  last_verified_at timestamptz,
  through_day      date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    COALESCE(cp.credits, 0)::numeric,
    COALESCE(cp.debits, 0)::numeric,
    (COALESCE(cp.credits, 0) - COALESCE(cp.debits, 0))::numeric,
    COALESCE(cp.rows_seen, 0)::bigint,
    cp.as_of,
    cp.last_verified_at,
    (SELECT max(d.day)
       FROM club_rake_daily_user d
       JOIN fn_union_club_scope(p_union_id) s ON s.club_id = d.club_id)
  FROM union_rake_ledger_checkpoint cp
  WHERE cp.union_id = p_union_id
    AND public.fn_union_report_caller_ok(p_union_id);
$$;

REVOKE ALL ON FUNCTION public.fn_union_rake_ledger_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_union_rake_ledger_summary(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_union_rake_by_day(p_union_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(day date, rake numeric, players bigint, player_hands bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT d.day,
         SUM(d.rake_amount)::numeric,
         COUNT(DISTINCT d.user_id)::bigint,
         SUM(d.hands)::bigint
    FROM club_rake_daily_user d
    JOIN fn_union_club_scope(p_union_id) s ON s.club_id = d.club_id
   WHERE public.fn_union_report_caller_ok(p_union_id)
     AND d.day >= (CURRENT_DATE - GREATEST(COALESCE(p_days, 30), 1))
   GROUP BY d.day
   ORDER BY d.day DESC;
$$;

REVOKE ALL ON FUNCTION public.fn_union_rake_by_day(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_union_rake_by_day(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_union_rake_by_club(p_union_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(club_id uuid, club_name text, rake numeric, players bigint, player_hands bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT d.club_id,
         COALESCE(c.name, 'Union Tables')::text,
         SUM(d.rake_amount)::numeric,
         COUNT(DISTINCT d.user_id)::bigint,
         SUM(d.hands)::bigint
    FROM club_rake_daily_user d
    JOIN fn_union_club_scope(p_union_id) s ON s.club_id = d.club_id
    LEFT JOIN clubs c ON c.id = d.club_id
   WHERE public.fn_union_report_caller_ok(p_union_id)
     AND d.day >= (CURRENT_DATE - GREATEST(COALESCE(p_days, 30), 1))
   GROUP BY d.club_id, c.name
   ORDER BY 3 DESC;
$$;

REVOKE ALL ON FUNCTION public.fn_union_rake_by_club(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_union_rake_by_club(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_bbj_contributions_by_day(p_union_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(
  day          date,
  bbj          numeric,
  main         numeric,
  backup       numeric,
  promo        numeric,
  players      bigint,
  player_hands bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT b.day,
         SUM(b.bbj_amount)::numeric,
         SUM(b.main_amount)::numeric,
         SUM(b.backup_amount)::numeric,
         SUM(b.promo_amount)::numeric,
         COUNT(DISTINCT b.user_id)::bigint,
         SUM(b.hands)::bigint
    FROM bbj_daily_user b
    JOIN fn_union_club_scope(p_union_id) s ON s.club_id = b.club_id
   WHERE public.fn_union_report_caller_ok(p_union_id)
     AND b.day >= (CURRENT_DATE - GREATEST(COALESCE(p_days, 30), 1))
   GROUP BY b.day
   ORDER BY b.day DESC;
$$;

REVOKE ALL ON FUNCTION public.fn_bbj_contributions_by_day(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bbj_contributions_by_day(uuid, integer) TO authenticated, service_role;

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(t.want, ', ')
    INTO v_missing
    FROM (VALUES
      ('fn_union_report_caller_ok'), ('fn_union_club_scope'),
      ('fn_union_rake_ledger_summary'), ('fn_union_rake_by_day'),
      ('fn_union_rake_by_club'), ('fn_bbj_contributions_by_day')
    ) AS t(want)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = t.want
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'union wallet report functions missing after apply: %', v_missing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('fn_union_report_caller_ok','fn_union_club_scope',
                         'fn_union_rake_ledger_summary','fn_union_rake_by_day',
                         'fn_union_rake_by_club','fn_bbj_contributions_by_day')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'a union wallet report function is executable by anon';
  END IF;
END $$;
