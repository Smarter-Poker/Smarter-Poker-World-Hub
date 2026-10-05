-- 20261005112820_operator_rake_aggregate_reports.sql
-- Phase 6 O6: exact, horse-inclusive operator rake aggregates and freshness.
-- Numeric totals cross the PostgREST boundary as text so JavaScript never
-- rounds a database NUMERIC. These functions are read-only and service-role
-- only; the Stable Admin route supplies the operator permission boundary.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_ca_operator_rake_report(
  p_dimension text,
  p_start timestamptz,
  p_end timestamptz,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  group_key text,
  label text,
  rake_amount text,
  bbj_contribution text,
  record_count text,
  first_recorded_at timestamptz,
  last_recorded_at timestamptz,
  total_groups bigint,
  window_record_count text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '15000ms'
AS $function$
BEGIN
  IF p_dimension NOT IN ('club', 'union', 'stake', 'date') THEN
    RAISE EXCEPTION 'INVALID_RAKE_DIMENSION' USING ERRCODE = '22023';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start >= p_end
     OR p_start < p_end - interval '90 days'
     OR p_end > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'INVALID_RAKE_WINDOW' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RAISE EXCEPTION 'INVALID_RAKE_PAGE' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH attributed AS (
    SELECT
      r.rake_amount::numeric AS rake_numeric,
      COALESCE(r.bbj_contribution, 0)::numeric AS bbj_numeric,
      r.created_at,
      r.club_id,
      c.name AS club_name,
      COALESCE(t.union_id, c.union_id) AS union_id,
      u.name AS union_name,
      t.small_blind,
      t.big_blind
    FROM public.rake_records r
    LEFT JOIN public.clubs c ON c.id = r.club_id
    LEFT JOIN public.tables t ON t.id = r.table_id
    LEFT JOIN public.unions u ON u.id = COALESCE(t.union_id, c.union_id)
    WHERE r.created_at >= p_start AND r.created_at < p_end
  ), keyed AS (
    SELECT
      CASE p_dimension
        WHEN 'club' THEN COALESCE(club_id::text, 'unattributed')
        WHEN 'union' THEN COALESCE(union_id::text, 'unattributed')
        WHEN 'stake' THEN CASE
          WHEN small_blind IS NULL OR big_blind IS NULL THEN 'unattributed'
          ELSE small_blind::text || ' / ' || big_blind::text
        END
        WHEN 'date' THEN (created_at AT TIME ZONE 'UTC')::date::text
      END AS k,
      CASE p_dimension
        WHEN 'club' THEN COALESCE(club_name, 'Unattributed Club')
        WHEN 'union' THEN COALESCE(union_name, 'Unattributed Union')
        WHEN 'stake' THEN CASE
          WHEN small_blind IS NULL OR big_blind IS NULL THEN 'Unattributed Stake'
          ELSE small_blind::text || ' / ' || big_blind::text
        END
        WHEN 'date' THEN (created_at AT TIME ZONE 'UTC')::date::text
      END AS display_label,
      rake_numeric,
      bbj_numeric,
      created_at
    FROM attributed
  ), grouped AS (
    SELECT k, max(display_label) AS display_label,
           sum(rake_numeric)::numeric AS rake_numeric,
           sum(bbj_numeric)::numeric AS bbj_numeric,
           count(*)::bigint AS records,
           min(created_at) AS first_at,
           max(created_at) AS last_at
    FROM keyed
    GROUP BY k
  ), measured AS (
    SELECT grouped.*,
           count(*) OVER ()::bigint AS groups_in_window,
           sum(records) OVER ()::bigint AS records_in_window
    FROM grouped
  )
  SELECT measured.k,
         measured.display_label,
         measured.rake_numeric::text,
         measured.bbj_numeric::text,
         measured.records::text,
         measured.first_at,
         measured.last_at,
         measured.groups_in_window,
         measured.records_in_window::text
  FROM measured
  ORDER BY measured.rake_numeric DESC, measured.k
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ca_operator_rake_freshness(
  p_start date,
  p_to_exclusive date
)
RETURNS TABLE(
  union_id uuid,
  union_name text,
  stale_days text[],
  checked_from date,
  checked_to_exclusive date,
  checked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '15000ms'
AS $function$
BEGIN
  IF p_start IS NULL OR p_to_exclusive IS NULL OR p_start >= p_to_exclusive
     OR p_start < p_to_exclusive - 90
     OR p_to_exclusive > (now() AT TIME ZONE 'UTC')::date + 1 THEN
    RAISE EXCEPTION 'INVALID_RAKE_FRESHNESS_WINDOW' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH relevant_unions AS (
    SELECT DISTINCT COALESCE(t.union_id, c.union_id) AS id
    FROM public.rake_records r
    LEFT JOIN public.tables t ON t.id = r.table_id
    LEFT JOIN public.clubs c ON c.id = r.club_id
    WHERE r.created_at >= (p_start::timestamp AT TIME ZONE 'UTC')
      AND r.created_at < (p_to_exclusive::timestamp AT TIME ZONE 'UTC')
      AND COALESCE(t.union_id, c.union_id) IS NOT NULL
  )
  SELECT u.id,
         u.name,
         ARRAY(
           SELECT stale_day::text
           FROM public.fn_union_rake_stale_days(u.id, p_start, p_to_exclusive) stale_day
           ORDER BY stale_day
         ),
         p_start,
         p_to_exclusive,
         now()
  FROM relevant_unions scope
  JOIN public.unions u ON u.id = scope.id
  ORDER BY u.name, u.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ca_operator_rake_report(text, timestamptz, timestamptz, integer, integer)
  FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.fn_ca_operator_rake_report(text, timestamptz, timestamptz, integer, integer)
  OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_ca_operator_rake_report(text, timestamptz, timestamptz, integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.fn_ca_operator_rake_freshness(date, date)
  FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.fn_ca_operator_rake_freshness(date, date)
  OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_ca_operator_rake_freshness(date, date)
  TO service_role;

COMMENT ON FUNCTION public.fn_ca_operator_rake_report(text, timestamptz, timestamptz, integer, integer)
  IS 'Read-only Stable Admin O6 rake aggregates. Exact numeric totals are returned as text and always include horses.';
COMMENT ON FUNCTION public.fn_ca_operator_rake_freshness(date, date)
  IS 'Read-only Stable Admin O6 rollup stale-day evidence for unions represented in the selected window.';

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_ca_operator_rake_report'
      AND p.pronargs = 5 AND p.prosecdef AND p.provolatile = 's'
      AND pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: operator rake report ownership or security contract differs';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_ca_operator_rake_freshness'
      AND p.pronargs = 2 AND p.prosecdef AND p.provolatile = 's'
      AND pg_get_userbyid(p.proowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'post-apply failed: operator rake freshness ownership or security contract differs';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.fn_ca_operator_rake_report(text,timestamptz,timestamptz,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_ca_operator_rake_report(text,timestamptz,timestamptz,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_ca_operator_rake_report(text,timestamptz,timestamptz,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply failed: operator rake report grants differ';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.fn_ca_operator_rake_freshness(date,date)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_ca_operator_rake_freshness(date,date)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_ca_operator_rake_freshness(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply failed: operator rake freshness grants differ';
  END IF;
END;
$verify$;

COMMIT;
