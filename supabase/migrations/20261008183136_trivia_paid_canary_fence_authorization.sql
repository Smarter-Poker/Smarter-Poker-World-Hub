-- TIER: 2; AUTHOR: Codex; AFFECTS: exact named-human capped paid-canary access and one retained private fence authorization
-- WHY: Finish real-clock capped paid-entry settlement and automatic-refund qualification with a genuinely
-- signed-in existing LaunchQualification human, after repairing free funding.
-- No public schedules, certificates, flags, grants, wallet or rule changes.
-- Acquisition requires the current zero-cohort fence2 to be released first.
-- Normal cohort horse holds are capped at700; refund cohort has no horse input.
-- The original insufficient-entrants start path refunds the sole ten-Diamond
-- genuine human entry. This is not an operator cancellation or SMSMFA test.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $authorize$
DECLARE ids constant uuid[] := ARRAY['35e9bbe9-2831-4458-96af-6d4f450ec62c','53e0c2ab-3633-4578-a76b-cb3cda0fad4b']::uuid[];
 actor constant uuid := 'a379dc08-375e-4bcd-96f7-10e96a8a5c65';
BEGIN
IF (SELECT count(*) FROM public.trivia_tournament_scheduler_leases)<>1 OR NOT EXISTS(SELECT 1 FROM public.trivia_tournament_scheduler_leases WHERE job_identity='openclaw:trivia-nightly-tournament' AND fencing_token=2 AND holder_id='qualification:oct8-human-zero-canaries' AND released_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'prior fence history changed; investigate'; END IF;
IF EXISTS(SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-human-paid-canaries') OR EXISTS(SELECT 1 FROM public.trivia_tournament_canary_access WHERE tournament_id=ANY(ids)) THEN RAISE EXCEPTION 'named canary authorization already exists; read durable outcome'; END IF;
IF (SELECT count(*) FROM public.trivia_tournaments WHERE id=ANY(ids) AND schedule_kind='canary' AND engine_version='trivia-nightly-bracket/1.0.0' AND entry_fee=10 AND NOT COALESCE((format_snapshot->>'zero_diamond')::boolean,false) AND (format_snapshot->>'entry_fee')::integer=10 AND horse_target=70 AND (format_snapshot->>'min_entrants_to_start')::integer=2 AND lifecycle_state='registration' AND start_time>clock_timestamp())<>2 THEN RAISE EXCEPTION 'exact capped paid events must remain in future registration'; END IF;
IF NOT public.trivia_competitive_test_wallet_active_at_v1(actor,clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND username='trivia_canary_1' AND NOT COALESCE(is_horse,false)) THEN RAISE EXCEPTION 'existing named test human is not active'; END IF;
IF EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(gate_key) enabled FROM public.trivia_competitive_cutover_certificates ORDER BY gate_key,certificate_version DESC) gates WHERE enabled) THEN RAISE EXCEPTION 'qualification requires dormant public gates'; END IF;
INSERT INTO public.trivia_tournament_canary_access(tournament_id,user_id,approved_by) SELECT unnest(ids),actor,'Codex /root named LaunchQualification human for exact ten-Diamond paid-entry canaries';
INSERT INTO public.trivia_p12_scheduler_bootstrap_authorizations(job_identity,holder_id,expected_fencing_token,reason,created_by,expires_at)
VALUES('openclaw:trivia-nightly-tournament','qualification:oct8-human-paid-canaries',3,'Bounded named-human ten-Diamond canaries 35e9bbe9-2831-4458-96af-6d4f450ec62c normal70horse settlement and53e0c2ab-3633-4578-a76b-cb3cda0fad4b insufficient-entrants automaticrefund only; no public schedule or certificate activation.','Codex /root launch qualification',clock_timestamp()+interval '30 minutes');
IF (SELECT count(*) FROM public.trivia_tournament_canary_access WHERE tournament_id=ANY(ids) AND user_id=actor)<>2 OR (SELECT count(*) FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-human-paid-canaries' AND expected_fencing_token=3 AND consumed_run_id IS NULL)<>1 THEN RAISE EXCEPTION 'named access and authorization not exact-once'; END IF;
END $authorize$;
COMMIT;
-- Rollback: unused authorization expires after 30 minutes, retaining audit history.
-- Consumed original run must release through trivia_tournament_scheduler_release
-- with its actual returned UUID/fence. Never delete or rewind prior history.
-- Test access does not itself admit or charge the user; only genuine API entry
-- may do that. Finite input scope is the exact two capped paid events above; the full
-- pre-certification scheduler tick remains refused.
