-- TIER: 2; AUTHOR: Codex; AFFECTS: one exact existing future named-human zero140
-- canary access row and one retained future fence4 authorization.
-- WHY: The earlier genuine140 run was interrupted and exceeded timing gates.
-- This one real-clock event qualifies the repaired original engine's timing;
-- it does not erase prior failed evidence or activate public competition.
-- Future authorization is installed while original recovery fence3 remains live;
-- root must finish its exact pending events and release3 before acquiring4.
-- Original authorization expiry remains30minutes; install20:04→expire20:34.
-- No ledger, grants, rules, clock, schedule, certificates or runtime ownership edits.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $authorize$
DECLARE tid constant uuid := '7248c584-8c79-4c42-8ed6-352557fe7863';
 actor constant uuid := 'a379dc08-375e-4bcd-96f7-10e96a8a5c65';
 authorization_at timestamptz;
BEGIN
IF (SELECT count(*) FROM public.trivia_tournament_scheduler_leases)<>1 OR NOT EXISTS(SELECT 1 FROM public.trivia_tournament_scheduler_leases WHERE job_identity='openclaw:trivia-nightly-tournament' AND fencing_token=3 AND holder_id='qualification:oct8-canary-recovery' AND released_at IS NULL AND expires_at>clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM public.trivia_tournament_scheduler_runs WHERE run_id='b047f987-52e5-4a5f-8a9d-383013c217d2' AND fencing_token=3 AND holder_id='qualification:oct8-canary-recovery' AND outcome='owner' AND finished_at IS NULL) THEN RAISE EXCEPTION 'prior actual recovery ownership changed; investigate'; END IF;
IF EXISTS(SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-human-140-timing') OR EXISTS(SELECT 1 FROM public.trivia_tournament_canary_access WHERE tournament_id=tid) THEN RAISE EXCEPTION 'named timing access or authorization already exists; read durable outcome'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.trivia_tournaments WHERE id=tid AND schedule_kind='canary' AND schedule_key='canary:oct8-human-140-timing-140' AND engine_version='trivia-nightly-bracket/1.0.0' AND entry_fee=0 AND COALESCE((format_snapshot->>'zero_diamond')::boolean,false) AND (format_snapshot->>'entry_fee')::integer=0 AND horse_target=140 AND (format_snapshot->>'min_entrants_to_start')::integer=2 AND lifecycle_state='registration' AND start_time='2026-10-08T20:30:55.518963+00:00'::timestamptz AND start_time>clock_timestamp()) THEN RAISE EXCEPTION 'exact future zero140 timing event changed'; END IF;
IF EXISTS(SELECT 1 FROM public.trivia_tournament_entrants WHERE tournament_id=tid) THEN RAISE EXCEPTION 'timing event already admitted; inspect original outcome'; END IF;
IF NOT public.trivia_competitive_test_wallet_active_at_v1(actor,clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND username='trivia_canary_1' AND NOT COALESCE(is_horse,false)) THEN RAISE EXCEPTION 'existing named human not active'; END IF;
IF EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(gate_key) enabled FROM public.trivia_competitive_cutover_certificates ORDER BY gate_key,certificate_version DESC) gates WHERE enabled) THEN RAISE EXCEPTION 'timing qualification requires dormant public gates'; END IF;
INSERT INTO public.trivia_tournament_canary_access(tournament_id,user_id,approved_by) VALUES(tid,actor,'Codex /root existing LaunchQualification named human for exact real-clock zero140 timing run');
authorization_at:=clock_timestamp();
INSERT INTO public.trivia_p12_scheduler_bootstrap_authorizations(job_identity,holder_id,expected_fencing_token,reason,created_by,created_at,expires_at)
VALUES('openclaw:trivia-nightly-tournament','qualification:oct8-human-140-timing',4,'One real-clock named-human zero140 timing canary7248c584-8c79-4c42-8ed6-352557fe7863 on repaired original engine only; retain prior interrupted failure; no public schedules or certificates. Acquire only after original recovery3 releases.','Codex /root launch qualification',authorization_at,authorization_at+interval '30 minutes');
IF (SELECT count(*) FROM public.trivia_tournament_canary_access WHERE tournament_id=tid AND user_id=actor)<>1 OR (SELECT count(*) FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-human-140-timing' AND expected_fencing_token=4 AND consumed_run_id IS NULL)<>1 THEN RAISE EXCEPTION 'exact timing access and authorization not installed once'; END IF;
END $authorize$;
COMMIT;
-- Rollback: unused authorization expires after30minutes, retaining history.
-- If consumed, release only original returned run/fence through maintainedRPC.
-- Never delete, rewind or extend authorization/lease history.
-- Test access alone admits no entrant; root uses genuine named-human API entry.
-- Scope is one exact event only; full pre-certification scheduler stays refused.
