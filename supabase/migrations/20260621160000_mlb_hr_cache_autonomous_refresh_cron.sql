-- ─────────────────────────────────────────────────────────────────────────────
-- Autonomous daily refresh of public.mlb_hr_cache via pg_cron + pg_net.
--
-- WHY: The sanctioned scheduler (Hetzner OpenClaw dispatcher) deploy workflow has
-- been failing since 2026-05-17 (stale HETZNER_SSH_PRIVATE_KEY → "Permission
-- denied (publickey)"), so the committed ALL_CRONS entry never reaches the running
-- dispatcher. This pg_cron job keeps the MLB HR Tracker cache fresh 24/7 with zero
-- human intervention until OpenClaw is restored. RETIRE this job once the OpenClaw
-- VM SSH key is fixed and the dispatcher is redeploying:
--     select cron.unschedule('mlb-hr-cache-refresh');
--
-- SECURITY: CRON_SECRET is stored in Supabase Vault as secret name
-- 'mlb_cron_secret' (created out-of-band, never committed). The job reads it at
-- run time from vault.decrypted_secrets; no plaintext secret lives in cron.job.
-- pg_cron + pg_net are already installed on this project.
-- ─────────────────────────────────────────────────────────────────────────────

-- Idempotent: drop any prior instance of this job before (re)scheduling.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'mlb-hr-cache-refresh';
exception when others then
  null;
end $$;

select cron.schedule(
  'mlb-hr-cache-refresh',
  '0 11 * * *',  -- daily 11:00 UTC (7am ET) — matches the intended OpenClaw slot
  $cmd$select net.http_get(
    url     := 'https://smarter.poker/api/cron/mlb-hr-cache-refresh',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mlb_cron_secret')
    )
  );$cmd$
);
