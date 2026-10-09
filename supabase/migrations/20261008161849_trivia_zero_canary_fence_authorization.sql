-- TIER: 2; AUTHOR: Codex; AFFECTS: one retained private scheduler authorization
-- WHY: Run the three already-created zero-diamond launch canaries under the
-- installed one-time holder/fence contract, without enabling public schedules.
-- Scope: e6164277-912d-443e-a3de-9351733e8d75 (70),
-- 4f244ec2-5f2c-402d-8a54-0790664180ec (100),
-- 3d60e76b-71c0-4072-93e3-90a8e23fa91f (140).
-- No grant, clock, rule, engine, public gate or player balance changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $authorize$
BEGIN
IF EXISTS(SELECT 1 FROM public.trivia_tournament_scheduler_leases) OR EXISTS(SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-zero-field-canaries') THEN RAISE EXCEPTION 'canary fence prestate changed; investigate'; END IF;
IF (SELECT count(*) FROM public.trivia_tournaments WHERE id IN ('e6164277-912d-443e-a3de-9351733e8d75','4f244ec2-5f2c-402d-8a54-0790664180ec','3d60e76b-71c0-4072-93e3-90a8e23fa91f') AND schedule_kind='canary' AND engine_version='trivia-nightly-bracket/1.0.0' AND (format_snapshot->>'zero_diamond')::boolean AND (format_snapshot->>'entry_fee')::integer=0 AND lifecycle_state='registration' AND start_time>pg_catalog.clock_timestamp())<>3 THEN RAISE EXCEPTION 'exact zero-diamond canaries must remain in registration and future'; END IF;
IF EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(gate_key) enabled FROM public.trivia_competitive_cutover_certificates ORDER BY gate_key,certificate_version DESC) gates WHERE enabled) THEN RAISE EXCEPTION 'canary authorization requires dormant public gates'; END IF;
INSERT INTO public.trivia_p12_scheduler_bootstrap_authorizations(job_identity,holder_id,expected_fencing_token,reason,created_by,expires_at)
VALUES('openclaw:trivia-nightly-tournament','qualification:oct8-zero-field-canaries',1,'Bounded zero-diamond 70/100/140 canaries named in this migration only; no public schedule or certificate activation.','Codex /root launch qualification',pg_catalog.clock_timestamp()+interval '30 minutes');
IF (SELECT count(*) FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-zero-field-canaries' AND expected_fencing_token=1 AND consumed_run_id IS NULL)<>1 THEN RAISE EXCEPTION 'canary authorization was not exact-once'; END IF;
END $authorize$;
COMMIT;
-- Rollback: an unused authorization expires after 30 minutes. Retain its history.
-- A consumed fence must be released through trivia_tournament_scheduler_release
-- with the actual returned run UUID and fencing token; never delete/rewind either
-- authorization or lease. Every domain action is restricted by the owning agent
-- to the three named zero-diamond canaries; the full scheduler tick stays refused.
