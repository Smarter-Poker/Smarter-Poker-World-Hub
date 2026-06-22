-- Remove duplicate pg_cron job for mlb_hr_cache_refresh if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'mlb_hr_cache_autonomous_refresh_cron'
  ) THEN
    PERFORM cron.unschedule('mlb_hr_cache_autonomous_refresh_cron');
  END IF;
END $$;
