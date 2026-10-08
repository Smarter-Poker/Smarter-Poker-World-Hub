-- TIER: 2; AUTHOR: Codex; AFFECTS: exact named-human zero-canary access and one retained private fence authorization
-- WHY: Finish real-clock zero-entry 70/100/140 qualification with a genuinely
-- signed-in existing LaunchQualification human, after repairing free funding.
-- No public schedules, certificates, flags, grants, wallet or rule changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $authorize$
DECLARE ids constant uuid[] := ARRAY['6062f650-9b21-40d1-a34b-5c1dad34b762','1d403b1c-063c-4908-8b6c-dbf947ec5fd7','fd1125a0-8bc5-455f-8cb7-73a94b6cd9ef']::uuid[];
 actor constant uuid := 'a379dc08-375e-4bcd-96f7-10e96a8a5c65';
BEGIN
IF (SELECT count(*) FROM public.trivia_tournament_scheduler_leases)<>1 OR NOT EXISTS(SELECT 1 FROM public.trivia_tournament_scheduler_leases WHERE job_identity='openclaw:trivia-nightly-tournament' AND fencing_token=1 AND released_at='2026-10-08T16:54:08.386372+00:00'::timestamptz) THEN RAISE EXCEPTION 'prior fence history changed; investigate'; END IF;
IF EXISTS(SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-human-zero-canaries') OR EXISTS(SELECT 1 FROM public.trivia_tournament_canary_access WHERE tournament_id=ANY(ids)) THEN RAISE EXCEPTION 'named canary authorization already exists; read durable outcome'; END IF;
IF (SELECT count(*) FROM public.trivia_tournaments WHERE id=ANY(ids) AND schedule_kind='canary' AND engine_version='trivia-nightly-bracket/1.0.0' AND entry_fee=0 AND (format_snapshot->>'zero_diamond')::boolean AND (format_snapshot->>'entry_fee')::integer=0 AND lifecycle_state='registration' AND start_time>clock_timestamp())<>3 THEN RAISE EXCEPTION 'exact zero events must remain in future registration'; END IF;
IF NOT public.trivia_competitive_test_wallet_active_at_v1(actor,clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND username='trivia_canary_1' AND NOT COALESCE(is_horse,false)) THEN RAISE EXCEPTION 'existing named test human is not active'; END IF;
IF EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(gate_key) enabled FROM public.trivia_competitive_cutover_certificates ORDER BY gate_key,certificate_version DESC) gates WHERE enabled) THEN RAISE EXCEPTION 'qualification requires dormant public gates'; END IF;
INSERT INTO public.trivia_tournament_canary_access(tournament_id,user_id,approved_by) SELECT unnest(ids),actor,'Codex /root named LaunchQualification human for exact free-entry canaries';
INSERT INTO public.trivia_p12_scheduler_bootstrap_authorizations(job_identity,holder_id,expected_fencing_token,reason,created_by,expires_at)
VALUES('openclaw:trivia-nightly-tournament','qualification:oct8-human-zero-canaries',2,'Bounded named-human zero-diamond canaries 6062f650-9b21-40d1-a34b-5c1dad34b762,1d403b1c-063c-4908-8b6c-dbf947ec5fd7,fd1125a0-8bc5-455f-8cb7-73a94b6cd9ef only; no public schedule or certificate activation.','Codex /root launch qualification',clock_timestamp()+interval '30 minutes');
IF (SELECT count(*) FROM public.trivia_tournament_canary_access WHERE tournament_id=ANY(ids) AND user_id=actor)<>3 OR (SELECT count(*) FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-human-zero-canaries' AND expected_fencing_token=2 AND consumed_run_id IS NULL)<>1 THEN RAISE EXCEPTION 'named access and authorization not exact-once'; END IF;
END $authorize$;
COMMIT;
-- Rollback: unused authorization expires after30minutes, retaining audit history.
-- Consumed original run must release through trivia_tournament_scheduler_release
-- with its actual returned UUID/fence. Never delete or rewind prior history.
-- Test access does not itself admit or charge the user; only genuine API entry
-- may do that. Finite input scope is the exact three zero events above; the full
-- pre-certification scheduler tick remains refused.
