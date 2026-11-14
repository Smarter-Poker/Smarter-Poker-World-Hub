-- Fixture for 20261114163409: a stand-in fn_sp_digest_attention carrying the
-- exact production error_spike block, seeded with the 2026-11-06..13 counts.
CREATE TABLE public.sp_daily_metrics (day date PRIMARY KEY, metrics jsonb);
CREATE TABLE public.client_error_events (received_at timestamptz, automated boolean, occurrences integer);
CREATE FUNCTION public.fn_sp_setting(k text, d numeric) RETURNS numeric LANGUAGE sql AS 'SELECT d';
CREATE FUNCTION public.fn_sp_digest_attention(p_day date, p_metrics jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  a jsonb := '[]'::jsonb;
  v numeric; v2 numeric; avg7 numeric; t text; r record; v_elig numeric;
  prev jsonb;
  s timestamptz := (p_day::timestamp AT TIME ZONE 'America/Chicago');
  e timestamptz := ((p_day + 1)::timestamp AT TIME ZONE 'America/Chicago');
BEGIN
  -- Error spike
  SELECT avg((metrics#>>'{health,client_errors}')::numeric), count(*) INTO avg7, v2 FROM public.sp_daily_metrics WHERE day BETWEEN p_day - 7 AND p_day - 1;
  v := (p_metrics#>>'{health,client_errors}')::numeric;
  IF v2 >= 3 AND avg7 > 0 AND v > avg7 * public.fn_sp_setting('client_error_spike_ratio',2) THEN
    a := a || jsonb_build_object('rule','error_spike','severity','warning',
      'title', format('%s client errors vs a 7 day average of %s', v, round(avg7)), 'detail', jsonb_build_object('errors', v, 'avg7', round(avg7)));
  END IF;
  RETURN a;
END $function$;
INSERT INTO public.sp_daily_metrics
SELECT d::date, jsonb_build_object('health', jsonb_build_object('client_errors', n))
FROM (VALUES ('2026-11-06',1395),('2026-11-07',564),('2026-11-08',757),('2026-11-09',2493),
             ('2026-11-10',3006),('2026-11-11',1505),('2026-11-12',2107)) x(d,n);
INSERT INTO public.client_error_events
SELECT (d::date + time '12:00') AT TIME ZONE 'America/Chicago', auto, n
FROM (VALUES ('2026-11-06',false,897),('2026-11-06',true,498),('2026-11-07',false,353),('2026-11-07',true,211),
             ('2026-11-08',false,573),('2026-11-08',true,184),('2026-11-09',false,1978),('2026-11-09',true,515),
             ('2026-11-10',false,2579),('2026-11-10',true,427),('2026-11-11',false,1011),('2026-11-11',true,494),
             ('2026-11-12',false,1746),('2026-11-12',true,361),('2026-11-13',false,1320),('2026-11-13',true,2294)) x(d,auto,n);
DO $before$ BEGIN
  IF jsonb_array_length(public.fn_sp_digest_attention('2026-11-13', '{"health":{"client_errors":3614}}')) <> 1 THEN
    RAISE EXCEPTION 'fixture does not reproduce the false spike';
  END IF;
END $before$;
