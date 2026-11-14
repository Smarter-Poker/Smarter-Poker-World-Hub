-- Captured BEFORE 20261114155817: the report each fixture day answered with the
-- previous single-function definition, so the new live name can be held to it.
CREATE TABLE digest_daily_results_before AS
SELECT d AS day, public.fn_sp_digest_daily_results(d) AS result
  FROM (VALUES ('2026-11-10'::date), ('2026-11-11'::date)) v(d);
-- pg_cron is not installed in this private database: the smallest stand-in
-- with the one call the migration makes and the row it changes.
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
CREATE OR REPLACE FUNCTION cron.alter_job(job_id bigint, command text) RETURNS void LANGUAGE sql AS
$$ UPDATE cron.job SET command = alter_job.command WHERE jobid = alter_job.job_id $$;
-- Production's job 495, as it stands before 20261114155817.
INSERT INTO cron.job(jobid, jobname, schedule, command) VALUES (495, 'sp-daily-metrics-snapshot', '15,45 5-12 * * *', $prev$SET statement_timeout = '1500s'; SELECT public.fn_sp_daily_metrics_snapshot()
     WHERE to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') = '00:15'
        OR (to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') IN
              ('00:45','01:15','01:45','02:15','02:45','03:15','03:45','04:45','05:15','05:45','06:15','06:45')
            AND NOT EXISTS (SELECT 1 FROM public.sp_daily_metrics WHERE day = (clock_timestamp() AT TIME ZONE 'America/Chicago')::date - 1));$prev$);
