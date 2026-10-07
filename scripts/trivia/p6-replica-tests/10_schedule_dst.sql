-- Gate: exactly one 8 PM America/Chicago instance per Central date across both
-- DST transitions, year end and a leap day; duplicate fires create nothing.
\set ON_ERROR_STOP on
CREATE TEMP TABLE walk AS
SELECT d::date AS d FROM generate_series('2026-02-26'::date, '2026-03-16'::date, interval '1 day') d
UNION SELECT d::date FROM generate_series('2026-10-22'::date, '2026-11-10'::date, interval '1 day') d
UNION SELECT d::date FROM generate_series('2026-12-24'::date, '2027-01-06'::date, interval '1 day') d
UNION SELECT d::date FROM generate_series('2028-02-22'::date, '2028-03-12'::date, interval '1 day') d;
DO $$
DECLARE d date; o jsonb; r jsonb; v_fires integer := 0;
BEGIN
  FOR d IN SELECT walk.d FROM walk ORDER BY 1 LOOP
    FOREACH r IN ARRAY ARRAY['{"t":"00:05"}'::jsonb, '{"t":"12:00"}'::jsonb, '{"t":"19:59"}'::jsonb] LOOP
      PERFORM p6test.set_clock((d + (r->>'t')::time) AT TIME ZONE 'America/Chicago');
      o := public.trivia_tournament_scheduler_acquire('dispatcher-a', 60);
      IF NOT (o->>'owner')::boolean THEN RAISE EXCEPTION 'expected owner'; END IF;
      -- two fires at the same instant (active + passive dispatcher replay)
      PERFORM public.trivia_tournament_reconcile_schedule((o->>'fencing_token')::bigint, (o->>'run_id')::uuid, 8);
      r := public.trivia_tournament_reconcile_schedule((o->>'fencing_token')::bigint, (o->>'run_id')::uuid, 8);
      PERFORM p6test.assert((r->>'created')::integer = 0, 'replayed reconcile created ' || (r->>'created'));
      PERFORM p6test.assert((r->>'upcoming')::integer >= 7, 'fewer than seven upcoming at ' || d);
      PERFORM public.trivia_tournament_scheduler_release((o->>'run_id')::uuid, (o->>'fencing_token')::bigint);
      v_fires := v_fires + 2;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'fires=%', v_fires;
END $$;

-- Expected coverage: every walk date's next eight local dates (8 PM always in the future at fire time).
CREATE TEMP TABLE expected AS SELECT DISTINCT (w.d + k)::date AS d FROM walk w, generate_series(0, 7) k;
SELECT p6test.assert(NOT EXISTS (SELECT 1 FROM public.trivia_tournaments WHERE schedule_kind = 'public_nightly'
                                  GROUP BY schedule_timezone, scheduled_local_date HAVING count(*) <> 1),
                     'a Central date has more than one public instance');
SELECT p6test.assert((SELECT count(*) FROM expected e WHERE NOT EXISTS (SELECT 1 FROM public.trivia_tournaments t
         WHERE t.schedule_kind = 'public_nightly' AND t.scheduled_local_date = e.d)) = 0, 'a covered Central date is missing');
SELECT p6test.assert((SELECT count(*) FROM public.trivia_tournaments t WHERE t.schedule_kind = 'public_nightly'
         AND ((t.start_time AT TIME ZONE 'America/Chicago') <> (t.scheduled_local_date + time '20:00')
              OR t.end_time IS NULL OR t.end_time <> t.start_time + interval '60 minutes'
              OR t.registration_closes_at <> t.start_time)) = 0, 'an instance is not 8 PM CT / end missing');
SELECT p6test.assert((SELECT bool_and(start_time = expect) FROM (VALUES
    ('2026-03-07'::date, '2026-03-08 02:00:00+00'::timestamptz), ('2026-03-08', '2026-03-09 01:00:00+00'),
    ('2026-10-31', '2026-11-01 01:00:00+00'), ('2026-11-01', '2026-11-02 02:00:00+00'),
    ('2026-12-31', '2027-01-01 02:00:00+00'), ('2028-02-28', '2028-02-29 02:00:00+00'),
    ('2028-02-29', '2028-03-01 02:00:00+00'), ('2028-03-12', '2028-03-13 01:00:00+00')) x(d, expect)
    JOIN public.trivia_tournaments t ON t.schedule_kind = 'public_nightly' AND t.scheduled_local_date = x.d), 'DST/edge UTC mapping');
-- Imminent: a missing date is never created inside the population lead window.
SELECT p6test.set_clock(('2029-06-01'::date + time '19:30') AT TIME ZONE 'America/Chicago');
SELECT public.trivia_tournament_scheduler_acquire('dispatcher-a', 60) AS o \gset
SELECT public.trivia_tournament_reconcile_schedule((:'o'::jsonb->>'fencing_token')::bigint, NULL, 8) AS r \gset
SELECT p6test.assert((:'r'::jsonb->>'missed_imminent')::integer = 1 AND (:'r'::jsonb->>'created')::integer = 7, 'imminent date skipped, next seven created');
SELECT p6test.assert(NOT EXISTS (SELECT 1 FROM public.trivia_tournaments WHERE scheduled_local_date = '2029-06-01'), 'no late instance');
SELECT p6test.assert(public.trivia_tournament_health_v1()->'alerts' @> '[{"code":"next_instance_coverage_short"}]'::jsonb IS FALSE, 'coverage alert absent');
-- Every instance has its own open Phase 2 settlement and a sealed seed commitment.
SELECT p6test.assert((SELECT count(*) FROM public.trivia_tournaments t
         LEFT JOIN public.trivia_settlements s ON s.subject_type = 'tournament' AND s.subject_id = t.id AND s.state = 'open'
        WHERE t.schedule_kind = 'public_nightly' AND (s.id IS NULL OR t.seed_commitment !~ '^[0-9a-f]{64}$')) = 0,
       'settlement open + commitment per instance');
SELECT json_build_object('suite', 'schedule_dst', 'pass', true,
  'public_instances', (SELECT count(*) FROM public.trivia_tournaments WHERE schedule_kind = 'public_nightly'),
  'distinct_dates', (SELECT count(DISTINCT scheduled_local_date) FROM public.trivia_tournaments WHERE schedule_kind = 'public_nightly'),
  'horse_targets_in_range', (SELECT bool_and(horse_target BETWEEN 70 AND 140) FROM public.trivia_tournaments WHERE schedule_kind = 'public_nightly'),
  'horse_target_min', (SELECT min(horse_target) FROM public.trivia_tournaments WHERE schedule_kind = 'public_nightly'),
  'horse_target_max', (SELECT max(horse_target) FROM public.trivia_tournaments WHERE schedule_kind = 'public_nightly'),
  'utc_hours', (SELECT json_object_agg(h, n) FROM (SELECT extract(hour FROM start_time AT TIME ZONE 'UTC')::int h, count(*) n
                 FROM public.trivia_tournaments WHERE schedule_kind = 'public_nightly' GROUP BY 1) x)) AS result;
