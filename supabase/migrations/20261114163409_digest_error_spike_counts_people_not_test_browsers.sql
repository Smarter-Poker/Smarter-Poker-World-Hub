-- 20261114163409_digest_error_spike_counts_people_not_test_browsers.sql
-- Reserved against origin/main and every remote branch.
-- IRREVERSIBLE: no
--
-- WHY:
-- The 2026-11-13 digest raised "3,614 client errors vs a 7 day average of
-- 1,690" (DailyDigest.error_spike). 2,294 of those reports came from automated
-- browsers (client_error_events.automated = true, navigator.webdriver): the
-- post-deploy end-to-end harness. Reports from people were 1,320, against an
-- average of about 1,305 for the seven days before. The rule compared the raw
-- total, so test traffic produced a spike that no player saw.
--
-- WHAT:
-- Only the error_spike rule of fn_sp_digest_attention changes. It now compares
-- reports from people (automated = false) plus unclassified reports
-- (automated IS NULL, never hidden) against the same population's average over
-- the seven prior Chicago days. Its title and detail still show the
-- unclassified and automated counts. The history gate (three or more stored
-- days) and the ratio setting are unchanged. The edit is a guarded
-- replacement of that one block in the live definition, so every other rule
-- stays exactly as production has it; the migration aborts if the block is not
-- found exactly once. The daily metrics total (health.client_errors) is
-- unchanged. Nothing here writes a balance, a ledger row or a payout.
--
-- ROLLBACK: run the same replacement with the two blocks swapped.

BEGIN;

DO $migrate$
DECLARE
  d text := pg_get_functiondef('public.fn_sp_digest_attention(date,jsonb)'::regprocedure);
  old_block text := $old$  -- Error spike
  SELECT avg((metrics#>>'{health,client_errors}')::numeric), count(*) INTO avg7, v2 FROM public.sp_daily_metrics WHERE day BETWEEN p_day - 7 AND p_day - 1;
  v := (p_metrics#>>'{health,client_errors}')::numeric;
  IF v2 >= 3 AND avg7 > 0 AND v > avg7 * public.fn_sp_setting('client_error_spike_ratio',2) THEN
    a := a || jsonb_build_object('rule','error_spike','severity','warning',
      'title', format('%s client errors vs a 7 day average of %s', v, round(avg7)), 'detail', jsonb_build_object('errors', v, 'avg7', round(avg7)));
  END IF;$old$;
  new_block text := $new$  -- Error spike: reports from people plus unclassified reports. Automated
  -- browsers (navigator.webdriver, the post-deploy test harness) are shown but
  -- never compared; 2026-11-13 raised a false spike from 2,294 harness reports.
  SELECT count(*) INTO v2 FROM public.sp_daily_metrics WHERE day BETWEEN p_day - 7 AND p_day - 1;
  SELECT COALESCE(sum(occurrences), 0) / 7.0 INTO avg7 FROM public.client_error_events
   WHERE received_at >= ((p_day - 7)::timestamp AT TIME ZONE 'America/Chicago') AND received_at < s
     AND automated IS NOT TRUE;
  SELECT COALESCE(sum(occurrences) FILTER (WHERE automated IS FALSE), 0) AS people,
         COALESCE(sum(occurrences) FILTER (WHERE automated IS NULL), 0) AS unclassified,
         COALESCE(sum(occurrences) FILTER (WHERE automated IS TRUE), 0) AS automated
    INTO r FROM public.client_error_events WHERE received_at >= s AND received_at < e;
  v := r.people + r.unclassified;
  IF v2 >= 3 AND avg7 > 0 AND v > avg7 * public.fn_sp_setting('client_error_spike_ratio',2) THEN
    a := a || jsonb_build_object('rule','error_spike','severity','warning',
      'title', format('%s client errors from people and unclassified sources (%s unclassified) vs a 7 day average of %s; %s from automated test browsers not counted',
                      v, r.unclassified, round(avg7), r.automated),
      'detail', jsonb_build_object('errors', v, 'people', r.people, 'unclassified', r.unclassified,
                                   'automated', r.automated, 'avg7', round(avg7)));
  END IF;$new$;
BEGIN
  IF (length(d) - length(replace(d, old_block, ''))) <> length(old_block) THEN
    RAISE EXCEPTION 'fn_sp_digest_attention error_spike block is not the one this migration was written against';
  END IF;
  EXECUTE replace(d, old_block, new_block);
  IF position('automated IS NOT TRUE' IN pg_get_functiondef('public.fn_sp_digest_attention(date,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_sp_digest_attention was not updated';
  END IF;
END
$migrate$;

COMMIT;
