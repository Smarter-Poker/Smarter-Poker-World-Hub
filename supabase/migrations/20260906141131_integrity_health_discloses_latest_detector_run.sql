-- 20260906141131_integrity_health_discloses_latest_detector_run.sql
--
-- Phase 5 release audit: Open Claw records this worker as
-- `/cron/collusion-scan`. The original health wrapper looked only for the bare
-- `collusion-scan` name, so it returned latest_cron null and dropped the
-- detector's window and threshold disclosure even though every successful run
-- recorded both fields in cron_execution_log.result.

BEGIN;

DO $migration$
DECLARE
  v_sql text;
  v_before text;
BEGIN
  SELECT pg_get_functiondef(
    'public.fn_ca_integrity_detector_health(integer)'::regprocedure
  ) INTO v_sql;

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'fn_ca_integrity_detector_health is missing';
  END IF;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'WHERE replace(lower(e.job_name), ''_'', ''-'') = ''collusion-scan''',
    'WHERE regexp_replace(replace(lower(e.job_name), ''_'', ''-''), ''^.*/'', '''') = ''collusion-scan'''
  );
  IF v_sql = v_before THEN
    RAISE EXCEPTION 'integrity cron-name predicate did not match';
  END IF;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    E'  BEGIN\n    SELECT jsonb_build_object(\n             ''newest_at'', max(c.created_at),',
    E'  IF v_worker IS NOT NULL\n'
      || E'     AND jsonb_typeof(v_latest_cron -> ''result'') = ''object''\n'
      || E'     AND (v_latest_cron -> ''result'') ? ''detection_span_minutes''\n'
      || E'     AND (v_latest_cron -> ''result'') ? ''detection_thresholds'' THEN\n'
      || E'    v_worker := v_worker || jsonb_build_object(\n'
      || E'      ''detection_span_minutes'', v_latest_cron #> ''{result,detection_span_minutes}'',\n'
      || E'      ''detection_thresholds'', v_latest_cron #> ''{result,detection_thresholds}'');\n'
      || E'  END IF;\n\n'
      || E'  BEGIN\n    SELECT jsonb_build_object(\n             ''newest_at'', max(c.created_at),'
  );
  IF v_sql = v_before THEN
    RAISE EXCEPTION 'integrity detector disclosure insertion point did not match';
  END IF;

  EXECUTE v_sql;
END;
$migration$;

REVOKE ALL ON FUNCTION public.fn_ca_integrity_detector_health(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_detector_health(integer)
  TO service_role;

COMMIT;
