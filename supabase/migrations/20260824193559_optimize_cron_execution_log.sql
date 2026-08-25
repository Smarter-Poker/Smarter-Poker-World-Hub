CREATE INDEX IF NOT EXISTS idx_cron_execution_log_job_started 
ON public.cron_execution_log USING btree (job_name, started_at DESC);
